import crypto from 'crypto'
import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireDeveloper } from '../middleware/auth.js'

const router = Router()

function toIso(value) {
  return value ? new Date(value).toISOString() : null
}

function maskKey(prefix) {
  return `${prefix || 'icx_dev'}...`
}

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key || '')).digest('hex')
}

function extractApiKey(req) {
  const headerKey = req.get('x-api-key') || req.get('X-API-Key') || ''
  if (headerKey) return headerKey.trim()

  const authorization = String(req.get('authorization') || '').trim()
  const [scheme, ...rest] = authorization.split(/\s+/)
  const token = rest.join(' ').trim()
  return /^(bearer|apikey|token)$/i.test(scheme) ? token : ''
}

function endpointDoc({ method, path, resource, group, description, returns, example, notes = [] }) {
  return {
    method,
    path,
    resource,
    group,
    description,
    authentication: 'Developer API key required. Use x-api-key or Authorization: Bearer.',
    parameters: [
      {
        name: 'resource',
        in: 'path',
        required: true,
        description: `Must be "${resource}".`,
      },
    ],
    returns,
    example,
    notes,
  }
}

async function authenticateDeveloperApiKey(req, res, next) {
  const apiKey = extractApiKey(req)
  if (!apiKey) {
    return res.status(401).json({ message: 'Developer API key required.' })
  }

  const key = await verifyDeveloperApiKey(apiKey)
  if (!key) {
    return res.status(401).json({ message: 'Invalid developer API key.' })
  }

  req.user = { id: key.user_id, username: key.username, role: key.role }
  req.developerApiKeyId = key.id
  void pool.query('UPDATE developer_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', [key.id]).catch(() => {})
  return next()
}

async function verifyDeveloperApiKey(apiKey) {
  const [rows] = await pool.query(
    `SELECT k.id, k.user_id, u.username, u.role
     FROM developer_api_keys k
     INNER JOIN users u ON u.id = k.user_id
     WHERE k.key_hash = ? AND k.revoked_at IS NULL AND u.role IN ('admin', 'developer')
     LIMIT 1`,
    [hashKey(apiKey)],
  )

  return rows[0] || null
}

