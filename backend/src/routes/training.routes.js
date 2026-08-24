import { Router } from 'express'
import { pool } from '../db/pool.js'
import {
  authenticate,
  optionalAuthenticate,
  requireAdmin,
  requireTrainer,
} from '../middleware/auth.js'
import { isRole, normaliseRole, ROLES } from '../config/roles.js'

const router = Router()

const LIBRARY_TYPES = ['lecture', 'presentation', 'material', 'link']
const POST_CATEGORIES = ['announcement', 'notification', 'achievement', 'content']

function clampRating(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.max(1, Math.min(5, Math.round(number)))
}

/* ------------------------------------------------------------------ homepage */
// Public so the sign-in and landing screens can show announcements.
router.get('/homepage', optionalAuthenticate, async (req, res) => {
  const category = POST_CATEGORIES.includes(String(req.query.category))
    ? String(req.query.category)
    : null

  const [rows] = await pool.query(
    `SELECT p.id, p.category, p.title, p.body, p.link_url, p.image_data, p.pinned,
            p.published_at, u.username AS author_username, u.first_name AS author_first_name
     FROM homepage_posts p
     LEFT JOIN users u ON u.id = p.created_by
     WHERE p.is_published = true
       AND (p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)
       ${category ? 'AND p.category = ?' : ''}
     ORDER BY p.pinned DESC, p.published_at DESC
     LIMIT 50`,
    category ? [category] : [],
  )

  return res.json(
    rows.map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      body: row.body,
      linkUrl: row.link_url,
      imageData: row.image_data,
      pinned: Boolean(row.pinned),
      publishedAt: row.published_at,
      author: row.author_first_name || row.author_username,
    })),
  )
})

router.post('/homepage', authenticate, requireAdmin, async (req, res) => {
  const title = String(req.body?.title || '').trim()
  if (!title) return res.status(400).json({ message: 'Title is required' })

  const category = POST_CATEGORIES.includes(req.body?.category) ? req.body.category : 'announcement'

  const [result] = await pool.query(
    `INSERT INTO homepage_posts
       (category, title, body, link_url, image_data, is_published, pinned, expires_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      category,
      title,
      req.body?.body || null,
      req.body?.linkUrl || null,
      req.body?.imageData || null,
      req.body?.isPublished === false ? false : true,
      Boolean(req.body?.pinned),
      req.body?.expiresAt ? new Date(req.body.expiresAt).toISOString().slice(0, 19).replace('T', ' ') : null,
      req.user.id,
    ],
  )

  return res.status(201).json({ id: result.insertId })
})

router.put('/homepage/:id', authenticate, requireAdmin, async (req, res) => {
  const fields = {
    category: POST_CATEGORIES.includes(req.body?.category) ? req.body.category : undefined,
    title: req.body?.title,
    body: req.body?.body,
    link_url: req.body?.linkUrl,
    image_data: req.body?.imageData,
    is_published: req.body?.isPublished,
    pinned: req.body?.pinned,
  }

  const updates = Object.entries(fields).filter(([, value]) => value !== undefined)
  if (!updates.length) return res.status(400).json({ message: 'Nothing to update' })

  const [result] = await pool.query(
    `UPDATE homepage_posts SET ${updates.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...updates.map(([, value]) => value), req.params.id],
  )

  if (!result.affectedRows) return res.status(404).json({ message: 'Post not found' })
  return res.json({ updated: true })
})

router.delete('/homepage/:id', authenticate, requireAdmin, async (req, res) => {
  const [result] = await pool.query('DELETE FROM homepage_posts WHERE id = ?', [req.params.id])
  if (!result.affectedRows) return res.status(404).json({ message: 'Post not found' })
  return res.json({ deleted: true })
})

