import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin, requireTrainer } from '../middleware/auth.js'
import { ASSIGNABLE_ROLES, initialApprovalFor, normaliseRole, ROLES } from '../config/roles.js'
import { recordAudit } from '../services/audit.js'

const router = Router()

router.use(authenticate)

/* ------------------------------------------------------------------ cohorts */

router.get('/', requireTrainer, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, u.username AS owner_username, u.first_name AS owner_first_name,
            (SELECT COUNT(*) FROM cohort_members m WHERE m.cohort_id = c.id) AS member_count
     FROM cohorts c
     LEFT JOIN users u ON u.id = c.owner_id
     ORDER BY c.is_active DESC, c.created_at DESC
     LIMIT 200`,
  )

  return res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      department: row.department,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      isActive: Boolean(row.is_active),
      ownerName: row.owner_first_name || row.owner_username,
      memberCount: Number(row.member_count || 0),
    })),
  )
})

/** The signed-in trainee's batches and learning assigned through enrolment. */
router.get('/me', async (req, res) => {
  const [cohortRows] = await pool.query(
    `SELECT c.id, c.name, c.code, c.description, c.department, c.starts_on, c.ends_on,
            c.is_active, m.member_role
     FROM cohort_members m
     JOIN cohorts c ON c.id = m.cohort_id
     WHERE m.user_id = ?
     ORDER BY c.is_active DESC, c.starts_on DESC, c.name ASC`,
    [req.user.id],
  )

  const [enrolmentRows] = await pool.query(
    `SELECT e.id, e.status, e.enrolled_at, e.completed_at, e.room_id, e.career_path_id,
            r.title AS course_title, r.slug AS course_slug, p.title AS path_title
     FROM course_enrollments e
     LEFT JOIN rooms r ON r.id = e.room_id
     LEFT JOIN career_paths p ON p.id = e.career_path_id
     WHERE e.user_id = ?
     ORDER BY e.status = 'active' DESC, e.enrolled_at DESC`,
    [req.user.id],
  )

  return res.json({
    cohorts: cohortRows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      department: row.department,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      isActive: Boolean(row.is_active),
      memberRole: row.member_role,
    })),
    enrolments: enrolmentRows.map((row) => ({
      id: row.id,
      status: row.status,
      enrolledAt: row.enrolled_at,
      completedAt: row.completed_at,
      kind: row.room_id ? 'course' : 'path',
      title: row.course_title || row.path_title || 'Assigned learning',
      link: row.room_id
        ? `/learn/course/${row.course_slug || row.room_id}`
        : `/learn/path/${row.career_path_id}`,
    })),
  })
})

router.post('/', requireAdmin, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ message: 'Name is required' })

  try {
    const [result] = await pool.query(
      `INSERT INTO cohorts (name, code, description, department, starts_on, ends_on, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        req.body?.code || null,
        req.body?.description || null,
        req.body?.department || null,
        req.body?.startsOn || null,
        req.body?.endsOn || null,
        req.body?.ownerId || req.user.id,
      ],
    )

    await recordAudit(req, {
      action: 'cohort.created',
      entityType: 'cohort',
      entityId: result.insertId,
      summary: `Created cohort "${name}"`,
    })

    return res.status(201).json({ id: result.insertId })
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A cohort with that code already exists' })
    }
    throw error
  }
})

