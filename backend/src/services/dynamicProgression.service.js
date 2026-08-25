import { pool } from '../db/pool.js'

let tablesInitialized = false

/**
 * Ensures dynamic progression tables are present in the database.
 */
export async function ensureProgressionTables() {
  if (tablesInitialized) return
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dynamic_progression_rules (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        module_id VARCHAR(191) NOT NULL,
        rule_type VARCHAR(50) NOT NULL DEFAULT 'min_assessment_score',
        target_id VARCHAR(191) NULL,
        required_value DECIMAL(10,2) NOT NULL DEFAULT 80.00,
        config_json LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_progression_module (module_id),
        FOREIGN KEY (module_id) REFERENCES career_path_modules(id) ON DELETE CASCADE
      );
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_milestone_achievements (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        milestone_key VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(50) DEFAULT 'general',
        badge_icon VARCHAR(80) DEFAULT 'military_tech',
        xp_awarded INT DEFAULT 0,
        achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_milestone (user_id, milestone_key),
        INDEX idx_user_milestones (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_progression_recommendations (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        item_type VARCHAR(50) NOT NULL,
        item_id VARCHAR(191) NOT NULL,
        title VARCHAR(255) NOT NULL,
        reason VARCHAR(500) NOT NULL,
        action_url VARCHAR(255) NOT NULL,
        status VARCHAR(30) DEFAULT 'suggested',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_recommendations (user_id, status),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `)
    tablesInitialized = true
  } catch (err) {
    console.error('Error ensuring dynamic progression tables:', err.message)
  }
}

/**
 * 1. Adaptive Gating & Mastery-Based Rule Evaluation
 */
export async function evaluateDynamicModuleGating(userId, moduleId) {
  await ensureProgressionTables()

  const [rules] = await pool.query(
    `SELECT id, module_id, rule_type, target_id, required_value, config_json
     FROM dynamic_progression_rules
     WHERE module_id = ?`,
    [moduleId],
  )

  if (!rules.length) {
    return {
      hasDynamicRules: false,
      unlocked: true,
      fastTracked: false,
      blockedReasons: [],
      rulesEvaluated: [],
    }
  }

  const blockedReasons = []
  const rulesEvaluated = []
  let fastTracked = false

  for (const rule of rules) {
    let met = false
    let currentVal = null
    let description = ''

    if (rule.rule_type === 'min_assessment_score') {
      let assessmentQuery = `SELECT MAX(score / NULLIF(max_score, 0) * 100) AS best_pct, MAX(score) AS best_score
                             FROM assessment_attempts WHERE user_id = ?`
      const params = [userId]
      if (rule.target_id) {
        assessmentQuery += ` AND assessment_id = ?`
        params.push(rule.target_id)
      }

      const [[attempt]] = await pool.query(assessmentQuery, params)
      const achieved = attempt?.best_pct !== null && attempt?.best_pct !== undefined ? Number(attempt.best_pct) : 0
      currentVal = Math.round(achieved)
      met = achieved >= Number(rule.required_value)
      description = `Assessment ${rule.target_id || ''} score >= ${rule.required_value}% (Current: ${currentVal}%)`
      if (!met) {
        blockedReasons.push(`Requires at least ${rule.required_value}% on Assessment (Current: ${currentVal}%)`)
      }
    } else if (rule.rule_type === 'diagnostic_bypass') {
      let bypassQuery = `SELECT MAX(score / NULLIF(max_score, 0) * 100) AS best_pct
                         FROM assessment_attempts WHERE user_id = ?`
      const params = [userId]
      if (rule.target_id) {
        bypassQuery += ` AND assessment_id = ?`
        params.push(rule.target_id)
      }
      const [[attempt]] = await pool.query(bypassQuery, params)
      const achieved = attempt?.best_pct ? Number(attempt.best_pct) : 0
      currentVal = Math.round(achieved)
      if (achieved >= Number(rule.required_value)) {
        met = true
        fastTracked = true
        description = `Diagnostic test fast-track achieved (${currentVal}% >= ${rule.required_value}%)`
      } else {
        description = `Diagnostic bypass threshold not met (${currentVal}% < ${rule.required_value}%)`
      }
    } else if (rule.rule_type === 'min_assignment_score') {
      let assignmentQuery = `SELECT MAX(score) AS best_score FROM assignment_submissions WHERE user_id = ?`
      const params = [userId]
      if (rule.target_id) {
        assignmentQuery += ` AND assignment_id = ?`
        params.push(rule.target_id)
      }
      const [[sub]] = await pool.query(assignmentQuery, params)
      currentVal = sub?.best_score ? Number(sub.best_score) : 0
      met = currentVal >= Number(rule.required_value)
      description = `Assignment score >= ${rule.required_value} (Current: ${currentVal})`
      if (!met) {
        blockedReasons.push(`Requires assignment score >= ${rule.required_value}`)
      }
    } else if (rule.rule_type === 'skill_level') {
      const [[skill]] = await pool.query(
        `SELECT proficiency FROM user_skills WHERE user_id = ? AND skill = ?
         UNION ALL
         SELECT proficiency FROM skill_evidence WHERE user_id = ? AND skill = ? LIMIT 1`,
        [userId, rule.target_id, userId, rule.target_id],
      )
      const prof = (skill?.proficiency || 'none').toLowerCase()
      const levels = { none: 0, beginner: 1, intermediate: 2, advanced: 3, expert: 4 }
      const currentLevel = levels[prof] || 0
      met = currentLevel >= Number(rule.required_value)
      description = `Skill '${rule.target_id}' level >= ${rule.required_value} (Current: ${prof})`
      if (!met) {
        blockedReasons.push(`Requires skill '${rule.target_id}' at level ${rule.required_value}`)
      }
    } else {
      met = true
      description = `Rule ${rule.rule_type}`
    }

    rulesEvaluated.push({
      ruleId: rule.id,
      ruleType: rule.rule_type,
      targetId: rule.target_id,
      requiredValue: rule.required_value,
      currentValue: currentVal,
      met,
      description,
    })
  }

  const unlocked = fastTracked || blockedReasons.length === 0

  return {
    hasDynamicRules: true,
    unlocked,
    fastTracked,
    blockedReasons: fastTracked ? [] : blockedReasons,
    rulesEvaluated,
  }
}

/**
 * 2. Gamification: XP Tiers, Streaks, and Dynamic Milestones Engine
 */
export async function calculateGamificationStats(userId) {
  await ensureProgressionTables()

  const [completedRooms] = await pool.query(
    `SELECT r.id, r.category, COALESCE(NULLIF(REGEXP_REPLACE(r.xp, '[^0-9]', ''), ''), '100') AS xp
     FROM user_room_progress p
     JOIN rooms r ON r.id = p.room_id
     WHERE p.user_id = ? AND p.completed_at IS NOT NULL`,
    [userId],
  )
  const roomXp = completedRooms.reduce((sum, r) => sum + Number(r.xp || 100), 0)

  const [[assessmentStats]] = await pool.query(
    `SELECT COUNT(*) AS total_attempts,
            COUNT(CASE WHEN passed = true THEN 1 END) AS passed_count,
            COALESCE(SUM(score), 0) AS total_score,
            MAX(CASE WHEN score >= max_score AND max_score > 0 THEN 1 ELSE 0 END) AS has_perfect_score
     FROM assessment_attempts WHERE user_id = ?`,
    [userId],
  )
  const assessmentXp = Math.round(Number(assessmentStats?.total_score || 0) * 10)

  const [[projectStats]] = await pool.query(
    `SELECT COUNT(*) AS approved_milestones
     FROM project_milestones m
     JOIN learning_projects p ON p.id = m.project_id
     JOIN learning_project_members mem ON mem.project_id = p.id
     WHERE mem.user_id = ? AND m.status = 'reviewed'`,
    [userId],
  )
  const projectXp = Number(projectStats?.approved_milestones || 0) * 150

  const [[attendanceStats]] = await pool.query(
    `SELECT COUNT(*) AS attended FROM attendance_records WHERE user_id = ? AND status = 'present'`,
    [userId],
  )
  const attendanceXp = Number(attendanceStats?.attended || 0) * 50

  const totalXp = roomXp + assessmentXp + projectXp + attendanceXp

  const TIERS = [
    { name: 'Novice', minXp: 0, maxXp: 499, level: 1, icon: 'shield' },
    { name: 'Apprentice', minXp: 500, maxXp: 1499, level: 2, icon: 'military_tech' },
    { name: 'Practitioner', minXp: 1500, maxXp: 3499, level: 3, icon: 'workspace_premium' },
    { name: 'Specialist', minXp: 3500, maxXp: 6999, level: 4, icon: 'stars' },
    { name: 'Expert', minXp: 7000, maxXp: 11999, level: 5, icon: 'diamond' },
    { name: 'Master', minXp: 12000, maxXp: 999999, level: 6, icon: 'crown' },
  ]

  let currentTier = TIERS[0]
  for (const tier of TIERS) {
    if (totalXp >= tier.minXp) {
      currentTier = tier
    }
  }

  const nextTier = TIERS.find((t) => t.level === currentTier.level + 1) || null
  const progressToNextTier = nextTier
    ? Math.min(100, Math.round(((totalXp - currentTier.minXp) / (nextTier.minXp - currentTier.minXp)) * 100))
    : 100

  const [activityDates] = await pool.query(
    `SELECT DISTINCT DATE(activity_at) AS date FROM (
       SELECT completed_at AS activity_at FROM user_room_progress WHERE user_id = ? AND completed_at IS NOT NULL
       UNION ALL
       SELECT started_at AS activity_at FROM assessment_attempts WHERE user_id = ?
       UNION ALL
       SELECT checkin_at AS activity_at FROM attendance_records WHERE user_id = ? AND checkin_at IS NOT NULL
     ) acts ORDER BY date DESC LIMIT 30`,
    [userId, userId, userId],
  )

  let streakDays = 0
  if (activityDates.length) {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const dates = activityDates.map((r) => new Date(r.date).toISOString().slice(0, 10))

    if (dates.includes(today) || dates.includes(yesterday)) {
      let checkDate = new Date(dates[0])
      streakDays = 1
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i])
        const diffDays = Math.round((checkDate - prev) / (1000 * 3600 * 24))
        if (diffDays === 1) {
          streakDays++
          checkDate = prev
        } else {
          break
        }
      }
    }
  }

  const streakMultiplier = streakDays >= 7 ? 1.5 : streakDays >= 3 ? 1.2 : 1.0

  const potentialMilestones = [
    {
      key: 'first_blood',
      title: 'First Step',
      description: 'Completed your very first learning room',
      category: 'course',
      icon: 'flag',
      xp: 50,
      achieved: completedRooms.length >= 1,
    },
    {
      key: 'quiz_ace',
      title: 'Assessment Ace',
      description: 'Scored 100% on a technical assessment',
      category: 'assessment',
      icon: 'auto_awesome',
      xp: 100,
      achieved: Boolean(assessmentStats?.has_perfect_score),
    },
    {
      key: 'lab_warrior',
      title: 'Lab Warrior',
      description: 'Completed 5 or more courses',
      category: 'course',
      icon: 'psychology',
      xp: 200,
      achieved: completedRooms.length >= 5,
    },
    {
      key: 'project_builder',
      title: 'Capstone Builder',
      description: 'Successfully had a project milestone reviewed and approved',
      category: 'project',
      icon: 'handyman',
      xp: 150,
      achieved: Number(projectStats?.approved_milestones || 0) >= 1,
    },
    {
      key: 'streak_3',
      title: 'Consistent Scholar',
      description: 'Maintained a 3-day active learning streak',
      category: 'streak',
      icon: 'local_fire_department',
      xp: 75,
      achieved: streakDays >= 3,
    },
  ]

  for (const m of potentialMilestones) {
    if (m.achieved) {
      await pool.query(
        `INSERT IGNORE INTO user_milestone_achievements
         (user_id, milestone_key, title, description, category, badge_icon, xp_awarded)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, m.key, m.title, m.description, m.category, m.icon, m.xp],
      ).catch(() => {})
    }
  }

  const [milestones] = await pool.query(
    `SELECT milestone_key, title, description, category, badge_icon, xp_awarded, achieved_at
     FROM user_milestone_achievements WHERE user_id = ? ORDER BY achieved_at DESC`,
    [userId],
  )

  return {
    totalXp,
    roomXp,
    assessmentXp,
    projectXp,
    attendanceXp,
    currentTier: currentTier.name,
    level: currentTier.level,
    tierIcon: currentTier.icon,
    nextTier: nextTier?.name || null,
    nextTierXp: nextTier?.minXp || null,
    progressToNextTier,
    streakDays,
    streakMultiplier,
    completedRoomsCount: completedRooms.length,
    passedAssessmentsCount: Number(assessmentStats?.passed_count || 0),
    milestones,
    allMilestones: potentialMilestones.map((m) => ({
      ...m,
      unlocked: milestones.some((am) => am.milestone_key === m.key),
    })),
  }
}

