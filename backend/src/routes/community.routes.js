import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { WebSocketServer } from 'ws'
import { pool } from '../db/pool.js'
import { env } from '../config/env.js'
import { authenticate, requireTrainer } from '../middleware/auth.js'
import { isRole, ROLES } from '../config/roles.js'

const router = Router()

/* ------------------------------------------------------------ helpers --- */

function mapUserSummary(row) {
  if (!row) return null
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
  return {
    id: row.id,
    username: row.username,
    name: name || row.username,
    role: row.role,
  }
}

async function userIsAdminOrTrainer(user) {
  return isRole(user?.role, ROLES.TRAINER, ROLES.ADMIN)
}

async function fetchClassroomMembership(classroomId, userId) {
  const [rows] = await pool.query(
    'SELECT * FROM classroom_members WHERE classroom_id = ? AND user_id = ? LIMIT 1',
    [classroomId, userId],
  )
  return rows[0] || null
}

async function ensureClassroomTeacher(req, res, classroomId) {
  if (req.user.role === 'admin') return true
  const membership = await fetchClassroomMembership(classroomId, req.user.id)
  if (membership?.classroom_role === 'teacher') return true
  res.status(403).json({ message: 'Only the classroom teacher or an admin can do this.' })
  return false
}

async function ensureClassroomMember(req, res, classroomId) {
  if (req.user.role === 'admin') return true
  const membership = await fetchClassroomMembership(classroomId, req.user.id)
  if (membership) return true
  res.status(403).json({ message: 'You are not a member of this classroom.' })
  return false
}

async function ensureGeneralChannelsExist(createdBy) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS count FROM community_channels WHERE classroom_id IS NULL',
  )
  if (rows[0]?.count > 0) return

  const defaults = [
    ['general', 'General discussion for everyone'],
    ['announcements', 'Platform-wide announcements'],
    ['projects', 'Share and discuss projects'],
    ['resources', 'Useful links, notes and materials'],
  ]

  for (const [name, topic] of defaults) {
    await pool.query(
      'INSERT INTO community_channels (classroom_id, name, topic, kind, created_by) VALUES (NULL, ?, ?, ?, ?)',
      [name, topic, name === 'announcements' ? 'announcements' : 'general', createdBy || null],
    )
  }
}

async function fetchChannelById(channelId) {
  const [rows] = await pool.query('SELECT * FROM community_channels WHERE id = ? LIMIT 1', [channelId])
  return rows[0] || null
}

async function ensureChannelAccess(req, res, channel) {
  if (!channel) {
    res.status(404).json({ message: 'Channel not found.' })
    return false
  }
  if (!channel.classroom_id) return true
  return ensureClassroomMember(req, res, channel.classroom_id)
}

function mapMessageRow(row) {
  return {
    id: row.id,
    channelId: row.channel_id,
    parentMessageId: row.parent_message_id,
    body: row.deleted_at ? '' : row.body,
    deleted: Boolean(row.deleted_at),
    createdAt: row.created_at,
    editedAt: row.edited_at,
    author: mapUserSummary({
      id: row.user_id,
      username: row.username,
      first_name: row.first_name,
      last_name: row.last_name,
      role: row.author_role,
    }),
  }
}

const MESSAGE_SELECT = `
  SELECT m.*, u.username, u.first_name, u.last_name, u.role AS author_role
  FROM community_messages m
  JOIN users u ON u.id = m.user_id
`

async function attachReactionsAndReplyCounts(messages) {
  if (!messages.length) return messages
  const ids = messages.map((message) => message.id)
  const placeholders = ids.map(() => '?').join(',')

  const [reactionRows] = await pool.query(
    `SELECT message_id, emoji, COUNT(*) AS count, GROUP_CONCAT(user_id) AS userIds
     FROM community_message_reactions
     WHERE message_id IN (${placeholders})
     GROUP BY message_id, emoji`,
    ids,
  )
  const [replyRows] = await pool.query(
    `SELECT parent_message_id, COUNT(*) AS count, MAX(created_at) AS lastReplyAt
     FROM community_messages
     WHERE parent_message_id IN (${placeholders}) AND deleted_at IS NULL
     GROUP BY parent_message_id`,
    ids,
  )

  const reactionsByMessage = new Map()
  for (const row of reactionRows) {
    const list = reactionsByMessage.get(row.message_id) || []
    list.push({
      emoji: row.emoji,
      count: row.count,
      userIds: String(row.userIds || '').split(',').map(Number).filter(Boolean),
    })
    reactionsByMessage.set(row.message_id, list)
  }
  const repliesByMessage = new Map(replyRows.map((row) => [row.parent_message_id, row]))

  return messages.map((message) => ({
    ...message,
    reactions: reactionsByMessage.get(message.id) || [],
    replyCount: repliesByMessage.get(message.id)?.count || 0,
    lastReplyAt: repliesByMessage.get(message.id)?.lastReplyAt || null,
  }))
}

/* ------------------------------------------------------------ channels --- */

