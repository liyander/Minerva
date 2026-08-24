import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { APPROVAL, ASSIGNABLE_ROLES, normaliseRole, ROLES } from '../config/roles.js'

const router = Router()

router.use(authenticate, requireAdmin)

function shapeUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: normaliseRole(row.role),
    approvalStatus: row.approval_status || APPROVAL.APPROVED,
    department: row.department,
    headline: row.headline,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    rejectionReason: row.rejection_reason,
  }
}

const USER_COLUMNS = `id, username, first_name, last_name, email, role, approval_status,
                      department, headline, is_active, created_at, last_login_at, rejection_reason`

/** All users, filterable by role and approval status. */
router.get('/users', async (req, res) => {
  const filters = []
  const params = []

  if (req.query.status && Object.values(APPROVAL).includes(String(req.query.status))) {
    filters.push('approval_status = ?')
    params.push(String(req.query.status))
  }

  if (req.query.role) {
    const role = normaliseRole(req.query.role)
    // 'operator' is the legacy storage value for a trainee.
    if (role === ROLES.TRAINEE) {
      filters.push("role IN ('trainee', 'operator')")
    } else {
      filters.push('role = ?')
      params.push(role)
    }
  }

  if (req.query.search) {
    filters.push('(username LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)')
    const like = `%${String(req.query.search)}%`
    params.push(like, like, like, like)
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const [rows] = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users ${where} ORDER BY created_at DESC LIMIT 500`,
    params,
  )

  return res.json(rows.map(shapeUser))
})

/** Counts for the approvals badge. */
router.get('/users/pending-count', async (_req, res) => {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS count FROM users WHERE approval_status = 'pending'",
  )
  return res.json({ pending: Number(rows[0]?.count || 0) })
})

router.put('/users/:id/approval', async (req, res) => {
  const status = String(req.body?.status || '')
  if (!Object.values(APPROVAL).includes(status)) {
    return res.status(400).json({ message: 'Status must be pending, approved or rejected' })
  }

  if (Number(req.params.id) === Number(req.user.id)) {
    return res.status(400).json({ message: 'You cannot change your own approval status' })
  }

  const [result] = await pool.query(
    `UPDATE users
     SET approval_status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, rejection_reason = ?
     WHERE id = ?`,
    [status, req.user.id, status === APPROVAL.REJECTED ? req.body?.reason || null : null, req.params.id],
  )

  if (!result.affectedRows) return res.status(404).json({ message: 'User not found' })

  // Let the approved account know the outcome next time they open the app.
  if (status === APPROVAL.APPROVED) {
    await pool.query(
      `INSERT INTO notifications (title, message, type, is_active, target_user_id)
       VALUES (?, ?, 'success', true, ?)`,
      ['Account approved', 'Your account has been approved. Welcome aboard.', req.params.id],
    )
  }

  return res.json({ updated: true, status })
})

router.put('/users/:id/role', async (req, res) => {
  const role = normaliseRole(req.body?.role)
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return res.status(400).json({ message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` })
  }

  if (Number(req.params.id) === Number(req.user.id)) {
    return res.status(400).json({ message: 'You cannot change your own role' })
  }

  const [result] = await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id])
  if (!result.affectedRows) return res.status(404).json({ message: 'User not found' })

  return res.json({ updated: true, role })
})

router.put('/users/:id/active', async (req, res) => {
  if (Number(req.params.id) === Number(req.user.id)) {
    return res.status(400).json({ message: 'You cannot deactivate your own account' })
  }

  const [result] = await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [
    req.body?.isActive === false ? false : true,
    req.params.id,
  ])

  if (!result.affectedRows) return res.status(404).json({ message: 'User not found' })
  return res.json({ updated: true })
})