/* --------------------------------------------------------------- enrolments */
router.get('/enrollments/me', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT e.id, e.room_id, e.career_path_id, e.status, e.enrolled_at, e.completed_at,
            r.title AS course_title, r.slug AS course_slug, r.category AS course_category,
            r.level AS course_level, r.estimate_time AS course_duration,
            p.title AS path_title, p.slug AS path_slug
     FROM course_enrollments e
     LEFT JOIN rooms r ON r.id = e.room_id
     LEFT JOIN career_paths p ON p.id = e.career_path_id
     WHERE e.user_id = ?
     ORDER BY e.enrolled_at DESC`,
    [req.user.id],
  )

  return res.json(
    rows.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      careerPathId: row.career_path_id,
      status: row.status,
      enrolledAt: row.enrolled_at,
      completedAt: row.completed_at,
      title: row.course_title || row.path_title,
      slug: row.course_slug || row.path_slug,
      category: row.course_category,
      level: row.course_level,
      duration: row.course_duration,
      kind: row.room_id ? 'course' : 'path',
    })),
  )
})

router.post('/enrollments', authenticate, async (req, res) => {
  const roomId = req.body?.roomId || null
  const careerPathId = req.body?.careerPathId || null

  if (!roomId && !careerPathId) {
    return res.status(400).json({ message: 'Provide either roomId or careerPathId' })
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO course_enrollments (user_id, room_id, career_path_id, status)
       VALUES (?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE status = 'active'`,
      [req.user.id, roomId, careerPathId],
    )

    if (careerPathId) {
      await pool.query(
        'UPDATE career_paths SET enrolled_count = enrolled_count + 1 WHERE id = ?',
        [careerPathId],
      )
    }

    return res.status(201).json({ id: result.insertId, enrolled: true })
  } catch (error) {
    if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({ message: 'That course or path does not exist' })
    }
    throw error
  }
})

router.delete('/enrollments/:id', authenticate, async (req, res) => {
  const [result] = await pool.query(
    'DELETE FROM course_enrollments WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
  )
  if (!result.affectedRows) return res.status(404).json({ message: 'Enrolment not found' })
  return res.json({ deleted: true })
})

