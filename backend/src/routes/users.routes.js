import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()

const editableProfileFields = [
  'first_name',
  'last_name',
  'email',
  'hackthebox_profile',
  'tryhackme_profile',
  'picoctf_profile',
  'github_profile',
  'linkedin_profile',
  'resume_url',
  'about_me',
  'projects',
  'achievements',
]

const allowedRoles = new Set(['operator', 'developer', 'admin'])

function normalizeNullable(value) {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return null
  }

  const trimmed = String(value).trim()
  return trimmed.length ? trimmed : null
}

function normalizeUserIds(value) {
  const values = Array.isArray(value) ? value : [value]
  return [...new Set(
    values
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0),
  )]
}

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw || '')
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function isProtectedAdminUser(user) {
  return String(user?.username || '').trim().toLowerCase() === 'admin01'
}

async function getUserById(userId) {
  const [rows] = await pool.query(
    'SELECT id, username, role, password_hash FROM users WHERE id = ? LIMIT 1',
    [userId],
  )
  return rows[0] || null
}

async function resetUserActivity(conn, userIds) {
  if (!userIds.length) {
    return 0
  }

  await conn.query('DELETE FROM user_room_question_progress WHERE user_id IN (?)', [userIds])
  await conn.query('DELETE FROM user_room_theoretical_attempts WHERE user_id IN (?)', [userIds])
  await conn.query('DELETE FROM user_room_progress WHERE user_id IN (?)', [userIds])
  await conn.query('DELETE FROM user_notes WHERE user_id IN (?)', [userIds])
  await conn.query('DELETE FROM certificates WHERE user_id IN (?)', [userIds])
  await conn.query('DELETE FROM ctf_event_registrations WHERE user_id IN (?)', [userIds])
  await conn.query('DELETE FROM ctf_notification_logs WHERE user_id IN (?)', [userIds])

  return userIds.length
}

router.get('/me', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT
      id,
      username,
      registration_number,
      first_name,
      last_name,
      email,
      role,
      hackthebox_profile,
      tryhackme_profile,
      picoctf_profile,
      github_profile,
      linkedin_profile,
      resume_url,
      about_me,
      projects,
      achievements,
      (
        SELECT COUNT(*)
        FROM user_room_progress urp
        WHERE urp.user_id = users.id AND urp.completed_at IS NOT NULL
      ) AS completed_rooms,
      created_at,
      updated_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [req.user.id],
  )

  if (!rows.length) {
    return res.status(404).json({ message: 'User not found' })
  }

  return res.json(rows[0])
})

router.put('/me', authenticate, async (req, res) => {
  const updates = []
  const values = []

  for (const field of editableProfileFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      updates.push(`${field} = ?`)
      values.push(normalizeNullable(req.body[field]))
    }
  }

  if (!updates.length) {
    return res.status(400).json({ message: 'No editable fields provided' })
  }

  values.push(req.user.id)

  try {
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values)
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email is already in use' })
    }
    throw error
  }

  const [rows] = await pool.query(
    `SELECT
      id,
      username,
      registration_number,
      first_name,
      last_name,
      email,
      role,
      hackthebox_profile,
      tryhackme_profile,
      picoctf_profile,
      github_profile,
      linkedin_profile,
      resume_url,
      about_me,
      projects,
      achievements,
      created_at,
      updated_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [req.user.id],
  )

  return res.json(rows[0])
})

router.post('/me/password', authenticate, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '')
  const newPassword = String(req.body?.newPassword || '')

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' })
  }

  if (newPassword.trim().length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' })
  }

  const user = await getUserById(req.user.id)
  if (!user) {
    return res.status(404).json({ message: 'User not found' })
  }

  const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash)
  if (!passwordMatches) {
    return res.status(403).json({ message: 'Current password is incorrect' })
  }

  const hash = await bcrypt.hash(newPassword, 10)
  await pool.query(
    'UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?',
    [hash, req.user.id],
  )

  return res.json({ changed: true })
})

router.get('/admin/registrations', authenticate, requireAdmin, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT
      id,
      username,
      registration_number,
      first_name,
      last_name,
      email,
      role,
      is_active,
      hackthebox_profile,
      tryhackme_profile,
      picoctf_profile,
      github_profile,
      linkedin_profile,
      resume_url,
      about_me,
      projects,
      achievements,
      created_at,
      updated_at
     FROM users
     ORDER BY created_at DESC`,
  )

  return res.json(rows)
})

