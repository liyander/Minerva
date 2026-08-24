import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requirePublicApiKey, getPublicApiKeyState } from './public/auth.js'

const router = Router()

const LEVEL_ORDER = ['Easy', 'Medium', 'Hard']
const LEVEL_RANK = new Map([
  ['Easy', 1],
  ['Beginner', 1],
  ['Medium', 2],
  ['Intermediate', 2],
  ['Hard', 3],
  ['Advanced', 3],
  ['Expert', 4],
])

function rankToLabel(rank) {
  if (rank >= 4) return 'Expert'
  if (rank >= 3) return 'Hard'
  if (rank >= 2) return 'Medium'
  if (rank >= 1) return 'Easy'
  return 'Unclassified'
}

function getLevelRank(level) {
  return LEVEL_RANK.get(String(level || '').trim()) || 0
}

function normalizeInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  if (typeof min === 'number' && parsed < min) {
    return min
  }

  if (typeof max === 'number' && parsed > max) {
    return max
  }

  return parsed
}

function buildLikeTerm(value) {
  const text = String(value || '').trim()
  return text ? `%${text}%` : null
}

function toIsoDate(value) {
  return value ? new Date(value).toISOString() : null
}

function buildStudentDisplayName(row = {}) {
  const firstName = String(row.first_name || '').trim()
  const lastName = String(row.last_name || '').trim()
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
  return fullName || String(row.username || 'Student').trim() || 'Student'
}

function formatPercent(value) {
  const safeValue = Number.isFinite(value) ? value : 0
  return Math.round(safeValue * 1000) / 10
}

async function fetchRoomCatalog({ includeProgress = false } = {}) {
  const [rows] = await pool.query(
    `SELECT
      r.id,
      r.slug,
      r.category,
      r.level,
      r.title,
      r.description,
      r.xp,
      r.difficulty,
      r.estimate_time,
      r.environment,
      r.category_tag,
      r.created_at,
      r.updated_at,
      COUNT(DISTINCT urp.user_id) AS studying_students,
      COUNT(DISTINCT CASE WHEN urp.completed_at IS NOT NULL THEN urp.user_id END) AS completed_students
     FROM rooms r
     LEFT JOIN user_room_progress urp ON urp.room_id = r.id
     GROUP BY r.id
     ORDER BY r.created_at DESC`,
  )

  if (!includeProgress) {
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      category: row.category,
      level: row.level,
      title: row.title,
      description: row.description,
      xp: row.xp,
      difficulty: row.difficulty,
      estimateTime: row.estimate_time,
      environment: row.environment,
      categoryTag: row.category_tag,
      studyingStudents: Number(row.studying_students || 0),
      completedStudents: Number(row.completed_students || 0),
      createdAt: toIsoDate(row.created_at),
      updatedAt: toIsoDate(row.updated_at),
    }))
  }

  const [tagRows] = await pool.query('SELECT room_id, tag FROM room_tags ORDER BY id ASC')
  const [keywordRows] = await pool.query('SELECT room_id, keyword FROM room_required_keywords ORDER BY id ASC')
  const tagsByRoom = new Map()
  const keywordsByRoom = new Map()

  for (const tagRow of tagRows) {
    const key = String(tagRow.room_id)
    const tags = tagsByRoom.get(key) || []
    tags.push(tagRow.tag)
    tagsByRoom.set(key, tags)
  }

  for (const keywordRow of keywordRows) {
    const key = String(keywordRow.room_id)
    const keywords = keywordsByRoom.get(key) || []
    keywords.push(keywordRow.keyword)
    keywordsByRoom.set(key, keywords)
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    category: row.category,
    level: row.level,
    title: row.title,
    description: row.description,
    xp: row.xp,
    difficulty: row.difficulty,
    estimateTime: row.estimate_time,
    environment: row.environment,
    categoryTag: row.category_tag,
    tags: tagsByRoom.get(String(row.id)) || [],
    requiredKeywords: keywordsByRoom.get(String(row.id)) || [],
    studyingStudents: Number(row.studying_students || 0),
    completedStudents: Number(row.completed_students || 0),
    createdAt: toIsoDate(row.created_at),
    updatedAt: toIsoDate(row.updated_at),
  }))
}