router.get('/channels', authenticate, async (req, res) => {
  const classroomId = req.query.classroomId ? Number(req.query.classroomId) : null

  if (classroomId) {
    if (!(await ensureClassroomMember(req, res, classroomId))) return
    const [rows] = await pool.query(
      'SELECT * FROM community_channels WHERE classroom_id = ? ORDER BY name ASC',
      [classroomId],
    )
    return res.json(rows.map((row) => ({
      id: row.id,
      classroomId: row.classroom_id,
      name: row.name,
      topic: row.topic,
      kind: row.kind,
      createdAt: row.created_at,
    })))
  }

  await ensureGeneralChannelsExist(req.user.id)
  const [rows] = await pool.query(
    'SELECT * FROM community_channels WHERE classroom_id IS NULL ORDER BY FIELD(kind, "announcements", "general") DESC, name ASC',
  )
  return res.json(rows.map((row) => ({
    id: row.id,
    classroomId: null,
    name: row.name,
    topic: row.topic,
    kind: row.kind,
    createdAt: row.created_at,
  })))
})

router.post('/channels', authenticate, requireTrainer, async (req, res) => {
  const { classroomId, name, topic } = req.body || {}
  const cleanName = String(name || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')

  if (!cleanName) {
    return res.status(400).json({ message: 'Channel name is required.' })
  }

  if (classroomId) {
    if (!(await ensureClassroomTeacher(req, res, classroomId))) return
  } else if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only an admin can create general community channels.' })
  }

  const [result] = await pool.query(
    'INSERT INTO community_channels (classroom_id, name, topic, kind, created_by) VALUES (?, ?, ?, ?, ?)',
    [classroomId || null, cleanName, String(topic || '').trim(), 'general', req.user.id],
  )
  const channel = await fetchChannelById(result.insertId)
  return res.status(201).json({
    id: channel.id,
    classroomId: channel.classroom_id,
    name: channel.name,
    topic: channel.topic,
    kind: channel.kind,
    createdAt: channel.created_at,
  })
})

router.delete('/channels/:id', authenticate, requireTrainer, async (req, res) => {
  const channel = await fetchChannelById(req.params.id)
  if (!channel) return res.status(404).json({ message: 'Channel not found.' })
  if (channel.kind === 'announcements' && !channel.classroom_id) {
    return res.status(400).json({ message: 'The announcements channel cannot be deleted.' })
  }
  if (channel.classroom_id) {
    if (!(await ensureClassroomTeacher(req, res, channel.classroom_id))) return
  } else if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only an admin can delete general community channels.' })
  }

  await pool.query('DELETE FROM community_channels WHERE id = ?', [channel.id])
  return res.status(204).send()
})

/* ------------------------------------------------------------ messages --- */

router.get('/channels/:channelId/messages', authenticate, async (req, res) => {
  const channel = await fetchChannelById(req.params.channelId)
  if (!(await ensureChannelAccess(req, res, channel))) return

  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50))
  const before = req.query.before ? new Date(req.query.before) : null

  const params = [channel.id]
  let whereBefore = ''
  if (before && !Number.isNaN(before.getTime())) {
    whereBefore = 'AND m.created_at < ?'
    params.push(before)
  }
  params.push(limit)

  const [rows] = await pool.query(
    `${MESSAGE_SELECT}
     WHERE m.channel_id = ? AND m.parent_message_id IS NULL ${whereBefore}
     ORDER BY m.created_at DESC
     LIMIT ?`,
    params,
  )

  const messages = await attachReactionsAndReplyCounts(rows.map(mapMessageRow))
  return res.json(messages.reverse())
})

router.get('/messages/:messageId/thread', authenticate, async (req, res) => {
  const [rootRows] = await pool.query(`${MESSAGE_SELECT} WHERE m.id = ?`, [req.params.messageId])
  const root = rootRows[0]
  if (!root) return res.status(404).json({ message: 'Message not found.' })

  const channel = await fetchChannelById(root.channel_id)
  if (!(await ensureChannelAccess(req, res, channel))) return

  const [replyRows] = await pool.query(
    `${MESSAGE_SELECT} WHERE m.parent_message_id = ? ORDER BY m.created_at ASC`,
    [root.id],
  )

  const [rootMessage] = await attachReactionsAndReplyCounts([mapMessageRow(root)])
  const replies = await attachReactionsAndReplyCounts(replyRows.map(mapMessageRow))
  return res.json({ root: rootMessage, replies })
})

router.post('/channels/:channelId/messages', authenticate, async (req, res) => {
  const channel = await fetchChannelById(req.params.channelId)
  if (!(await ensureChannelAccess(req, res, channel))) return

  const body = String(req.body?.body || '').trim()
  if (!body) return res.status(400).json({ message: 'Message body is required.' })
  if (body.length > 8000) return res.status(413).json({ message: 'Message is too long.' })

  const parentMessageId = req.body?.parentMessageId ? Number(req.body.parentMessageId) : null
  if (parentMessageId) {
    const [parentRows] = await pool.query(
      'SELECT id, channel_id, parent_message_id FROM community_messages WHERE id = ?',
      [parentMessageId],
    )
    const parent = parentRows[0]
    if (!parent || parent.channel_id !== channel.id) {
      return res.status(400).json({ message: 'Reply target not found in this channel.' })
    }
    if (parent.parent_message_id) {
      return res.status(400).json({ message: 'Replies can only be added to a top-level message.' })
    }
  }

  const [result] = await pool.query(
    'INSERT INTO community_messages (channel_id, user_id, parent_message_id, body) VALUES (?, ?, ?, ?)',
    [channel.id, req.user.id, parentMessageId, body],
  )
  const [rows] = await pool.query(`${MESSAGE_SELECT} WHERE m.id = ?`, [result.insertId])
  const [message] = await attachReactionsAndReplyCounts(rows.map(mapMessageRow))

  broadcastToChannel(channel.id, { type: 'message.created', channelId: channel.id, message })
  return res.status(201).json(message)
})