router.post('/admin/admins', authenticate, requireAdmin, async (req, res) => {
  const username = String(req.body?.username || '').trim()
  const registrationNumber = normalizeNullable(req.body?.registrationNumber)
  const email = normalizeNullable(req.body?.email)?.toLowerCase() || null
  const password = String(req.body?.password || '')

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' })
  }

  if (password.trim().length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' })
  }

  const hash = await bcrypt.hash(password, 10)

  try {
    const [result] = await pool.query(
      `INSERT INTO users (username, registration_number, email, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, 'admin', true)`,
      [username, registrationNumber, email, hash],
    )

    const [rows] = await pool.query(
      `SELECT
        id,
        username,
        registration_number,
        first_name,
        last_name,
        email,
        role,
        is_active,
        created_at,
        updated_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [result.insertId],
    )

    return res.status(201).json(rows[0])
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Username, email, or registration number already exists' })
    }
    throw error
  }
})

router.post('/admin/registrations/bulk-promote-admin', authenticate, requireAdmin, async (req, res) => {
  const userIds = normalizeUserIds(req.body?.userIds)

  if (!userIds.length) {
    return res.status(400).json({ message: 'Select at least one valid user.' })
  }

  const [result] = await pool.query(
    "UPDATE users SET role = 'admin', is_active = true WHERE id IN (?) AND role <> 'admin'",
    [userIds],
  )

  return res.json({
    promoted: Number(result.affectedRows || 0),
    skipped: userIds.length - Number(result.affectedRows || 0),
  })
})

router.post('/admin/registrations/bulk-revoke-admin', authenticate, requireAdmin, async (req, res) => {
  const requestedIds = normalizeUserIds(req.body?.userIds)
  const [protectedRows] = requestedIds.length
    ? await pool.query(
        "SELECT id FROM users WHERE id IN (?) AND LOWER(username) = 'admin01'",
        [requestedIds],
      )
    : [[]]
  const protectedIds = new Set(protectedRows.map((row) => row.id))
  const userIds = requestedIds.filter((id) => id !== req.user.id && !protectedIds.has(id))

  if (!requestedIds.length) {
    return res.status(400).json({ message: 'Select at least one valid user.' })
  }

  if (!userIds.length) {
    return res.status(400).json({ message: 'You cannot revoke your own active admin account.' })
  }

  const [result] = await pool.query(
    "UPDATE users SET role = 'operator' WHERE id IN (?) AND role = 'admin'",
    [userIds],
  )

  return res.json({
    revoked: Number(result.affectedRows || 0),
    skipped: requestedIds.length - Number(result.affectedRows || 0),
  })
})

router.post('/admin/registrations/:id/promote-admin', authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  const [result] = await pool.query(
    "UPDATE users SET role = 'admin', is_active = true WHERE id = ? AND role <> 'admin'",
    [userId],
  )

  if (!result.affectedRows) {
    const [rows] = await pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId])
    if (!rows.length) {
      return res.status(404).json({ message: 'User not found' })
    }
  }

  return res.json({ promoted: Number(result.affectedRows || 0), userId })
})

router.post('/admin/registrations/:id/revoke-admin', authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  if (userId === req.user.id) {
    return res.status(400).json({ message: 'You cannot revoke your own active admin account.' })
  }

  const user = await getUserById(userId)
  if (!user) {
    return res.status(404).json({ message: 'User not found' })
  }

  if (isProtectedAdminUser(user)) {
    return res.status(400).json({ message: 'admin01 is a permanent admin and cannot be revoked.' })
  }

  const [result] = await pool.query(
    "UPDATE users SET role = 'operator' WHERE id = ? AND role = 'admin'",
    [userId],
  )
  return res.json({ revoked: Number(result.affectedRows || 0), userId })
})

router.post('/admin/registrations/:id/password', authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  const newPassword = String(req.body?.newPassword || '')

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  if (newPassword.trim().length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' })
  }

  const user = await getUserById(userId)
  if (!user) {
    return res.status(404).json({ message: 'User not found' })
  }

  const hash = await bcrypt.hash(newPassword, 10)
  await pool.query(
    'UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?',
    [hash, userId],
  )

  return res.json({ changed: true, userId })
})

router.get('/admin/registrations/:id', authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  const [rows] = await pool.query(
    `SELECT
      id,
      username,
      registration_number,
      first_name,
      last_name,
      email,
      role,
      is_active,
      hackthebox_profile,
      tryhackme_profile,
      picoctf_profile,
      github_profile,
      linkedin_profile,
      resume_url,
      about_me,
      projects,
      achievements,
      created_at,
      updated_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId],
  )

  if (!rows.length) {
    return res.status(404).json({ message: 'User not found' })
  }

  return res.json(rows[0])
})

