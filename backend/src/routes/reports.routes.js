import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin, requireTrainer } from '../middleware/auth.js'
import { isRole, ROLES } from '../config/roles.js'
import { listAudit } from '../services/audit.js'
import { runDeadlineReminders, runWeeklyDigest } from '../services/reminders.js'
import { mailerStatus } from '../services/mailer.js'

const router = Router()

router.use(authenticate)

/** RFC 4180 quoting: wrap in quotes and double any embedded quote. */
function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = value instanceof Date ? value.toISOString() : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(columns, rows) {
  const header = columns.map((column) => csvCell(column.label)).join(',')
  const body = rows
    .map((row) => columns.map((column) => csvCell(row[column.key])).join(','))
    .join('\r\n')
  // A BOM makes Excel read UTF-8 correctly.
  return `﻿${header}\r\n${body}`
}

function sendCsv(res, filename, columns, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.send(toCsv(columns, rows))
}

const EXPORTS = {
  users: {
    role: 'admin',
    filename: 'users.csv',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'username', label: 'Username' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Role' },
      { key: 'approval_status', label: 'Approval' },
      { key: 'department', label: 'Department' },
      { key: 'is_active', label: 'Active' },
      { key: 'created_at', label: 'Joined' },
      { key: 'last_login_at', label: 'Last login' },
    ],
    query: `SELECT id, username,
                   TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) AS name,
                   email, role, approval_status, department, is_active, created_at, last_login_at
            FROM users ORDER BY created_at DESC`,
  },
  enrolments: {
    role: 'trainer',
    filename: 'enrolments.csv',
    columns: [
      { key: 'user_name', label: 'Trainee' },
      { key: 'email', label: 'Email' },
      { key: 'target', label: 'Course or path' },
      { key: 'status', label: 'Status' },
      { key: 'enrolled_at', label: 'Enrolled' },
      { key: 'completed_at', label: 'Completed' },
    ],
    query: `SELECT TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS user_name,
                   u.email, COALESCE(r.title, p.title) AS target, e.status, e.enrolled_at, e.completed_at
            FROM course_enrollments e
            JOIN users u ON u.id = e.user_id
            LEFT JOIN rooms r ON r.id = e.room_id
            LEFT JOIN career_paths p ON p.id = e.career_path_id
            ORDER BY e.enrolled_at DESC`,
  },
  assessmentResults: {
    role: 'trainer',
    filename: 'assessment-results.csv',
    columns: [
      { key: 'assessment', label: 'Assessment' },
      { key: 'subject', label: 'Subject' },
      { key: 'user_name', label: 'Trainee' },
      { key: 'email', label: 'Email' },
      { key: 'score', label: 'Score' },
      { key: 'max_score', label: 'Out of' },
      { key: 'percentage', label: 'Percent' },
      { key: 'passed', label: 'Passed' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    query: `SELECT a.title AS assessment, a.subject,
                   TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS user_name,
                   u.email, t.score, t.max_score, t.percentage, t.passed, t.submitted_at
            FROM assessment_attempts t
            JOIN assessments a ON a.id = t.assessment_id
            JOIN users u ON u.id = t.user_id
            WHERE t.submitted_at IS NOT NULL
            ORDER BY t.submitted_at DESC`,
  },
  submissions: {
    role: 'trainer',
    filename: 'assignment-submissions.csv',
    columns: [
      { key: 'assignment', label: 'Assignment' },
      { key: 'subject', label: 'Subject' },
      { key: 'user_name', label: 'Trainee' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' },
      { key: 'score', label: 'Score' },
      { key: 'max_score', label: 'Out of' },
      { key: 'passed', label: 'Passed' },
      { key: 'is_late', label: 'Late' },
      { key: 'submitted_at', label: 'Submitted' },
      { key: 'graded_at', label: 'Graded' },
    ],
    query: `SELECT a.title AS assignment, a.subject,
                   TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS user_name,
                   u.email, s.status, s.score, a.max_score, s.passed, s.is_late,
                   s.submitted_at, s.graded_at
            FROM assignment_submissions s
            JOIN assignments a ON a.id = s.assignment_id
            JOIN users u ON u.id = s.user_id
            ORDER BY s.submitted_at DESC`,
  },
  certificates: {
    role: 'admin',
    filename: 'certificates.csv',
    columns: [
      { key: 'certificate_id', label: 'Certificate ID' },
      { key: 'full_name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'path_title', label: 'Awarded for' },
      { key: 'source', label: 'Source' },
      { key: 'issued_at', label: 'Issued' },
    ],
    query: `SELECT c.certificate_id, c.full_name, u.email, c.path_title, c.source, c.issued_at
            FROM certificates c
            JOIN users u ON u.id = c.user_id
            ORDER BY c.issued_at DESC`,
  },
  participation: {
    role: 'trainer',
    filename: 'participation.csv',
    columns: [
      { key: 'name', label: 'Trainee' },
      { key: 'email', label: 'Email' },
      { key: 'department', label: 'Department' },
      { key: 'enrolments', label: 'Enrolments' },
      { key: 'attempts', label: 'Assessment attempts' },
      { key: 'avg_score', label: 'Average score' },
      { key: 'submissions', label: 'Assignments submitted' },
      { key: 'certificates', label: 'Certificates' },
      { key: 'last_login_at', label: 'Last login' },
    ],
    query: `SELECT TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS name,
                   u.email, u.department,
                   (SELECT COUNT(*) FROM course_enrollments e WHERE e.user_id = u.id) AS enrolments,
                   (SELECT COUNT(*) FROM assessment_attempts t WHERE t.user_id = u.id AND t.submitted_at IS NOT NULL) AS attempts,
                   (SELECT ROUND(AVG(t.percentage)) FROM assessment_attempts t WHERE t.user_id = u.id AND t.submitted_at IS NOT NULL) AS avg_score,
                   (SELECT COUNT(*) FROM assignment_submissions s WHERE s.user_id = u.id) AS submissions,
                   (SELECT COUNT(*) FROM certificates c WHERE c.user_id = u.id) AS certificates,
                   u.last_login_at
            FROM users u
            WHERE u.role IN ('trainee', 'operator')
            ORDER BY attempts DESC`,
  },
}

/** Which exports the caller may run. */
router.get('/exports', requireTrainer, (req, res) => {
  const admin = isRole(req.user.role, ROLES.ADMIN)
  res.json(
    Object.entries(EXPORTS)
      .filter(([, config]) => admin || config.role !== 'admin')
      .map(([key, config]) => ({ key, filename: config.filename, adminOnly: config.role === 'admin' })),
  )
})

router.get('/exports/:key', requireTrainer, async (req, res) => {
  const config = EXPORTS[req.params.key]
  if (!config) return res.status(404).json({ message: 'Unknown export' })

  if (config.role === 'admin' && !isRole(req.user.role, ROLES.ADMIN)) {
    return res.status(403).json({ message: 'That export is admin-only' })
  }

  const [rows] = await pool.query(config.query)

  // JSON mode lets the client render a print-to-PDF view of the same data.
  if (req.query.format === 'json') {
    return res.json({ key: req.params.key, columns: config.columns, rows })
  }

  return sendCsv(res, config.filename, config.columns, rows)
})

/* ------------------------------------------------- trainer own dashboard --- */

/** A trainer's own numbers, scoped to the material they authored. */
router.get('/trainer/me', requireTrainer, async (req, res) => {
  const trainerId = req.user.id

  const single = async (sql, params = []) => {
    const [rows] = await pool.query(sql, params)
    return rows[0] || {}
  }

  const [assessments, assignments, library, feedback, competencies] = await Promise.all([
    single(
      `SELECT COUNT(*) AS total,
              SUM(is_published = true) AS published,
              (SELECT COUNT(*) FROM assessment_attempts t
                JOIN assessments a2 ON a2.id = t.assessment_id
                WHERE a2.created_by = ? AND t.submitted_at IS NOT NULL) AS attempts,
              (SELECT ROUND(AVG(t.percentage)) FROM assessment_attempts t
                JOIN assessments a3 ON a3.id = t.assessment_id
                WHERE a3.created_by = ? AND t.submitted_at IS NOT NULL) AS avg_score,
              (SELECT COUNT(*) FROM assessment_attempts t
                JOIN assessments a4 ON a4.id = t.assessment_id
                WHERE a4.created_by = ? AND t.passed = true) AS passed
       FROM assessments WHERE created_by = ?`,
      [trainerId, trainerId, trainerId, trainerId],
    ),
    single(
      `SELECT COUNT(*) AS total,
              (SELECT COUNT(*) FROM assignment_submissions s
                JOIN assignments a2 ON a2.id = s.assignment_id
                WHERE a2.created_by = ?) AS submissions,
              (SELECT COUNT(*) FROM assignment_submissions s
                JOIN assignments a3 ON a3.id = s.assignment_id
                WHERE a3.created_by = ? AND s.status = 'submitted') AS awaiting
       FROM assignments WHERE created_by = ?`,
      [trainerId, trainerId, trainerId],
    ),
    single(
      `SELECT COUNT(*) AS total, COALESCE(SUM(download_count), 0) AS opens
       FROM trainer_library_items WHERE trainer_id = ?`,
      [trainerId],
    ),
    single(
      `SELECT COUNT(*) AS total, ROUND(AVG(trainer_rating), 1) AS average
       FROM course_feedback WHERE trainer_id = ? AND trainer_rating IS NOT NULL`,
      [trainerId],
    ),
    single('SELECT COUNT(*) AS total FROM trainer_competencies WHERE trainer_id = ?', [trainerId]),
  ])

  const [subjectRows] = await pool.query(
    `SELECT a.subject,
            COUNT(DISTINCT a.id) AS assessments,
            COUNT(t.id) AS attempts,
            ROUND(AVG(t.percentage)) AS avg_score
     FROM assessments a
     LEFT JOIN assessment_attempts t ON t.assessment_id = a.id AND t.submitted_at IS NOT NULL
     WHERE a.created_by = ?
     GROUP BY a.subject
     ORDER BY attempts DESC`,
    [trainerId],
  )

  const [recentRows] = await pool.query(
    `SELECT 'assessment' AS kind, a.title, t.percentage AS score, t.submitted_at AS at,
            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS who
     FROM assessment_attempts t
     JOIN assessments a ON a.id = t.assessment_id
     JOIN users u ON u.id = t.user_id
     WHERE a.created_by = ? AND t.submitted_at IS NOT NULL
     UNION ALL
     SELECT 'assignment' AS kind, a.title, s.score, s.submitted_at AS at,
            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS who
     FROM assignment_submissions s
     JOIN assignments a ON a.id = s.assignment_id
     JOIN users u ON u.id = s.user_id
     WHERE a.created_by = ?
     ORDER BY at DESC LIMIT 15`,
    [trainerId, trainerId],
  )

  const number = (value) => Number(value || 0)

  return res.json({
    assessments: {
      total: number(assessments.total),
      published: number(assessments.published),
      attempts: number(assessments.attempts),
      passed: number(assessments.passed),
      averageScore: number(assessments.avg_score),
    },
    assignments: {
      total: number(assignments.total),
      submissions: number(assignments.submissions),
      awaiting: number(assignments.awaiting),
    },
    library: { items: number(library.total), opens: number(library.opens) },
    feedback: {
      count: number(feedback.total),
      average: feedback.average ? Number(feedback.average) : null,
    },
    competencies: number(competencies.total),
    subjects: subjectRows.map((row) => ({
      subject: row.subject,
      assessments: number(row.assessments),
      attempts: number(row.attempts),
      averageScore: number(row.avg_score),
    })),
    recent: recentRows.map((row) => ({
      kind: row.kind,
      title: row.title,
      who: row.who,
      score: row.score === null ? null : Number(row.score),
      at: row.at,
    })),
  })
})

/* ----------------------------------------------------------- audit log ---- */

router.get('/audit', requireAdmin, async (req, res) => {
  res.json(
    await listAudit({
      action: req.query.action,
      actorId: req.query.actorId,
      entityType: req.query.entityType,
      limit: req.query.limit,
      before: req.query.before,
    }),
  )
})

router.get('/audit/actions', requireAdmin, async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT action, COUNT(*) AS count FROM audit_log GROUP BY action ORDER BY count DESC',
  )
  res.json(rows.map((row) => ({ action: row.action, count: Number(row.count) })))
})

/* ------------------------------------------------------------ mail jobs --- */

router.get('/mail/status', requireAdmin, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) AS count FROM email_log
     WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY status`,
  )
  res.json({
    ...mailerStatus(),
    last30Days: rows.map((row) => ({ status: row.status, count: Number(row.count) })),
  })
})

router.post('/mail/reminders', requireAdmin, async (_req, res) => {
  res.json(await runDeadlineReminders())
})

router.post('/mail/digest', requireAdmin, async (_req, res) => {
  res.json(await runWeeklyDigest())
})

export default router