/* ----------------------------------------------------------------- feedback */
router.get('/feedback/course/:roomId', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT f.id, f.rating, f.content_rating, f.trainer_rating, f.comment, f.created_at,
            u.username, u.first_name
     FROM course_feedback f
     JOIN users u ON u.id = f.user_id
     WHERE f.room_id = ?
     ORDER BY f.created_at DESC LIMIT 100`,
    [req.params.roomId],
  )

  const ratings = rows.map((row) => Number(row.rating))
  return res.json({
    average: ratings.length
      ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10
      : null,
    count: rows.length,
    feedback: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      contentRating: row.content_rating,
      trainerRating: row.trainer_rating,
      comment: row.comment,
      createdAt: row.created_at,
      author: row.first_name || row.username,
    })),
  })
})

router.post('/feedback', authenticate, async (req, res) => {
  const rating = clampRating(req.body?.rating)
  if (!rating) return res.status(400).json({ message: 'Give a rating between 1 and 5' })
  if (!req.body?.roomId && !req.body?.careerPathId) {
    return res.status(400).json({ message: 'Provide either roomId or careerPathId' })
  }

  await pool.query(
    `INSERT INTO course_feedback
       (user_id, room_id, career_path_id, trainer_id, rating, content_rating, trainer_rating, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rating = VALUES(rating),
       content_rating = VALUES(content_rating),
       trainer_rating = VALUES(trainer_rating),
       comment = VALUES(comment)`,
    [
      req.user.id,
      req.body?.roomId || null,
      req.body?.careerPathId || null,
      req.body?.trainerId || null,
      rating,
      clampRating(req.body?.contentRating),
      clampRating(req.body?.trainerRating),
      req.body?.comment || null,
    ],
  )

  return res.status(201).json({ saved: true })
})

/* ---------------------------------------------------------- trainer library */
router.get('/library', authenticate, async (req, res) => {
  const staff = isRole(req.user.role, ROLES.TRAINER, ROLES.ADMIN)
  const filters = []
  const params = []

  if (req.query.mine === 'true' && staff) {
    filters.push('l.trainer_id = ?')
    params.push(req.user.id)
  } else {
    filters.push('l.is_published = true')
  }

  if (req.query.subject) {
    filters.push('l.subject = ?')
    params.push(String(req.query.subject))
  }

  if (LIBRARY_TYPES.includes(String(req.query.type))) {
    filters.push('l.item_type = ?')
    params.push(String(req.query.type))
  }

  const [rows] = await pool.query(
    `SELECT l.id, l.title, l.description, l.subject, l.room_id, l.item_type, l.external_url,
            l.file_name, l.file_type, l.file_size, l.is_published, l.download_count, l.created_at,
            l.trainer_id, u.username AS trainer_username, u.first_name AS trainer_first_name,
            r.title AS course_title
     FROM trainer_library_items l
     JOIN users u ON u.id = l.trainer_id
     LEFT JOIN rooms r ON r.id = l.room_id
     WHERE ${filters.join(' AND ')}
     ORDER BY l.created_at DESC LIMIT 300`,
    params,
  )

  // File payloads are fetched separately so the listing stays small.
  return res.json(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      subject: row.subject,
      roomId: row.room_id,
      courseTitle: row.course_title,
      itemType: row.item_type,
      externalUrl: row.external_url,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSize: row.file_size,
      isPublished: Boolean(row.is_published),
      downloadCount: row.download_count,
      createdAt: row.created_at,
      trainerId: row.trainer_id,
      trainerName: row.trainer_first_name || row.trainer_username,
      canManage: isRole(req.user.role, ROLES.ADMIN) || Number(row.trainer_id) === Number(req.user.id),
    })),
  )
})

router.get('/library/:id/file', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT file_name, file_type, file_data, external_url, is_published FROM trainer_library_items WHERE id = ? LIMIT 1',
    [req.params.id],
  )

  if (!rows.length) return res.status(404).json({ message: 'Item not found' })
  if (!rows[0].is_published && !isRole(req.user.role, ROLES.TRAINER, ROLES.ADMIN)) {
    return res.status(403).json({ message: 'This item is not published' })
  }

  await pool.query('UPDATE trainer_library_items SET download_count = download_count + 1 WHERE id = ?', [
    req.params.id,
  ])

  return res.json({
    fileName: rows[0].file_name,
    fileType: rows[0].file_type,
    fileData: rows[0].file_data,
    externalUrl: rows[0].external_url,
  })
})

router.post('/library', authenticate, requireTrainer, async (req, res) => {
  const title = String(req.body?.title || '').trim()
  if (!title) return res.status(400).json({ message: 'Title is required' })

  const itemType = LIBRARY_TYPES.includes(req.body?.itemType) ? req.body.itemType : 'material'
  if (!req.body?.fileData && !req.body?.externalUrl) {
    return res.status(400).json({ message: 'Attach a file or provide a link' })
  }

  const [result] = await pool.query(
    `INSERT INTO trainer_library_items
       (trainer_id, title, description, subject, room_id, item_type, external_url,
        file_name, file_type, file_size, file_data, is_published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      title,
      req.body?.description || null,
      req.body?.subject || null,
      req.body?.roomId || null,
      itemType,
      req.body?.externalUrl || null,
      req.body?.fileName || null,
      req.body?.fileType || null,
      Number(req.body?.fileSize || 0),
      req.body?.fileData || null,
      req.body?.isPublished === false ? false : true,
    ],
  )

  return res.status(201).json({ id: result.insertId })
})

