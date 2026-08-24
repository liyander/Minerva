import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.use(authenticate)

function normalizeTitle(value) {
  const title = String(value || '').trim()
  return title || 'Untitled note'
}

function serializeNote(row) {
  return {
    id: Number(row.id),
    title: String(row.title || 'Untitled note'),
    content: String(row.content || ''),
    roomId: row.room_id || null,
    moduleId: row.module_id || null,
    libraryItemId: row.library_item_id || null,
    timestampSeconds: row.timestamp_seconds === null ? null : Number(row.timestamp_seconds),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

async function fetchNote(userId, noteId) {
  const [rows] = await pool.query(
    `SELECT id, title, content, room_id, module_id, library_item_id, timestamp_seconds, created_at, updated_at
     FROM user_notes
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [noteId, userId],
  )

  return rows[0] || null
}

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, content, room_id, module_id, library_item_id, timestamp_seconds, created_at, updated_at
       FROM user_notes
       WHERE user_id = ?
       ORDER BY updated_at DESC, id DESC`,
      [req.user.id],
    )

    return res.json(rows.map(serializeNote))
  } catch (error) {
    return next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const title = normalizeTitle(req.body?.title)
    const content = String(req.body?.content || '')

    const [result] = await pool.query(
      `INSERT INTO user_notes (user_id, title, content, room_id, module_id, library_item_id, timestamp_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, title.slice(0, 255), content, req.body?.roomId || null, req.body?.moduleId || null,
        req.body?.libraryItemId || null, req.body?.timestampSeconds ?? null],
    )

    const note = await fetchNote(req.user.id, result.insertId)
    return res.status(201).json(serializeNote(note))
  } catch (error) {
    return next(error)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const noteId = Number(req.params.id)
    if (!Number.isFinite(noteId)) {
      return res.status(400).json({ message: 'Valid note id is required' })
    }

    const existing = await fetchNote(req.user.id, noteId)
    if (!existing) {
      return res.status(404).json({ message: 'Note not found' })
    }

    const title = Object.prototype.hasOwnProperty.call(req.body || {}, 'title')
      ? normalizeTitle(req.body.title).slice(0, 255)
      : existing.title
    const content = Object.prototype.hasOwnProperty.call(req.body || {}, 'content')
      ? String(req.body.content || '')
      : existing.content

    await pool.query(
      `UPDATE user_notes
       SET title = ?, content = ?, room_id = ?, module_id = ?, library_item_id = ?, timestamp_seconds = ?
       WHERE id = ? AND user_id = ?`,
      [title, content, req.body?.roomId ?? existing.room_id, req.body?.moduleId ?? existing.module_id,
        req.body?.libraryItemId ?? existing.library_item_id, req.body?.timestampSeconds ?? existing.timestamp_seconds,
        noteId, req.user.id],
    )

    const note = await fetchNote(req.user.id, noteId)
    return res.json(serializeNote(note))
  } catch (error) {
    return next(error)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const noteId = Number(req.params.id)
    if (!Number.isFinite(noteId)) {
      return res.status(400).json({ message: 'Valid note id is required' })
    }

    const [result] = await pool.query(
      `DELETE FROM user_notes
       WHERE id = ? AND user_id = ?`,
      [noteId, req.user.id],
    )

    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Note not found' })
    }

    return res.json({ deleted: true, id: noteId })
  } catch (error) {
    return next(error)
  }
})

export default router
