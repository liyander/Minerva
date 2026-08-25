import mysql from 'mysql2/promise'
import { env } from '../config/env.js'
import { ensureProgressionTables, calculateGamificationStats } from '../services/dynamicProgression.service.js'

async function seedProgressionSampleData() {
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    multipleStatements: true,
  })

  try {
    console.log('--- Seeding Dynamic Progression Sample Data ---')
    await ensureProgressionTables()

    // 1. Target User: ID 1
    const [users] = await conn.query('SELECT id, username, role FROM users ORDER BY id LIMIT 5')
    if (!users.length) {
      console.log('No users found. Please initialize DB first.')
      return
    }
    const targetUser = users.find(u => u.id === 1) || users[0]
    const targetUserId = targetUser.id
    console.log(`Targeting User ID: ${targetUserId} (${targetUser.username})`)

    // 2. Career Paths & Modules
    const [paths] = await conn.query('SELECT id, title FROM career_paths LIMIT 1')
    if (!paths.length) {
      console.log('No career paths found.')
      return
    }
    const pathId = paths[0].id
    console.log(`Using career path: ${pathId} (${paths[0].title})`)

    const [modules] = await conn.query(
      'SELECT id, title, sort_order FROM career_path_modules WHERE career_path_id = ? ORDER BY sort_order',
      [pathId]
    )

    let moduleIds = modules.map(m => m.id)

    if (moduleIds.length < 3) {
      const starterMods = [
        { id: `${pathId}-mod-1`, title: 'Network Fundamentals & Packet Analysis', phase: 'Phase 1: Foundations', sort: 1 },
        { id: `${pathId}-mod-2`, title: 'SIEM & Threat Detection Systems', phase: 'Phase 2: Core Defense', sort: 2 },
        { id: `${pathId}-mod-3`, title: 'Advanced Incident Response & Forensics', phase: 'Phase 3: Specialization', sort: 3 },
      ]
      for (const sm of starterMods) {
        await conn.query(
          `INSERT IGNORE INTO career_path_modules (id, career_path_id, title, phase, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [sm.id, pathId, sm.title, sm.phase, sm.sort]
        )
      }
      moduleIds = starterMods.map(m => m.id)
    }

    // 3. Enroll the target user into the career path
    await conn.query(
      `INSERT INTO course_enrollments (user_id, career_path_id, status)
       VALUES (?, ?, 'active')
       ON DUPLICATE KEY UPDATE status = 'active'`,
      [targetUserId, pathId]
    )

    // 4. Create sample assessments
    await conn.query(`
      INSERT INTO assessments (id, title, description, subject, total_marks, pass_percentage, is_published)
      VALUES 
        (101, 'Network Security Assessment', 'Evaluates core networking and firewall concepts', 'Networking', 100, 80, true),
        (102, 'Diagnostic Pre-Test: Threat Intelligence', 'Diagnostic bypass evaluation for advanced defenders', 'Threat Intelligence', 100, 85, true),
        (103, 'Linux Defense & Forensics Quiz', 'Basic Linux log auditing assessment', 'Linux Security', 100, 75, true)
      ON DUPLICATE KEY UPDATE title = VALUES(title), is_published = true;
    `)

    // 5. Configure Dynamic Progression Rules for Modules
    // Module 2: Requires >= 80% on Assessment 101
    await conn.query(`
      INSERT INTO dynamic_progression_rules (module_id, rule_type, target_id, required_value)
      VALUES (?, 'min_assessment_score', '101', 80.00)
      ON DUPLICATE KEY UPDATE required_value = 80.00;
    `, [moduleIds[1] || moduleIds[0]])

    // Module 3: Has a Diagnostic Pre-test Bypass rule (>= 85% on Assessment 102)
    if (moduleIds[2]) {
      await conn.query(`
        INSERT INTO dynamic_progression_rules (module_id, rule_type, target_id, required_value)
        VALUES (?, 'diagnostic_bypass', '102', 85.00)
        ON DUPLICATE KEY UPDATE required_value = 85.00;
      `, [moduleIds[2]])
    }

    // 6. Record sample student attempts:
    // Assessment 101: High score (92%) -> Unlocks Module 2!
    // Assessment 103: Low score (55%) -> Triggers Remedial Recommendation!
    await conn.query(`DELETE FROM assessment_attempts WHERE user_id = ? AND assessment_id IN (101, 103)`, [targetUserId])
    await conn.query(`
      INSERT INTO assessment_attempts (assessment_id, user_id, score, max_score, percentage, passed, status, started_at, submitted_at)
      VALUES 
        (101, ?, 92.00, 100.00, 92, true, 'completed', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY)),
        (103, ?, 55.00, 100.00, 55, false, 'completed', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY));
    `, [targetUserId, targetUserId])

    // 7. Record Course Completions & Room Progress for XP
    const [rooms] = await conn.query('SELECT id FROM rooms LIMIT 3')
    for (const r of rooms) {
      await conn.query(`
        INSERT INTO user_room_progress (user_id, room_id, completed_at)
        VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE completed_at = NOW();
      `, [targetUserId, r.id])
    }

    // 8. Calculate and award Gamification Stats, Tiers, and Badges
    const stats = await calculateGamificationStats(targetUserId)
    console.log(`\n✅ Gamification Profile for ${targetUser.username}:`)
    console.log(`   - Current Tier: ${stats.currentTier} (Level ${stats.level})`)
    console.log(`   - Total XP: ${stats.totalXp}`)
    console.log(`   - Completed Courses: ${stats.completedRoomsCount}`)
    console.log(`   - Passed Assessments: ${stats.passedAssessmentsCount}`)
    console.log(`   - Study Streak: ${stats.streakDays} days (${stats.streakMultiplier}x multiplier)`)
    console.log(`   - Milestones Unlocked: ${stats.milestones.map(m => m.title).join(', ')}`)

    console.log('\n=============================================')
    console.log('🎉 Sample Dynamic Progression data created!')
    console.log(`👉 View Student Monitor: http://localhost:5173/admin/students/${targetUserId}`)
    console.log('👉 View Learning Hub:    http://localhost:5173/learning-hub')
    console.log('=============================================\n')
  } finally {
    await conn.end()
  }
}

seedProgressionSampleData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
