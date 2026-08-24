import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, optionalAuthenticate, requireTrainer } from '../middleware/auth.js'
import { searchYouTubeVideos } from '../services/youtube.service.js'

const router = Router()

/**
 * Utility: extract YouTube Video ID from standard YouTube URLs
 */
function extractYouTubeId(url) {
  if (!url) return ''
  try {
    const raw = String(url).trim()
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const parsed = new URL(withProtocol)
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '')
    }
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtube-nocookie.com')) {
      const v = parsed.searchParams.get('v')
      if (v) return v
      const pathParts = parsed.pathname.split('/').filter(Boolean)
      const embedIdx = pathParts.findIndex((p) => p === 'embed' || p === 'shorts')
      if (embedIdx !== -1 && pathParts[embedIdx + 1]) return pathParts[embedIdx + 1]
    }
  } catch {}
  const match = String(url).match(/([a-zA-Z0-9_-]{11})/)
  return match?.[1] || ''
}

/* =========================================================================
   1. STUDENT / PUBLIC: COURSE PLAYLIST
   ========================================================================= */

/**
 * GET /api/youtube/course/:identifier/playlist
 * Returns the approved playlist for a course (or fallback suggested videos)
 */
router.get('/course/:identifier/playlist', optionalAuthenticate, async (req, res) => {
  const { identifier } = req.params

  const [rooms] = await pool.query(
    `SELECT id, slug, title, category, youtube_video_url FROM rooms WHERE slug = ? OR id = ? LIMIT 1`,
    [identifier, identifier],
  )

  if (!rooms.length) {
    return res.status(404).json({ message: 'Course not found' })
  }

  const room = rooms[0]

  // 1. Fetch approved playlist items from DB
  const [playlistItems] = await pool.query(
    `SELECT id, room_id, video_id, url, title, description, thumbnail, channel_title,
            published_at, source, status, sort_order, created_at
     FROM course_playlist_items
     WHERE room_id = ? AND status = 'approved'
     ORDER BY sort_order ASC, id ASC`,
    [room.id],
  )

  // If playlist exists, return approved items
  if (playlistItems.length > 0) {
    return res.json({
      roomId: room.id,
      courseTitle: room.title,
      playlist: playlistItems.map((item) => ({
        id: item.id,
        videoId: item.video_id,
        url: item.url,
        title: item.title,
        description: item.description,
        thumbnail: item.thumbnail || (item.video_id ? `https://img.youtube.com/vi/${item.video_id}/hqdefault.jpg` : ''),
        channelTitle: item.channel_title,
        publishedAt: item.published_at,
        source: item.source,
        sortOrder: item.sort_order,
        embedUrl: item.video_id ? `https://www.youtube-nocookie.com/embed/${item.video_id}?rel=0` : item.url,
      })),
      isCurated: true,
    })
  }

  // Fallback if no playlist approved yet: if course has youtube_video_url, provide it
  const defaultItems = []
  if (room.youtube_video_url) {
    const videoId = extractYouTubeId(room.youtube_video_url)
    defaultItems.push({
      id: `default-${room.id}`,
      videoId,
      url: room.youtube_video_url,
      title: `${room.title} - Official Video`,
      description: 'Official course lecture/walkthrough',
      thumbnail: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '',
      channelTitle: 'Course Material',
      source: 'youtube',
      sortOrder: 0,
      embedUrl: videoId ? `https://www.youtube-nocookie.com/embed/${videoId}?rel=0` : room.youtube_video_url,
    })
  }

  return res.json({
    roomId: room.id,
    courseTitle: room.title,
    playlist: defaultItems,
    isCurated: false,
  })
})

/* =========================================================================
   2. TRAINER: REVIEW CANDIDATES & MANAGE PLAYLIST
   ========================================================================= */

/**
 * GET /api/youtube/trainer/courses/:identifier/candidates
 * Fetches automatic YouTube search candidates and shows candidate approval status
 */