/**
 * 3. Personalized Learning Recommendations Engine
 */
export async function generatePersonalizedRecommendations(userId) {
  await ensureProgressionTables()

  const recommendations = []

  const [weakAssessments] = await pool.query(
    `SELECT a.id, a.title, a.subject, AVG(att.score / NULLIF(att.max_score, 0) * 100) AS avg_score
     FROM assessment_attempts att
     JOIN assessments a ON a.id = att.assessment_id
     WHERE att.user_id = ?
     GROUP BY a.id, a.title, a.subject
     HAVING avg_score < 70
     ORDER BY avg_score ASC LIMIT 3`,
    [userId],
  )

  for (const item of weakAssessments) {
    recommendations.push({
      itemType: 'assessment',
      itemId: String(item.id),
      title: `Review & Retake: ${item.title}`,
      subject: item.subject,
      reason: `Your score average was ${Math.round(item.avg_score || 0)}%. Reviewing this subject will unlock advanced modules.`,
      actionUrl: `/assessments/${item.id}`,
      priority: 'high',
      tag: 'Remedial Mastery',
    })
  }

  const [enrolledPaths] = await pool.query(
    `SELECT e.career_path_id, cp.title AS path_title
     FROM course_enrollments e
     JOIN career_paths cp ON cp.id = e.career_path_id
     WHERE e.user_id = ? AND e.status = 'active'`,
    [userId],
  )

  for (const path of enrolledPaths) {
    const [modules] = await pool.query(
      `SELECT m.id, m.title, m.phase, m.sort_order
       FROM career_path_modules m
       WHERE m.career_path_id = ?
       ORDER BY m.sort_order, m.id`,
      [path.career_path_id],
    )

    for (const mod of modules) {
      const gating = await evaluateDynamicModuleGating(userId, mod.id)
      if (gating.unlocked) {
        const [incompleteCourses] = await pool.query(
          `SELECT r.id, r.title, r.slug
           FROM career_path_module_rooms mr
           JOIN rooms r ON r.id = mr.room_id
           LEFT JOIN user_room_progress p ON p.room_id = r.id AND p.user_id = ? AND p.completed_at IS NOT NULL
           WHERE mr.module_id = ? AND p.room_id IS NULL LIMIT 1`,
          [userId, mod.id],
        )

        if (incompleteCourses.length > 0) {
          recommendations.push({
            itemType: 'module',
            itemId: mod.id,
            title: `${mod.title} (${path.path_title})`,
            subject: mod.phase || 'Core',
            reason: gating.fastTracked
              ? 'Fast-tracked via diagnostic assessment! Ready to learn.'
              : 'All prerequisite criteria met. Recommended next step in your path.',
            actionUrl: `/learn/path/${path.career_path_id}/module/${mod.id}`,
            priority: 'medium',
            tag: gating.fastTracked ? 'Fast-Track' : 'Next in Path',
          })
          break
        }
      }
    }
  }

  const [newRooms] = await pool.query(
    `SELECT r.id, r.title, r.slug, r.category, r.level
     FROM rooms r
     LEFT JOIN user_room_progress p ON p.room_id = r.id AND p.user_id = ?
     WHERE p.completed_at IS NULL
     ORDER BY r.created_at DESC LIMIT 3`,
    [userId],
  )

  for (const room of newRooms) {
    if (!recommendations.some((r) => r.itemId === room.id || r.itemId === room.slug)) {
      recommendations.push({
        itemType: 'course',
        itemId: room.slug || room.id,
        title: room.title,
        subject: room.category,
        reason: `Expand your competency with hands-on practice in ${room.category}.`,
        actionUrl: `/learn/course/${room.slug || room.id}`,
        priority: 'low',
        tag: 'Recommended Practice',
      })
    }
  }

  return recommendations.slice(0, 6)
}

