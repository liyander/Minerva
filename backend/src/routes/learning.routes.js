import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireTrainer } from '../middleware/auth.js'

const router = Router()

router.use(authenticate)

/* -------------------------------------------------------- prerequisites --- */

/**
 * Module gating. A module unlocks once every prerequisite module is complete,
 * where "complete" means all of its courses are finished. Explicit prerequisite
 * rows take priority; without them a path falls back to sequential order.
 */
router.get('/paths/:pathId/gating', async (req, res) => {
  const [modules] = await pool.query(
    `SELECT id, title, phase, sort_order FROM career_path_modules
     WHERE career_path_id = ? ORDER BY sort_order, id`,
    [req.params.pathId],
  )

  if (!modules.length) return res.json({ modules: [] })

  const moduleIds = modules.map((row) => row.id)

  const [courseRows] = await pool.query(
    'SELECT module_id, room_id FROM career_path_module_rooms WHERE module_id IN (?)',
    [moduleIds],
  )

  const [prereqRows] = await pool.query(
    'SELECT module_id, requires_module_id FROM module_prerequisites WHERE module_id IN (?)',
    [moduleIds],
  )

  const [progressRows] = await pool.query(
    'SELECT room_id FROM user_room_progress WHERE user_id = ? AND completed_at IS NOT NULL',
    [req.user.id],
  )
  const completedCourses = new Set(progressRows.map((row) => row.room_id))

  const coursesByModule = new Map()
  for (const row of courseRows) {
    coursesByModule.set(row.module_id, [...(coursesByModule.get(row.module_id) || []), row.room_id])
  }

  const prereqsByModule = new Map()
  for (const row of prereqRows) {
    prereqsByModule.set(row.module_id, [
      ...(prereqsByModule.get(row.module_id) || []),
      row.requires_module_id,
    ])
  }

  const isModuleComplete = (moduleId) => {
    const courses = coursesByModule.get(moduleId) || []
    if (!courses.length) return false
    return courses.every((roomId) => completedCourses.has(roomId))
  }

  const result = modules.map((module, index) => {
    const explicit = prereqsByModule.get(module.id) || []
    // No explicit rule: require the immediately preceding module.
    const required = explicit.length
      ? explicit
      : index > 0
        ? [modules[index - 1].id]
        : []

    const outstanding = required.filter((moduleId) => !isModuleComplete(moduleId))
    const courses = coursesByModule.get(module.id) || []
    const done = courses.filter((roomId) => completedCourses.has(roomId)).length

    return {
      id: module.id,
      title: module.title,
      phase: module.phase,
      totalCourses: courses.length,
      completedCourses: done,
      isComplete: isModuleComplete(module.id),
      requires: required,
      locked: outstanding.length > 0,
      blockedBy: outstanding.map(
        (moduleId) => modules.find((row) => row.id === moduleId)?.title || moduleId,
      ),
    }
  })

  return res.json({ modules: result })
})

