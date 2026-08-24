import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()

router.get('/', authenticate, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT name FROM room_categories
     UNION
     SELECT category AS name FROM rooms WHERE category IS NOT NULL AND category <> ''
     ORDER BY name ASC`,
  )

  return res.json(rows.map((row) => row.name).filter(Boolean))
})

router.post('/', authenticate, requireAdmin, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) {
    return res.status(400).json({ message: 'Category name is required.' })
  }

  await pool.query(
    `INSERT INTO room_categories (name)
     VALUES (?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [name],
  )

  return res.status(201).json({ name })
})

router.delete('/:name', authenticate, requireAdmin, async (req, res) => {
  const name = String(req.params.name || '').trim()
  if (!name) {
    return res.status(400).json({ message: 'Category name is required.' })
  }

  const [[usage]] = await pool.query('SELECT COUNT(*) AS count FROM rooms WHERE category = ?', [name])
  if (Number(usage?.count || 0) > 0) {
    return res.status(409).json({
      message: `Category "${name}" is assigned to ${Number(usage.count)} room(s). Reassign those rooms before deleting it.`,
      assignedRooms: Number(usage.count),
    })
  }

  await pool.query('DELETE FROM room_categories WHERE name = ?', [name])
  return res.json({ deleted: true, name })
})

export default router
