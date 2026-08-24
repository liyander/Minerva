import bcrypt from 'bcryptjs'
import { defaultPlatformConfig, defaultUsers } from '../seed/defaultData.js'
import {
  buildStarterEvents,
  starterCareerPaths,
  starterCategories,
  starterCourses,
  starterNotifications,
  starterResources,
} from '../seed/starterContent.js'
import {
  departmentCareerPaths,
  departmentCategories,
  departmentCourses,
  departmentResources,
} from '../seed/departmentContent.js'

const allCategories = [...new Set([...starterCategories, ...departmentCategories])]
const allCourses = [...starterCourses, ...departmentCourses]
const allCareerPaths = [...starterCareerPaths, ...departmentCareerPaths]
const allResources = [...starterResources, ...departmentResources]

async function countRows(conn, table) {
  try {
    const [rows] = await conn.query(`SELECT COUNT(*) AS count FROM \`${table}\``)
    return Number(rows[0]?.count || 0)
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return null
    }
    throw error
  }
}

async function seedUsers(conn, force) {
  const existing = await countRows(conn, 'users')
  if (existing === null) return { table: 'users', skipped: 'table missing', inserted: 0 }
  if (existing > 0 && !force) return { table: 'users', skipped: 'already has rows', inserted: 0 }

  let inserted = 0
  for (const user of defaultUsers) {
    const hash = await bcrypt.hash(user.password, 10)
    const [result] = await conn.query(
      `INSERT INTO users (username, registration_number, email, password_hash, role)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE username = username`,
      [user.username, user.registrationNumber || null, user.email || null, hash, user.role],
    )
    if (result.affectedRows === 1) inserted += 1
  }

  return { table: 'users', inserted }
}

async function seedPlatformConfig(conn, force) {
  const existing = await countRows(conn, 'platform_config')
  if (existing === null) return { table: 'platform_config', skipped: 'table missing', inserted: 0 }
  if (existing > 0 && !force) {
    return { table: 'platform_config', skipped: 'already configured', inserted: 0 }
  }

  await conn.query(
    `INSERT INTO platform_config (id, routes_json, features_json, ai_json, api_json)
     VALUES (1, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       routes_json = VALUES(routes_json),
       features_json = VALUES(features_json)`,
    [
      JSON.stringify(defaultPlatformConfig.routes),
      JSON.stringify(defaultPlatformConfig.features),
      JSON.stringify(defaultPlatformConfig.ai || {}),
      JSON.stringify(defaultPlatformConfig.api || {}),
    ],
  )

  return { table: 'platform_config', inserted: 1 }
}

async function seedCategories(conn, force) {
  const existing = await countRows(conn, 'room_categories')
  if (existing === null) return { table: 'room_categories', skipped: 'table missing', inserted: 0 }

  let inserted = 0
  for (const name of allCategories) {
    const [result] = await conn.query(
      'INSERT INTO room_categories (name) VALUES (?) ON DUPLICATE KEY UPDATE name = name',
      [name],
    )
    if (result.affectedRows === 1) inserted += 1
  }

  return { table: 'room_categories', inserted }
}