const developerEndpointCatalog = [
  endpointDoc({
    method: 'GET',
    path: '/api/developer/data/all',
    resource: 'all',
    group: 'Overview',
    description: 'Complete operational snapshot with overview, live users, Docker, users, skills, progress, paths, and events.',
    returns: 'Object containing all primary platform datasets. Each section includes either data or an error diagnostic.',
    example: { overview: { users: { total: 42 }, rooms: { total: 18 } }, activeUsers: { total: 3, items: [] } },
    notes: ['Designed for monitoring dashboards and external collectors.', 'One failing subresource is reported without breaking the full export.'],
  }),
  endpointDoc({
    method: 'GET',
    path: '/api/developer/data/users',
    resource: 'users',
    group: 'Users',
    description: 'Registered users with role, active status, last login, and last seen timestamps.',
    returns: 'total plus user account records.',
    example: { total: 1, items: [{ id: 3, username: 'operator01', role: 'operator', last_seen_at: '2026-06-11T10:00:00.000Z' }] },
  }),
  endpointDoc({
    method: 'GET',
    path: '/api/developer/data/active-users',
    resource: 'active-users',
    group: 'Monitoring',
    description: 'Users currently active on the platform, current skill being solved, and active Docker association.',
    returns: 'Operator accounts seen in the last 30 seconds with current skill and Docker runtime metadata.',
    example: { total: 1, items: [{ username: 'operator01', active: true, currentRoom: { title: 'Linux Basics' }, docker: null }] },
  }),
  endpointDoc({
    method: 'GET',
    path: '/api/developer/data/rooms',
    resource: 'rooms',
    group: 'Skills',
    description: 'Skill catalog with type, category, difficulty, XP, and Docker enablement.',
    returns: 'Skill records sorted by last update.',
    example: { total: 1, items: [{ id: 'linux-basics', title: 'Linux Basics', room_type: 'practical', docker_enabled: 1 }] },
  }),
  endpointDoc({
    method: 'GET',
    path: '/api/developer/data/progress',
    resource: 'progress',
    group: 'Learning',
    description: 'User skill progress, started/completed timestamps, and skill titles.',
    returns: 'Skill progress rows joined with user and skill labels.',
    example: { total: 1, items: [{ user_id: 3, username: 'operator01', room_id: 'linux-basics', completed_at: null }] },
  }),
  endpointDoc({
    method: 'GET',
    path: '/api/developer/data/docker',
    resource: 'docker',
    group: 'Infrastructure',
    description: 'Tracked Docker instances, owner, skill, status, host port, and timestamps.',
    returns: 'Docker instance telemetry for active and historical lab machines.',
    example: { total: 1, items: [{ username: 'operator01', roomTitle: 'Web Lab', status: 'running', hostPort: 52702 }] },
  }),
  endpointDoc({
    method: 'GET',
    path: '/api/developer/data/career-paths',
    resource: 'career-paths',
    group: 'Learning',
    description: 'Career path metadata and roadmap ordering.',
    returns: 'Career path records used by learning paths and roadmap screens.',
    example: { total: 1, items: [{ id: 'red-team', title: 'Red Team Operator', roadmap_sort_order: 10 }] },
  }),
  endpointDoc({
    method: 'GET',
    path: '/api/developer/data/categories',
    resource: 'categories',
    group: 'Skills',
    description: 'Skill categories and number of assigned skills.',
    returns: 'Category rows with skill usage counts.',
    example: { total: 1, items: [{ name: 'Web Exploitation', room_count: 4 }] },
  }),
  endpointDoc({
    method: 'GET',
    path: '/api/developer/data/notifications',
    resource: 'notifications',
    group: 'Platform',
    description: 'System notifications with active state and target user.',
    returns: 'Notification records used by the platform navbar and alerts.',
    example: { total: 1, items: [{ title: 'CTF reminder', type: 'ctf', is_active: 1 }] },
  }),
  endpointDoc({
    method: 'GET',
    path: '/api/developer/data/ctf-events',
    resource: 'ctf-events',
    group: 'Events',
    description: 'Upcoming and synced CTF events with CTFtime metadata and registration counts.',
    returns: 'CTF event rows, weightage, CTFtime metadata, and registration counts.',
    example: { total: 1, items: [{ name: 'Example CTF', weight: 25, source: 'ctftime', registered_users: 8 }] },
  }),
  endpointDoc({
    method: 'GET',
    path: '/api/developer/data/certificates',
    resource: 'certificates',
    group: 'Learning',
    description: 'Issued certificates with student and career path details.',
    returns: 'Certificate issue records joined with user and path context.',
    example: { total: 1, items: [{ certificate_id: 'ICX-001', username: 'operator01', path_title: 'Red Team Operator' }] },
  }),
  endpointDoc({
    method: 'GET',
    path: '/api/developer/data/attempts',
    resource: 'attempts',
    group: 'Evaluation',
    description: 'AI evaluation attempts, scores, pass state, and skill/user references.',
    returns: 'Theoretical attempt summaries with technical and grammar scores.',
    example: { total: 1, items: [{ username: 'operator01', room_title: 'RSA', technical_score: 90, passed: 0 }] },
  }),
  endpointDoc({
    method: 'GET',
    path: '/api/developer/data/scoreboard',
    resource: 'scoreboard',
    group: 'Analytics',
    description: 'Scoreboard-style user rankings from completed skills and XP.',
    returns: 'Learner ranking rows based on completed skills and skill XP.',
    example: { total: 1, items: [{ username: 'operator01', completed_rooms: 7, xp: 420 }] },
  }),
]

async function fetchDataSection(resource) {
  try {
    if (resource === 'overview') {
      return await fetchOverview()
    }
    return await fetchDataResource(resource)
  } catch (error) {
    return {
      error: true,
      message: error?.sqlMessage || error?.message || 'Unable to load resource.',
      resource,
    }
  }
}

