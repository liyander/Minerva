import { pool } from '../db/pool.js'
import { sendMail } from './mailer.js'

/**
 * Scheduled email jobs. Both are idempotent through the mailer's dedupe key, so
 * they can be triggered by a cron, by the admin UI, or on an interval without
 * sending anything twice.
 */

const DAY_MS = 86400000

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function formatDue(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'soon'
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/**
 * Emails trainees about assessments, assignments and mandatory training falling
 * due in the next three days that they have not yet completed.
 */
export async function runDeadlineReminders({ withinDays = 3 } = {}) {
  const horizon = new Date(Date.now() + withinDays * DAY_MS)
  const horizonSql = horizon.toISOString().slice(0, 19).replace('T', ' ')

  const pending = new Map()

  const push = (row, title, due) => {
    if (!row.email) return
    const entry = pending.get(row.id) || {
      email: row.email,
      name: row.first_name || row.username,
      items: [],
    }
    entry.items.push({ title, due: formatDue(due) })
    pending.set(row.id, entry)
  }

  // Assessments with a deadline the trainee has not yet passed.
  const [assessmentRows] = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.username, a.title, a.deadline
     FROM assessments a
     CROSS JOIN users u
     WHERE a.is_published = true
       AND a.deadline IS NOT NULL
       AND a.deadline BETWEEN NOW() AND ?
       AND u.role IN ('trainee', 'operator')
       AND u.is_active = true
       AND u.approval_status = 'approved'
       AND NOT EXISTS (
         SELECT 1 FROM assessment_attempts t
         WHERE t.assessment_id = a.id AND t.user_id = u.id AND t.passed = true
       )`,
    [horizonSql],
  )
  for (const row of assessmentRows) push(row, row.title, row.deadline)

  // Assignments with a deadline and no submission.
  const [assignmentRows] = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.username, a.title, a.deadline
     FROM assignments a
     CROSS JOIN users u
     WHERE a.is_published = true
       AND a.deadline IS NOT NULL
       AND a.deadline BETWEEN NOW() AND ?
       AND u.role IN ('trainee', 'operator')
       AND u.is_active = true
       AND u.approval_status = 'approved'
       AND NOT EXISTS (
         SELECT 1 FROM assignment_submissions s
         WHERE s.assignment_id = a.id AND s.user_id = u.id
       )`,
    [horizonSql],
  )
  for (const row of assignmentRows) push(row, row.title, row.deadline)

  // Mandatory training due soon, resolved through cohort or department.
  const [requirementRows] = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.username, t.title, t.due_on
     FROM training_requirements t
     JOIN users u ON (
       t.applies_to_all = true
       OR (t.department IS NOT NULL AND t.department = u.department)
       OR EXISTS (
         SELECT 1 FROM cohort_members m WHERE m.cohort_id = t.cohort_id AND m.user_id = u.id
       )
     )
     WHERE t.is_active = true
       AND t.due_on IS NOT NULL
       AND t.due_on BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
       AND u.role IN ('trainee', 'operator')
       AND u.is_active = true`,
    [withinDays],
  )
  for (const row of requirementRows) push(row, `${row.title} (required)`, row.due_on)

  const today = dayKey()
  let sent = 0
  let skipped = 0

  for (const [userId, entry] of pending) {
    // eslint-disable-next-line no-await-in-loop
    const result = await sendMail({
      to: entry.email,
      template: 'deadlineReminder',
      data: { name: entry.name, items: entry.items },
      dedupeKey: `reminder:${userId}:${today}`,
    })
    if (result.sent) sent += 1
    else skipped += 1
  }

  return { recipients: pending.size, sent, skipped }
}

/** Weekly per-trainee summary of what they completed and what is new. */
export async function runWeeklyDigest() {
  const [users] = await pool.query(
    `SELECT id, email, first_name, username FROM users
     WHERE role IN ('trainee', 'operator') AND is_active = true AND approval_status = 'approved'
       AND email IS NOT NULL`,
  )

  const [newContent] = await pool.query(
    `SELECT title FROM rooms WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
     UNION ALL
     SELECT title FROM trainer_library_items
     WHERE is_published = true AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
     LIMIT 8`,
  )
  const highlights = newContent.map((row) => row.title)

  const week = dayKey()
  let sent = 0
  let skipped = 0

  for (const user of users) {
    /* eslint-disable no-await-in-loop */
    const [statRows] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM user_room_progress p
           WHERE p.user_id = ? AND p.completed_at > DATE_SUB(NOW(), INTERVAL 7 DAY)) AS courses_completed,
         (SELECT COUNT(*) FROM assessment_attempts t
           WHERE t.user_id = ? AND t.submitted_at > DATE_SUB(NOW(), INTERVAL 7 DAY)) AS attempts,
         (SELECT ROUND(AVG(t.percentage)) FROM assessment_attempts t
           WHERE t.user_id = ? AND t.submitted_at > DATE_SUB(NOW(), INTERVAL 7 DAY)) AS avg_score`,
      [user.id, user.id, user.id],
    )

    const stats = {
      coursesCompleted: Number(statRows[0]?.courses_completed || 0),
      attempts: Number(statRows[0]?.attempts || 0),
      averageScore: statRows[0]?.avg_score ? Number(statRows[0].avg_score) : null,
    }

    // Nothing happened and nothing new to announce: do not send noise.
    if (!stats.coursesCompleted && !stats.attempts && !highlights.length) {
      skipped += 1
      continue
    }

    const result = await sendMail({
      to: user.email,
      template: 'weeklyDigest',
      data: { name: user.first_name || user.username, stats, highlights },
      dedupeKey: `digest:${user.id}:${week}`,
    })
    /* eslint-enable no-await-in-loop */

    if (result.sent) sent += 1
    else skipped += 1
  }

  return { candidates: users.length, sent, skipped, highlights: highlights.length }
}

/**
 * Starts the in-process schedule. Deliberately simple: an interval rather than a
 * cron dependency, with dedupe keys making repeat runs harmless. Set
 * REMINDERS_ENABLED=false to leave scheduling to an external cron instead.
 */
export function startReminderSchedule() {
  if (String(process.env.REMINDERS_ENABLED || 'true') === 'false') {
    return null
  }

  const runAll = async () => {
    try {
      await runDeadlineReminders()
    } catch (error) {
      console.error('Deadline reminder job failed:', error.message)
    }

    // Digest only on Mondays.
    if (new Date().getDay() === 1) {
      try {
        await runWeeklyDigest()
      } catch (error) {
        console.error('Weekly digest job failed:', error.message)
      }
    }
  }

  const timer = setInterval(runAll, 6 * 60 * 60 * 1000)
  timer.unref?.()
  // Give the server a moment to finish booting before the first pass.
  setTimeout(runAll, 60_000).unref?.()

  return timer
}