async function fetchOwnedMessage(id) {
  const [rows] = await pool.query('SELECT * FROM community_messages WHERE id = ?', [id])
  return rows[0] || null
}

router.patch('/messages/:id', authenticate, async (req, res) => {
  const existing = await fetchOwnedMessage(req.params.id)
  if (!existing || existing.deleted_at) return res.status(404).json({ message: 'Message not found.' })
  if (existing.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'You can only edit your own messages.' })
  }

  const body = String(req.body?.body || '').trim()
  if (!body) return res.status(400).json({ message: 'Message body is required.' })

  await pool.query(
    'UPDATE community_messages SET body = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?',
    [body, existing.id],
  )
  const [rows] = await pool.query(`${MESSAGE_SELECT} WHERE m.id = ?`, [existing.id])
  const [message] = await attachReactionsAndReplyCounts(rows.map(mapMessageRow))

  broadcastToChannel(existing.channel_id, { type: 'message.updated', channelId: existing.channel_id, message })
  return res.json(message)
})

router.delete('/messages/:id', authenticate, async (req, res) => {
  const existing = await fetchOwnedMessage(req.params.id)
  if (!existing || existing.deleted_at) return res.status(404).json({ message: 'Message not found.' })
  if (existing.user_id !== req.user.id && !(await userIsAdminOrTrainer(req.user))) {
    return res.status(403).json({ message: 'You cannot delete this message.' })
  }

  await pool.query(
    'UPDATE community_messages SET deleted_at = CURRENT_TIMESTAMP, body = "" WHERE id = ?',
    [existing.id],
  )

  broadcastToChannel(existing.channel_id, {
    type: 'message.deleted',
    channelId: existing.channel_id,
    messageId: existing.id,
    parentMessageId: existing.parent_message_id,
  })
  return res.status(204).send()
})

router.post('/messages/:id/reactions', authenticate, async (req, res) => {
  const existing = await fetchOwnedMessage(req.params.id)
  if (!existing || existing.deleted_at) return res.status(404).json({ message: 'Message not found.' })

  const emoji = String(req.body?.emoji || '').trim().slice(0, 16)
  if (!emoji) return res.status(400).json({ message: 'Emoji is required.' })

  const [existingReaction] = await pool.query(
    'SELECT id FROM community_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
    [existing.id, req.user.id, emoji],
  )

  if (existingReaction.length) {
    await pool.query('DELETE FROM community_message_reactions WHERE id = ?', [existingReaction[0].id])
  } else {
    await pool.query(
      'INSERT INTO community_message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
      [existing.id, req.user.id, emoji],
    )
  }

  const [rows] = await pool.query(`${MESSAGE_SELECT} WHERE m.id = ?`, [existing.id])
  const [message] = await attachReactionsAndReplyCounts(rows.map(mapMessageRow))
  broadcastToChannel(existing.channel_id, { type: 'message.updated', channelId: existing.channel_id, message })
  return res.json(message)
})

/* ---------------------------------------------------------- classrooms --- */

router.get('/classrooms', authenticate, async (req, res) => {
  if (req.user.role === 'admin') {
    const [rows] = await pool.query(
      `SELECT c.*, (SELECT COUNT(*) FROM classroom_members cm WHERE cm.classroom_id = c.id) AS member_count
       FROM classrooms c ORDER BY c.created_at DESC`,
    )
    return res.json(rows.map(mapClassroomRow))
  }

  const [rows] = await pool.query(
    `SELECT c.*, cm.classroom_role,
            (SELECT COUNT(*) FROM classroom_members cm2 WHERE cm2.classroom_id = c.id) AS member_count
     FROM classrooms c
     JOIN classroom_members cm ON cm.classroom_id = c.id
     WHERE cm.user_id = ?
     ORDER BY c.created_at DESC`,
    [req.user.id],
  )
  return res.json(rows.map((row) => ({ ...mapClassroomRow(row), myRole: row.classroom_role })))
})

function mapClassroomRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isArchived: Boolean(row.is_archived),
    memberCount: row.member_count || 0,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

router.post('/classrooms', authenticate, requireTrainer, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ message: 'Classroom name is required.' })

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [result] = await conn.query(
      'INSERT INTO classrooms (name, description, created_by) VALUES (?, ?, ?)',
      [name, String(req.body?.description || '').trim(), req.user.id],
    )
    const classroomId = result.insertId
    await conn.query(
      'INSERT INTO classroom_members (classroom_id, user_id, classroom_role) VALUES (?, ?, ?)',
      [classroomId, req.user.id, 'teacher'],
    )
    await conn.query(
      'INSERT INTO community_channels (classroom_id, name, topic, kind, created_by) VALUES (?, ?, ?, ?, ?)',
      [classroomId, 'announcements', 'Classroom announcements', 'announcements', req.user.id],
    )
    await conn.query(
      'INSERT INTO community_channels (classroom_id, name, topic, kind, created_by) VALUES (?, ?, ?, ?, ?)',
      [classroomId, 'general', 'General classroom discussion', 'general', req.user.id],
    )
    await conn.query(
      'INSERT INTO community_channels (classroom_id, name, topic, kind, created_by) VALUES (?, ?, ?, ?, ?)',
      [classroomId, 'doubts', 'Ask questions here', 'general', req.user.id],
    )
    await conn.commit()

    const [rows] = await conn.query('SELECT *, 1 AS member_count FROM classrooms WHERE id = ?', [classroomId])
    return res.status(201).json({ ...mapClassroomRow(rows[0]), myRole: 'teacher' })
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
})

