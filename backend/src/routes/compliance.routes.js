import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin, requireTrainer } from '../middleware/auth.js'
import { recordAudit } from '../services/audit.js'

const router = Router()

router.use(authenticate)

/**
 * Mandatory training. A requirement points at a course, a path or an assessment,
 * and applies to a cohort, a department, or everyone. Completion is derived from
 * existing progress rather than duplicated, so it can never drift.
 */

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

router.get('/requirements', requireTrainer, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT t.*, r.title AS course_title, p.title AS path_title, a.title AS assessment_title,
            c.name AS cohort_name
     FROM training_requirements t
     LEFT JOIN rooms r ON r.id = t.room_id
     LEFT JOIN career_paths p ON p.id = t.career_path_id
     LEFT JOIN assessments a ON a.id = t.assessment_id
     LEFT JOIN cohorts c ON c.id = t.cohort_id
     ORDER BY t.is_active DESC, t.due_on IS NULL, t.due_on ASC
     LIMIT 200`,
  )

  return res.json(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      roomId: row.room_id,
      careerPathId: row.career_path_id,
      assessmentId: row.assessment_id,
      cohortId: row.cohort_id,
      cohortName: row.cohort_name,
      department: row.department,
      appliesToAll: Boolean(row.applies_to_all),
      dueOn: row.due_on,
      isMandatory: Boolean(row.is_mandatory),
      isActive: Boolean(row.is_active),
      target: row.course_title || row.path_title || row.assessment_title || 'Unlinked',
      targetKind: row.room_id
        ? 'course'
        : row.career_path_id
          ? 'path'
          : row.assessment_id
            ? 'assessment'
            : 'none',
    })),
  )
})

router.post('/requirements', requireAdmin, async (req, res) => {
  const title = String(req.body?.title || '').trim()
  if (!title) return res.status(400).json({ message: 'Title is required' })

  if (!req.body?.roomId && !req.body?.careerPathId && !req.body?.assessmentId) {
    return res.status(400).json({ message: 'Link the requirement to a course, path or assessment' })
  }

  if (!req.body?.cohortId && !req.body?.department && !req.body?.appliesToAll) {
    return res.status(400).json({ message: 'Choose a cohort, a department, or apply to everyone' })
  }

  const [result] = await pool.query(
    `INSERT INTO training_requirements
       (title, description, room_id, career_path_id, assessment_id, cohort_id, department,
        applies_to_all, due_on, is_mandatory, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      req.body?.description || null,
      req.body?.roomId || null,
      req.body?.careerPathId || null,
      req.body?.assessmentId || null,
      req.body?.cohortId || null,
      req.body?.department || null,
      Boolean(req.body?.appliesToAll),
      toDate(req.body?.dueOn),
      req.body?.isMandatory === false ? false : true,
      req.user.id,
    ],
  )

  await recordAudit(req, {
    action: 'requirement.created',
    entityType: 'requirement',
    entityId: result.insertId,
    summary: `Created training requirement "${title}"`,
  })

  return res.status(201).json({ id: result.insertId })
})

router.put('/requirements/:id', requireAdmin, async (req, res) => {
  const fields = {
    title: req.body?.title,
    description: req.body?.description,
    due_on: req.body?.dueOn !== undefined ? toDate(req.body.dueOn) : undefined,
    is_mandatory: req.body?.isMandatory,
    is_active: req.body?.isActive,
    cohort_id: req.body?.cohortId,
    department: req.body?.department,
    applies_to_all: req.body?.appliesToAll,
  }
  const updates = Object.entries(fields).filter(([, value]) => value !== undefined)
  if (!updates.length) return res.status(400).json({ message: 'Nothing to update' })

  const [result] = await pool.query(
    `UPDATE training_requirements SET ${updates.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...updates.map(([, value]) => (value === '' ? null : value)), req.params.id],
  )
  if (!result.affectedRows) return res.status(404).json({ message: 'Requirement not found' })

  return res.json({ updated: true })
})

router.delete('/requirements/:id', requireAdmin, async (req, res) => {
  const [result] = await pool.query('DELETE FROM training_requirements WHERE id = ?', [req.params.id])
  if (!result.affectedRows) return res.status(404).json({ message: 'Requirement not found' })

  await recordAudit(req, {
    action: 'requirement.deleted',
    entityType: 'requirement',
    entityId: req.params.id,
    summary: 'Deleted a training requirement',
  })

  return res.json({ deleted: true })
})

/** Resolves which users a requirement applies to. */
async function audienceFor(requirement) {
  if (requirement.applies_to_all) {
    const [rows] = await pool.query(
      "SELECT id, username, first_name, last_name, email, department FROM users WHERE role IN ('trainee','operator') AND is_active = true",
    )
    return rows
  }

  if (requirement.cohort_id) {
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.email, u.department
       FROM cohort_members m JOIN users u ON u.id = m.user_id
       WHERE m.cohort_id = ? AND u.is_active = true`,
      [requirement.cohort_id],
    )
    return rows
  }

  if (requirement.department) {
    const [rows] = await pool.query(
      `SELECT id, username, first_name, last_name, email, department FROM users
       WHERE department = ? AND role IN ('trainee','operator') AND is_active = true`,
      [requirement.department],
    )
    return rows
  }

  return []
}