router.get('/trainer/courses/:identifier/candidates', authenticate, requireTrainer, async (req, res) => {
  const { identifier } = req.params

  const [rooms] = await pool.query(
    `SELECT r.id, r.slug, r.title, r.category, r.youtube_video_url,
            GROUP_CONCAT(DISTINCT t.tag SEPARATOR ' ') AS tags
     FROM rooms r
     LEFT JOIN room_tags t ON t.room_id = r.id
     WHERE r.slug = ? OR r.id = ?
     GROUP BY r.id`,
    [identifier, identifier],
  )

  if (!rooms.length) {
    return res.status(404).json({ message: 'Course not found' })
  }

  const room = rooms[0]
  const searchQuery = `${room.title} ${room.category || ''} ${room.tags || ''}`.trim()
  const limit = Math.min(Math.max(1, Number(req.query.limit || 8)), 20)

  // Fetch search results from YouTube
  const youtubeVideos = await searchYouTubeVideos(searchQuery, limit)

  // Fetch existing approved/pending playlist items
  const [existingItems] = await pool.query(
    `SELECT * FROM course_playlist_items WHERE room_id = ? ORDER BY sort_order ASC, id ASC`,
    [room.id],
  )

  const approvedVideoIds = new Set(
    existingItems.filter((i) => i.status === 'approved').map((i) => i.video_id).filter(Boolean),
  )

  const candidates = youtubeVideos.map((video) => ({
    ...video,
    isAlreadyAdded: approvedVideoIds.has(video.id),
  }))

  return res.json({
    roomId: room.id,
    courseTitle: room.title,
    searchQuery,
    candidates,
    playlist: existingItems,
  })
})

/**
 * POST /api/youtube/trainer/courses/:identifier/playlist
 * Adds a candidate or external custom video into the course playlist
 */
router.post('/trainer/courses/:identifier/playlist', authenticate, requireTrainer, async (req, res) => {
  const { identifier } = req.params
  const { url, title, description, thumbnail, channelTitle, publishedAt, source = 'youtube' } = req.body

  if (!url || !title) {
    return res.status(400).json({ message: 'Video URL and Title are required' })
  }

  const [rooms] = await pool.query(
    `SELECT id, title FROM rooms WHERE slug = ? OR id = ? LIMIT 1`,
    [identifier, identifier],
  )

  if (!rooms.length) {
    return res.status(404).json({ message: 'Course not found' })
  }

  const roomId = rooms[0].id
  const videoId = extractYouTubeId(url)

  // Get current max sort order
  const [orderRows] = await pool.query(
    `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM course_playlist_items WHERE room_id = ?`,
    [roomId],
  )
  const nextOrder = (orderRows[0]?.max_order ?? -1) + 1

  const computedThumb = thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '')

  const [result] = await pool.query(
    `INSERT INTO course_playlist_items
     (room_id, video_id, url, title, description, thumbnail, channel_title, published_at, source, status, sort_order, added_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)`,
    [
      roomId,
      videoId || null,
      url,
      title,
      description || '',
      computedThumb,
      channelTitle || 'Trainer Resource',
      publishedAt || '',
      source,
      nextOrder,
      req.user.id,
    ],
  )

  return res.status(201).json({
    message: 'Video added to course playlist',
    item: {
      id: result.insertId,
      roomId,
      videoId,
      url,
      title,
      description,
      thumbnail: computedThumb,
      channelTitle,
      source,
      status: 'approved',
      sortOrder: nextOrder,
    },
  })
})

/**
 * PUT /api/youtube/trainer/courses/:identifier/playlist/reorder
 * Reorder playlist items
 */
router.put('/trainer/courses/:identifier/playlist/reorder', authenticate, requireTrainer, async (req, res) => {
  const { identifier } = req.params
  const { itemIds } = req.body

  if (!Array.isArray(itemIds)) {
    return res.status(400).json({ message: 'itemIds array required' })
  }

  const [rooms] = await pool.query(
    `SELECT id FROM rooms WHERE slug = ? OR id = ? LIMIT 1`,
    [identifier, identifier],
  )

  if (!rooms.length) {
    return res.status(404).json({ message: 'Course not found' })
  }

  const roomId = rooms[0].id

  for (let index = 0; index < itemIds.length; index++) {
    await pool.query(
      `UPDATE course_playlist_items SET sort_order = ? WHERE id = ? AND room_id = ?`,
      [index, itemIds[index], roomId],
    )
  }

  return res.json({ message: 'Playlist reordered successfully' })
})

/**
 * DELETE /api/youtube/trainer/playlist/:itemId
 * Removes an item from the course playlist
 */