/** Aggregate dashboard for courses, enrolments, assessments and participation. */
router.get('/dashboard', async (_req, res) => {
  const single = async (sql, params = []) => {
    try {
      const [rows] = await pool.query(sql, params)
      return rows[0] || {}
    } catch (error) {
      if (error?.code === 'ER_NO_SUCH_TABLE') return {}
      throw error
    }
  }

  const many = async (sql, params = []) => {
    try {
      const [rows] = await pool.query(sql, params)
      return rows
    } catch (error) {
      if (error?.code === 'ER_NO_SUCH_TABLE') return []
      throw error
    }
  }

  const [users, courses, enrolments, assessments, certificates, library, feedback] =
    await Promise.all([
      single(`SELECT
                COUNT(*) AS total,
                SUM(role IN ('trainee', 'operator')) AS trainees,
                SUM(role = 'trainer') AS trainers,
                SUM(role = 'admin') AS admins,
                SUM(approval_status = 'pending') AS pending,
                SUM(is_active = true) AS active
              FROM users`),
      single('SELECT COUNT(*) AS total FROM rooms'),
      single(`SELECT COUNT(*) AS total,
                     SUM(status = 'active') AS active,
                     SUM(completed_at IS NOT NULL) AS completed
              FROM course_enrollments`),
      single(`SELECT
                (SELECT COUNT(*) FROM assessments) AS total,
                (SELECT COUNT(*) FROM assessments WHERE is_published = true) AS published,
                (SELECT COUNT(*) FROM assessment_attempts WHERE submitted_at IS NOT NULL) AS attempts,
                (SELECT ROUND(AVG(percentage)) FROM assessment_attempts WHERE submitted_at IS NOT NULL) AS avg_score,
                (SELECT COUNT(*) FROM assessment_attempts WHERE passed = true) AS passed`),
      single('SELECT COUNT(*) AS total FROM certificates'),
      single('SELECT COUNT(*) AS total FROM trainer_library_items WHERE is_published = true'),
      single('SELECT COUNT(*) AS total, ROUND(AVG(rating), 1) AS average FROM course_feedback'),
    ])

  const [topCourses, subjectBreakdown, recentSignups, participation] = await Promise.all([
    many(`SELECT r.id, r.title, r.category,
                 COUNT(e.id) AS enrolments,
                 (SELECT ROUND(AVG(f.rating), 1) FROM course_feedback f WHERE f.room_id = r.id) AS rating
          FROM rooms r
          LEFT JOIN course_enrollments e ON e.room_id = r.id
          GROUP BY r.id
          ORDER BY enrolments DESC, r.title
          LIMIT 10`),
    many(`SELECT subject, COUNT(*) AS assessments,
                 (SELECT COUNT(*) FROM assessment_attempts t
                   JOIN assessments a2 ON a2.id = t.assessment_id
                   WHERE a2.subject = a.subject AND t.submitted_at IS NOT NULL) AS attempts
          FROM assessments a GROUP BY subject ORDER BY assessments DESC LIMIT 12`),
    many(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at DESC LIMIT 8`),
    many(`SELECT DATE(submitted_at) AS day, COUNT(*) AS attempts
          FROM assessment_attempts
          WHERE submitted_at IS NOT NULL AND submitted_at > DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
          GROUP BY DATE(submitted_at) ORDER BY day`),
  ])

  const number = (value) => Number(value || 0)

  return res.json({
    users: {
      total: number(users.total),
      trainees: number(users.trainees),
      trainers: number(users.trainers),
      admins: number(users.admins),
      pending: number(users.pending),
      active: number(users.active),
    },
    courses: { total: number(courses.total) },
    enrolments: {
      total: number(enrolments.total),
      active: number(enrolments.active),
      completed: number(enrolments.completed),
    },
    assessments: {
      total: number(assessments.total),
      published: number(assessments.published),
      attempts: number(assessments.attempts),
      passed: number(assessments.passed),
      averageScore: number(assessments.avg_score),
    },
    certifications: { total: number(certificates.total) },
    library: { published: number(library.total) },
    feedback: { total: number(feedback.total), average: feedback.average ? Number(feedback.average) : null },
    topCourses: topCourses.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      enrolments: number(row.enrolments),
      rating: row.rating === null ? null : Number(row.rating),
    })),
    subjects: subjectBreakdown.map((row) => ({
      subject: row.subject,
      assessments: number(row.assessments),
      attempts: number(row.attempts),
    })),
    recentSignups: recentSignups.map(shapeUser),
    participation: participation.map((row) => ({ day: row.day, attempts: number(row.attempts) })),
  })
})

/**
 * Trainer-facing view of the trainees engaging with their material: enrolment,
 * assessment attempts and pass rates.
 */
router.get('/participation', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.email,
            (SELECT COUNT(*) FROM course_enrollments e WHERE e.user_id = u.id) AS enrolments,
            (SELECT COUNT(*) FROM assessment_attempts t WHERE t.user_id = u.id AND t.submitted_at IS NOT NULL) AS attempts,
            (SELECT ROUND(AVG(t.percentage)) FROM assessment_attempts t WHERE t.user_id = u.id AND t.submitted_at IS NOT NULL) AS avg_score,
            (SELECT COUNT(*) FROM certificates c WHERE c.user_id = u.id) AS certificates,
            u.last_login_at
     FROM users u
     WHERE u.role IN ('trainee', 'operator') AND u.is_active = true
     ORDER BY attempts DESC, enrolments DESC
     LIMIT 300`,
  )

  return res.json(
    rows.map((row) => ({
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username,
      username: row.username,
      email: row.email,
      enrolments: Number(row.enrolments || 0),
      attempts: Number(row.attempts || 0),
      averageScore: row.avg_score === null ? null : Number(row.avg_score),
      certificates: Number(row.certificates || 0),
      lastLoginAt: row.last_login_at,
    })),
  )
})

export default router
