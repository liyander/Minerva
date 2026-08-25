import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin, requireTrainer } from '../middleware/auth.js'
import {
  evaluateDynamicModuleGating,
  calculateGamificationStats,
  generatePersonalizedRecommendations,
  getStallingAndRiskMetrics,
  ensureProgressionTables,
} from '../services/dynamicProgression.service.js'

const router = Router()

router.use(authenticate)

/* -------------------------------------------------------- prerequisites & dynamic progression --- */

/**
 * Module gating. A module unlocks once every prerequisite module is complete
 * and dynamic progression rules (minimum assessment/assignment score, diagnostic bypass)
 * are satisfied.
 */
router.get('/paths/:pathId/gating', async (req, res) => {
  await ensureProgressionTables()

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

  const [overrideRows] = await pool.query(
    `SELECT module_id FROM module_gating_overrides
     WHERE user_id = ? AND module_id IN (?) AND (expires_at IS NULL OR expires_at > NOW())`,
    [req.user.id, moduleIds],
  )
  const overrides = new Set(overrideRows.map((row) => row.module_id))

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

  const result = await Promise.all(
    modules.map(async (module, index) => {
      const explicit = prereqsByModule.get(module.id) || []
      const required = explicit.length
        ? explicit
        : index > 0
          ? [modules[index - 1].id]
          : []

      const outstanding = required.filter((moduleId) => !isModuleComplete(moduleId))
      const courses = coursesByModule.get(module.id) || []
      const done = courses.filter((roomId) => completedCourses.has(roomId)).length

      // Evaluate dynamic progression rules (mastery/assessment score thresholds, diagnostic bypass)
      const dynamicEvaluation = await evaluateDynamicModuleGating(req.user.id, module.id)

      const staticBlocked = outstanding.length > 0
      const dynamicBlocked = dynamicEvaluation.hasDynamicRules && !dynamicEvaluation.unlocked
      const isOverridden = overrides.has(module.id)
      const isFastTracked = dynamicEvaluation.fastTracked

      const allBlockers = [
        ...outstanding.map(
          (moduleId) => modules.find((row) => row.id === moduleId)?.title || moduleId,
        ),
        ...dynamicEvaluation.blockedReasons,
      ]

      return {
        id: module.id,
        title: module.title,
        phase: module.phase,
        totalCourses: courses.length,
        completedCourses: done,
        isComplete: isModuleComplete(module.id),
        requires: required,
        locked: !isOverridden && !isFastTracked && (staticBlocked || dynamicBlocked),
        overridden: isOverridden,
        fastTracked: isFastTracked,
        hasDynamicRules: dynamicEvaluation.hasDynamicRules,
        dynamicRules: dynamicEvaluation.rulesEvaluated,
        blockedBy: isFastTracked ? [] : allBlockers,
      }
    }),
  )

  return res.json({ modules: result })
})

router.put('/modules/:moduleId/override/:userId', requireAdmin, async (req, res) => {
  if (req.body?.granted === false) {
    await pool.query('DELETE FROM module_gating_overrides WHERE module_id=? AND user_id=?', [req.params.moduleId, req.params.userId])
    return res.json({ granted: false })
  }
  await pool.query(
    `INSERT INTO module_gating_overrides (module_id,user_id,granted_by,reason,expires_at)
     VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE granted_by=VALUES(granted_by),reason=VALUES(reason),expires_at=VALUES(expires_at)`,
    [req.params.moduleId, req.params.userId, req.user.id, req.body?.reason || null, req.body?.expiresAt || null],
  )
  res.json({ granted: true })
})