router.delete('/trainer/playlist/:itemId', authenticate, requireTrainer, async (req, res) => {
  const { itemId } = req.params

  const [result] = await pool.query(
    `DELETE FROM course_playlist_items WHERE id = ?`,
    [itemId],
  )

  if (result.affectedRows === 0) {
    return res.status(404).json({ message: 'Playlist item not found' })
  }

  return res.json({ message: 'Playlist item removed' })
})

/* =========================================================================
   3. PRIVATE 1-ON-1 TRAINER RECOMMENDATIONS & SUGGESTIONS
   ========================================================================= */

/**
 * POST /api/youtube/trainer/suggestions
 * Trainer sends a private recommendation/video suggestion to a specific student
 */
router.post('/trainer/suggestions', authenticate, requireTrainer, async (req, res) => {
  const { studentId, roomId, title, message, resourceUrl } = req.body

  if (!studentId || !title || !message) {
    return res.status(400).json({ message: 'studentId, title, and message are required' })
  }

  // Validate student exists
  const [students] = await pool.query(
    `SELECT id, username, first_name, email FROM users WHERE id = ? LIMIT 1`,
    [studentId],
  )

  if (!students.length) {
    return res.status(404).json({ message: 'Student not found' })
  }

  // Insert private recommendation
  const [result] = await pool.query(
    `INSERT INTO student_private_recommendations
     (trainer_id, student_id, room_id, title, message, resource_url)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, studentId, roomId || null, title, message, resourceUrl || null],
  )

  // Also create an active notification for the student
  await pool.query(
    `INSERT INTO notifications (title, message, type, target_user_id)
     VALUES (?, ?, 'info', ?)`,
    [
      `Trainer Guidance: ${title}`,
      `Your trainer left a private suggestion: "${message.slice(0, 120)}..."`,
      studentId,
    ],
  ).catch(() => {})

  return res.status(201).json({
    message: 'Private suggestion sent successfully',
    suggestionId: result.insertId,
  })
})

/**
 * GET /api/youtube/trainer/suggestions/student/:studentId
 * Trainer views suggestions sent to a specific student
 */
router.get('/trainer/suggestions/student/:studentId', authenticate, requireTrainer, async (req, res) => {
  const { studentId } = req.params

  const [suggestions] = await pool.query(
    `SELECT s.*, r.title AS room_title, u.username AS trainer_username
     FROM student_private_recommendations s
     LEFT JOIN rooms r ON r.id = s.room_id
     LEFT JOIN users u ON u.id = s.trainer_id
     WHERE s.student_id = ?
     ORDER BY s.created_at DESC`,
    [studentId],
  )

  return res.json({ suggestions })
})

/**
 * GET /api/youtube/students/me/suggestions
 * Student retrieves their private suggestions (optionally filtered by current room)
 */
router.get('/students/me/suggestions', authenticate, async (req, res) => {
  const roomId = req.query.roomId ? String(req.query.roomId) : null

  let query = `
    SELECT s.*, r.title AS room_title, r.slug AS room_slug,
           u.username AS trainer_username, u.first_name AS trainer_first_name
    FROM student_private_recommendations s
    LEFT JOIN rooms r ON r.id = s.room_id
    LEFT JOIN users u ON u.id = s.trainer_id
    WHERE s.student_id = ?
  `
  const params = [req.user.id]

  if (roomId) {
    query += ` AND (s.room_id = ? OR s.room_id IS NULL)`
    params.push(roomId)
  }

  query += ` ORDER BY s.created_at DESC LIMIT 50`

  const [rows] = await pool.query(query, params)

  return res.json({ suggestions: rows })
})

/**
 * PATCH /api/youtube/students/me/suggestions/:id/read
 * Mark private suggestion as read
 */
router.patch('/students/me/suggestions/:id/read', authenticate, async (req, res) => {
  await pool.query(
    `UPDATE student_private_recommendations SET is_read = true WHERE id = ? AND student_id = ?`,
    [req.params.id, req.user.id],
  )

  return res.json({ message: 'Marked as read' })
})

/* =========================================================================
   4. GENERAL SEARCH HELPER
   ========================================================================= */

router.get('/search', optionalAuthenticate, async (req, res) => {
  const query = String(req.query.q || '').trim()
  if (!query) {
    return res.status(400).json({ message: 'Query parameter "q" is required' })
  }

  const limit = Math.min(Math.max(1, Number(req.query.limit || 6)), 20)
  const videos = await searchYouTubeVideos(query, limit)

  return res.json({
    query,
    count: videos.length,
    videos,
  })
})

export default router