router.get('/admin/registrations/:id/theoretical-attempts', authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  const [rows] = await pool.query(
    `SELECT
      uta.room_id,
      uta.questions_json,
      uta.answers_json,
      uta.technical_score,
      uta.grammar_score,
      uta.feedback,
      uta.passed,
      uta.evaluated_at,
      r.title AS room_title,
      r.category
     FROM user_room_theoretical_attempts uta
     LEFT JOIN rooms r ON r.id = uta.room_id
     WHERE uta.user_id = ?
     ORDER BY COALESCE(uta.evaluated_at, uta.updated_at) DESC`,
    [userId],
  )

  const attempts = rows.map((row) => {
    const questions = safeJsonParse(row.questions_json, [])
    const answers = safeJsonParse(row.answers_json, {})
    const interviewQuestions = questions
      .filter((question) => question.bonus || question.optional || question.sourceType === 'interview')
      .map((question) => ({
        id: question.id,
        prompt: question.prompt,
        company: question.company || 'General cybersecurity interview practice',
        interview: question.interview || '',
        sourceInfo: question.sourceInfo || '',
        answer: answers?.[question.id] || '',
        answered: Boolean(String(answers?.[question.id] || '').trim()),
      }))

    return {
      roomId: row.room_id,
      roomTitle: row.room_title || row.room_id,
      category: row.category || '',
      technicalScore: Number(row.technical_score || 0),
      grammarScore: Number(row.grammar_score || 0),
      passed: Boolean(row.passed),
      feedback: row.feedback || '',
      evaluatedAt: row.evaluated_at ? new Date(row.evaluated_at).toISOString() : null,
      interviewQuestions,
    }
  })

  return res.json(attempts)
})

router.get('/admin/registrations/:id/completed-rooms', authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  const [userRows] = await pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId])
  if (!userRows.length) {
    return res.status(404).json({ message: 'User not found' })
  }

  const [rows] = await pool.query(
    `SELECT
       urp.room_id,
       urp.started_at,
       urp.completed_at,
       r.slug,
       r.title,
       r.category,
       r.level,
       r.difficulty,
       r.room_type,
       r.xp,
       uta.technical_score,
       uta.grammar_score,
       uta.passed AS ai_passed,
       uta.evaluated_at
     FROM user_room_progress urp
     INNER JOIN rooms r ON r.id = urp.room_id
     LEFT JOIN user_room_theoretical_attempts uta
       ON uta.user_id = urp.user_id AND uta.room_id = urp.room_id
     WHERE urp.user_id = ? AND urp.completed_at IS NOT NULL
     ORDER BY urp.completed_at DESC`,
    [userId],
  )

  const completedRooms = rows.map((row) => ({
    roomId: row.room_id,
    slug: row.slug || row.room_id,
    title: row.title || row.room_id,
    category: row.category || 'Uncategorized',
    level: row.level || row.difficulty || '',
    difficulty: row.difficulty || row.level || '',
    roomType: row.room_type || 'theoretical',
    xp: row.xp || '0 XP',
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    technicalScore: Number(row.technical_score || 0),
    grammarScore: Number(row.grammar_score || 0),
    aiPassed: Boolean(row.ai_passed),
    evaluatedAt: row.evaluated_at ? new Date(row.evaluated_at).toISOString() : null,
  }))

  const categoryCounts = completedRooms.reduce((map, room) => {
    map[room.category] = (map[room.category] || 0) + 1
    return map
  }, {})

  const totalXp = completedRooms.reduce((sum, room) => {
    const numericXp = Number(String(room.xp || '').replace(/[^0-9]/g, ''))
    return sum + (Number.isFinite(numericXp) ? numericXp : 0)
  }, 0)

  return res.json({
    totalCompleted: completedRooms.length,
    totalXp,
    categoryCounts,
    rooms: completedRooms,
  })
})