router.put('/library/:id', authenticate, requireTrainer, async (req, res) => {
  const [rows] = await pool.query('SELECT trainer_id FROM trainer_library_items WHERE id = ? LIMIT 1', [
    req.params.id,
  ])
  if (!rows.length) return res.status(404).json({ message: 'Item not found' })
  if (!isRole(req.user.role, ROLES.ADMIN) && Number(rows[0].trainer_id) !== Number(req.user.id)) {
    return res.status(403).json({ message: 'You can only edit your own uploads' })
  }

  const fields = {
    title: req.body?.title,
    description: req.body?.description,
    subject: req.body?.subject,
    room_id: req.body?.roomId,
    item_type: LIBRARY_TYPES.includes(req.body?.itemType) ? req.body.itemType : undefined,
    external_url: req.body?.externalUrl,
    is_published: req.body?.isPublished,
  }

  const updates = Object.entries(fields).filter(([, value]) => value !== undefined)
  if (!updates.length) return res.status(400).json({ message: 'Nothing to update' })

  await pool.query(
    `UPDATE trainer_library_items SET ${updates.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...updates.map(([, value]) => (value === '' ? null : value)), req.params.id],
  )

  return res.json({ updated: true })
})

router.delete('/library/:id', authenticate, requireTrainer, async (req, res) => {
  const [rows] = await pool.query('SELECT trainer_id FROM trainer_library_items WHERE id = ? LIMIT 1', [
    req.params.id,
  ])
  if (!rows.length) return res.status(404).json({ message: 'Item not found' })
  if (!isRole(req.user.role, ROLES.ADMIN) && Number(rows[0].trainer_id) !== Number(req.user.id)) {
    return res.status(403).json({ message: 'You can only delete your own uploads' })
  }

  await pool.query('DELETE FROM trainer_library_items WHERE id = ?', [req.params.id])
  return res.json({ deleted: true })
})

/* ------------------------------------------------------ competency mapping */
router.get('/competencies/me', authenticate, requireTrainer, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM trainer_competencies WHERE trainer_id = ? ORDER BY proficiency_score DESC, subject',
    [req.user.id],
  )
  return res.json(rows)
})

router.put('/competencies/me', authenticate, requireTrainer, async (req, res) => {
  const subject = String(req.body?.subject || '').trim()
  if (!subject) return res.status(400).json({ message: 'Subject is required' })

  const score = Math.max(1, Math.min(5, Number(req.body?.proficiencyScore || 3)))

  await pool.query(
    `INSERT INTO trainer_competencies
       (trainer_id, subject, proficiency, proficiency_score, years_experience, notes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       proficiency = VALUES(proficiency),
       proficiency_score = VALUES(proficiency_score),
       years_experience = VALUES(years_experience),
       notes = VALUES(notes)`,
    [
      req.user.id,
      subject,
      req.body?.proficiency || 'Intermediate',
      score,
      Number(req.body?.yearsExperience || 0),
      req.body?.notes || null,
    ],
  )

  return res.json({ saved: true })
})

router.delete('/competencies/me/:id', authenticate, requireTrainer, async (req, res) => {
  const [result] = await pool.query(
    'DELETE FROM trainer_competencies WHERE id = ? AND trainer_id = ?',
    [req.params.id, req.user.id],
  )
  if (!result.affectedRows) return res.status(404).json({ message: 'Competency not found' })
  return res.json({ deleted: true })
})

/**
 * Competency mapping: rank trainers for a subject. Self-declared proficiency and
 * experience are combined with verification status and how the trainer's own
 * learners have actually performed, so the ranking is not purely self-reported.
 */
router.get('/competencies/match', authenticate, async (req, res) => {
  const subject = String(req.query.subject || '').trim()
  if (!subject) return res.status(400).json({ message: 'Provide a subject to match against' })

  const [rows] = await pool.query(
    `SELECT c.id AS competency_id, c.trainer_id, c.subject, c.proficiency, c.proficiency_score,
            c.years_experience, c.is_verified, c.notes,
            u.username, u.first_name, u.last_name, u.email, u.headline, u.department,
            (SELECT COUNT(*) FROM trainer_library_items l
              WHERE l.trainer_id = c.trainer_id AND l.subject = c.subject AND l.is_published = true)
              AS resources_published,
            (SELECT COUNT(*) FROM assessments a
              WHERE a.created_by = c.trainer_id AND a.subject = c.subject) AS assessments_authored,
            (SELECT ROUND(AVG(t.percentage)) FROM assessment_attempts t
              JOIN assessments a2 ON a2.id = t.assessment_id
              WHERE a2.created_by = c.trainer_id AND a2.subject = c.subject
                AND t.submitted_at IS NOT NULL) AS avg_trainee_score,
            (SELECT ROUND(AVG(f.trainer_rating), 1) FROM course_feedback f
              WHERE f.trainer_id = c.trainer_id AND f.trainer_rating IS NOT NULL) AS avg_rating
     FROM trainer_competencies c
     JOIN users u ON u.id = c.trainer_id
     WHERE c.subject = ? AND u.is_active = true AND u.approval_status = 'approved'
     ORDER BY c.proficiency_score DESC, c.years_experience DESC`,
    [subject],
  )

  const scored = rows
    .map((row) => {
      const proficiency = Number(row.proficiency_score || 0) * 10 // 0-50
      const experience = Math.min(Number(row.years_experience || 0), 10) * 2 // 0-20
      const verified = row.is_verified ? 10 : 0
      const contribution = Math.min(
        Number(row.resources_published || 0) + Number(row.assessments_authored || 0),
        10,
      ) // 0-10
      const rating = row.avg_rating ? (Number(row.avg_rating) / 5) * 10 : 0 // 0-10

      return {
        competencyId: row.competency_id,
        trainerId: row.trainer_id,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username,
        username: row.username,
        email: row.email,
        headline: row.headline,
        department: row.department,
        subject: row.subject,
        proficiency: row.proficiency,
        proficiencyScore: row.proficiency_score,
        yearsExperience: Number(row.years_experience || 0),
        isVerified: Boolean(row.is_verified),
        resourcesPublished: Number(row.resources_published || 0),
        assessmentsAuthored: Number(row.assessments_authored || 0),
        avgTraineeScore: row.avg_trainee_score === null ? null : Number(row.avg_trainee_score),
        avgRating: row.avg_rating === null ? null : Number(row.avg_rating),
        matchScore: Math.round(proficiency + experience + verified + contribution + rating),
      }
    })
    .sort((a, b) => b.matchScore - a.matchScore)

  return res.json({ subject, trainers: scored })
})

/** Admins can verify a declared competency. */
router.put('/competencies/:id/verify', authenticate, requireAdmin, async (req, res) => {
  const [result] = await pool.query(
    'UPDATE trainer_competencies SET is_verified = ? WHERE id = ?',
    [req.body?.isVerified === false ? false : true, req.params.id],
  )
  if (!result.affectedRows) return res.status(404).json({ message: 'Competency not found' })
  return res.json({ updated: true })
})

/** Directory of trainers, for trainees choosing who to learn from. */
router.get('/trainers', authenticate, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.headline, u.department, u.about_me,
            GROUP_CONCAT(DISTINCT c.subject ORDER BY c.proficiency_score DESC SEPARATOR '||') AS subjects,
            (SELECT COUNT(*) FROM trainer_library_items l WHERE l.trainer_id = u.id AND l.is_published = true) AS resources,
            (SELECT ROUND(AVG(f.trainer_rating), 1) FROM course_feedback f WHERE f.trainer_id = u.id) AS rating
     FROM users u
     LEFT JOIN trainer_competencies c ON c.trainer_id = u.id
     WHERE u.role = 'trainer' AND u.is_active = true AND u.approval_status = 'approved'
     GROUP BY u.id
     ORDER BY u.first_name, u.username`,
  )

  return res.json(
    rows.map((row) => ({
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username,
      username: row.username,
      headline: row.headline,
      department: row.department,
      aboutMe: row.about_me,
      subjects: row.subjects ? row.subjects.split('||') : [],
      resources: Number(row.resources || 0),
      rating: row.rating === null ? null : Number(row.rating),
      role: normaliseRole('trainer'),
    })),
  )
})

export default router