async function fetchOverview() {
  const [[userTotals]] = await pool.query(
    `SELECT
       COUNT(*) AS users,
       COUNT(CASE WHEN role = 'operator' THEN 1 END) AS operators,
       COUNT(CASE WHEN role = 'admin' THEN 1 END) AS admins,
       COUNT(CASE WHEN role = 'developer' THEN 1 END) AS developers,
       COUNT(CASE WHEN role = 'operator' AND last_seen_at >= DATE_SUB(NOW(), INTERVAL 30 SECOND) THEN 1 END) AS active_users
     FROM users`,
  )
  const [[progressTotals]] = await pool.query(
    `SELECT
       COUNT(CASE WHEN completed_at IS NULL THEN 1 END) AS rooms_in_progress,
       COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) AS completed_rooms
     FROM user_room_progress`,
  )
  const [[dockerTotals]] = await pool.query(
    `SELECT
       COUNT(*) AS total_instances,
       COUNT(CASE WHEN status = 'running' THEN 1 END) AS running_instances
     FROM user_room_docker_instances`,
  )
  const [[roomTotals]] = await pool.query(
    `SELECT
       COUNT(*) AS rooms,
       COUNT(CASE WHEN room_type = 'practical' THEN 1 END) AS practical_rooms,
       COUNT(CASE WHEN room_type <> 'practical' OR room_type IS NULL THEN 1 END) AS theoretical_rooms
     FROM rooms`,
  )

  return {
    users: {
      total: Number(userTotals?.users || 0),
      operators: Number(userTotals?.operators || 0),
      admins: Number(userTotals?.admins || 0),
      developers: Number(userTotals?.developers || 0),
      active: Number(userTotals?.active_users || 0),
    },
    rooms: {
      total: Number(roomTotals?.rooms || 0),
      practical: Number(roomTotals?.practical_rooms || 0),
      theoretical: Number(roomTotals?.theoretical_rooms || 0),
      inProgress: Number(progressTotals?.rooms_in_progress || 0),
      completed: Number(progressTotals?.completed_rooms || 0),
    },
    docker: {
      totalInstances: Number(dockerTotals?.total_instances || 0),
      runningInstances: Number(dockerTotals?.running_instances || 0),
    },
  }
}

async function fetchActiveUsers() {
  const [rows] = await pool.query(
    `SELECT
       u.id,
       u.username,
       u.registration_number,
       u.email,
       u.role,
       u.last_login_at,
       u.last_seen_at,
       TIMESTAMPDIFF(SECOND, u.last_seen_at, NOW()) AS seconds_idle,
       r.id AS room_id,
       r.slug AS room_slug,
       r.title AS room_title,
       urp.started_at AS room_started_at,
       di.status AS docker_status,
       di.container_name,
       di.host_port,
       di.updated_at AS docker_updated_at
     FROM users u
     LEFT JOIN user_room_progress urp
       ON urp.user_id = u.id
      AND urp.completed_at IS NULL
      AND urp.started_at = (
        SELECT MAX(started_at)
        FROM user_room_progress latest
        WHERE latest.user_id = u.id AND latest.completed_at IS NULL
      )
     LEFT JOIN rooms r ON r.id = urp.room_id
     LEFT JOIN user_room_docker_instances di ON di.user_id = u.id AND di.status = 'running'
     WHERE u.role = 'operator'
       AND u.last_seen_at >= DATE_SUB(NOW(), INTERVAL 30 SECOND)
     ORDER BY u.last_seen_at DESC
     LIMIT 100`,
  )

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    registrationNumber: row.registration_number,
    email: row.email,
    role: row.role,
    active: Number(row.seconds_idle || 999999) <= 30,
    secondsIdle: Number(row.seconds_idle || 0),
    lastLoginAt: toIso(row.last_login_at),
    lastSeenAt: toIso(row.last_seen_at),
    currentRoom: row.room_id
      ? {
          id: row.room_id,
          slug: row.room_slug,
          title: row.room_title,
          startedAt: toIso(row.room_started_at),
        }
      : null,
    docker: row.container_name
      ? {
          status: row.docker_status,
          containerName: row.container_name,
          hostPort: row.host_port,
          updatedAt: toIso(row.docker_updated_at),
        }
      : null,
  }))
}