router.get('/admin/registrations/:id/room-activity', authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  const [userRows] = await pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId])
  if (!userRows.length) {
    return res.status(404).json({ message: 'User not found' })
  }

  const [progressRows] = await pool.query(
    `SELECT
       urp.room_id,
       urp.started_at,
       urp.completed_at,
       r.slug,
       r.title,
       r.category,
       r.level,
       r.difficulty,
       r.room_type,
       r.xp,
       r.questions_json AS manual_questions_json,
       r.questions_enabled,
       r.practical_ai_questions_enabled,
       uta.questions_json AS ai_questions_json,
       uta.answers_json AS ai_answers_json,
       uta.technical_score,
       uta.grammar_score,
       uta.feedback,
       uta.passed AS ai_passed,
       uta.evaluated_at
     FROM user_room_progress urp
     INNER JOIN rooms r ON r.id = urp.room_id
     LEFT JOIN user_room_theoretical_attempts uta
       ON uta.user_id = urp.user_id AND uta.room_id = urp.room_id
     WHERE urp.user_id = ?
     ORDER BY COALESCE(urp.completed_at, urp.started_at) DESC`,
    [userId],
  )

  const roomIds = progressRows.map((row) => row.room_id)
  const questionProgressByRoom = new Map()

  if (roomIds.length) {
    const [questionRows] = await pool.query(
      `SELECT room_id, question_id, answer_text, answered_correctly, answered_at
       FROM user_room_question_progress
       WHERE user_id = ? AND room_id IN (?)`,
      [userId, roomIds],
    )

    questionRows.forEach((row) => {
      const list = questionProgressByRoom.get(row.room_id) || []
      list.push(row)
      questionProgressByRoom.set(row.room_id, list)
    })
  }

  const rooms = progressRows.map((row) => {
    const manualQuestions = safeJsonParse(row.manual_questions_json, [])
    const manualProgress = questionProgressByRoom.get(row.room_id) || []
    const manualProgressMap = new Map(manualProgress.map((item) => [String(item.question_id), item]))
    const aiQuestions = safeJsonParse(row.ai_questions_json, [])
    const aiAnswers = safeJsonParse(row.ai_answers_json, {})

    const manualLogs = manualQuestions.map((question, index) => {
      const progress = manualProgressMap.get(String(question.id)) || {}
      return {
        id: question.id || `manual-${index + 1}`,
        type: 'manual',
        prompt: question.prompt || '',
        expectedAnswer: question.answer || '',
        answer: progress.answer_text || '',
        answeredCorrectly:
          progress.answered_correctly === null || progress.answered_correctly === undefined
            ? null
            : Boolean(progress.answered_correctly),
        answeredAt: progress.answered_at ? new Date(progress.answered_at).toISOString() : null,
      }
    })

    const aiLogs = aiQuestions.map((question, index) => ({
      id: question.id || `ai-${index + 1}`,
      type: question.bonus || question.optional ? 'interview-bonus' : 'ai',
      prompt: question.prompt || '',
      company: question.company || '',
      interview: question.interview || '',
      sourceInfo: question.sourceInfo || '',
      answer: aiAnswers?.[question.id] || '',
      answeredCorrectly:
        row.ai_passed === null || row.ai_passed === undefined ? null : Boolean(row.ai_passed),
      answeredAt: row.evaluated_at ? new Date(row.evaluated_at).toISOString() : null,
    }))

    return {
      roomId: row.room_id,
      slug: row.slug || row.room_id,
      title: row.title || row.room_id,
      category: row.category || 'Uncategorized',
      level: row.level || row.difficulty || '',
      difficulty: row.difficulty || row.level || '',
      roomType: row.room_type || 'theoretical',
      xp: row.xp || '0 XP',
      status: row.completed_at ? 'completed' : 'in-progress',
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      manualQuestionsEnabled: Boolean(row.questions_enabled),
      aiQuestionsEnabled: String(row.room_type || '').toLowerCase() !== 'practical' || Boolean(row.practical_ai_questions_enabled),
      technicalScore:
        row.technical_score === null || row.technical_score === undefined
          ? null
          : Number(row.technical_score),
      grammarScore:
        row.grammar_score === null || row.grammar_score === undefined ? null : Number(row.grammar_score),
      aiPassed: row.ai_passed === null || row.ai_passed === undefined ? null : Boolean(row.ai_passed),
      evaluatedAt: row.evaluated_at ? new Date(row.evaluated_at).toISOString() : null,
      feedback: row.feedback || '',
      logs: [...manualLogs, ...aiLogs],
    }
  })

  return res.json({
    total: rooms.length,
    completed: rooms.filter((room) => room.status === 'completed').length,
    inProgress: rooms.filter((room) => room.status === 'in-progress').length,
    rooms,
  })
})

