import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()
const MAX_RESUME_BYTES = 5 * 1024 * 1024
const allowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
])

export async function ensureResumeTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS top_player_resumes (
       id BIGINT AUTO_INCREMENT PRIMARY KEY,
       user_id INT NOT NULL UNIQUE,
       file_name VARCHAR(255) NOT NULL,
       mime_type VARCHAR(160) NOT NULL,
       file_size INT NOT NULL DEFAULT 0,
       file_data LONGTEXT NOT NULL,
       uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       CONSTRAINT fk_top_player_resumes_user
         FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
     )`,
  )
}

function normalizeFileName(value) {
  const clean = String(value || 'resume.pdf')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .trim()
  return clean.slice(0, 180) || 'resume.pdf'
}

function normalizeBase64(value) {
  const raw = String(value || '')
  return raw.includes(',') ? raw.split(',').pop() : raw
}

function formatResume(row) {
  if (!row?.file_name) {
    return null
  }

  return {
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size || 0),
    uploadedAt: row.uploaded_at ? new Date(row.uploaded_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

async function getScoreboard(limit = 100) {
  const [rows] = await pool.query(
    `SELECT
       u.id,
       u.username,
       u.registration_number,
       u.email,
       COUNT(DISTINCT CASE WHEN urp.completed_at IS NOT NULL THEN urp.room_id END) AS completed_rooms,
       COALESCE(SUM(CASE WHEN urp.completed_at IS NOT NULL THEN CAST(REPLACE(REPLACE(r.xp, ',', ''), ' XP', '') AS UNSIGNED) ELSE 0 END), 0) AS xp,
       COALESCE(ROUND(AVG(NULLIF(uta.technical_score, 0))), 0) AS avg_technical_score,
       COALESCE(ROUND(AVG(NULLIF(uta.grammar_score, 0))), 0) AS avg_grammar_score,
       MAX(urp.completed_at) AS last_completed_at
     FROM users u
     LEFT JOIN user_room_progress urp ON urp.user_id = u.id
     LEFT JOIN rooms r ON r.id = urp.room_id
     LEFT JOIN user_room_theoretical_attempts uta ON uta.user_id = u.id
     WHERE u.role = 'operator' AND u.is_active = true
     GROUP BY u.id, u.username, u.registration_number, u.email
     ORDER BY xp DESC, completed_rooms DESC, avg_technical_score DESC, u.username ASC
     LIMIT ?`,
    [limit],
  )

  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.id,
    username: row.username,
    registrationNumber: row.registration_number,
    email: row.email,
    completedRooms: Number(row.completed_rooms || 0),
    xp: Number(row.xp || 0),
    averageTechnicalScore: Number(row.avg_technical_score || 0),
    averageGrammarScore: Number(row.avg_grammar_score || 0),
    lastCompletedAt: row.last_completed_at ? new Date(row.last_completed_at).toISOString() : null,
  }))
}

async function getTopTenStatus(userId) {
  const scoreboard = await getScoreboard(10)
  const player = scoreboard.find((entry) => Number(entry.userId) === Number(userId))
  return {
    eligible: Boolean(player),
    rank: player?.rank || null,
    player: player || null,
  }
}

router.get('/me', authenticate, async (req, res) => {
  await ensureResumeTable()
  const status = await getTopTenStatus(req.user.id)
  const [rows] = await pool.query(
    `SELECT file_name, mime_type, file_size, uploaded_at, updated_at
     FROM top_player_resumes
     WHERE user_id = ?
     LIMIT 1`,
    [req.user.id],
  )

  return res.json({
    eligible: status.eligible,
    rank: status.rank,
    resume: formatResume(rows[0]),
  })
})

router.post('/me', authenticate, async (req, res) => {
  await ensureResumeTable()
  const status = await getTopTenStatus(req.user.id)

  if (!status.eligible) {
    return res.status(403).json({ message: 'Resume upload is available only for current top 10 players.' })
  }

  const fileName = normalizeFileName(req.body?.fileName)
  const mimeType = String(req.body?.mimeType || 'application/octet-stream').trim() || 'application/octet-stream'
  const base64Data = normalizeBase64(req.body?.fileData)

  if (!allowedMimeTypes.has(mimeType)) {
    return res.status(400).json({ message: 'Upload a PDF, DOC, or DOCX resume.' })
  }

  let buffer
  try {
    buffer = Buffer.from(base64Data, 'base64')
  } catch {
    return res.status(400).json({ message: 'Resume file could not be decoded.' })
  }

  if (!buffer.length) {
    return res.status(400).json({ message: 'Choose a resume file before uploading.' })
  }

  if (buffer.length > MAX_RESUME_BYTES) {
    return res.status(400).json({ message: 'Resume file must be 5 MB or smaller.' })
  }

  await pool.query(
    `INSERT INTO top_player_resumes (user_id, file_name, mime_type, file_size, file_data)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       file_name = VALUES(file_name),
       mime_type = VALUES(mime_type),
       file_size = VALUES(file_size),
       file_data = VALUES(file_data),
       updated_at = CURRENT_TIMESTAMP`,
    [req.user.id, fileName, mimeType, buffer.length, base64Data],
  )

  return res.status(201).json({
    eligible: true,
    rank: status.rank,
    resume: {
      fileName,
      mimeType,
      fileSize: buffer.length,
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  })
})

router.delete('/me', authenticate, async (req, res) => {
  await ensureResumeTable()
  await pool.query('DELETE FROM top_player_resumes WHERE user_id = ?', [req.user.id])
  return res.json({ deleted: true })
})

router.get('/admin', authenticate, requireAdmin, async (_req, res) => {
  await ensureResumeTable()
  const topPlayers = await getScoreboard(10)
  const userIds = topPlayers.map((player) => player.userId)
  const resumeMap = new Map()

  if (userIds.length) {
    const [rows] = await pool.query(
      `SELECT user_id, file_name, mime_type, file_size, uploaded_at, updated_at
       FROM top_player_resumes
       WHERE user_id IN (?)`,
      [userIds],
    )

    rows.forEach((row) => {
      resumeMap.set(Number(row.user_id), formatResume(row))
    })
  }

  return res.json({
    players: topPlayers.map((player) => ({
      ...player,
      resume: resumeMap.get(Number(player.userId)) || null,
      downloadPath: resumeMap.has(Number(player.userId))
        ? `/resumes/admin/${player.userId}/download`
        : null,
    })),
  })
})

router.get('/admin/:userId/download', authenticate, requireAdmin, async (req, res) => {
  await ensureResumeTable()
  const userId = Number(req.params.userId)

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  const [rows] = await pool.query(
    `SELECT file_name, mime_type, file_data
     FROM top_player_resumes
     WHERE user_id = ?
     LIMIT 1`,
    [userId],
  )

  if (!rows.length) {
    return res.status(404).json({ message: 'Resume not found' })
  }

  const resume = rows[0]
  const buffer = Buffer.from(normalizeBase64(resume.file_data), 'base64')
  res.setHeader('Content-Type', resume.mime_type || 'application/octet-stream')
  res.setHeader('Content-Length', buffer.length)
  res.setHeader('Content-Disposition', `attachment; filename="${normalizeFileName(resume.file_name)}"`)
  return res.send(buffer)
})

export default router