/** Enforces module gates even when a trainee opens a course URL directly. */
router.get('/courses/:courseId/access', async (req, res) => {
  await ensureProgressionTables()
  const [rooms] = await pool.query('SELECT id FROM rooms WHERE id=? OR slug=? LIMIT 1', [req.params.courseId, req.params.courseId])
  if (!rooms.length) return res.status(404).json({ message: 'Course not found' })
  const [modules] = await pool.query(
    `SELECT module.id,module.title,module.career_path_id,module.sort_order
     FROM career_path_module_rooms link JOIN career_path_modules module ON module.id=link.module_id
     WHERE link.room_id=?`, [rooms[0].id])
  for (const module of modules) {
    const [override] = await pool.query(`SELECT 1 FROM module_gating_overrides WHERE module_id=? AND user_id=? AND (expires_at IS NULL OR expires_at>NOW()) LIMIT 1`, [module.id, req.user.id])
    if (override.length) continue

    // Dynamic progression rules
    const dynamicEval = await evaluateDynamicModuleGating(req.user.id, module.id)
    if (dynamicEval.fastTracked) continue
    if (dynamicEval.hasDynamicRules && !dynamicEval.unlocked) {
      return res.json({
        allowed: false,
        moduleId: module.id,
        moduleTitle: module.title,
        blockedBy: dynamicEval.blockedReasons,
      })
    }

    let [required] = await pool.query('SELECT requires_module_id id FROM module_prerequisites WHERE module_id=?', [module.id])
    if (!required.length) {
      const [previous] = await pool.query('SELECT id FROM career_path_modules WHERE career_path_id=? AND sort_order < ? ORDER BY sort_order DESC LIMIT 1', [module.career_path_id, module.sort_order])
      required = previous
    }
    if (!required.length) continue
    const ids = required.map((row) => row.id)
    const [counts] = await pool.query(
      `SELECT required.id,required.title,COUNT(DISTINCT links.room_id) total,
              COUNT(DISTINCT CASE WHEN progress.completed_at IS NOT NULL THEN links.room_id END) done
       FROM career_path_modules required
       LEFT JOIN career_path_module_rooms links ON links.module_id=required.id
       LEFT JOIN user_room_progress progress ON progress.room_id=links.room_id AND progress.user_id=?
       WHERE required.id IN (?) GROUP BY required.id,required.title`, [req.user.id, ids])
    const blocked = counts.filter((row) => !Number(row.total) || Number(row.done) < Number(row.total))
    if (blocked.length) return res.json({ allowed: false, moduleId: module.id, moduleTitle: module.title, blockedBy: blocked.map((row) => row.title) })
  }
  res.json({ allowed: true })
})

/* ------------------------------------------------ dynamic progression rules CRUD --- */

router.get('/modules/:moduleId/dynamic-rules', requireTrainer, async (req, res) => {
  await ensureProgressionTables()
  const [rules] = await pool.query(
    `SELECT id, module_id, rule_type, target_id, required_value, config_json, created_at
     FROM dynamic_progression_rules WHERE module_id = ? ORDER BY id`,
    [req.params.moduleId],
  )
  res.json({ rules })
})

router.post('/modules/:moduleId/dynamic-rules', requireTrainer, async (req, res) => {
  await ensureProgressionTables()
  const { ruleType = 'min_assessment_score', targetId = null, requiredValue = 80 } = req.body || {}

  const [result] = await pool.query(
    `INSERT INTO dynamic_progression_rules (module_id, rule_type, target_id, required_value)
     VALUES (?, ?, ?, ?)`,
    [req.params.moduleId, ruleType, targetId, Number(requiredValue)],
  )
  res.json({ id: result.insertId, saved: true })
})

router.delete('/modules/:moduleId/dynamic-rules/:ruleId', requireTrainer, async (req, res) => {
  await ensureProgressionTables()
  await pool.query(
    `DELETE FROM dynamic_progression_rules WHERE id = ? AND module_id = ?`,
    [req.params.ruleId, req.params.moduleId],
  )
  res.json({ deleted: true })
})

/* ------------------------------------------------ gamification & milestones --- */

router.get('/gamification/me', async (req, res) => {
  const stats = await calculateGamificationStats(req.user.id)
  res.json(stats)
})

router.get('/gamification/:userId', async (req, res) => {
  const targetId = Number(req.params.userId) || req.user.id
  const stats = await calculateGamificationStats(targetId)
  res.json(stats)
})

/* ------------------------------------------------ personalized recommendations --- */

router.get('/recommendations/me', async (req, res) => {
  const recommendations = await generatePersonalizedRecommendations(req.user.id)
  res.json({ recommendations })
})

router.get('/recommendations/:userId', async (req, res) => {
  const targetId = Number(req.params.userId) || req.user.id
  const recommendations = await generatePersonalizedRecommendations(targetId)
  res.json({ recommendations })
})

/* ------------------------------------------------ admin student progression monitor --- */

