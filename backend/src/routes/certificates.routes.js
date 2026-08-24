import crypto from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { mapCareerPath } from '../services/careerPathMapper.js'

const router = Router()

function buildDisplayName(userRow = {}) {
  const firstName = String(userRow.first_name || '').trim()
  const lastName = String(userRow.last_name || '').trim()
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
  return fullName || String(userRow.username || 'Learner').trim() || 'Learner'
}

function buildVerificationUrl(req, certificateId) {
  const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`
  return `${origin}/verify-certificate/${encodeURIComponent(certificateId)}`
}

async function fetchCareerPathWithRooms(pathId) {
  const [pathRows] = await pool.query('SELECT * FROM career_paths WHERE id = ? OR slug = ? LIMIT 1', [pathId, pathId])
  if (!pathRows.length) {
    return null
  }

  const pathRow = pathRows[0]
  const [moduleRows] = await pool.query(
    `SELECT id, phase, title, description, module_image_data
     FROM career_path_modules
     WHERE career_path_id = ?
     ORDER BY sort_order ASC, title ASC`,
    [pathRow.id],
  )

  const modules = []
  for (const moduleRow of moduleRows) {
    const [roomRows] = await pool.query(
      `SELECT room_id
       FROM career_path_module_rooms
       WHERE module_id = ?
       ORDER BY sort_order ASC`,
      [moduleRow.id],
    )

    modules.push({
      id: moduleRow.id,
      phase: moduleRow.phase,
      title: moduleRow.title,
      description: moduleRow.description,
      imageData: moduleRow.module_image_data,
      rooms: roomRows.map((row) => row.room_id),
    })
  }

  return mapCareerPath(pathRow, modules, [])
}

async function fetchCompletionState(userId, path) {
  const roomIds = path.modules.flatMap((module) => (Array.isArray(module.rooms) ? module.rooms : []))
  const uniqueRoomIds = [...new Set(roomIds.filter(Boolean))]

  if (!uniqueRoomIds.length) {
    return {
      totalRooms: 0,
      completedRooms: 0,
      isComplete: false,
    }
  }

  const placeholders = uniqueRoomIds.map(() => '?').join(', ')
  const [rows] = await pool.query(
    `SELECT room_id
     FROM user_room_progress
     WHERE user_id = ?
       AND completed_at IS NOT NULL
       AND room_id IN (${placeholders})`,
    [userId, ...uniqueRoomIds],
  )

  const completedSet = new Set(rows.map((row) => String(row.room_id)))
  const completedRooms = uniqueRoomIds.filter((roomId) => completedSet.has(String(roomId))).length

  return {
    totalRooms: uniqueRoomIds.length,
    completedRooms,
    isComplete: completedRooms === uniqueRoomIds.length,
  }
}

router.post('/issue', authenticate, async (req, res) => {
  const pathId = String(req.body?.pathId || req.body?.careerPathId || '').trim()
  if (!pathId) {
    return res.status(400).json({ message: 'pathId is required' })
  }

  const path = await fetchCareerPathWithRooms(pathId)
  if (!path) {
    return res.status(404).json({ message: 'Career path not found' })
  }

  const [userRows] = await pool.query(
    `SELECT id, username, first_name, last_name
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [req.user.id],
  )
  if (!userRows.length) {
    return res.status(404).json({ message: 'User not found' })
  }

  const completionState = await fetchCompletionState(req.user.id, path)
  if (!completionState.isComplete) {
    return res.status(400).json({
      message: 'Complete every room in this path before issuing a certificate.',
      completionState,
    })
  }

  const userRow = userRows[0]
  const fullName = buildDisplayName(userRow)
  const firstName = String(userRow.first_name || '').trim() || null
  const lastName = String(userRow.last_name || '').trim() || null
  const certificateArtwork = path.certificateImageData || null

  const [existingRows] = await pool.query(
    `SELECT *
     FROM certificates
     WHERE user_id = ? AND career_path_id = ?
     LIMIT 1`,
    [req.user.id, path.id],
  )

  let certificateRow = existingRows[0] || null

  if (certificateRow) {
    await pool.query(
      `UPDATE certificates
       SET full_name = ?, first_name = ?, last_name = ?, path_title = ?, artwork_data = ?
       WHERE id = ?`,
      [fullName, firstName, lastName, path.title, certificateArtwork, certificateRow.id],
    )
    const [updatedRows] = await pool.query('SELECT * FROM certificates WHERE id = ? LIMIT 1', [certificateRow.id])
    certificateRow = updatedRows[0] || certificateRow
  } else {
    const certificateId = `CERT-${path.slug || path.id}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`
    await pool.query(
      `INSERT INTO certificates (
        certificate_id, user_id, career_path_id, full_name, first_name, last_name, path_title, artwork_data
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [certificateId, req.user.id, path.id, fullName, firstName, lastName, path.title, certificateArtwork],
    )
    const [createdRows] = await pool.query('SELECT * FROM certificates WHERE certificate_id = ? LIMIT 1', [certificateId])
    certificateRow = createdRows[0] || null
  }

  if (!certificateRow) {
    return res.status(500).json({ message: 'Failed to issue certificate' })
  }

  return res.json({
    certificate: {
      certificateId: certificateRow.certificate_id,
      fullName: certificateRow.full_name,
      firstName: certificateRow.first_name,
      lastName: certificateRow.last_name,
      pathId: certificateRow.career_path_id,
      pathTitle: certificateRow.path_title,
      artworkData: certificateRow.artwork_data,
      issuedAt: certificateRow.issued_at ? new Date(certificateRow.issued_at).toISOString() : null,
      updatedAt: certificateRow.updated_at ? new Date(certificateRow.updated_at).toISOString() : null,
      verificationUrl: buildVerificationUrl(req, certificateRow.certificate_id),
    },
    completionState,
  })
})

router.get('/:certificateId/verify', async (req, res) => {
  const certificateId = String(req.params.certificateId || '').trim()
  if (!certificateId) {
    return res.status(400).json({ message: 'certificateId is required' })
  }

  const [rows] = await pool.query(
    `SELECT
      c.certificate_id,
      c.full_name,
      c.first_name,
      c.last_name,
      c.path_title,
      c.issued_at,
      c.updated_at,
      u.username,
      p.id AS path_id,
      p.slug AS path_slug,
      p.title AS path_title_source
     FROM certificates c
     INNER JOIN users u ON u.id = c.user_id
     INNER JOIN career_paths p ON p.id = c.career_path_id
     WHERE c.certificate_id = ?
     LIMIT 1`,
    [certificateId],
  )

  if (!rows.length) {
    return res.status(404).json({
      valid: false,
      message: 'Certificate not found',
    })
  }

  const certificate = rows[0]
  return res.json({
    valid: true,
    certificate: {
      certificateId: certificate.certificate_id,
      fullName: certificate.full_name,
      firstName: certificate.first_name,
      lastName: certificate.last_name,
      pathId: certificate.path_id,
      pathSlug: certificate.path_slug,
      pathTitle: certificate.path_title || certificate.path_title_source,
      issuedAt: certificate.issued_at ? new Date(certificate.issued_at).toISOString() : null,
      updatedAt: certificate.updated_at ? new Date(certificate.updated_at).toISOString() : null,
    },
  })
})

export default router