router.put('/:id', requireAdmin, async (req, res) => {
  const fields = {
    name: req.body?.name,
    code: req.body?.code,
    description: req.body?.description,
    department: req.body?.department,
    starts_on: req.body?.startsOn,
    ends_on: req.body?.endsOn,
    is_active: req.body?.isActive,
  }
  const updates = Object.entries(fields).filter(([, value]) => value !== undefined)
  if (!updates.length) return res.status(400).json({ message: 'Nothing to update' })

  const [result] = await pool.query(
    `UPDATE cohorts SET ${updates.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...updates.map(([, value]) => (value === '' ? null : value)), req.params.id],
  )
  if (!result.affectedRows) return res.status(404).json({ message: 'Cohort not found' })

  return res.json({ updated: true })
})

router.delete('/:id', requireAdmin, async (req, res) => {
  const [result] = await pool.query('DELETE FROM cohorts WHERE id = ?', [req.params.id])
  if (!result.affectedRows) return res.status(404).json({ message: 'Cohort not found' })

  await recordAudit(req, {
    action: 'cohort.deleted',
    entityType: 'cohort',
    entityId: req.params.id,
    summary: 'Deleted a cohort',
  })

  return res.json({ deleted: true })
})

/** Members plus a progress roll-up per person. */
router.get('/:id/members', requireTrainer, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT m.id AS membership_id, m.member_role, m.joined_at,
            u.id, u.username, u.first_name, u.last_name, u.email, u.role, u.department,
            (SELECT COUNT(*) FROM course_enrollments e WHERE e.user_id = u.id) AS enrolments,
            (SELECT COUNT(*) FROM assessment_attempts t
              WHERE t.user_id = u.id AND t.submitted_at IS NOT NULL) AS attempts,
            (SELECT ROUND(AVG(t.percentage)) FROM assessment_attempts t
              WHERE t.user_id = u.id AND t.submitted_at IS NOT NULL) AS avg_score,
            (SELECT COUNT(*) FROM certificates c WHERE c.user_id = u.id) AS certificates
     FROM cohort_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.cohort_id = ?
     ORDER BY u.first_name, u.username`,
    [req.params.id],
  )

  return res.json(
    rows.map((row) => ({
      membershipId: row.membership_id,
      memberRole: row.member_role,
      joinedAt: row.joined_at,
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username,
      username: row.username,
      email: row.email,
      role: normaliseRole(row.role),
      department: row.department,
      enrolments: Number(row.enrolments || 0),
      attempts: Number(row.attempts || 0),
      averageScore: row.avg_score === null ? null : Number(row.avg_score),
      certificates: Number(row.certificates || 0),
    })),
  )
})

router.post('/:id/members', requireAdmin, async (req, res) => {
  const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : []
  if (!userIds.length) return res.status(400).json({ message: 'Provide at least one user' })

  const memberRole = normaliseRole(req.body?.memberRole || ROLES.TRAINEE)

  let added = 0
  for (const userId of userIds) {
    const [result] = await pool.query(
      `INSERT INTO cohort_members (cohort_id, user_id, member_role) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE member_role = VALUES(member_role)`,
      [req.params.id, userId, memberRole],
    )
    if (result.affectedRows === 1) added += 1
    await pool.query('UPDATE users SET primary_cohort_id = ? WHERE id = ? AND primary_cohort_id IS NULL', [
      req.params.id,
      userId,
    ])
  }

  await recordAudit(req, {
    action: 'cohort.membersAdded',
    entityType: 'cohort',
    entityId: req.params.id,
    summary: `Added ${added} member(s) to a cohort`,
  })

  return res.status(201).json({ added })
})

router.delete('/:id/members/:userId', requireAdmin, async (req, res) => {
  const [result] = await pool.query(
    'DELETE FROM cohort_members WHERE cohort_id = ? AND user_id = ?',
    [req.params.id, req.params.userId],
  )
  if (!result.affectedRows) return res.status(404).json({ message: 'Membership not found' })

  await pool.query(
    'UPDATE users SET primary_cohort_id = NULL WHERE id = ? AND primary_cohort_id = ?',
    [req.params.userId, req.params.id],
  )

  return res.json({ removed: true })
})