/** Whether one user satisfies one requirement, read from live progress. */
async function completionFor(requirement, userIds) {
  if (!userIds.length) return new Map()

  if (requirement.room_id) {
    const [rows] = await pool.query(
      'SELECT user_id, completed_at FROM user_room_progress WHERE room_id = ? AND user_id IN (?) AND completed_at IS NOT NULL',
      [requirement.room_id, userIds],
    )
    return new Map(rows.map((row) => [Number(row.user_id), row.completed_at]))
  }

  if (requirement.assessment_id) {
    const [rows] = await pool.query(
      `SELECT user_id, MAX(submitted_at) AS completed_at FROM assessment_attempts
       WHERE assessment_id = ? AND user_id IN (?) AND passed = true
       GROUP BY user_id`,
      [requirement.assessment_id, userIds],
    )
    return new Map(rows.map((row) => [Number(row.user_id), row.completed_at]))
  }

  if (requirement.career_path_id) {
    // A path counts as done once every course in its modules is complete.
    const [courseRows] = await pool.query(
      `SELECT mr.room_id FROM career_path_modules m
       JOIN career_path_module_rooms mr ON mr.module_id = m.id
       WHERE m.career_path_id = ?`,
      [requirement.career_path_id],
    )
    const required = courseRows.map((row) => row.room_id)
    if (!required.length) return new Map()

    const [progressRows] = await pool.query(
      `SELECT user_id, COUNT(*) AS done, MAX(completed_at) AS completed_at
       FROM user_room_progress
       WHERE room_id IN (?) AND user_id IN (?) AND completed_at IS NOT NULL
       GROUP BY user_id`,
      [required, userIds],
    )

    return new Map(
      progressRows
        .filter((row) => Number(row.done) >= required.length)
        .map((row) => [Number(row.user_id), row.completed_at]),
    )
  }

  return new Map()
}

/** Compliance matrix: per requirement, who is complete, pending or overdue. */
router.get('/report', requireTrainer, async (req, res) => {
  const [requirements] = await pool.query(
    `SELECT * FROM training_requirements
     WHERE is_active = true ${req.query.id ? 'AND id = ?' : ''}
     ORDER BY due_on IS NULL, due_on ASC`,
    req.query.id ? [req.query.id] : [],
  )

  const today = new Date().toISOString().slice(0, 10)
  const report = []

  for (const requirement of requirements) {
    /* eslint-disable no-await-in-loop */
    const audience = await audienceFor(requirement)
    const completion = await completionFor(
      requirement,
      audience.map((person) => person.id),
    )
    /* eslint-enable no-await-in-loop */

    const overdue = requirement.due_on && toDate(requirement.due_on) < today

    const people = audience.map((person) => {
      const completedAt = completion.get(Number(person.id)) || null
      return {
        id: person.id,
        name: [person.first_name, person.last_name].filter(Boolean).join(' ') || person.username,
        email: person.email,
        department: person.department,
        status: completedAt ? 'complete' : overdue ? 'overdue' : 'pending',
        completedAt,
      }
    })

    report.push({
      requirement: {
        id: requirement.id,
        title: requirement.title,
        dueOn: requirement.due_on,
        isMandatory: Boolean(requirement.is_mandatory),
        targetKind: requirement.room_id
          ? 'course'
          : requirement.career_path_id
            ? 'path'
            : 'assessment',
      },
      summary: {
        audience: people.length,
        complete: people.filter((person) => person.status === 'complete').length,
        pending: people.filter((person) => person.status === 'pending').length,
        overdue: people.filter((person) => person.status === 'overdue').length,
        compliance: people.length
          ? Math.round(
              (people.filter((person) => person.status === 'complete').length / people.length) * 100,
            )
          : 0,
      },
      people,
    })
  }

  return res.json(report)
})

/** A trainee's own outstanding mandatory training. */
router.get('/me', async (req, res) => {
  const [userRows] = await pool.query(
    'SELECT id, department, primary_cohort_id FROM users WHERE id = ? LIMIT 1',
    [req.user.id],
  )
  if (!userRows.length) return res.json([])

  const user = userRows[0]

  const [cohortRows] = await pool.query('SELECT cohort_id FROM cohort_members WHERE user_id = ?', [
    user.id,
  ])
  const cohortIds = cohortRows.map((row) => Number(row.cohort_id))

  const [requirements] = await pool.query(
    `SELECT t.*, r.title AS course_title, r.slug AS course_slug,
            p.title AS path_title, p.slug AS path_slug, a.title AS assessment_title
     FROM training_requirements t
     LEFT JOIN rooms r ON r.id = t.room_id
     LEFT JOIN career_paths p ON p.id = t.career_path_id
     LEFT JOIN assessments a ON a.id = t.assessment_id
     WHERE t.is_active = true
       AND (t.applies_to_all = true
            OR (t.department IS NOT NULL AND t.department = ?)
            ${cohortIds.length ? 'OR t.cohort_id IN (?)' : ''})
     ORDER BY t.due_on IS NULL, t.due_on ASC`,
    cohortIds.length ? [user.department, cohortIds] : [user.department],
  )

  const today = new Date().toISOString().slice(0, 10)
  const output = []

  for (const requirement of requirements) {
    // eslint-disable-next-line no-await-in-loop
    const completion = await completionFor(requirement, [user.id])
    const completedAt = completion.get(Number(user.id)) || null
    const overdue = requirement.due_on && toDate(requirement.due_on) < today && !completedAt

    output.push({
      id: requirement.id,
      title: requirement.title,
      description: requirement.description,
      dueOn: requirement.due_on,
      isMandatory: Boolean(requirement.is_mandatory),
      status: completedAt ? 'complete' : overdue ? 'overdue' : 'pending',
      completedAt,
      target: requirement.course_title || requirement.path_title || requirement.assessment_title,
      link: requirement.course_slug
        ? `/learn/course/${requirement.course_slug}`
        : requirement.path_slug
          ? `/learn/path/${requirement.path_slug}`
          : requirement.assessment_id
            ? `/assessments/${requirement.assessment_id}`
            : null,
    })
  }

  return res.json(output)
})

export default router