async function fetchDockerInstances() {
  const [rows] = await pool.query(
    `SELECT
       di.id,
       di.user_id,
       u.username,
       u.registration_number,
       di.room_id,
       r.title AS room_title,
       r.slug AS room_slug,
       di.container_name,
       di.host_port,
       di.status,
       di.created_at,
       di.updated_at
     FROM user_room_docker_instances di
     LEFT JOIN users u ON u.id = di.user_id
     LEFT JOIN rooms r ON r.id = di.room_id
     ORDER BY di.updated_at DESC
     LIMIT 200`,
  )

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    registrationNumber: row.registration_number,
    roomId: row.room_id,
    roomTitle: row.room_title,
    roomSlug: row.room_slug,
    containerName: row.container_name,
    hostPort: row.host_port,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }))
}

async function fetchDataResource(resource) {
  if (resource === 'users') {
    const [items] = await pool.query(
      `SELECT id, username, registration_number, email, role, is_active, last_login_at, last_seen_at, created_at, updated_at
       FROM users
       ORDER BY created_at DESC
       LIMIT 1000`,
    )
    return { total: items.length, items }
  }

  if (resource === 'rooms') {
    const [items] = await pool.query(
      `SELECT id, slug, title, category, room_type, difficulty, xp, docker_enabled, created_at, updated_at
       FROM rooms
       ORDER BY updated_at DESC`,
    )
    return { total: items.length, items }
  }

  if (resource === 'progress') {
    const [items] = await pool.query(
      `SELECT urp.*, u.username, r.title AS room_title
       FROM user_room_progress urp
       LEFT JOIN users u ON u.id = urp.user_id
       LEFT JOIN rooms r ON r.id = urp.room_id
       ORDER BY urp.updated_at DESC
       LIMIT 2000`,
    )
    return { total: items.length, items }
  }

  if (resource === 'docker') {
    const items = await fetchDockerInstances()
    return { total: items.length, items }
  }

  if (resource === 'active-users') {
    const items = await fetchActiveUsers()
    return { total: items.length, items }
  }

  if (resource === 'career-paths') {
    const [items] = await pool.query(
      `SELECT id, slug, title, description, roadmap_sort_order, created_at, updated_at
       FROM career_paths
       ORDER BY roadmap_sort_order ASC, title ASC`,
    )
    return { total: items.length, items }
  }

  if (resource === 'categories') {
    const [items] = await pool.query(
      `SELECT
         rc.id,
         rc.name,
         rc.created_at,
         COUNT(r.id) AS room_count
       FROM room_categories rc
       LEFT JOIN rooms r ON r.category = rc.name
       GROUP BY rc.id
       ORDER BY rc.name ASC`,
    )
    return { total: items.length, items }
  }

  if (resource === 'notifications') {
    const [items] = await pool.query(
      `SELECT id, title, message, type, is_active, target_user_id, created_at, updated_at
       FROM notifications
       ORDER BY created_at DESC
       LIMIT 500`,
    )
    return { total: items.length, items }
  }

  if (resource === 'ctf-events') {
    const [items] = await pool.query(
      `SELECT
         ce.*,
         COUNT(CASE WHEN cer.registered = true THEN 1 END) AS registered_users
       FROM ctf_events ce
       LEFT JOIN ctf_event_registrations cer ON cer.ctf_event_id = ce.id
       GROUP BY ce.id
       ORDER BY ce.registration_deadline ASC
       LIMIT 500`,
    )
    return { total: items.length, items }
  }

  if (resource === 'certificates') {
    const [items] = await pool.query(
      `SELECT
         c.certificate_id,
         c.full_name,
         c.path_title,
         c.issued_at,
         u.id AS user_id,
         u.username,
         u.registration_number,
         p.id AS career_path_id,
         p.slug AS career_path_slug
       FROM certificates c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN career_paths p ON p.id = c.career_path_id
       ORDER BY c.issued_at DESC
       LIMIT 1000`,
    )
    return { total: items.length, items }
  }

  if (resource === 'attempts') {
    const [items] = await pool.query(
      `SELECT
         uta.id,
         uta.user_id,
         u.username,
         u.registration_number,
         uta.room_id,
         r.title AS room_title,
         uta.technical_score,
         uta.grammar_score,
         uta.passed,
         uta.evaluated_at,
         uta.created_at,
         uta.updated_at
       FROM user_room_theoretical_attempts uta
       LEFT JOIN users u ON u.id = uta.user_id
       LEFT JOIN rooms r ON r.id = uta.room_id
       ORDER BY COALESCE(uta.evaluated_at, uta.updated_at) DESC
       LIMIT 1000`,
    )
    return { total: items.length, items }
  }

  if (resource === 'scoreboard') {
    const [items] = await pool.query(
      `SELECT
         u.id,
         u.username,
         u.registration_number,
         COUNT(DISTINCT CASE WHEN urp.completed_at IS NOT NULL THEN urp.room_id END) AS completed_rooms,
         SUM(CASE WHEN urp.completed_at IS NOT NULL THEN CAST(COALESCE(r.xp, '0') AS UNSIGNED) ELSE 0 END) AS xp
       FROM users u
       LEFT JOIN user_room_progress urp ON urp.user_id = u.id
       LEFT JOIN rooms r ON r.id = urp.room_id
       WHERE u.role = 'operator'
       GROUP BY u.id
       ORDER BY xp DESC, completed_rooms DESC, u.username ASC
       LIMIT 500`,
    )
    return { total: items.length, items }
  }

  if (resource === 'all') {
    return {
      overview: await fetchDataSection('overview'),
      activeUsers: await fetchDataSection('active-users'),
      docker: await fetchDataSection('docker'),
      users: await fetchDataSection('users'),
      rooms: await fetchDataSection('rooms'),
      progress: await fetchDataSection('progress'),
      careerPaths: await fetchDataSection('career-paths'),
      categories: await fetchDataSection('categories'),
      notifications: await fetchDataSection('notifications'),
      ctfEvents: await fetchDataSection('ctf-events'),
      certificates: await fetchDataSection('certificates'),
      attempts: await fetchDataSection('attempts'),
      scoreboard: await fetchDataSection('scoreboard'),
    }
  }

  return null
}

