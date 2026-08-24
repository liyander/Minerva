import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()

// Get all active notifications (accessible to all authenticated users)
router.get('/', authenticate, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, message, type, created_at
       FROM notifications
       WHERE is_active = true AND (target_user_id IS NULL OR target_user_id = ?)
       ORDER BY created_at DESC`,
      [_req.user.id],
    )
    return res.json(rows || [])
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return res.status(500).json({ message: 'Failed to fetch notifications' })
  }
})

// Get all notifications including inactive ones (admin only)
router.get('/admin/all', authenticate, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, message, type, is_active, target_user_id, created_at, updated_at FROM notifications ORDER BY created_at DESC'
    )
    return res.json(rows || [])
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return res.status(500).json({ message: 'Failed to fetch notifications' })
  }
})

// Create a new notification (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { title, message, type = 'info', targetUserId } = req.body || {}

  if (!title || !message) {
    return res.status(400).json({ message: 'Title and message are required' })
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO notifications (title, message, type, is_active, target_user_id) VALUES (?, ?, ?, true, ?)',
      [title, message, type, targetUserId || null]
    )

    return res.status(201).json({
      id: result.insertId,
      title,
      message,
      type,
      is_active: true,
      created_at: new Date(),
    })
  } catch (error) {
    console.error('Error creating notification:', error)
    return res.status(500).json({ message: 'Failed to create notification' })
  }
})

// Update a notification (admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params
  const { title, message, type, is_active, target_user_id, targetUserId } = req.body || {}

  if (!id) {
    return res.status(400).json({ message: 'Notification ID is required' })
  }

  try {
    const updateFields = []
    const updateValues = []

    if (title !== undefined) {
      updateFields.push('title = ?')
      updateValues.push(title)
    }
    if (message !== undefined) {
      updateFields.push('message = ?')
      updateValues.push(message)
    }
    if (type !== undefined) {
      updateFields.push('type = ?')
      updateValues.push(type)
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?')
      updateValues.push(is_active)
    }
    if (target_user_id !== undefined || targetUserId !== undefined) {
      updateFields.push('target_user_id = ?')
      updateValues.push(target_user_id ?? targetUserId ?? null)
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' })
    }

    updateValues.push(id)
    const query = `UPDATE notifications SET ${updateFields.join(', ')} WHERE id = ?`
    await pool.query(query, updateValues)

    return res.json({ message: 'Notification updated successfully' })
  } catch (error) {
    console.error('Error updating notification:', error)
    return res.status(500).json({ message: 'Failed to update notification' })
  }
})

// Delete a notification (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ message: 'Notification ID is required' })
  }

  try {
    await pool.query('DELETE FROM notifications WHERE id = ?', [id])
    return res.json({ message: 'Notification deleted successfully' })
  } catch (error) {
    console.error('Error deleting notification:', error)
    return res.status(500).json({ message: 'Failed to delete notification' })
  }
})

export default router