/**
 * 4. Stalling and Risk Analysis for Admins and Trainers
 */
export async function getStallingAndRiskMetrics(userId) {
  const [lastActivityRow] = await pool.query(
    `SELECT MAX(activity_at) AS last_seen FROM (
       SELECT completed_at AS activity_at FROM user_room_progress WHERE user_id = ?
       UNION ALL
       SELECT started_at AS activity_at FROM assessment_attempts WHERE user_id = ?
       UNION ALL
       SELECT submitted_at AS activity_at FROM assignment_submissions WHERE user_id = ?
       UNION ALL
       SELECT last_login_at AS activity_at FROM users WHERE id = ?
     ) acts`,
    [userId, userId, userId, userId],
  )

  const lastSeenDate = lastActivityRow[0]?.last_seen ? new Date(lastActivityRow[0].last_seen) : null
  const daysInactive = lastSeenDate ? Math.round((Date.now() - lastSeenDate.getTime()) / (1000 * 3600 * 24)) : 999

  const [failedAttempts] = await pool.query(
    `SELECT COUNT(*) AS fail_count FROM assessment_attempts WHERE user_id = ? AND passed = false`,
    [userId],
  )
  const failCount = Number(failedAttempts[0]?.fail_count || 0)

  const reasons = []
  let riskLevel = 'low'

  if (daysInactive >= 14) {
    riskLevel = 'high'
    reasons.push(`Inactive for ${daysInactive} days`)
  } else if (daysInactive >= 7) {
    riskLevel = 'medium'
    reasons.push(`Inactive for ${daysInactive} days`)
  }

  if (failCount >= 3) {
    riskLevel = 'high'
    reasons.push(`Repeated assessment failures (${failCount} failed attempts)`)
  } else if (failCount >= 1) {
    if (riskLevel !== 'high') riskLevel = 'medium'
    reasons.push(`Has ${failCount} failed assessment attempt(s)`)
  }

  return {
    isStalling: riskLevel !== 'low',
    riskLevel,
    daysInactive,
    failCount,
    reasons,
  }
}