router.get('/data/:resource', authenticateDeveloperApiKey, async (req, res, next) => {
  try {
    const data = await fetchDataResource(req.params.resource)
    if (!data) {
      return res.status(404).json({ message: 'Unknown data resource' })
    }
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

router.use(authenticate)
router.use(requireDeveloper)

router.get('/catalog', async (req, res) => {
  const protocol = req.protocol
  const host = req.get('host')
  return res.json({
    name: 'Incognitrix Developer API',
    version: '1.1.0',
    baseUrl: `${protocol}://${host}/api/developer`,
    authentication: {
      requiredForDataEndpoints: true,
      headers: ['x-api-key: <developer_api_key>', 'Authorization: Bearer <developer_api_key>'],
      note: 'A developer login can create keys and view this panel, but exported /data endpoints require an API key.',
    },
    endpoints: developerEndpointCatalog,
  })
})

router.get('/overview', async (_req, res, next) => {
  try {
    return res.json(await fetchOverview())
  } catch (error) {
    return next(error)
  }
})

router.get('/active-users', async (_req, res, next) => {
  try {
    const items = await fetchActiveUsers()
    return res.json({ total: items.length, items })
  } catch (error) {
    return next(error)
  }
})

router.get('/docker', async (_req, res, next) => {
  try {
    const items = await fetchDockerInstances()
    return res.json({ total: items.length, running: items.filter((item) => item.status === 'running').length, items })
  } catch (error) {
    return next(error)
  }
})

router.get('/api-keys', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, key_prefix, scopes_json, last_used_at, revoked_at, created_at
       FROM developer_api_keys
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.id],
    )
    return res.json({
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        key: maskKey(row.key_prefix),
        scopes: row.scopes_json,
        lastUsedAt: toIso(row.last_used_at),
        revokedAt: toIso(row.revoked_at),
        createdAt: toIso(row.created_at),
      })),
    })
  } catch (error) {
    return next(error)
  }
})

