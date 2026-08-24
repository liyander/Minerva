import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { isRole, normaliseRole, ROLES } from '../config/roles.js'

const router = Router()

router.use(authenticate)

// Sub-resources of a professional profile. Each is a flat list owned by a user,
// so one generic handler set covers them all.
const SECTIONS = {
  qualifications: {
    table: 'user_qualifications',
    columns: ['qualification', 'institution', 'field_of_study', 'grade', 'start_year', 'end_year', 'sort_order'],
    required: ['qualification'],
    order: 'end_year DESC, sort_order ASC, id DESC',
  },
  experience: {
    table: 'user_work_experience',
    columns: ['job_title', 'organisation', 'location', 'description', 'started_on', 'ended_on', 'is_current', 'sort_order'],
    required: ['job_title'],
    order: 'is_current DESC, started_on DESC, id DESC',
  },
  skills: {
    table: 'user_skills',
    columns: ['skill', 'proficiency'],
    required: ['skill'],
    order: 'skill ASC',
  },
  interests: {
    table: 'user_interests',
    columns: ['interest'],
    required: ['interest'],
    order: 'interest ASC',
  },
  certificates: {
    table: 'user_certificates',
    columns: ['title', 'issuer', 'credential_id', 'credential_url', 'issued_on', 'expires_on', 'file_name', 'file_type', 'file_data'],
    required: ['title'],
    order: 'issued_on DESC, id DESC',
  },
}

const DATE_COLUMNS = new Set(['started_on', 'ended_on', 'issued_on', 'expires_on'])
const BOOLEAN_COLUMNS = new Set(['is_current'])
const NUMBER_COLUMNS = new Set(['start_year', 'end_year', 'sort_order'])

// Body keys arrive as camelCase from the client.
function camelToSnake(value) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function snakeToCamel(value) {
  return value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase())
}

function readColumn(body, column) {
  const camel = snakeToCamel(column)
  const raw = body?.[camel] !== undefined ? body[camel] : body?.[column]

  if (raw === undefined || raw === null || raw === '') {
    return BOOLEAN_COLUMNS.has(column) ? false : null
  }

  if (BOOLEAN_COLUMNS.has(column)) return Boolean(raw)
  if (NUMBER_COLUMNS.has(column)) {
    const number = Number(raw)
    return Number.isFinite(number) ? number : null
  }
  if (DATE_COLUMNS.has(column)) {
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }

  return String(raw)
}

function serialiseRow(row) {
  const output = {}
  for (const [key, value] of Object.entries(row)) {
    output[snakeToCamel(key)] = value
  }
  return output
}

async function listSection(userId, sectionKey) {
  const section = SECTIONS[sectionKey]
  const [rows] = await pool.query(
    `SELECT * FROM ${section.table} WHERE user_id = ? ORDER BY ${section.order}`,
    [userId],
  )
  return rows.map(serialiseRow)
}

/** The signed-in user's full professional profile. */
router.get('/me', async (req, res) => {
  const [userRows] = await pool.query(
    `SELECT id, username, first_name, last_name, email, role, headline, phone, department,
            about_me, resume_url, github_profile, linkedin_profile, approval_status, created_at
     FROM users WHERE id = ? LIMIT 1`,
    [req.user.id],
  )

  if (!userRows.length) {
    return res.status(404).json({ message: 'Profile not found' })
  }

  const sections = await Promise.all(
    Object.keys(SECTIONS).map(async (key) => [key, await listSection(req.user.id, key)]),
  )

  return res.json({
    user: { ...serialiseRow(userRows[0]), role: normaliseRole(userRows[0].role) },
    ...Object.fromEntries(sections),
  })
})

/** Free-text fields that live directly on the users row. */
router.put('/me', async (req, res) => {
  const fields = {
    first_name: req.body?.firstName,
    last_name: req.body?.lastName,
    headline: req.body?.headline,
    phone: req.body?.phone,
    department: req.body?.department,
    about_me: req.body?.aboutMe,
    resume_url: req.body?.resumeUrl,
    github_profile: req.body?.githubProfile,
    linkedin_profile: req.body?.linkedinProfile,
  }

  const updates = Object.entries(fields).filter(([, value]) => value !== undefined)
  if (!updates.length) {
    return res.status(400).json({ message: 'Nothing to update' })
  }

  await pool.query(
    `UPDATE users SET ${updates.map(([column]) => `${column} = ?`).join(', ')} WHERE id = ?`,
    [...updates.map(([, value]) => (value === '' ? null : value)), req.user.id],
  )

  return res.json({ updated: true })
})

router.get('/me/:section', async (req, res) => {
  const section = SECTIONS[req.params.section]
  if (!section) return res.status(404).json({ message: 'Unknown profile section' })
  return res.json(await listSection(req.user.id, req.params.section))
})

router.post('/me/:section', async (req, res) => {
  const sectionKey = req.params.section
  const section = SECTIONS[sectionKey]
  if (!section) return res.status(404).json({ message: 'Unknown profile section' })

  for (const column of section.required) {
    if (!readColumn(req.body, column)) {
      return res.status(400).json({ message: `${snakeToCamel(column)} is required` })
    }
  }

  const values = section.columns.map((column) => readColumn(req.body, column))

  try {
    const [result] = await pool.query(
      `INSERT INTO ${section.table} (user_id, ${section.columns.join(', ')})
       VALUES (?, ${section.columns.map(() => '?').join(', ')})`,
      [req.user.id, ...values],
    )
    return res.status(201).json({ id: result.insertId })
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That entry already exists' })
    }
    throw error
  }
})