/** Enrols every member of a cohort into a course or path in one action. */
router.post('/:id/enrol', requireAdmin, async (req, res) => {
  const roomId = req.body?.roomId || null
  const careerPathId = req.body?.careerPathId || null
  if (!roomId && !careerPathId) {
    return res.status(400).json({ message: 'Provide either roomId or careerPathId' })
  }

  const [members] = await pool.query(
    "SELECT user_id FROM cohort_members WHERE cohort_id = ? AND member_role = 'trainee'",
    [req.params.id],
  )

  let enrolled = 0
  for (const member of members) {
    const [result] = await pool.query(
      `INSERT INTO course_enrollments (user_id, room_id, career_path_id, status)
       VALUES (?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE status = 'active'`,
      [member.user_id, roomId, careerPathId],
    )
    if (result.affectedRows === 1) enrolled += 1
  }

  await recordAudit(req, {
    action: 'cohort.bulkEnrol',
    entityType: 'cohort',
    entityId: req.params.id,
    summary: `Enrolled ${enrolled} member(s)`,
    metadata: { roomId, careerPathId },
  })

  return res.json({ enrolled, members: members.length })
})

/* -------------------------------------------------------------- bulk import */

/**
 * Creates accounts from parsed CSV rows. Rows are validated individually so one
 * bad line does not abort the whole import; every outcome is reported back.
 */
router.post('/import/users', requireAdmin, async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  if (!rows.length) return res.status(400).json({ message: 'No rows to import' })
  if (rows.length > 1000) {
    return res.status(413).json({ message: 'Import at most 1000 rows at a time' })
  }

  const cohortId = req.body?.cohortId || null
  const defaultRole = normaliseRole(req.body?.defaultRole || ROLES.TRAINEE)
  const autoApprove = req.body?.autoApprove !== false

  const results = []
  let created = 0

  for (const [index, row] of rows.entries()) {
    const line = index + 1
    const email = String(row.email || '').trim().toLowerCase()
    const firstName = String(row.firstName || row.first_name || '').trim()
    const lastName = String(row.lastName || row.last_name || '').trim()
    const role = ASSIGNABLE_ROLES.includes(normaliseRole(row.role)) ? normaliseRole(row.role) : defaultRole
    const password = String(row.password || '').trim() || Math.random().toString(36).slice(-12)

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      results.push({ line, email, status: 'skipped', reason: 'Invalid email' })
      continue
    }
    if (!firstName) {
      results.push({ line, email, status: 'skipped', reason: 'Missing first name' })
      continue
    }

    const base =
      `${firstName}${lastName ? `_${lastName}` : ''}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || `user_${Date.now()}_${line}`

    let username = base
    let suffix = 1
    /* eslint-disable no-await-in-loop */
    while (true) {
      const [taken] = await pool.query('SELECT 1 FROM users WHERE username = ? LIMIT 1', [username])
      if (!taken.length) break
      username = `${base}_${suffix}`
      suffix += 1
    }

    try {
      const [result] = await pool.query(
        `INSERT INTO users
           (username, first_name, last_name, email, password_hash, role, department,
            is_active, approval_status, primary_cohort_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, true, ?, ?)`,
        [
          username,
          firstName,
          lastName || null,
          email,
          await bcrypt.hash(password, 10),
          role,
          row.department || null,
          autoApprove ? 'approved' : initialApprovalFor(role),
          cohortId,
        ],
      )

      if (cohortId) {
        await pool.query(
          'INSERT IGNORE INTO cohort_members (cohort_id, user_id, member_role) VALUES (?, ?, ?)',
          [cohortId, result.insertId, role],
        )
      }

      created += 1
      results.push({
        line,
        email,
        status: 'created',
        username,
        // Returned once so the admin can distribute credentials.
        temporaryPassword: row.password ? undefined : password,
      })
    } catch (error) {
      results.push({
        line,
        email,
        status: 'failed',
        reason: error?.code === 'ER_DUP_ENTRY' ? 'Email already exists' : error.message,
      })
    }
    /* eslint-enable no-await-in-loop */
  }

  await recordAudit(req, {
    action: 'users.bulkImport',
    entityType: 'user',
    summary: `Imported ${created} of ${rows.length} rows`,
    metadata: { cohortId, defaultRole },
  })

  return res.json({ created, total: rows.length, results })
})

export default router