async function fetchStudyPaths({ includeDetails = false } = {}) {
  const [rows] = await pool.query(
    `SELECT
      p.id,
      p.slug,
      p.title,
      p.description,
      p.icon,
      p.learning_path_level,
      p.difficulty,
      p.estimated_hours,
      p.enrolled_count,
      p.mastery,
      p.color,
      p.certificate_image_data,
      p.created_at,
      p.updated_at,
      COUNT(DISTINCT m.id) AS module_count,
      COUNT(DISTINCT mr.room_id) AS room_count,
      COUNT(DISTINCT CASE WHEN urp.started_at IS NOT NULL OR urp.completed_at IS NOT NULL THEN urp.user_id END) AS studying_students,
      COUNT(DISTINCT c.user_id) AS certificate_holders
     FROM career_paths p
     LEFT JOIN career_path_modules m ON m.career_path_id = p.id
     LEFT JOIN career_path_module_rooms mr ON mr.module_id = m.id
     LEFT JOIN user_room_progress urp ON urp.room_id = mr.room_id
     LEFT JOIN certificates c ON c.career_path_id = p.id
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
  )

  if (!includeDetails) {
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      icon: row.icon,
      learningPathLevel: row.learning_path_level,
      difficulty: row.difficulty,
      estimatedHours: row.estimated_hours,
      enrolledCount: row.enrolled_count,
      mastery: row.mastery,
      color: row.color,
      certificateImageData: row.certificate_image_data || null,
      moduleCount: Number(row.module_count || 0),
      roomCount: Number(row.room_count || 0),
      studyingStudents: Number(row.studying_students || 0),
      certificateHolders: Number(row.certificate_holders || 0),
      createdAt: toIsoDate(row.created_at),
      updatedAt: toIsoDate(row.updated_at),
    }))
  }

  const [moduleRows] = await pool.query(
    `SELECT
      id,
      career_path_id,
      phase,
      title,
      description,
      module_image_data,
      sort_order
     FROM career_path_modules
     ORDER BY sort_order ASC, title ASC`,
  )
  const [moduleRoomRows] = await pool.query(
    `SELECT
      module_id,
      room_id,
      sort_order
     FROM career_path_module_rooms
     ORDER BY sort_order ASC`,
  )
  const [resourceRows] = await pool.query(
    `SELECT
      id,
      career_path_id,
      title,
      url,
      type,
      sort_order
     FROM career_path_resources
     ORDER BY sort_order ASC`,
  )

  const roomsByModule = new Map()
  for (const row of moduleRoomRows) {
    const key = String(row.module_id)
    const values = roomsByModule.get(key) || []
    values.push(row.room_id)
    roomsByModule.set(key, values)
  }

  const modulesByPath = new Map()
  for (const row of moduleRows) {
    const key = String(row.career_path_id)
    const values = modulesByPath.get(key) || []
    values.push({
      id: row.id,
      phase: row.phase,
      title: row.title,
      description: row.description,
      imageData: row.module_image_data || null,
      rooms: roomsByModule.get(String(row.id)) || [],
      sortOrder: row.sort_order,
    })
    modulesByPath.set(key, values)
  }

  const resourcesByPath = new Map()
  for (const row of resourceRows) {
    const key = String(row.career_path_id)
    const values = resourcesByPath.get(key) || []
    values.push({
      id: row.id,
      title: row.title,
      url: row.url,
      type: row.type,
      sortOrder: row.sort_order,
    })
    resourcesByPath.set(key, values)
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    icon: row.icon,
    learningPathLevel: row.learning_path_level,
    difficulty: row.difficulty,
    estimatedHours: row.estimated_hours,
    enrolledCount: row.enrolled_count,
    mastery: row.mastery,
    color: row.color,
    certificateImageData: row.certificate_image_data || null,
    moduleCount: Number(row.module_count || 0),
    roomCount: Number(row.room_count || 0),
    studyingStudents: Number(row.studying_students || 0),
    certificateHolders: Number(row.certificate_holders || 0),
    createdAt: toIsoDate(row.created_at),
    updatedAt: toIsoDate(row.updated_at),
    modules: modulesByPath.get(String(row.id)) || [],
    resources: resourcesByPath.get(String(row.id)) || [],
  }))
}

async function fetchCertificates() {
  const [rows] = await pool.query(
    `SELECT
      c.certificate_id,
      c.full_name,
      c.first_name,
      c.last_name,
      c.path_title,
      c.issued_at,
      c.updated_at,
      u.id AS user_id,
      u.username,
      p.id AS path_id,
      p.slug AS path_slug,
      p.title AS path_source_title
     FROM certificates c
     INNER JOIN users u ON u.id = c.user_id
     INNER JOIN career_paths p ON p.id = c.career_path_id
     ORDER BY c.issued_at DESC`,
  )

  return rows.map((row) => ({
    certificateId: row.certificate_id,
    fullName: row.full_name,
    firstName: row.first_name,
    lastName: row.last_name,
    pathTitle: row.path_title || row.path_source_title,
    issuedAt: toIsoDate(row.issued_at),
    updatedAt: toIsoDate(row.updated_at),
    apiPath: `/api/public/certificates/${encodeURIComponent(row.certificate_id)}`,
    user: {
      id: row.user_id,
      username: row.username,
    },
    studyPath: {
      id: row.path_id,
      slug: row.path_slug,
      title: row.path_source_title,
    },
  }))
}

async function fetchStudentById(identifier) {
  const numericId = Number(identifier)
  const [rows] = await pool.query(
    `SELECT
      id,
      username,
      registration_number,
      first_name,
      last_name,
      email,
      role,
      created_at,
      updated_at
     FROM users
     WHERE role = 'operator' AND (id = ? OR username = ?)
     LIMIT 1`,
    [Number.isFinite(numericId) ? numericId : -1, String(identifier || '')],
  )

  if (!rows.length) {
    return null
  }

  const student = rows[0]
  const studentId = student.id

  const [progressRows] = await pool.query(
    `SELECT
      rp.room_id,
      rp.started_at,
      rp.completed_at,
      r.title AS room_title,
      r.level AS room_level,
      r.category AS room_category,
      r.slug AS room_slug
     FROM user_room_progress rp
     INNER JOIN rooms r ON r.id = rp.room_id
     WHERE rp.user_id = ?
     ORDER BY COALESCE(rp.completed_at, rp.started_at, rp.created_at) DESC`,
    [studentId],
  )

  const [certificateRows] = await pool.query(
    `SELECT
      c.certificate_id,
      c.path_title,
      c.issued_at,
      p.id AS path_id,
      p.slug AS path_slug
     FROM certificates c
     INNER JOIN career_paths p ON p.id = c.career_path_id
     WHERE c.user_id = ?
     ORDER BY c.issued_at DESC`,
    [studentId],
  )

  const [roomStats] = await pool.query(
    `SELECT
      COUNT(DISTINCT rp.room_id) AS rooms_started,
      COUNT(DISTINCT CASE WHEN rp.completed_at IS NOT NULL THEN rp.room_id END) AS rooms_completed,
      MAX(CASE
        WHEN r.level IN ('Expert', 'Hard') THEN 4
        WHEN r.level IN ('Advanced', 'Intermediate', 'Medium') THEN 2
        WHEN r.level IN ('Beginner', 'Easy') THEN 1
        ELSE 0
      END) AS level_rank
     FROM user_room_progress rp
     INNER JOIN rooms r ON r.id = rp.room_id
     WHERE rp.user_id = ?`,
    [studentId],
  )

  const stats = roomStats[0] || {}
  const roomLevelRank = Number(stats.level_rank || 0)

  return {
    id: student.id,
    username: student.username,
    registrationNumber: student.registration_number,
    firstName: student.first_name,
    lastName: student.last_name,
    fullName: buildStudentDisplayName(student),
    email: student.email,
    role: student.role,
    createdAt: toIsoDate(student.created_at),
    updatedAt: toIsoDate(student.updated_at),
    studySummary: {
      roomsStarted: Number(stats.rooms_started || 0),
      roomsCompleted: Number(stats.rooms_completed || 0),
      inferredLevel: rankToLabel(roomLevelRank),
    },
    progress: progressRows.map((row) => ({
      roomId: row.room_id,
      roomTitle: row.room_title,
      roomLevel: row.room_level,
      roomCategory: row.room_category,
      roomSlug: row.room_slug,
      startedAt: toIsoDate(row.started_at),
      completedAt: toIsoDate(row.completed_at),
    })),
    certificates: certificateRows.map((row) => ({
      certificateId: row.certificate_id,
      pathId: row.path_id,
      pathSlug: row.path_slug,
      pathTitle: row.path_title,
      issuedAt: toIsoDate(row.issued_at),
    })),
  }
}

async function fetchStudentLevelDistribution() {
  const students = await fetchAllStudentsWithStats()
  const grouped = new Map()

  for (const student of students.items) {
    const level = String(student.inferredLevel || 'Unclassified')
    grouped.set(level, (grouped.get(level) || 0) + 1)
  }

  return LEVEL_ORDER.map((level) => ({
    level,
    count: grouped.get(level) || 0,
  })).concat(
    grouped.has('Expert') ? [{ level: 'Expert', count: grouped.get('Expert') || 0 }] : [],
    grouped.has('Unclassified') ? [{ level: 'Unclassified', count: grouped.get('Unclassified') || 0 }] : [],
  )
}

async function fetchAllStudentsWithStats({ search = '', limit = 1000, offset = 0 } = {}) {
  const likeTerm = buildLikeTerm(search)
  const whereClauses = ['u.role = \'operator\'']
  const values = []

  if (likeTerm) {
    whereClauses.push('(u.username LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)')
    values.push(likeTerm, likeTerm, likeTerm, likeTerm)
  }

  const [rows] = await pool.query(
    `SELECT
      u.id,
      u.username,
      u.registration_number,
      u.first_name,
      u.last_name,
      u.email,
      u.created_at,
      u.updated_at,
      COUNT(DISTINCT rp.room_id) AS rooms_started,
      COUNT(DISTINCT CASE WHEN rp.completed_at IS NOT NULL THEN rp.room_id END) AS rooms_completed,
      COUNT(DISTINCT c.id) AS certificate_count,
      MAX(CASE
        WHEN r.level IN ('Expert', 'Hard') THEN 4
        WHEN r.level IN ('Advanced', 'Intermediate', 'Medium') THEN 2
        WHEN r.level IN ('Beginner', 'Easy') THEN 1
        ELSE 0
      END) AS level_rank
     FROM users u
     LEFT JOIN user_room_progress rp ON rp.user_id = u.id
     LEFT JOIN rooms r ON r.id = rp.room_id
     LEFT JOIN certificates c ON c.user_id = u.id
     WHERE ${whereClauses.join(' AND ')}
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  )

  const totalQuery = await pool.query(
    `SELECT COUNT(*) AS total
     FROM users u
     WHERE ${whereClauses.join(' AND ')}`,
    values,
  )

  const total = Number(totalQuery[0]?.[0]?.total || 0)
  const items = rows.map((row) => ({
    id: row.id,
    username: row.username,
    registrationNumber: row.registration_number,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: buildStudentDisplayName(row),
    email: row.email,
    createdAt: toIsoDate(row.created_at),
    updatedAt: toIsoDate(row.updated_at),
    roomsStarted: Number(row.rooms_started || 0),
    roomsCompleted: Number(row.rooms_completed || 0),
    certificateCount: Number(row.certificate_count || 0),
    inferredLevel: rankToLabel(Number(row.level_rank || 0)),
  }))

  return { total, items }
}