router.put('/admin/registrations/:id', authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  const existingUser = await getUserById(userId)
  if (!existingUser) {
    return res.status(404).json({ message: 'User not found' })
  }

  const updates = []
  const values = []

  const editableAdminFields = [
    'registration_number',
    'first_name',
    'last_name',
    'email',
    'role',
    'is_active',
    'hackthebox_profile',
    'tryhackme_profile',
    'picoctf_profile',
    'github_profile',
    'linkedin_profile',
    'resume_url',
    'about_me',
    'projects',
    'achievements',
  ]

  for (const field of editableAdminFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      if (isProtectedAdminUser(existingUser) && field === 'role' && normalizeNullable(req.body[field]) !== 'admin') {
        return res.status(400).json({ message: 'admin01 is a permanent admin and cannot be demoted.' })
      }

      if (isProtectedAdminUser(existingUser) && field === 'is_active' && !req.body[field]) {
        return res.status(400).json({ message: 'admin01 cannot be disabled.' })
      }

      if (field === 'is_active') {
        updates.push(`${field} = ?`)
        values.push(Boolean(req.body[field]))
      } else if (field === 'role') {
        const nextRole = normalizeNullable(req.body[field]) || 'operator'
        if (!allowedRoles.has(nextRole)) {
          return res.status(400).json({ message: 'Role must be operator, developer, or admin.' })
        }
        updates.push(`${field} = ?`)
        values.push(nextRole)
      } else {
        updates.push(`${field} = ?`)
        values.push(normalizeNullable(req.body[field]))
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'password')) {
    const rawPassword = String(req.body.password || '')
    if (rawPassword.trim().length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' })
    }
    const hash = await bcrypt.hash(rawPassword, 10)
    updates.push('password_hash = ?')
    values.push(hash)
    updates.push('session_version = session_version + 1')
  }

  if (!updates.length) {
    return res.status(400).json({ message: 'No editable fields provided' })
  }

  values.push(userId)

  try {
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values)
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email or registration number already in use' })
    }
    throw error
  }

  const [rows] = await pool.query(
    `SELECT
      id,
      username,
      registration_number,
      first_name,
      last_name,
      email,
      role,
      is_active,
      hackthebox_profile,
      tryhackme_profile,
      picoctf_profile,
      github_profile,
      linkedin_profile,
      resume_url,
      about_me,
      projects,
      achievements,
      created_at,
      updated_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId],
  )

  if (!rows.length) {
    return res.status(404).json({ message: 'User not found' })
  }

  return res.json(rows[0])
})

router.post('/admin/registrations/bulk-reset', authenticate, requireAdmin, async (req, res) => {
  const requestedIds = normalizeUserIds(req.body?.userIds)
  const userIds = requestedIds.filter((id) => id !== req.user.id)

  if (!requestedIds.length) {
    return res.status(400).json({ message: 'Select at least one valid user.' })
  }

  if (!userIds.length) {
    return res.status(400).json({ message: 'You cannot reset your own active admin account.' })
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const resetCount = await resetUserActivity(conn, userIds)
    await conn.commit()

    return res.json({
      reset: resetCount,
      skipped: requestedIds.length - userIds.length,
    })
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
})

router.delete('/admin/registrations/bulk-delete', authenticate, requireAdmin, async (req, res) => {
  const requestedIds = normalizeUserIds(req.body?.userIds)
  const [protectedRows] = requestedIds.length
    ? await pool.query(
        "SELECT id FROM users WHERE id IN (?) AND LOWER(username) = 'admin01'",
        [requestedIds],
      )
    : [[]]
  const protectedIds = new Set(protectedRows.map((row) => row.id))
  const userIds = requestedIds.filter((id) => id !== req.user.id && !protectedIds.has(id))

  if (!requestedIds.length) {
    return res.status(400).json({ message: 'Select at least one valid user.' })
  }

  if (!userIds.length) {
    return res.status(400).json({ message: 'You cannot delete your own active admin account.' })
  }

  const [result] = await pool.query('DELETE FROM users WHERE id IN (?)', [userIds])

  return res.json({
    deleted: Number(result.affectedRows || 0),
    skipped: requestedIds.length - userIds.length,
  })
})

router.post('/admin/registrations/:id/reset', authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  if (userId === req.user.id) {
    return res.status(400).json({ message: 'You cannot reset your own active admin account.' })
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await resetUserActivity(conn, [userId])
    await conn.commit()
    return res.json({ reset: 1, userId })
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
})

router.delete('/admin/registrations/:id', authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  if (userId === req.user.id) {
    return res.status(400).json({ message: 'You cannot delete your own active admin account.' })
  }

  const user = await getUserById(userId)
  if (!user) {
    return res.status(404).json({ message: 'User not found' })
  }

  if (isProtectedAdminUser(user)) {
    return res.status(400).json({ message: 'admin01 is a permanent admin and cannot be deleted.' })
  }

  const [result] = await pool.query('DELETE FROM users WHERE id = ?', [userId])
  if (!result.affectedRows) {
    return res.status(404).json({ message: 'User not found' })
  }

  return res.json({ deleted: true, userId })
})

export default router