async function seedCourses(conn, force) {
  const existing = await countRows(conn, 'rooms')
  if (existing === null) return { table: 'rooms', skipped: 'table missing', inserted: 0 }

  let inserted = 0
  for (const course of allCourses) {
    const [result] = await conn.query(
      `INSERT INTO rooms (
        id, slug, category, level, level_tone, dot_tone, title, description, xp,
        room_type, difficulty, estimate_time, environment, category_tag,
        content_markdown, content_html, mission_overview, remediation_protocols,
        vulnerability_definition, vulnerability_impact, technical_deep_dive
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
      [
        course.id,
        course.slug,
        course.category,
        course.level,
        course.levelTone,
        course.dotTone,
        course.title,
        course.description,
        course.xp,
        course.roomType || 'theoretical',
        course.difficulty,
        course.estimateTime,
        course.environment,
        course.categoryTag || null,
        course.content?.markdown || '',
        course.content?.html || '',
        course.content?.missionOverview || '',
        course.content?.remediationProtocols || '',
        course.content?.vulnerabilityBriefing?.definition || '',
        course.content?.vulnerabilityBriefing?.impact || '',
        course.content?.technicalDeepDive || '',
      ],
    )
    if (result.affectedRows === 1) inserted += 1

    await conn.query('DELETE FROM room_tags WHERE room_id = ?', [course.id])
    for (const tag of course.tags || []) {
      await conn.query('INSERT INTO room_tags (room_id, tag) VALUES (?, ?)', [course.id, tag])
    }

    await conn.query('DELETE FROM room_required_keywords WHERE room_id = ?', [course.id])
    for (const keyword of course.requiredKeywords || []) {
      await conn.query('INSERT INTO room_required_keywords (room_id, keyword) VALUES (?, ?)', [
        course.id,
        keyword,
      ])
    }
  }

  return { table: 'rooms', inserted }
}

async function seedCareerPaths(conn, force) {
  const existing = await countRows(conn, 'career_paths')
  if (existing === null) return { table: 'career_paths', skipped: 'table missing', inserted: 0 }

  let inserted = 0
  for (const path of allCareerPaths) {
    const [result] = await conn.query(
      `INSERT INTO career_paths (
        id, slug, title, description, icon, learning_path_level,
        difficulty, estimated_hours, enrolled_count, mastery, color, roadmap_sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
      [
        path.id,
        path.slug,
        path.title,
        path.description,
        path.icon || null,
        path.learningPathLevel || null,
        path.difficulty || null,
        path.estimatedHours || 0,
        path.enrolledCount || 0,
        path.mastery || 0,
        path.color || null,
        path.roadmapSortOrder || 0,
      ],
    )
    if (result.affectedRows === 1) inserted += 1

    for (let i = 0; i < (path.modules || []).length; i += 1) {
      const module = path.modules[i]
      await conn.query(
        `INSERT INTO career_path_modules (id, career_path_id, phase, title, description, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title), sort_order = VALUES(sort_order)`,
        [module.id, path.id, module.phase || null, module.title, module.description || null, i],
      )

      await conn.query('DELETE FROM career_path_module_rooms WHERE module_id = ?', [module.id])
      for (let j = 0; j < (module.rooms || []).length; j += 1) {
        // Only link courses that actually exist, so a partial seed cannot fail.
        const [roomRows] = await conn.query('SELECT 1 FROM rooms WHERE id = ? LIMIT 1', [
          module.rooms[j],
        ])
        if (!roomRows.length) continue

        await conn.query(
          'INSERT INTO career_path_module_rooms (module_id, room_id, sort_order) VALUES (?, ?, ?)',
          [module.id, module.rooms[j], j],
        )
      }
    }

    for (let i = 0; i < (path.resources || []).length; i += 1) {
      const resource = path.resources[i]
      await conn.query(
        `INSERT INTO career_path_resources (id, career_path_id, title, url, type, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title)`,
        [resource.id, path.id, resource.title, resource.url || null, resource.type || null, i],
      )
    }
  }

  return { table: 'career_paths', inserted }
}

async function seedResources(conn, force) {
  const existing = await countRows(conn, 'cves')
  if (existing === null) return { table: 'cves', skipped: 'table missing', inserted: 0 }

  let inserted = 0
  for (const resource of allResources) {
    const [result] = await conn.query(
      `INSERT INTO cves (
        cve_id, short_description, found_year, credit,
        vulnerability_report, method_followed, references_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE short_description = VALUES(short_description)`,
      [
        resource.cve_id,
        resource.short_description,
        resource.found_year || null,
        resource.credit || null,
        resource.vulnerability_report || '',
        resource.method_followed || '',
        resource.references_text || '',
      ],
    )
    if (result.affectedRows === 1) inserted += 1
  }

  return { table: 'cves', inserted }
}

async function seedNotifications(conn, force) {
  const existing = await countRows(conn, 'notifications')
  if (existing === null) return { table: 'notifications', skipped: 'table missing', inserted: 0 }
  if (existing > 0 && !force) {
    return { table: 'notifications', skipped: 'already has rows', inserted: 0 }
  }

  let inserted = 0
  for (const notification of starterNotifications) {
    await conn.query(
      'INSERT INTO notifications (title, message, type, is_active) VALUES (?, ?, ?, true)',
      [notification.title, notification.message, notification.type],
    )
    inserted += 1
  }

  return { table: 'notifications', inserted }
}

async function seedEvents(conn, force) {
  const existing = await countRows(conn, 'ctf_events')
  if (existing === null) return { table: 'ctf_events', skipped: 'table missing', inserted: 0 }
  if (existing > 0 && !force) {
    return { table: 'ctf_events', skipped: 'already has rows', inserted: 0 }
  }

  let inserted = 0
  for (const event of buildStarterEvents()) {
    await conn.query(
      `INSERT INTO ctf_events (
        name, registration_deadline, live_time, registration_link,
        source, event_format, is_active
      ) VALUES (?, ?, ?, ?, 'manual', ?, true)`,
      [
        event.name,
        event.registration_deadline,
        event.live_time,
        event.registration_link,
        event.event_format || null,
      ],
    )
    inserted += 1
  }

  return { table: 'ctf_events', inserted }
}

/**
 * Inserts starter content. Every step is skipped when its table already holds
 * rows, so this is safe to run repeatedly; `force` re-applies the content
 * without deleting anything the admin has since added.
 */
export async function seedStarterData(conn, { force = false } = {}) {
  const steps = [
    seedUsers,
    seedPlatformConfig,
    seedCategories,
    seedCourses,
    seedCareerPaths,
    seedResources,
    seedNotifications,
    seedEvents,
  ]

  const report = []
  for (const step of steps) {
    report.push(await step(conn, force))
  }

  return report
}