async function fetchSummary() {
  const [userTotals] = await pool.query(
    `SELECT
      COUNT(*) AS total_users,
      COUNT(CASE WHEN role = 'operator' THEN 1 END) AS total_students,
      COUNT(CASE WHEN role = 'admin' THEN 1 END) AS total_admins
     FROM users`,
  )

  const [progressTotals] = await pool.query(
    `SELECT
      COUNT(DISTINCT user_id) AS active_students,
      COUNT(DISTINCT CASE WHEN completed_at IS NOT NULL THEN user_id END) AS completed_students,
      COUNT(DISTINCT room_id) AS rooms_in_progress,
      COUNT(*) AS progress_rows
     FROM user_room_progress`,
  )

  const [certificateTotals] = await pool.query(
    `SELECT
      COUNT(*) AS total_certificates,
      COUNT(DISTINCT user_id) AS certificate_holders
     FROM certificates`,
  )

  const [pathTotals] = await pool.query(
    `SELECT
      COUNT(*) AS total_paths
     FROM career_paths`,
  )

  const [roomTotals] = await pool.query(
    `SELECT
      COUNT(*) AS total_rooms,
      COUNT(DISTINCT category) AS category_count
     FROM rooms`,
  )

  const levelDistribution = await fetchStudentLevelDistribution()
  const roomCatalog = await fetchRoomCatalog()
  const studyPaths = await fetchStudyPaths()

  return {
    api: {
      name: 'Incognitrix Public Data API',
      version: '1.0.0',
      keyAuth: await getPublicApiKeyState(),
    },
    totals: {
      users: Number(userTotals[0]?.total_users || 0),
      students: Number(userTotals[0]?.total_students || 0),
      admins: Number(userTotals[0]?.total_admins || 0),
      activeStudents: Number(progressTotals[0]?.active_students || 0),
      completedStudents: Number(progressTotals[0]?.completed_students || 0),
      roomsInProgress: Number(progressTotals[0]?.rooms_in_progress || 0),
      progressRows: Number(progressTotals[0]?.progress_rows || 0),
      certificates: Number(certificateTotals[0]?.total_certificates || 0),
      certificateHolders: Number(certificateTotals[0]?.certificate_holders || 0),
      studyPaths: Number(pathTotals[0]?.total_paths || 0),
      rooms: Number(roomTotals[0]?.total_rooms || 0),
      categories: Number(roomTotals[0]?.category_count || 0),
    },
    students: {
      total: Number(userTotals[0]?.total_students || 0),
      active: Number(progressTotals[0]?.active_students || 0),
      completed: Number(progressTotals[0]?.completed_students || 0),
      levels: levelDistribution,
    },
    studyPaths: {
      total: Number(pathTotals[0]?.total_paths || 0),
      items: studyPaths,
    },
    rooms: {
      total: Number(roomTotals[0]?.total_rooms || 0),
      items: roomCatalog,
    },
  }
}