router.put('/me/:section/:id', async (req, res) => {
  const section = SECTIONS[req.params.section]
  if (!section) return res.status(404).json({ message: 'Unknown profile section' })

  const provided = section.columns.filter((column) => {
    const camel = snakeToCamel(column)
    return req.body?.[camel] !== undefined || req.body?.[column] !== undefined
  })

  if (!provided.length) return res.status(400).json({ message: 'Nothing to update' })

  const [result] = await pool.query(
    `UPDATE ${section.table} SET ${provided.map((c) => `${c} = ?`).join(', ')}
     WHERE id = ? AND user_id = ?`,
    [...provided.map((column) => readColumn(req.body, column)), req.params.id, req.user.id],
  )

  if (!result.affectedRows) return res.status(404).json({ message: 'Entry not found' })
  return res.json({ updated: true })
})

router.delete('/me/:section/:id', async (req, res) => {
  const section = SECTIONS[req.params.section]
  if (!section) return res.status(404).json({ message: 'Unknown profile section' })

  const [result] = await pool.query(`DELETE FROM ${section.table} WHERE id = ? AND user_id = ?`, [
    req.params.id,
    req.user.id,
  ])

  if (!result.affectedRows) return res.status(404).json({ message: 'Entry not found' })
  return res.json({ deleted: true })
})

router.get('/me/activity', async (req, res) => {
  try {
    const userId = req.user.id
    
    // 1. Heatmap Data (aggregating from progress tables)
    const [counts] = await pool.query(`
      SELECT DATE(updated_at) as date, COUNT(*) as count
      FROM (
        SELECT updated_at FROM user_room_progress WHERE user_id = ?
        UNION ALL
        SELECT updated_at FROM user_room_question_progress WHERE user_id = ?
        UNION ALL
        SELECT created_at FROM user_room_theoretical_attempts WHERE user_id = ?
      ) as combined
      GROUP BY DATE(updated_at)
    `, [userId, userId, userId])

    // 2. Recent Logs Data (fetching actual courses interacted with)
    const [logs] = await pool.query(`
      SELECT r.title as action, urp.updated_at as time, 'school' as icon
      FROM user_room_progress urp
      JOIN rooms r ON urp.room_id = r.id
      WHERE urp.user_id = ?
      ORDER BY urp.updated_at DESC
      LIMIT 10
    `, [userId])

    return res.json({ counts, logs })
  } catch (error) {
    console.error('Failed to fetch activity data:', error)
    return res.status(500).json({ message: 'Failed to fetch activity data' })
  }
})

/**
 * Public-facing profile. Trainers are visible to everyone so trainees can see
 * who teaches a subject; trainee profiles are visible to trainers and admins.
 */
router.get('/:userId', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, username, first_name, last_name, email, role, headline, department,
            about_me, linkedin_profile, github_profile, created_at
     FROM users WHERE id = ? LIMIT 1`,
    [req.params.userId],
  )

  if (!rows.length) return res.status(404).json({ message: 'Profile not found' })

  const target = rows[0]
  const targetRole = normaliseRole(target.role)
  const viewerIsStaff = isRole(req.user.role, ROLES.TRAINER, ROLES.ADMIN)
  const isSelf = Number(req.user.id) === Number(target.id)

  if (targetRole !== ROLES.TRAINER && !viewerIsStaff && !isSelf) {
    return res.status(403).json({ message: 'Not allowed to view this profile' })
  }

  const userId = target.id
  const [qualifications, experience, skills, interests, certificates] = await Promise.all([
    listSection(userId, 'qualifications'),
    listSection(userId, 'experience'),
    listSection(userId, 'skills'),
    listSection(userId, 'interests'),
    listSection(userId, 'certificates'),
  ])

  const [competencies] =
    targetRole === ROLES.TRAINER
      ? await pool.query(
          'SELECT subject, proficiency, proficiency_score, years_experience, is_verified FROM trainer_competencies WHERE trainer_id = ? ORDER BY proficiency_score DESC',
          [userId],
        )
      : [[]]

  return res.json({
    user: { ...serialiseRow(target), role: targetRole },
    qualifications,
    experience,
    skills,
    interests,
    // Certificate file blobs are stripped from other people's profiles.
    certificates: certificates.map(({ fileData, ...rest }) => (isSelf ? { fileData, ...rest } : rest)),
    competencies: competencies.map(serialiseRow),
  })
})

/** Admin listing used by the approval and competency screens. */
router.get('/', requireAdmin, async (req, res) => {
  const role = req.query.role ? normaliseRole(req.query.role) : null
  const params = []
  let where = '1 = 1'

  if (role) {
    where += role === ROLES.TRAINEE ? " AND role IN ('trainee', 'operator')" : ' AND role = ?'
    if (role !== ROLES.TRAINEE) params.push(role)
  }

  const [rows] = await pool.query(
    `SELECT id, username, first_name, last_name, email, role, approval_status, department,
            headline, is_active, created_at, last_login_at
     FROM users WHERE ${where} ORDER BY created_at DESC LIMIT 500`,
    params,
  )

  return res.json(rows.map((row) => ({ ...serialiseRow(row), role: normaliseRole(row.role) })))
})

export default router