router.put('/modules/:moduleId/prerequisites', requireTrainer, async (req, res) => {
  const requires = Array.isArray(req.body?.requires) ? req.body.requires : []

  if (requires.includes(req.params.moduleId)) {
    return res.status(400).json({ message: 'A module cannot require itself' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.query('DELETE FROM module_prerequisites WHERE module_id = ?', [
      req.params.moduleId,
    ])

    for (const requiredId of requires) {
      await connection.query(
        'INSERT IGNORE INTO module_prerequisites (module_id, requires_module_id) VALUES (?, ?)',
        [req.params.moduleId, requiredId],
      )
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  return res.json({ saved: requires.length })
})

/* ------------------------------------------------------ lecture progress --- */

/** Saves the playback position so a lecture resumes where it was left. */
router.put('/lectures/:itemId/progress', async (req, res) => {
  const position = Math.max(0, Number(req.body?.positionSeconds || 0))
  const duration = Math.max(0, Number(req.body?.durationSeconds || 0))
  // Treat the last 5% as finished so a trailing outro does not block completion.
  const completed = duration > 0 ? position >= duration * 0.95 : Boolean(req.body?.completed)

  await pool.query(
    `INSERT INTO lecture_progress (user_id, library_item_id, position_seconds, duration_seconds, completed)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       position_seconds = VALUES(position_seconds),
       duration_seconds = GREATEST(duration_seconds, VALUES(duration_seconds)),
       completed = completed OR VALUES(completed)`,
    [req.user.id, req.params.itemId, Math.round(position), Math.round(duration), completed],
  )

  return res.json({ saved: true, completed })
})

router.get('/lectures/progress', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.library_item_id, p.position_seconds, p.duration_seconds, p.completed, p.last_viewed_at,
            l.title, l.subject, l.item_type
     FROM lecture_progress p
     JOIN trainer_library_items l ON l.id = p.library_item_id
     WHERE p.user_id = ?
     ORDER BY p.last_viewed_at DESC LIMIT 100`,
    [req.user.id],
  )

  return res.json(
    rows.map((row) => ({
      libraryItemId: row.library_item_id,
      positionSeconds: row.position_seconds,
      durationSeconds: row.duration_seconds,
      completed: Boolean(row.completed),
      lastViewedAt: row.last_viewed_at,
      title: row.title,
      subject: row.subject,
      itemType: row.item_type,
      percentage: row.duration_seconds
        ? Math.min(100, Math.round((row.position_seconds / row.duration_seconds) * 100))
        : 0,
    })),
  )
})

/* -------------------------------------------------------------- search ---- */

/**
 * Cross-entity search over courses, paths, library items, resources and
 * assessments. LIKE-based rather than a full-text index: it stays correct on
 * short terms and needs no extra schema, and the row counts here are modest.
 */
router.get('/search', async (req, res) => {
  const term = String(req.query.q || '').trim()
  if (term.length < 2) {
    return res.json({ query: term, results: [] })
  }

  const like = `%${term}%`
  const perType = Math.min(Number(req.query.limit || 8), 20)

  const [courses, paths, library, resources, assessments, assignments] = await Promise.all([
    pool.query(
      `SELECT id, slug, title, description, category FROM rooms
       WHERE title LIKE ? OR description LIKE ? OR category LIKE ? LIMIT ?`,
      [like, like, like, perType],
    ),
    pool.query(
      `SELECT id, slug, title, description FROM career_paths
       WHERE title LIKE ? OR description LIKE ? LIMIT ?`,
      [like, like, perType],
    ),
    pool.query(
      `SELECT id, title, description, subject, item_type FROM trainer_library_items
       WHERE is_published = true AND (title LIKE ? OR description LIKE ? OR subject LIKE ?) LIMIT ?`,
      [like, like, like, perType],
    ),
    pool.query(
      `SELECT id, cve_id, short_description FROM cves
       WHERE cve_id LIKE ? OR short_description LIKE ? LIMIT ?`,
      [like, like, perType],
    ),
    pool.query(
      `SELECT id, title, subject FROM assessments
       WHERE is_published = true AND (title LIKE ? OR subject LIKE ?) LIMIT ?`,
      [like, like, perType],
    ),
    pool.query(
      `SELECT id, title, subject FROM assignments
       WHERE is_published = true AND (title LIKE ? OR subject LIKE ?) LIMIT ?`,
      [like, like, perType],
    ),
  ])

  const results = [
    ...courses[0].map((row) => ({
      type: 'course',
      id: row.id,
      title: row.title,
      subtitle: row.category,
      snippet: row.description,
      link: `/learn/course/${row.slug}`,
      icon: 'school',
    })),
    ...paths[0].map((row) => ({
      type: 'path',
      id: row.id,
      title: row.title,
      subtitle: 'Learning path',
      snippet: row.description,
      link: `/learn/path/${row.slug}`,
      icon: 'auto_stories',
    })),
    ...library[0].map((row) => ({
      type: 'library',
      id: row.id,
      title: row.title,
      subtitle: `${row.subject || 'General'} · ${row.item_type}`,
      snippet: row.description,
      link: '/library',
      icon: 'video_library',
    })),
    ...resources[0].map((row) => ({
      type: 'resource',
      id: row.id,
      title: row.cve_id,
      subtitle: 'Resource',
      snippet: row.short_description,
      link: `/resources/${row.id}`,
      icon: 'menu_book',
    })),
    ...assessments[0].map((row) => ({
      type: 'assessment',
      id: row.id,
      title: row.title,
      subtitle: `${row.subject} · assessment`,
      snippet: null,
      link: `/assessments/${row.id}`,
      icon: 'quiz',
    })),
    ...assignments[0].map((row) => ({
      type: 'assignment',
      id: row.id,
      title: row.title,
      subtitle: `${row.subject} · assignment`,
      snippet: null,
      link: `/assignments/${row.id}`,
      icon: 'assignment',
    })),
  ]

  // Exact and prefix matches first, then everything else alphabetically.
  const lowered = term.toLowerCase()
  results.sort((a, b) => {
    const rank = (item) => {
      const title = item.title.toLowerCase()
      if (title === lowered) return 0
      if (title.startsWith(lowered)) return 1
      if (title.includes(lowered)) return 2
      return 3
    }
    return rank(a) - rank(b) || a.title.localeCompare(b.title)
  })

  return res.json({ query: term, count: results.length, results })
})

/* ------------------------------------------------------- skill gap ------- */

/**
 * Compares a trainee's declared skills against the skills a target subject or
 * path expects (drawn from course tags and required keywords) and recommends
 * courses that close the gap.
 */
router.get('/skill-gap', async (req, res) => {
  const targetSubject = req.query.subject ? String(req.query.subject) : null
  const targetPathId = req.query.pathId ? String(req.query.pathId) : null

  const [skillRows] = await pool.query('SELECT skill, proficiency FROM user_skills WHERE user_id = ?', [
    req.user.id,
  ])
  const mySkills = new Map(
    skillRows.map((row) => [String(row.skill).trim().toLowerCase(), row.proficiency]),
  )

  const params = []
  let where = '1 = 1'

  if (targetPathId) {
    where = `r.id IN (
      SELECT mr.room_id FROM career_path_modules m
      JOIN career_path_module_rooms mr ON mr.module_id = m.id
      WHERE m.career_path_id = ?
    )`
    params.push(targetPathId)
  } else if (targetSubject) {
    where = 'r.category = ?'
    params.push(targetSubject)
  }

  const [courseRows] = await pool.query(
    `SELECT r.id, r.slug, r.title, r.category, r.level,
            GROUP_CONCAT(DISTINCT t.tag SEPARATOR '||') AS tags,
            GROUP_CONCAT(DISTINCT k.keyword SEPARATOR '||') AS keywords,
            (SELECT completed_at FROM user_room_progress p
              WHERE p.room_id = r.id AND p.user_id = ?) AS completed_at
     FROM rooms r
     LEFT JOIN room_tags t ON t.room_id = r.id
     LEFT JOIN room_required_keywords k ON k.room_id = r.id
     WHERE ${where}
     GROUP BY r.id
     LIMIT 200`,
    [req.user.id, ...params],
  )

  const requiredSkills = new Map()
  const recommendations = []

  for (const row of courseRows) {
    const skills = [
      ...String(row.tags || '').split('||'),
      ...String(row.keywords || '').split('||'),
    ]
      .map((value) => value.trim())
      .filter(Boolean)

    const missing = skills.filter((skill) => !mySkills.has(skill.toLowerCase()))

    for (const skill of skills) {
      const key = skill.toLowerCase()
      const entry = requiredSkills.get(key) || { skill, courses: 0, held: mySkills.has(key) }
      entry.courses += 1
      requiredSkills.set(key, entry)
    }

    if (!row.completed_at && missing.length) {
      recommendations.push({
        id: row.id,
        slug: row.slug,
        title: row.title,
        category: row.category,
        level: row.level,
        coversSkills: missing,
        // More new skills per course means a bigger step forward.
        gapClosed: missing.length,
      })
    }
  }

  recommendations.sort((a, b) => b.gapClosed - a.gapClosed || a.title.localeCompare(b.title))

  const required = [...requiredSkills.values()].sort((a, b) => b.courses - a.courses)
  const held = required.filter((entry) => entry.held)

  return res.json({
    target: targetPathId ? { kind: 'path', id: targetPathId } : targetSubject ? { kind: 'subject', id: targetSubject } : { kind: 'all' },
    mySkillCount: mySkills.size,
    requiredSkills: required,
    matchedSkills: held.map((entry) => entry.skill),
    missingSkills: required.filter((entry) => !entry.held).map((entry) => entry.skill),
    coverage: required.length ? Math.round((held.length / required.length) * 100) : 0,
    recommendations: recommendations.slice(0, 12),
  })
})

export default router