async function fetchRoomById(identifier) {
  const [roomRows] = await pool.query('SELECT * FROM rooms WHERE id = ? OR slug = ? LIMIT 1', [identifier, identifier])
  if (!roomRows.length) {
    return null
  }

  const room = roomRows[0]
  const [tagRows] = await pool.query('SELECT tag FROM room_tags WHERE room_id = ? ORDER BY id ASC', [room.id])
  const [keywordRows] = await pool.query(
    'SELECT keyword FROM room_required_keywords WHERE room_id = ? ORDER BY id ASC',
    [room.id],
  )
  const [progressRows] = await pool.query(
    `SELECT
      COUNT(DISTINCT user_id) AS studying_students,
      COUNT(DISTINCT CASE WHEN completed_at IS NOT NULL THEN user_id END) AS completed_students
     FROM user_room_progress
     WHERE room_id = ?`,
    [room.id],
  )

  return {
    id: room.id,
    slug: room.slug,
    category: room.category,
    level: room.level,
    title: room.title,
    description: room.description,
    xp: room.xp,
    difficulty: room.difficulty,
    estimateTime: room.estimate_time,
    environment: room.environment,
    categoryTag: room.category_tag,
    content: {
      markdown: room.content_markdown || '',
      html: room.content_html || '',
      missionOverview: room.mission_overview || '',
      remediationProtocols: room.remediation_protocols || '',
      vulnerabilityBriefing: {
        definition: room.vulnerability_definition || '',
        impact: room.vulnerability_impact || '',
      },
      technicalDeepDive: room.technical_deep_dive || '',
      youtubeVideoUrl: room.youtube_video_url || '',
      aiQuestionsEnabled: Boolean(room.practical_ai_questions_enabled),
      attachment: room.attachment_data
        ? {
            name: room.attachment_name || 'room-file',
            type: room.attachment_type || 'application/octet-stream',
            size: Number(room.attachment_size || 0),
            dataUrl: room.attachment_data,
          }
        : null,
      docker: {
        enabled: Boolean(room.docker_enabled),
        image: room.docker_image || '',
        containerPort: Number(room.docker_container_port || 0) || '',
        protocol: room.docker_protocol || 'http',
        timeoutMinutes: Number(room.docker_timeout_minutes || 120),
        instructions: room.docker_instructions || '',
      },
      questionsEnabled: Boolean(room.questions_enabled),
      questions: (() => {
        try {
          const parsed = JSON.parse(room.questions_json || '[]')
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      })(),
    },
    tags: tagRows.map((row) => row.tag),
    requiredKeywords: keywordRows.map((row) => row.keyword),
    studyingStudents: Number(progressRows[0]?.studying_students || 0),
    completedStudents: Number(progressRows[0]?.completed_students || 0),
  }
}

async function fetchStudyPathById(identifier) {
  const [pathRows] = await pool.query('SELECT * FROM career_paths WHERE id = ? OR slug = ? LIMIT 1', [identifier, identifier])
  if (!pathRows.length) {
    return null
  }

  const path = pathRows[0]
  const [moduleRows] = await pool.query(
    `SELECT
      id,
      phase,
      title,
      description,
      module_image_data,
      sort_order
     FROM career_path_modules
     WHERE career_path_id = ?
     ORDER BY sort_order ASC, title ASC`,
    [path.id],
  )
  const [resourceRows] = await pool.query(
    `SELECT
      id,
      title,
      url,
      type,
      sort_order
     FROM career_path_resources
     WHERE career_path_id = ?
     ORDER BY sort_order ASC, title ASC`,
    [path.id],
  )
  const [moduleRoomRows] = await pool.query(
    `SELECT
      m.id AS module_id,
      m.title AS module_title,
      mr.room_id,
      r.title AS room_title,
      r.level AS room_level,
      r.category AS room_category,
      mr.sort_order AS room_sort_order
     FROM career_path_modules m
     LEFT JOIN career_path_module_rooms mr ON mr.module_id = m.id
     LEFT JOIN rooms r ON r.id = mr.room_id
     WHERE m.career_path_id = ?
     ORDER BY m.sort_order ASC, mr.sort_order ASC`,
    [path.id],
  )
  const [studentCounts] = await pool.query(
    `SELECT
      COUNT(DISTINCT CASE WHEN rp.started_at IS NOT NULL OR rp.completed_at IS NOT NULL THEN rp.user_id END) AS studying_students,
      COUNT(DISTINCT c.user_id) AS certificate_holders
     FROM career_path_modules m
     LEFT JOIN career_path_module_rooms mr ON mr.module_id = m.id
     LEFT JOIN user_room_progress rp ON rp.room_id = mr.room_id
     LEFT JOIN certificates c ON c.career_path_id = m.career_path_id
     WHERE m.career_path_id = ?`,
    [path.id],
  )

  const roomsByModule = new Map()
  for (const row of moduleRoomRows) {
    const moduleId = String(row.module_id)
    const values = roomsByModule.get(moduleId) || []
    if (row.room_id) {
      values.push({
        roomId: row.room_id,
        title: row.room_title,
        level: row.room_level,
        category: row.room_category,
        sortOrder: row.room_sort_order,
      })
    }
    roomsByModule.set(moduleId, values)
  }

  return {
    id: path.id,
    slug: path.slug,
    title: path.title,
    description: path.description,
    icon: path.icon,
    learningPathLevel: path.learning_path_level,
    difficulty: path.difficulty,
    estimatedHours: path.estimated_hours,
    enrolledCount: path.enrolled_count,
    mastery: path.mastery,
    color: path.color,
    certificateImageData: path.certificate_image_data || null,
    createdAt: toIsoDate(path.created_at),
    updatedAt: toIsoDate(path.updated_at),
    stats: {
      moduleCount: moduleRows.length,
      resourceCount: resourceRows.length,
      roomCount: moduleRoomRows.filter((row) => Boolean(row.room_id)).length,
      studyingStudents: Number(studentCounts[0]?.studying_students || 0),
      certificateHolders: Number(studentCounts[0]?.certificate_holders || 0),
    },
    modules: moduleRows.map((row) => ({
      id: row.id,
      phase: row.phase,
      verificationUrl: `/verify-certificate/${encodeURIComponent(row.certificate_id)}`,
      description: row.description,
      imageData: row.module_image_data || null,
      rooms: roomsByModule.get(String(row.id)) || [],
      sortOrder: row.sort_order,
    })),
    resources: resourceRows.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      type: row.type,
      sortOrder: row.sort_order,
    })),
  }
}