router.get('/classrooms/:id', authenticate, async (req, res) => {
  const classroomId = Number(req.params.id)
  if (!(await ensureClassroomMember(req, res, classroomId))) return

  const [rows] = await pool.query('SELECT * FROM classrooms WHERE id = ?', [classroomId])
  if (!rows.length) return res.status(404).json({ message: 'Classroom not found.' })

  const [memberRows] = await pool.query(
    `SELECT cm.classroom_role, cm.joined_at, u.id, u.username, u.first_name, u.last_name, u.role
     FROM classroom_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.classroom_id = ? ORDER BY cm.classroom_role ASC, u.username ASC`,
    [classroomId],
  )

  return res.json({
    ...mapClassroomRow({ ...rows[0], member_count: memberRows.length }),
    members: memberRows.map((row) => ({
      ...mapUserSummary(row),
      classroomRole: row.classroom_role,
      joinedAt: row.joined_at,
    })),
  })
})

router.patch('/classrooms/:id', authenticate, requireTrainer, async (req, res) => {
  const classroomId = Number(req.params.id)
  if (!(await ensureClassroomTeacher(req, res, classroomId))) return

  const fields = []
  const params = []
  if (req.body?.name !== undefined) {
    fields.push('name = ?')
    params.push(String(req.body.name).trim())
  }
  if (req.body?.description !== undefined) {
    fields.push('description = ?')
    params.push(String(req.body.description).trim())
  }
  if (req.body?.isArchived !== undefined) {
    fields.push('is_archived = ?')
    params.push(Boolean(req.body.isArchived))
  }
  if (!fields.length) return res.status(400).json({ message: 'Nothing to update.' })

  params.push(classroomId)
  await pool.query(`UPDATE classrooms SET ${fields.join(', ')} WHERE id = ?`, params)
  const [rows] = await pool.query('SELECT * FROM classrooms WHERE id = ?', [classroomId])
  return res.json(mapClassroomRow(rows[0]))
})

router.delete('/classrooms/:id', authenticate, requireTrainer, async (req, res) => {
  const classroomId = Number(req.params.id)
  const membership = await fetchClassroomMembership(classroomId, req.user.id)
  if (req.user.role !== 'admin' && membership?.classroom_role !== 'teacher') {
    return res.status(403).json({ message: 'Only the classroom teacher or an admin can delete it.' })
  }
  await pool.query('DELETE FROM classrooms WHERE id = ?', [classroomId])
  return res.status(204).send()
})

router.post('/classrooms/:id/members', authenticate, requireTrainer, async (req, res) => {
  const classroomId = Number(req.params.id)
  if (!(await ensureClassroomTeacher(req, res, classroomId))) return

  const userId = Number(req.body?.userId)
  const role = req.body?.role === 'teacher' ? 'teacher' : 'student'
  if (!userId) return res.status(400).json({ message: 'userId is required.' })

  await pool.query(
    'INSERT INTO classroom_members (classroom_id, user_id, classroom_role) VALUES (?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE classroom_role = VALUES(classroom_role)',
    [classroomId, userId, role],
  )
  const [rows] = await pool.query(
    `SELECT cm.classroom_role, cm.joined_at, u.id, u.username, u.first_name, u.last_name, u.role
     FROM classroom_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.classroom_id = ? AND cm.user_id = ?`,
    [classroomId, userId],
  )
  return res.status(201).json({
    ...mapUserSummary(rows[0]),
    classroomRole: rows[0].classroom_role,
    joinedAt: rows[0].joined_at,
  })
})

router.delete('/classrooms/:id/members/:userId', authenticate, requireTrainer, async (req, res) => {
  const classroomId = Number(req.params.id)
  if (!(await ensureClassroomTeacher(req, res, classroomId))) return

  await pool.query('DELETE FROM classroom_members WHERE classroom_id = ? AND user_id = ?', [
    classroomId,
    req.params.userId,
  ])
  return res.status(204).send()
})

router.get('/users/search', authenticate, requireTrainer, async (req, res) => {
  const term = `%${String(req.query.q || '').trim()}%`
  if (term === '%%') return res.json([])

  const [rows] = await pool.query(
    `SELECT id, username, first_name, last_name, role FROM users
     WHERE (username LIKE ? OR email LIKE ? OR CONCAT(first_name, ' ', last_name) LIKE ?) AND is_active = true
     ORDER BY username ASC LIMIT 20`,
    [term, term, term],
  )
  return res.json(rows.map(mapUserSummary))
})

/* ---------------------------------------------------------- discussions --- */

router.get('/labels', authenticate, async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM discussion_labels ORDER BY name ASC')
  return res.json(rows)
})

router.post('/labels', authenticate, requireTrainer, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ message: 'Label name is required.' })
  const color = String(req.body?.color || '#6366f1').trim()

  await pool.query(
    'INSERT INTO discussion_labels (name, color) VALUES (?, ?) ON DUPLICATE KEY UPDATE color = VALUES(color)',
    [name, color],
  )
  const [rows] = await pool.query('SELECT * FROM discussion_labels WHERE name = ?', [name])
  return res.status(201).json(rows[0])
})

function mapIssueRow(row) {
  return {
    id: row.id,
    classroomId: row.classroom_id,
    title: row.title,
    body: row.body,
    status: row.status,
    acceptedCommentId: row.accepted_comment_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: mapUserSummary({
      id: row.author_id,
      username: row.username,
      first_name: row.first_name,
      last_name: row.last_name,
      role: row.author_role,
    }),
  }
}