router.get('/admin/student-progression/:userId', requireTrainer, async (req, res) => {
  await ensureProgressionTables()
  const targetUserId = Number(req.params.userId)

  // 1. User details
  const [users] = await pool.query('SELECT id, username, first_name, last_name, role, is_active FROM users WHERE id = ?', [targetUserId])
  if (!users.length) return res.status(404).json({ message: 'User not found' })

  // 2. Gamification stats
  const gamification = await calculateGamificationStats(targetUserId)

  // 3. Stalling / Risk metrics
  const risk = await getStallingAndRiskMetrics(targetUserId)

  // 4. Recommendations
  const recommendations = await generatePersonalizedRecommendations(targetUserId)

  // 5. Comprehensive Student Performance Statistics
  const [roomStats] = await pool.query(
    `SELECT COUNT(*) AS total_completed, COALESCE(SUM(r.xp), 0) AS room_points
     FROM user_room_progress p
     JOIN rooms r ON r.id = p.room_id
     WHERE p.user_id = ? AND p.completed_at IS NOT NULL`,
    [targetUserId],
  )

  const [assessmentStats] = await pool.query(
    `SELECT 
       COUNT(*) AS total_attempts,
       SUM(passed = true) AS total_passed,
       COALESCE(ROUND(AVG(percentage)), 0) AS avg_percentage,
       COALESCE(MAX(percentage), 0) AS max_percentage
     FROM assessment_attempts
     WHERE user_id = ? AND submitted_at IS NOT NULL`,
    [targetUserId],
  )

  const [assignmentStats] = await pool.query(
    `SELECT 
       COUNT(*) AS total_submissions,
       SUM(passed = true) AS passed_submissions,
       COALESCE(ROUND(AVG(score)), 0) AS avg_assignment_score
     FROM assignment_submissions
     WHERE user_id = ?`,
    [targetUserId],
  )

  const [attendanceStats] = await pool.query(
    `SELECT 
       COUNT(*) AS total_sessions,
       SUM(status = 'present') AS attended_sessions
     FROM attendance_records
     WHERE user_id = ?`,
    [targetUserId],
  )

  const [categoryBreakdown] = await pool.query(
    `SELECT 
       r.category,
       COUNT(p.id) AS completed_count,
       COALESCE(ROUND(AVG(r.xp)), 0) AS avg_xp
     FROM user_room_progress p
     JOIN rooms r ON r.id = p.room_id
     WHERE p.user_id = ? AND p.completed_at IS NOT NULL
     GROUP BY r.category`,
    [targetUserId],
  )

  const totalSessions = Number(attendanceStats[0]?.total_sessions || 0)
  const attendedSessions = Number(attendanceStats[0]?.attended_sessions || 0)
  const attendanceRate = totalSessions > 0 ? Math.round((attendedSessions / totalSessions) * 100) : 100

  const totalAttempts = Number(assessmentStats[0]?.total_attempts || 0)
  const totalPassed = Number(assessmentStats[0]?.total_passed || 0)
  const assessmentPassRate = totalAttempts > 0 ? Math.round((totalPassed / totalAttempts) * 100) : 0

  const statistics = {
    totalCompletedRooms: Number(roomStats[0]?.total_completed || 0),
    roomPoints: Number(roomStats[0]?.room_points || 0),
    totalAssessmentAttempts: totalAttempts,
    passedAssessments: totalPassed,
    assessmentAverage: Number(assessmentStats[0]?.avg_percentage || 0),
    highestAssessmentScore: Number(assessmentStats[0]?.max_percentage || 0),
    assessmentPassRate,
    assignmentSubmissions: Number(assignmentStats[0]?.total_submissions || 0),
    passedAssignments: Number(assignmentStats[0]?.passed_submissions || 0),
    avgAssignmentScore: Number(assignmentStats[0]?.avg_assignment_score || 0),
    totalSessions,
    attendedSessions,
    attendanceRate,
    categoryBreakdown: categoryBreakdown.map(c => ({
      category: c.category,
      completed: Number(c.completed_count),
      avgXp: Number(c.avg_xp)
    }))
  }

  // 6. Active path progress & gating breakdown
  const [enrolledPaths] = await pool.query(
    `SELECT e.career_path_id, cp.title AS path_title
     FROM course_enrollments e
     JOIN career_paths cp ON cp.id = e.career_path_id
     WHERE e.user_id = ?`,
    [targetUserId],
  )

  const pathProgress = []
  for (const path of enrolledPaths) {
    const [modules] = await pool.query(
      `SELECT m.id, m.title, m.phase, m.sort_order
       FROM career_path_modules m
       WHERE m.career_path_id = ?
       ORDER BY m.sort_order, m.id`,
      [path.career_path_id],
    )

    const moduleStatuses = []
    for (const mod of modules) {
      const dynamicStatus = await evaluateDynamicModuleGating(targetUserId, mod.id)
      const [overrides] = await pool.query(
        `SELECT id, reason, expires_at FROM module_gating_overrides WHERE module_id = ? AND user_id = ?`,
        [mod.id, targetUserId],
      )

      const [courseProgress] = await pool.query(
        `SELECT mr.room_id, r.title, (p.completed_at IS NOT NULL) AS is_completed
         FROM career_path_module_rooms mr
         JOIN rooms r ON r.id = mr.room_id
         LEFT JOIN user_room_progress p ON p.room_id = mr.room_id AND p.user_id = ?
         WHERE mr.module_id = ?`,
        [targetUserId, mod.id],
      )

      const totalCourses = courseProgress.length
      const completedCourses = courseProgress.filter((c) => Boolean(c.is_completed)).length

      moduleStatuses.push({
        id: mod.id,
        title: mod.title,
        phase: mod.phase,
        totalCourses,
        completedCourses,
        isComplete: totalCourses > 0 && completedCourses === totalCourses,
        isUnlocked: Boolean(overrides.length) || dynamicStatus.unlocked,
        isOverridden: overrides.length > 0,
        isFastTracked: dynamicStatus.fastTracked,
        blockedReasons: dynamicStatus.blockedReasons,
        dynamicRules: dynamicStatus.rulesEvaluated,
        courses: courseProgress,
      })
    }

    pathProgress.push({
      pathId: path.career_path_id,
      pathTitle: path.path_title,
      modules: moduleStatuses,
    })
  }

  res.json({
    user: users[0],
    gamification,
    risk,
    statistics,
    recommendations,
    pathProgress,
  })
})