async function fetchStudentsByInferredLevel(levelLabel) {
  const normalizedLevel = String(levelLabel || '').trim()
  if (!normalizedLevel) {
    return []
  }

  const students = await fetchAllStudentsWithStats({ limit: 5000, offset: 0 })
  return students.items.filter((student) => student.inferredLevel.toLowerCase() === normalizedLevel.toLowerCase())
}

router.get('/health', (_req, res) => {
  return res.json({
    status: 'ok',
    service: 'incognitrix-public-api',
    version: '1.0.0',
  })
})

router.get('/meta', requirePublicApiKey, async (_req, res, next) => {
  try {
    return res.json({
      service: 'Incognitrix Public Data API',
      version: '1.0.0',
      auth: {
        header: 'x-api-key',
        alsoAccepted: ['Authorization: Bearer <key>', 'Authorization: ApiKey <key>'],
      },
      keyState: await getPublicApiKeyState(),
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/summary', requirePublicApiKey, async (_req, res, next) => {
  try {
    return res.json(await fetchSummary())
  } catch (error) {
    return next(error)
  }
})

router.get('/students', requirePublicApiKey, async (req, res, next) => {
  try {
    const limit = normalizeInt(req.query.limit, 100, 1, 500)
    const offset = normalizeInt(req.query.offset, 0, 0)
    const search = String(req.query.search || '').trim()
    const result = await fetchAllStudentsWithStats({ search, limit, offset })

    return res.json({
      total: result.total,
      limit,
      offset,
      items: result.items,
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/students/levels', requirePublicApiKey, async (_req, res, next) => {
  try {
    return res.json({
      items: await fetchStudentLevelDistribution(),
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/students/levels/:level', requirePublicApiKey, async (req, res, next) => {
  try {
    const items = await fetchStudentsByInferredLevel(req.params.level)
    return res.json({
      level: req.params.level,
      total: items.length,
      items,
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/students/:identifier', requirePublicApiKey, async (req, res, next) => {
  try {
    const student = await fetchStudentById(req.params.identifier)
    if (!student) {
      return res.status(404).json({ message: 'Student not found' })
    }

    return res.json(student)
  } catch (error) {
    return next(error)
  }
})

router.get('/students/:identifier/progress', requirePublicApiKey, async (req, res, next) => {
  try {
    const student = await fetchStudentById(req.params.identifier)
    if (!student) {
      return res.status(404).json({ message: 'Student not found' })
    }

    return res.json({
      student: {
        id: student.id,
        username: student.username,
        fullName: student.fullName,
      },
      summary: student.studySummary,
      progress: student.progress,
      certificates: student.certificates,
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/students/:identifier/certificates', requirePublicApiKey, async (req, res, next) => {
  try {
    const student = await fetchStudentById(req.params.identifier)
    if (!student) {
      return res.status(404).json({ message: 'Student not found' })
    }

    return res.json({
      student: {
        id: student.id,
        username: student.username,
        fullName: student.fullName,
      },
      items: student.certificates,
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/study-paths', requirePublicApiKey, async (req, res, next) => {
  try {
    const items = await fetchStudyPaths()
    return res.json({
      total: items.length,
      items,
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/study-paths/:identifier', requirePublicApiKey, async (req, res, next) => {
  try {
    const studyPath = await fetchStudyPathById(req.params.identifier)
    if (!studyPath) {
      return res.status(404).json({ message: 'Study path not found' })
    }

    return res.json(studyPath)
  } catch (error) {
    return next(error)
  }
})

router.get('/rooms', requirePublicApiKey, async (_req, res, next) => {
  try {
    const items = await fetchRoomCatalog({ includeProgress: true })
    return res.json({
      total: items.length,
      items,
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/rooms/:identifier', requirePublicApiKey, async (req, res, next) => {
  try {
    const room = await fetchRoomById(req.params.identifier)
    if (!room) {
      return res.status(404).json({ message: 'Room not found' })
    }

    return res.json(room)
  } catch (error) {
    return next(error)
  }
})

router.get('/certificates', requirePublicApiKey, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        c.certificate_id,
        c.full_name,
        c.first_name,
        c.last_name,
        c.path_title,
        c.issued_at,
        c.updated_at,
        u.id AS user_id,
        u.username,
        p.id AS path_id,
        p.slug AS path_slug,
        p.title AS path_source_title
       FROM certificates c
       INNER JOIN users u ON u.id = c.user_id
       INNER JOIN career_paths p ON p.id = c.career_path_id
       ORDER BY c.issued_at DESC`,
    )

    return res.json({
      total: rows.length,
      items: rows.map((row) => ({
        certificateId: row.certificate_id,
        fullName: row.full_name,
        firstName: row.first_name,
        lastName: row.last_name,
        pathTitle: row.path_title || row.path_source_title,
        issuedAt: toIsoDate(row.issued_at),
        updatedAt: toIsoDate(row.updated_at),
        student: {
          id: row.user_id,
          username: row.username,
        },
        studyPath: {
          id: row.path_id,
          slug: row.path_slug,
          title: row.path_source_title,
        },
        verificationUrl: `/verify-certificate/${encodeURIComponent(row.certificate_id)}`,
      })),
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/certificates/:certificateId', requirePublicApiKey, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        c.certificate_id,
        c.full_name,
        c.first_name,
        c.last_name,
        c.path_title,
        c.issued_at,
        c.updated_at,
        u.id AS user_id,
        u.username,
        p.id AS path_id,
        p.slug AS path_slug,
        p.title AS path_source_title
       FROM certificates c
       INNER JOIN users u ON u.id = c.user_id
       INNER JOIN career_paths p ON p.id = c.career_path_id
       WHERE c.certificate_id = ?
       LIMIT 1`,
      [req.params.certificateId],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Certificate not found' })
    }

    const row = rows[0]
    return res.json({
      certificateId: row.certificate_id,
      fullName: row.full_name,
      firstName: row.first_name,
      lastName: row.last_name,
      pathTitle: row.path_title || row.path_source_title,
      issuedAt: toIsoDate(row.issued_at),
      updatedAt: toIsoDate(row.updated_at),
      apiPath: `/api/public/certificates/${encodeURIComponent(row.certificate_id)}`,
      student: {
        id: row.user_id,
        username: row.username,
      },
      studyPath: {
        id: row.path_id,
        slug: row.path_slug,
        title: row.path_source_title,
      },
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/statistics/categories', requirePublicApiKey, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        COALESCE(category, 'Uncategorized') AS category,
        COUNT(*) AS room_count,
        COUNT(DISTINCT CASE WHEN urp.started_at IS NOT NULL OR urp.completed_at IS NOT NULL THEN urp.user_id END) AS studying_students,
        COUNT(DISTINCT CASE WHEN urp.completed_at IS NOT NULL THEN urp.user_id END) AS completed_students
       FROM rooms r
       LEFT JOIN user_room_progress urp ON urp.room_id = r.id
       GROUP BY COALESCE(category, 'Uncategorized')
       ORDER BY room_count DESC, category ASC`,
    )

    return res.json({
      total: rows.length,
      items: rows.map((row) => ({
        category: row.category,
        roomCount: Number(row.room_count || 0),
        studyingStudents: Number(row.studying_students || 0),
        completedStudents: Number(row.completed_students || 0),
      })),
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/statistics/completion', requirePublicApiKey, async (_req, res, next) => {
  try {
    const [roomRows] = await pool.query(
      `SELECT
        COUNT(*) AS total_rooms,
        COUNT(DISTINCT CASE WHEN urp.started_at IS NOT NULL THEN urp.user_id END) AS students_started,
        COUNT(DISTINCT CASE WHEN urp.completed_at IS NOT NULL THEN urp.user_id END) AS students_completed
       FROM rooms r
       LEFT JOIN user_room_progress urp ON urp.room_id = r.id`,
    )

    const [certRows] = await pool.query(
      `SELECT
        COUNT(*) AS total_certificates,
        COUNT(DISTINCT user_id) AS certificate_holders
       FROM certificates`,
    )

    return res.json({
      rooms: {
        total: Number(roomRows[0]?.total_rooms || 0),
        studentsStarted: Number(roomRows[0]?.students_started || 0),
        studentsCompleted: Number(roomRows[0]?.students_completed || 0),
      },
      certificates: {
        total: Number(certRows[0]?.total_certificates || 0),
        holders: Number(certRows[0]?.certificate_holders || 0),
      },
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/stats', requirePublicApiKey, async (_req, res, next) => {
  try {
    return res.json(await fetchSummary())
  } catch (error) {
    return next(error)
  }
})

export default router