const ISSUE_SELECT = `
  SELECT i.*, u.username, u.first_name, u.last_name, u.role AS author_role
  FROM discussion_issues i JOIN users u ON u.id = i.author_id
`

async function attachIssueLabelsAndCounts(issues) {
  if (!issues.length) return issues
  const ids = issues.map((issue) => issue.id)
  const placeholders = ids.map(() => '?').join(',')

  const [labelRows] = await pool.query(
    `SELECT il.issue_id, l.* FROM discussion_issue_labels il
     JOIN discussion_labels l ON l.id = il.label_id
     WHERE il.issue_id IN (${placeholders})`,
    ids,
  )
  const [commentRows] = await pool.query(
    `SELECT issue_id, COUNT(*) AS count FROM discussion_comments
     WHERE issue_id IN (${placeholders}) GROUP BY issue_id`,
    ids,
  )

  const labelsByIssue = new Map()
  for (const row of labelRows) {
    const list = labelsByIssue.get(row.issue_id) || []
    list.push({ id: row.id, name: row.name, color: row.color })
    labelsByIssue.set(row.issue_id, list)
  }
  const commentsByIssue = new Map(commentRows.map((row) => [row.issue_id, row.count]))

  return issues.map((issue) => ({
    ...issue,
    labels: labelsByIssue.get(issue.id) || [],
    commentCount: commentsByIssue.get(issue.id) || 0,
  }))
}

router.get('/discussions', authenticate, async (req, res) => {
  const classroomId = req.query.classroomId ? Number(req.query.classroomId) : null
  if (classroomId && !(await ensureClassroomMember(req, res, classroomId))) return

  const conditions = []
  const params = []
  if (classroomId) {
    conditions.push('i.classroom_id = ?')
    params.push(classroomId)
  } else {
    conditions.push('i.classroom_id IS NULL')
  }
  if (req.query.status) {
    conditions.push('i.status = ?')
    params.push(req.query.status)
  }

  const [rows] = await pool.query(
    `${ISSUE_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY i.created_at DESC`,
    params,
  )
  const issues = await attachIssueLabelsAndCounts(rows.map(mapIssueRow))
  return res.json(issues)
})

router.post('/discussions', authenticate, async (req, res) => {
  const classroomId = req.body?.classroomId ? Number(req.body.classroomId) : null
  if (classroomId && !(await ensureClassroomMember(req, res, classroomId))) return

  const title = String(req.body?.title || '').trim()
  const body = String(req.body?.body || '').trim()
  if (!title) return res.status(400).json({ message: 'Title is required.' })

  const [result] = await pool.query(
    'INSERT INTO discussion_issues (classroom_id, title, body, author_id) VALUES (?, ?, ?, ?)',
    [classroomId, title, body, req.user.id],
  )

  const labelIds = Array.isArray(req.body?.labelIds) ? req.body.labelIds.map(Number).filter(Boolean) : []
  for (const labelId of labelIds) {
    await pool.query(
      'INSERT IGNORE INTO discussion_issue_labels (issue_id, label_id) VALUES (?, ?)',
      [result.insertId, labelId],
    )
  }

  const [rows] = await pool.query(`${ISSUE_SELECT} WHERE i.id = ?`, [result.insertId])
  const [issue] = await attachIssueLabelsAndCounts(rows.map(mapIssueRow))
  return res.status(201).json(issue)
})

async function fetchIssueForRequest(req, res, issueId) {
  const [rows] = await pool.query(`${ISSUE_SELECT} WHERE i.id = ?`, [issueId])
  if (!rows.length) {
    res.status(404).json({ message: 'Discussion not found.' })
    return null
  }
  if (rows[0].classroom_id && !(await ensureClassroomMember(req, res, rows[0].classroom_id))) return null
  return rows[0]
}

router.get('/discussions/:id', authenticate, async (req, res) => {
  const issueRow = await fetchIssueForRequest(req, res, req.params.id)
  if (!issueRow) return

  const [commentRows] = await pool.query(
    `SELECT c.*, u.username, u.first_name, u.last_name, u.role AS author_role
     FROM discussion_comments c JOIN users u ON u.id = c.author_id
     WHERE c.issue_id = ? ORDER BY c.created_at ASC`,
    [issueRow.id],
  )

  const [issue] = await attachIssueLabelsAndCounts([mapIssueRow(issueRow)])
  return res.json({
    ...issue,
    comments: commentRows.map((row) => ({
      id: row.id,
      issueId: row.issue_id,
      parentCommentId: row.parent_comment_id,
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isAccepted: row.id === issueRow.accepted_comment_id,
      author: mapUserSummary({
        id: row.author_id,
        username: row.username,
        first_name: row.first_name,
        last_name: row.last_name,
        role: row.author_role,
      }),
    })),
  })
})