router.post('/admin/student-progression/:userId/fast-track', requireAdmin, async (req, res) => {
  await ensureProgressionTables()
  const { moduleId, reason = 'Admin fast-track override' } = req.body || {}
  if (!moduleId) return res.status(400).json({ message: 'Module ID is required' })

  await pool.query(
    `INSERT INTO module_gating_overrides (module_id, user_id, granted_by, reason)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE granted_by = VALUES(granted_by), reason = VALUES(reason)`,
    [moduleId, req.params.userId, req.user.id, reason],
  )

  res.json({ fastTracked: true, moduleId })
})

router.put('/modules/:moduleId/prerequisites', requireTrainer, async (req, res) => {
  const requires = Array.isArray(req.body?.requires) ? req.body.requires : []

  if (requires.includes(req.params.moduleId)) {
    return res.status(400).json({ message: 'A module cannot require itself' })
  }

  const [moduleRows] = await pool.query('SELECT id,career_path_id FROM career_path_modules WHERE id=? LIMIT 1', [req.params.moduleId])
  if (!moduleRows.length) return res.status(404).json({ message: 'Module not found' })
  if (requires.length) {
    const [requiredRows] = await pool.query('SELECT id,career_path_id FROM career_path_modules WHERE id IN (?)', [requires])
    if (requiredRows.length !== new Set(requires).size || requiredRows.some((row) => row.career_path_id !== moduleRows[0].career_path_id)) {
      return res.status(400).json({ message: 'Prerequisites must be valid modules in the same learning path' })
    }
    const [edges] = await pool.query(
      `SELECT prerequisite.module_id,prerequisite.requires_module_id
       FROM module_prerequisites prerequisite
       JOIN career_path_modules module ON module.id=prerequisite.module_id
       WHERE module.career_path_id=?`, [moduleRows[0].career_path_id])
    const graph = new Map()
    for (const edge of edges) {
      if (!graph.has(edge.module_id)) graph.set(edge.module_id, [])
      graph.get(edge.module_id).push(edge.requires_module_id)
    }
    const reachesTarget = (start, seen = new Set()) => {
      if (start === req.params.moduleId) return true
      if (seen.has(start)) return false
      seen.add(start)
      return (graph.get(start) || []).some((next) => reachesTarget(next, seen))
    }
    if (requires.some((requiredId) => reachesTarget(requiredId))) {
      return res.status(400).json({ message: 'These prerequisites would create a progression cycle' })
    }
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

  const [courses, paths, modules, library, resources, research, assessments, assignments] = await Promise.all([
    pool.query(
      `SELECT id, slug, title, description, category, COALESCE(difficulty,level) difficulty FROM rooms
       WHERE title LIKE ? OR description LIKE ? OR category LIKE ? LIMIT ?`,
      [like, like, like, perType],
    ),
    pool.query(
      `SELECT id, slug, title, description FROM career_paths
       WHERE title LIKE ? OR description LIKE ? LIMIT ?`,
      [like, like, perType],
    ),
    pool.query(
      `SELECT m.id,m.title,m.description,m.phase,p.id path_id,p.slug path_slug,p.title path_title
       FROM career_path_modules m JOIN career_paths p ON p.id=m.career_path_id
       WHERE m.title LIKE ? OR m.description LIKE ? OR m.phase LIKE ? LIMIT ?`,
      [like, like, like, perType],
    ),
    pool.query(
      `SELECT item.id, item.title, item.description, item.subject, item.item_type,
              item.trainer_id, COALESCE(NULLIF(CONCAT_WS(' ',u.first_name,u.last_name),''),u.username) trainer_name
       FROM trainer_library_items item JOIN users u ON u.id=item.trainer_id
       WHERE item.is_published = true AND (item.title LIKE ? OR item.description LIKE ? OR item.subject LIKE ?) LIMIT ?`,
      [like, like, like, perType],
    ),
    pool.query(
      `SELECT id, cve_id, short_description FROM cves
       WHERE cve_id LIKE ? OR short_description LIKE ? LIMIT ?`,
      [like, like, perType],
    ),
    pool.query(
      `SELECT id,title,summary description,project_type FROM lab_research_projects
       WHERE is_active=true AND (title LIKE ? OR summary LIKE ? OR explanation LIKE ?) LIMIT ?`,
      [like, like, like, perType],
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
      difficulty: row.difficulty,
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
    ...modules[0].map((row) => ({
      type: 'module', id: row.id, title: row.title,
      subtitle: `${row.path_title} · ${row.phase || 'Module'}`, snippet: row.description,
      link: `/learn/path/${row.path_slug || row.path_id}/module/${row.id}`, icon: 'view_agenda',
    })),
    ...library[0].map((row) => ({
      type: 'library',
      id: row.id,
      trainerId: row.trainer_id,
      trainer: row.trainer_name,
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
    ...research[0].map((row) => ({
      type: 'research', id: row.id, title: row.title, subtitle: `${row.project_type || 'research'} project`,
      snippet: row.description, link: `/projects/${row.id}`, icon: 'biotech',
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
  const typeFilter = String(req.query.type || '').trim()
  const subjectFilter = String(req.query.subject || req.query.stream || '').trim().toLowerCase()
  const trainerFilter = String(req.query.trainer || '').trim().toLowerCase()
  const difficultyFilter = String(req.query.difficulty || '').trim().toLowerCase()
  const filtered = results.filter((item) =>
    (!typeFilter || item.type === typeFilter) &&
    (!subjectFilter || `${item.subtitle || ''} ${item.snippet || ''}`.toLowerCase().includes(subjectFilter)) &&
    (!trainerFilter || `${item.trainer || ''} ${item.trainerId || ''}`.toLowerCase().includes(trainerFilter)) &&
    (!difficultyFilter || String(item.difficulty || '').toLowerCase().includes(difficultyFilter)),
  )
  filtered.sort((a, b) => {
    const rank = (item) => {
      const title = item.title.toLowerCase()
      if (title === lowered) return 0
      if (title.startsWith(lowered)) return 1
      if (title.includes(lowered)) return 2
      return 3
    }
    return rank(a) - rank(b) || a.title.localeCompare(b.title)
  })

  return res.json({ query: term, count: filtered.length, results: filtered })
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

  const [skillRows] = await pool.query(
    `SELECT skill,proficiency FROM user_skills WHERE user_id=?
     UNION ALL
     SELECT skill,proficiency FROM skill_evidence
     WHERE user_id=? AND (expires_at IS NULL OR expires_at>=CURRENT_DATE)
     UNION ALL
     SELECT a.subject,'intermediate' FROM assessment_attempts attempt
     JOIN assessments a ON a.id=attempt.assessment_id WHERE attempt.user_id=? AND attempt.passed=true
     UNION ALL
     SELECT a.subject,'intermediate' FROM assignment_submissions submission
     JOIN assignments a ON a.id=submission.assignment_id WHERE submission.user_id=? AND submission.passed=true
     UNION ALL
     SELECT p.title,'intermediate' FROM learning_project_members member
     JOIN learning_projects p ON p.id=member.project_id WHERE member.user_id=? AND p.status='completed'
     UNION ALL
     SELECT job_title,'intermediate' FROM user_work_experience WHERE user_id=?`,
    [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id],
  )
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