router.post('/api-keys', async (req, res, next) => {
  try {
    const name = String(req.body?.name || 'Developer Key').trim().slice(0, 120) || 'Developer Key'
    const rawKey = `icx_dev_${crypto.randomBytes(28).toString('hex')}`
    const keyPrefix = rawKey.slice(0, 18)
    const [result] = await pool.query(
      `INSERT INTO developer_api_keys (user_id, name, key_hash, key_prefix, scopes_json)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, name, hashKey(rawKey), keyPrefix, JSON.stringify(['read:all'])],
    )

    return res.status(201).json({
      id: result.insertId,
      name,
      key: rawKey,
      keyPreview: maskKey(keyPrefix),
      scopes: ['read:all'],
    })
  } catch (error) {
    return next(error)
  }
})

router.delete('/api-keys/:id', async (req, res, next) => {
  try {
    const keyId = Number(req.params.id)
    if (!Number.isInteger(keyId) || keyId <= 0) {
      return res.status(400).json({ message: 'Invalid API key id' })
    }
    const [result] = await pool.query(
      'UPDATE developer_api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
      [keyId, req.user.id],
    )
    return res.json({ revoked: Number(result.affectedRows || 0), id: keyId })
  } catch (error) {
    return next(error)
  }
})

router.get('/docs', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT markdown, updated_at FROM developer_documents WHERE user_id = ? LIMIT 1', [
      req.user.id,
    ])
    return res.json({
      markdown:
        rows[0]?.markdown ||
        '# Incognitrix Developer Notes\n\nDocument your integrations, endpoint behavior, and API usage here.',
      updatedAt: toIso(rows[0]?.updated_at),
    })
  } catch (error) {
    return next(error)
  }
})

router.put('/docs', async (req, res, next) => {
  try {
    const markdown = String(req.body?.markdown || '').slice(0, 200000)
    await pool.query(
      `INSERT INTO developer_documents (user_id, markdown)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE markdown = VALUES(markdown), updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, markdown],
    )
    return res.json({ saved: true })
  } catch (error) {
    return next(error)
  }
})

router.post('/console', async (req, res, next) => {
  try {
    const resource = String(req.body?.resource || '').trim()
    const data = await fetchDataResource(resource)
    if (!data) {
      return res.status(400).json({ message: 'Choose one of: all, users, rooms, progress, docker, career-paths.' })
    }
    return res.json({ resource, response: data })
  } catch (error) {
    return next(error)
  }
})

router.post('/test-request', async (req, res, next) => {
  try {
    const apiKey = String(req.body?.apiKey || '').trim()
    const path = String(req.body?.path || '').trim()
    const method = String(req.body?.method || 'GET').toUpperCase()

    if (method !== 'GET') {
      return res.status(400).json({ message: 'Developer data tester currently supports GET endpoints.' })
    }

    const key = await verifyDeveloperApiKey(apiKey)
    if (!key) {
      return res.status(401).json({ message: 'Valid developer API key required to test this endpoint.' })
    }

    const match = path.match(/^\/?api\/developer\/data\/([^/?#]+)/)
    if (!match) {
      return res.status(400).json({ message: 'Only /api/developer/data/:resource endpoints are available in the tester.' })
    }

    const resource = decodeURIComponent(match[1])
    const data = await fetchDataResource(resource)
    if (!data) {
      return res.status(404).json({ message: 'Unknown data resource' })
    }

    await pool.query('UPDATE developer_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', [key.id])
    return res.json({
      request: {
        method,
        path,
        authenticatedAs: key.username,
      },
      status: 200,
      response: data,
    })
  } catch (error) {
    return next(error)
  }
})

export default router