router.patch('/discussions/:id', authenticate, async (req, res) => {
  const issueRow = await fetchIssueForRequest(req, res, req.params.id)
  if (!issueRow) return

  const isOwner = issueRow.author_id === req.user.id
  const isModerator = await userIsAdminOrTrainer(req.user)
  if (!isOwner && !isModerator) {
    return res.status(403).json({ message: 'You cannot edit this discussion.' })
  }

  const fields = []
  const params = []
  if (req.body?.title !== undefined) {
    fields.push('title = ?')
    params.push(String(req.body.title).trim())
  }
  if (req.body?.body !== undefined) {
    fields.push('body = ?')
    params.push(String(req.body.body).trim())
  }
  if (req.body?.status && ['open', 'answered', 'closed'].includes(req.body.status)) {
    fields.push('status = ?')
    params.push(req.body.status)
  }
  if (req.body?.acceptedCommentId !== undefined) {
    fields.push('accepted_comment_id = ?')
    params.push(req.body.acceptedCommentId || null)
    if (req.body.acceptedCommentId) {
      fields.push("status = 'answered'")
    }
  }
  if (req.body?.labelIds !== undefined) {
    const labelIds = Array.isArray(req.body.labelIds) ? req.body.labelIds.map(Number).filter(Boolean) : []
    await pool.query('DELETE FROM discussion_issue_labels WHERE issue_id = ?', [issueRow.id])
    for (const labelId of labelIds) {
      await pool.query('INSERT IGNORE INTO discussion_issue_labels (issue_id, label_id) VALUES (?, ?)', [
        issueRow.id,
        labelId,
      ])
    }
  }

  if (fields.length) {
    params.push(issueRow.id)
    await pool.query(`UPDATE discussion_issues SET ${fields.join(', ')} WHERE id = ?`, params)
  }

  const [rows] = await pool.query(`${ISSUE_SELECT} WHERE i.id = ?`, [issueRow.id])
  const [issue] = await attachIssueLabelsAndCounts(rows.map(mapIssueRow))
  return res.json(issue)
})

router.post('/discussions/:id/comments', authenticate, async (req, res) => {
  const issueRow = await fetchIssueForRequest(req, res, req.params.id)
  if (!issueRow) return

  const body = String(req.body?.body || '').trim()
  if (!body) return res.status(400).json({ message: 'Comment body is required.' })
  const parentCommentId = req.body?.parentCommentId ? Number(req.body.parentCommentId) : null

  const [result] = await pool.query(
    'INSERT INTO discussion_comments (issue_id, author_id, parent_comment_id, body) VALUES (?, ?, ?, ?)',
    [issueRow.id, req.user.id, parentCommentId, body],
  )

  if (issueRow.status === 'open' && req.user.id !== issueRow.author_id) {
    await pool.query('UPDATE discussion_issues SET status = "answered" WHERE id = ? AND status = "open"', [
      issueRow.id,
    ])
  }

  const [rows] = await pool.query(
    `SELECT c.*, u.username, u.first_name, u.last_name, u.role AS author_role
     FROM discussion_comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`,
    [result.insertId],
  )
  const row = rows[0]
  return res.status(201).json({
    id: row.id,
    issueId: row.issue_id,
    parentCommentId: row.parent_comment_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isAccepted: false,
    author: mapUserSummary({
      id: row.author_id,
      username: row.username,
      first_name: row.first_name,
      last_name: row.last_name,
      role: row.author_role,
    }),
  })
})

/* ---------------------------------------------------------- assignments --- */

function mapAssignmentRow(row) {
  return {
    id: row.id,
    classroomId: row.classroom_id,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    dueAt: row.due_at,
    maxMarks: row.max_marks,
    submissionType: row.submission_type,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function attachAssignmentAttachments(assignments) {
  if (!assignments.length) return assignments
  const ids = assignments.map((assignment) => assignment.id)
  const placeholders = ids.map(() => '?').join(',')
  const [rows] = await pool.query(
    `SELECT id, assignment_id, file_name, file_type, file_size, external_url, created_at
     FROM assignment_attachments WHERE assignment_id IN (${placeholders})`,
    ids,
  )
  const byAssignment = new Map()
  for (const row of rows) {
    const list = byAssignment.get(row.assignment_id) || []
    list.push({
      id: row.id,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSize: row.file_size,
      externalUrl: row.external_url,
      createdAt: row.created_at,
    })
    byAssignment.set(row.assignment_id, list)
  }
  return assignments.map((assignment) => ({
    ...assignment,
    attachments: byAssignment.get(assignment.id) || [],
  }))
}

router.get('/assignments', authenticate, async (req, res) => {
  const classroomId = Number(req.query.classroomId)
  if (!classroomId) return res.status(400).json({ message: 'classroomId is required.' })
  if (!(await ensureClassroomMember(req, res, classroomId))) return

  const [rows] = await pool.query(
    'SELECT * FROM assignments WHERE classroom_id = ? ORDER BY (due_at IS NULL), due_at ASC, created_at DESC',
    [classroomId],
  )
  const assignments = await attachAssignmentAttachments(rows.map(mapAssignmentRow))

  const membership = await fetchClassroomMembership(classroomId, req.user.id)
  const isTeacher = req.user.role === 'admin' || membership?.classroom_role === 'teacher'

  if (isTeacher) {
    const ids = assignments.map((assignment) => assignment.id)
    if (ids.length) {
      const [submissionCounts] = await pool.query(
        `SELECT assignment_id, COUNT(*) AS count FROM assignment_submissions
         WHERE assignment_id IN (${ids.map(() => '?').join(',')}) GROUP BY assignment_id`,
        ids,
      )
      const byAssignment = new Map(submissionCounts.map((row) => [row.assignment_id, row.count]))
      return res.json(assignments.map((assignment) => ({
        ...assignment,
        submissionCount: byAssignment.get(assignment.id) || 0,
      })))
    }
  } else {
    const [ownSubmissions] = await pool.query(
      'SELECT assignment_id, status, grade FROM assignment_submissions WHERE student_id = ? AND assignment_id IN (' +
        `${assignments.map(() => '?').join(',') || 'NULL'})`,
      [req.user.id, ...assignments.map((assignment) => assignment.id)],
    )
    const byAssignment = new Map(ownSubmissions.map((row) => [row.assignment_id, row]))
    return res.json(assignments.map((assignment) => ({
      ...assignment,
      mySubmission: byAssignment.get(assignment.id) || null,
    })))
  }

  return res.json(assignments)
})

router.post('/assignments', authenticate, requireTrainer, async (req, res) => {
  const classroomId = Number(req.body?.classroomId)
  if (!classroomId) return res.status(400).json({ message: 'classroomId is required.' })
  if (!(await ensureClassroomTeacher(req, res, classroomId))) return

  const title = String(req.body?.title || '').trim()
  if (!title) return res.status(400).json({ message: 'Title is required.' })

  const [result] = await pool.query(
    `INSERT INTO assignments
       (classroom_id, title, description, instructions, due_at, max_marks, submission_type, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      classroomId,
      title,
      String(req.body?.description || '').trim(),
      String(req.body?.instructions || '').trim(),
      req.body?.dueAt ? new Date(req.body.dueAt) : null,
      Number(req.body?.maxMarks) || 100,
      String(req.body?.submissionType || 'text'),
      req.user.id,
    ],
  )

  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : []
  for (const attachment of attachments.slice(0, 10)) {
    await pool.query(
      `INSERT INTO assignment_attachments (assignment_id, file_name, file_type, file_size, file_data, external_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        String(attachment.fileName || '').slice(0, 255),
        String(attachment.fileType || '').slice(0, 120),
        Number(attachment.fileSize) || 0,
        attachment.fileData || null,
        String(attachment.externalUrl || '').slice(0, 2000) || null,
      ],
    )
  }

  const [rows] = await pool.query('SELECT * FROM assignments WHERE id = ?', [result.insertId])
  const [assignment] = await attachAssignmentAttachments(rows.map(mapAssignmentRow))
  return res.status(201).json(assignment)
})

async function fetchAssignmentForRequest(req, res, assignmentId) {
  const [rows] = await pool.query('SELECT * FROM assignments WHERE id = ?', [assignmentId])
  if (!rows.length) {
    res.status(404).json({ message: 'Assignment not found.' })
    return null
  }
  if (!(await ensureClassroomMember(req, res, rows[0].classroom_id))) return null
  return rows[0]
}

router.get('/assignments/:id', authenticate, async (req, res) => {
  const assignmentRow = await fetchAssignmentForRequest(req, res, req.params.id)
  if (!assignmentRow) return

  const [assignment] = await attachAssignmentAttachments([mapAssignmentRow(assignmentRow)])
  const membership = await fetchClassroomMembership(assignmentRow.classroom_id, req.user.id)
  const isTeacher = req.user.role === 'admin' || membership?.classroom_role === 'teacher'

  if (isTeacher) {
    const [submissionRows] = await pool.query(
      `SELECT s.*, u.username, u.first_name, u.last_name
       FROM assignment_submissions s JOIN users u ON u.id = s.student_id
       WHERE s.assignment_id = ? ORDER BY s.submitted_at DESC`,
      [assignmentRow.id],
    )
    return res.json({ ...assignment, submissions: submissionRows.map(mapSubmissionRow) })
  }

  const [ownRows] = await pool.query(
    'SELECT * FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?',
    [assignmentRow.id, req.user.id],
  )
  return res.json({ ...assignment, mySubmission: ownRows[0] ? mapSubmissionRow(ownRows[0]) : null })
})

router.patch('/assignments/:id', authenticate, requireTrainer, async (req, res) => {
  const assignmentRow = await fetchAssignmentForRequest(req, res, req.params.id)
  if (!assignmentRow) return
  if (!(await ensureClassroomTeacher(req, res, assignmentRow.classroom_id))) return

  const fields = []
  const params = []
  const map = {
    title: 'title',
    description: 'description',
    instructions: 'instructions',
    maxMarks: 'max_marks',
    submissionType: 'submission_type',
  }
  for (const [key, column] of Object.entries(map)) {
    if (req.body?.[key] !== undefined) {
      fields.push(`${column} = ?`)
      params.push(req.body[key])
    }
  }
  if (req.body?.dueAt !== undefined) {
    fields.push('due_at = ?')
    params.push(req.body.dueAt ? new Date(req.body.dueAt) : null)
  }
  if (!fields.length) return res.status(400).json({ message: 'Nothing to update.' })

  params.push(assignmentRow.id)
  await pool.query(`UPDATE assignments SET ${fields.join(', ')} WHERE id = ?`, params)
  const [rows] = await pool.query('SELECT * FROM assignments WHERE id = ?', [assignmentRow.id])
  const [assignment] = await attachAssignmentAttachments(rows.map(mapAssignmentRow))
  return res.json(assignment)
})

router.delete('/assignments/:id', authenticate, requireTrainer, async (req, res) => {
  const assignmentRow = await fetchAssignmentForRequest(req, res, req.params.id)
  if (!assignmentRow) return
  if (!(await ensureClassroomTeacher(req, res, assignmentRow.classroom_id))) return

  await pool.query('DELETE FROM assignments WHERE id = ?', [assignmentRow.id])
  return res.status(204).send()
})

function mapSubmissionRow(row) {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    body: row.body,
    linkUrl: row.link_url,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    status: row.status,
    grade: row.grade,
    feedback: row.feedback,
    submittedAt: row.submitted_at,
    gradedAt: row.graded_at,
    student: row.username
      ? mapUserSummary({
          id: row.student_id,
          username: row.username,
          first_name: row.first_name,
          last_name: row.last_name,
        })
      : undefined,
  }
}

router.post('/assignments/:id/submissions', authenticate, async (req, res) => {
  const assignmentRow = await fetchAssignmentForRequest(req, res, req.params.id)
  if (!assignmentRow) return

  const membership = await fetchClassroomMembership(assignmentRow.classroom_id, req.user.id)
  if (req.user.role === 'admin' || membership?.classroom_role === 'teacher') {
    return res.status(400).json({ message: 'Teachers cannot submit assignments.' })
  }

  const body = String(req.body?.body || '').trim()
  const linkUrl = String(req.body?.linkUrl || '').trim()
  const fileData = req.body?.fileData || null
  if (!body && !linkUrl && !fileData) {
    return res.status(400).json({ message: 'Provide a text answer, link, or file.' })
  }

  const status = assignmentRow.due_at && new Date() > new Date(assignmentRow.due_at) ? 'late' : 'submitted'

  await pool.query(
    `INSERT INTO assignment_submissions
       (assignment_id, student_id, body, link_url, file_name, file_type, file_size, file_data, status, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       body = VALUES(body), link_url = VALUES(link_url), file_name = VALUES(file_name),
       file_type = VALUES(file_type), file_size = VALUES(file_size), file_data = VALUES(file_data),
       status = VALUES(status), submitted_at = CURRENT_TIMESTAMP, grade = NULL, feedback = NULL,
       graded_by = NULL, graded_at = NULL`,
    [
      assignmentRow.id,
      req.user.id,
      body,
      linkUrl,
      String(req.body?.fileName || '').slice(0, 255),
      String(req.body?.fileType || '').slice(0, 120),
      Number(req.body?.fileSize) || 0,
      fileData,
      status,
    ],
  )

  const [rows] = await pool.query(
    'SELECT * FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?',
    [assignmentRow.id, req.user.id],
  )
  return res.status(201).json(mapSubmissionRow(rows[0]))
})

router.patch('/submissions/:id', authenticate, requireTrainer, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM assignment_submissions WHERE id = ?', [req.params.id])
  if (!rows.length) return res.status(404).json({ message: 'Submission not found.' })
  const submission = rows[0]

  const [assignmentRows] = await pool.query('SELECT * FROM assignments WHERE id = ?', [submission.assignment_id])
  const assignment = assignmentRows[0]
  if (!(await ensureClassroomTeacher(req, res, assignment.classroom_id))) return

  const fields = ['graded_by = ?', 'graded_at = CURRENT_TIMESTAMP']
  const params = [req.user.id]
  if (req.body?.grade !== undefined) {
    fields.push('grade = ?')
    params.push(Math.max(0, Math.min(assignment.max_marks, Number(req.body.grade) || 0)))
  }
  if (req.body?.feedback !== undefined) {
    fields.push('feedback = ?')
    params.push(String(req.body.feedback || ''))
  }
  const status = req.body?.status && ['reviewed', 'resubmit', 'completed'].includes(req.body.status)
    ? req.body.status
    : 'reviewed'
  fields.push('status = ?')
  params.push(status)

  params.push(submission.id)
  await pool.query(`UPDATE assignment_submissions SET ${fields.join(', ')} WHERE id = ?`, params)

  const [updatedRows] = await pool.query('SELECT * FROM assignment_submissions WHERE id = ?', [submission.id])
  return res.json(mapSubmissionRow(updatedRows[0]))
})

/* ------------------------------------------------------------ realtime --- */

const channelSockets = new Map()

function broadcastToChannel(channelId, payload) {
  const sockets = channelSockets.get(Number(channelId))
  if (!sockets) return
  const data = JSON.stringify(payload)
  for (const socket of sockets) {
    if (socket.readyState === 1) {
      socket.send(data)
    }
  }
}

export function setupCommunityWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    let parsedUrl
    try {
      parsedUrl = new URL(request.url || '', 'http://localhost')
    } catch {
      return
    }
    if (parsedUrl.pathname !== '/api/community/ws') return

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, parsedUrl)
    })
  })

  wss.on('connection', (ws, _request, parsedUrl) => {
    let user = null
    try {
      const token = parsedUrl.searchParams.get('token') || ''
      user = jwt.verify(token, env.jwtSecret)
    } catch {
      ws.close()
      return
    }

    const subscribedChannels = new Set()

    ws.on('message', (raw) => {
      let payload
      try {
        payload = JSON.parse(raw.toString())
      } catch {
        return
      }

      if (payload?.type === 'join' && payload.channelId) {
        const channelId = Number(payload.channelId)
        if (!channelSockets.has(channelId)) {
          channelSockets.set(channelId, new Set())
        }
        channelSockets.get(channelId).add(ws)
        subscribedChannels.add(channelId)
      }

      if (payload?.type === 'leave' && payload.channelId) {
        const channelId = Number(payload.channelId)
        channelSockets.get(channelId)?.delete(ws)
        subscribedChannels.delete(channelId)
      }
    })

    ws.on('close', () => {
      for (const channelId of subscribedChannels) {
        const sockets = channelSockets.get(channelId)
        sockets?.delete(ws)
        if (sockets && sockets.size === 0) {
          channelSockets.delete(channelId)
        }
      }
    })

    void user
  })
}

export default router
