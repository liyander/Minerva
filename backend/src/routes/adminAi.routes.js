import { Router } from 'express'
import OpenAI from 'openai'
import { pool } from '../db/pool.js'
import { env } from '../config/env.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { getAiRuntimeConfig } from '../services/aiSettings.js'
import { aiSystemMessage, aiTaskMessage } from '../services/aiPrompts.js'

const router = Router()
const pendingActionByUser = new Map()

router.use(authenticate, requireAdmin)

function buildId(input, prefix) {
  const base = String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  return base || `${prefix}-${Date.now()}`
}

function parseAiJson(raw) {
  const text = String(raw || '').trim()
  if (!text) {
    return null
  }

  const candidates = []

  candidates.push(text)

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim())
  }

  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1).trim())
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // try next candidate
    }
  }

  return null
}

function normalizeAction(action) {
  if (!action || typeof action !== 'object') {
    return { type: 'none', payload: {} }
  }

  const supported = new Set(['none', 'create_room', 'create_career_path', 'create_module'])
  const type = String(action.type || 'none')

  return {
    type: supported.has(type) ? type : 'none',
    payload: action.payload && typeof action.payload === 'object' ? action.payload : {},
  }
}

function buildFallbackPlan(raw, userMessage, insights) {
  const message = String(raw || '').trim()
  const prompt = String(userMessage || '').trim()
  const metrics = insights?.metrics || {}

  if (/^(hi|hello|hey|yo|sup)\b/i.test(prompt)) {
    return {
      assistantReply:
        'Hi. I am Admin AI. I can monitor platform insights and create skills, career paths, or modules when requested.',
      action: { type: 'none', payload: {} },
    }
  }

  if (/\b(what\s+is\s+this|what\s+can\s+you\s+do|help|who\s+are\s+you)\b/i.test(prompt)) {
    return {
      assistantReply:
        `This is the Admin AI Control Center. Current totals: ${Number(metrics.rooms || 0)} skills, ${Number(metrics.careerPaths || 0)} career paths, ${Number(metrics.modules || 0)} modules, ${Number(metrics.users || 0)} users. Ask me to monitor insights or create platform content.`,
      action: { type: 'none', payload: {} },
    }
  }

  return {
    assistantReply:
      message ||
      'I can help monitor platform insights and manage content. Ask for user lists, platform totals, or creation of skills, career paths, and modules.',
    action: { type: 'none', payload: {} },
  }
}

function extractMessageText(modelMessage) {
  const content = modelMessage?.content
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }

        if (part && typeof part === 'object') {
          if (typeof part.text === 'string') {
            return part.text
          }

          if (part.type === 'output_text' && typeof part.output_text === 'string') {
            return part.output_text
          }
        }

        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

async function fetchUsersPreview(limit = 25) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Number(limit), 100)) : 25
  const [rows] = await pool.query(
    `SELECT id, username, email, role, is_active
     FROM users
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`,
  )

  return rows
}

function normalizeCategory(value) {
  return String(value || 'General').trim() || 'General'
}

function roleForCategory(category) {
  const normalized = normalizeCategory(category).toLowerCase()
  if (/\bsoc\b|blue|defen[sc]e|incident|monitor|siem|log/.test(normalized)) return 'SOC Analyst'
  if (/forensic|memory|disk|windows|evidence/.test(normalized)) return 'Digital Forensics Analyst'
  if (/web|app|api|injection|xss|csrf/.test(normalized)) return 'Web Application Security Tester'
  if (/crypto|rsa|cipher|hash/.test(normalized)) return 'Cryptography Analyst'
  if (/reverse|reversing|malware|binary/.test(normalized)) return 'Reverse Engineering Analyst'
  if (/cloud|iam|kubernetes|container/.test(normalized)) return 'Cloud Security Analyst'
  return `${normalizeCategory(category)} Security Analyst`
}

function isRoleSuitabilityQuestion(text) {
  return /\b(suitable|fit|best|recommend|who\s+would|which\s+player|which\s+user|insights?|analysis|analy[sz]e)\b[\s\S]*\b(role|soc|analyst|security|forensic|web|penetration|pentest|pen\s*test|cloud|reverse|crypto)\b/i.test(text) ||
    /\b(each|every|all)\s+(person|player|user|operator)\b[\s\S]*\b(role|soc|analyst|web|penetration|pentest|pen\s*test|security)\b/i.test(text)
}

function isPlayerStatsQuestion(text) {
  return /\b(players?|users?|operators?)\b[\s\S]*\b(stats?|statistics|performance|scores?|progress|soc)\b/i.test(text) ||
    /\b(stats?|statistics|performance|scores?)\b[\s\S]*\b(players?|users?|operators?|soc)\b/i.test(text) ||
    /\binsights?\b[\s\S]*\b(each|every|all)\s+(person|player|user|operator)\b/i.test(text)
}

function extractRoleFilter(text) {
  const lowered = String(text || '').toLowerCase()
  if (/\bsoc\b|blue|defen[sc]e|incident|monitor|siem/.test(lowered)) return 'soc'
  if (/forensic/.test(lowered)) return 'forensics'
  if (/web|application|penetration|pentest|pen\s*test/.test(lowered)) return 'web'
  if (/crypto/.test(lowered)) return 'crypto'
  if (/reverse|malware/.test(lowered)) return 'reverse'
  if (/cloud/.test(lowered)) return 'cloud'
  return ''
}

function hasExplicitContentCreationIntent(text) {
  return /\b(add|create|generate|make|build)\b[\s\S]*\b(room|skill|module|career\s*path|path|lab)\b/i.test(text)
}

function categoryMatchesRoleFilter(category, roleFilter) {
  const normalized = normalizeCategory(category).toLowerCase()
  if (!roleFilter) return true
  if (roleFilter === 'soc') return /\bsoc\b|blue|defen[sc]e|incident|monitor|siem|log|cve|forensic/.test(normalized)
  if (roleFilter === 'forensics') return /forensic|memory|disk|windows|evidence/.test(normalized)
  if (roleFilter === 'web') return /web|app|api|injection|xss|csrf/.test(normalized)
  if (roleFilter === 'crypto') return /crypto|rsa|cipher|hash/.test(normalized)
  if (roleFilter === 'reverse') return /reverse|reversing|malware|binary/.test(normalized)
  if (roleFilter === 'cloud') return /cloud|iam|kubernetes|container/.test(normalized)
  return true
}

async function fetchPlayerPerformanceProfiles() {
  const [rows] = await pool.query(
    `SELECT
       u.id,
       u.username,
       u.registration_number,
       u.email,
       u.role,
       r.id AS room_id,
       r.title AS room_title,
       r.category,
       r.room_type,
       urp.completed_at,
       uta.technical_score,
       uta.grammar_score
     FROM users u
     LEFT JOIN user_room_progress urp
       ON urp.user_id = u.id AND urp.completed_at IS NOT NULL
     LEFT JOIN rooms r ON r.id = urp.room_id
     LEFT JOIN user_room_theoretical_attempts uta
       ON uta.user_id = u.id AND uta.room_id = urp.room_id
     WHERE u.role = 'operator'
     ORDER BY u.username ASC, urp.completed_at DESC`,
  )

  const players = new Map()

  for (const row of rows) {
    if (!players.has(row.id)) {
      players.set(row.id, {
        id: row.id,
        username: row.username || `user-${row.id}`,
        registrationNumber: row.registration_number || '',
        email: row.email || '',
        completedRooms: 0,
        technicalScores: [],
        grammarScores: [],
        categories: new Map(),
      })
    }

    const player = players.get(row.id)
    if (!row.room_id) {
      continue
    }

    player.completedRooms += 1
    const category = normalizeCategory(row.category)
    const currentCategory = player.categories.get(category) || {
      category,
      completedRooms: 0,
      technicalScores: [],
      grammarScores: [],
      rooms: [],
    }

    currentCategory.completedRooms += 1
    currentCategory.rooms.push(row.room_title)

    if (Number(row.technical_score || 0) > 0) {
      player.technicalScores.push(Number(row.technical_score))
      currentCategory.technicalScores.push(Number(row.technical_score))
    }
    if (Number(row.grammar_score || 0) > 0) {
      player.grammarScores.push(Number(row.grammar_score))
      currentCategory.grammarScores.push(Number(row.grammar_score))
    }

    player.categories.set(category, currentCategory)
  }

  return [...players.values()].map((player) => {
    const categories = [...player.categories.values()].map((category) => ({
      ...category,
      averageTechnical: category.technicalScores.length
        ? Math.round(category.technicalScores.reduce((sum, score) => sum + score, 0) / category.technicalScores.length)
        : 0,
      averageGrammar: category.grammarScores.length
        ? Math.round(category.grammarScores.reduce((sum, score) => sum + score, 0) / category.grammarScores.length)
        : 0,
      rooms: category.rooms.slice(0, 5),
    }))

    const topCategory = categories
      .slice()
      .sort(
        (a, b) =>
          b.completedRooms - a.completedRooms ||
          b.averageTechnical - a.averageTechnical ||
          a.category.localeCompare(b.category),
      )[0]

    return {
      ...player,
      averageTechnical: player.technicalScores.length
        ? Math.round(player.technicalScores.reduce((sum, score) => sum + score, 0) / player.technicalScores.length)
        : 0,
      averageGrammar: player.grammarScores.length
        ? Math.round(player.grammarScores.reduce((sum, score) => sum + score, 0) / player.grammarScores.length)
        : 0,
      topCategory: topCategory?.category || 'No completed skills',
      recommendedRole: topCategory ? roleForCategory(topCategory.category) : 'Needs more data',
      categories,
    }
  })
}

function extractPlayerLookupToken(text) {
  const value = String(text || '').trim()
  if (!value) return ''

  const email = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
  if (email) return email

  const labeled = value.match(
    /\b(?:reg(?:istration)?(?:\s*number)?|id|email|username|user|player|operator|name)\s*(?:is|=|:)?\s*([a-z0-9._@-]{3,})\b/i,
  )?.[1]
  if (labeled) return labeled

  const quoted = value.match(/["'`]([^"'`]{3,})["'`]/)?.[1]
  if (quoted) return quoted.trim()

  return ''
}

function isSinglePlayerInsightQuestion(text) {
  return /\b(insights?|analysis|profile|progress|stats?|performance|suitable|strengths?|improve|completed|rooms?)\b[\s\S]*\b(player|user|operator|candidate|reg(?:istration)?|email|username|name)\b/i.test(text) ||
    /\b(player|user|operator|candidate|reg(?:istration)?|email|username|name)\b[\s\S]*\b(insights?|analysis|profile|progress|stats?|performance|suitable|strengths?|improve|completed|rooms?)\b/i.test(text)
}

async function fetchPlayerProfileByLookup(text) {
  const token = extractPlayerLookupToken(text)
  if (!token) return null
  const likeToken = `%${token}%`
  const [rows] = await pool.query(
    `SELECT id, username, registration_number, email, role, is_active
     FROM users
     WHERE username = ?
        OR email = ?
        OR registration_number = ?
        OR username LIKE ?
        OR email LIKE ?
        OR registration_number LIKE ?
     ORDER BY
       CASE
         WHEN username = ? OR email = ? OR registration_number = ? THEN 0
         ELSE 1
       END,
       username ASC
     LIMIT 1`,
    [token, token, token, likeToken, likeToken, likeToken, token, token, token],
  )

  if (!rows.length) return null
  return rows[0]
}

async function buildSinglePlayerInsightAnswer(text) {
  const user = await fetchPlayerProfileByLookup(text)
  if (!user) {
    return 'I could not find a matching player. Use the exact username, email, or registration number.'
  }

  const profiles = await fetchPlayerPerformanceProfiles()
  const profile = profiles.find((item) => Number(item.id) === Number(user.id))
  const [roomRows] = await pool.query(
    `SELECT
       r.title,
       r.category,
       r.room_type,
       urp.started_at,
       urp.completed_at,
       uta.technical_score,
       uta.grammar_score,
       uta.feedback
     FROM user_room_progress urp
     JOIN rooms r ON r.id = urp.room_id
     LEFT JOIN user_room_theoretical_attempts uta
       ON uta.user_id = urp.user_id AND uta.room_id = urp.room_id
     WHERE urp.user_id = ?
     ORDER BY COALESCE(urp.completed_at, urp.started_at) DESC
     LIMIT 12`,
    [user.id],
  )

  const completed = roomRows.filter((row) => row.completed_at)
  const inProgress = roomRows.filter((row) => !row.completed_at)
  const topCategories = profile?.categories?.length
    ? profile.categories
        .slice()
        .sort((a, b) => b.completedRooms - a.completedRooms || b.averageTechnical - a.averageTechnical)
        .slice(0, 3)
    : []
  const strengths = topCategories.length
    ? topCategories.map((category) => `${category.category} (${category.completedRooms} completion(s), tech avg ${category.averageTechnical})`)
    : ['Not enough completed skill data yet.']
  const improvementSignals = roomRows
    .filter((row) => Number(row.technical_score || 0) > 0 && Number(row.technical_score || 0) < 85)
    .slice(0, 3)
    .map((row) => `${row.title}: raise technical accuracy from ${Number(row.technical_score || 0)}`)

  return [
    `Player insight: ${user.username}`,
    `- Registration: ${user.registration_number || 'Not set'}`,
    `- Email: ${user.email || 'Not set'}`,
    `- Status: ${user.is_active ? 'active' : 'inactive'}; role: ${user.role || 'operator'}`,
    `- Completed skills: ${completed.length}`,
    `- In-progress skills: ${inProgress.length}`,
    `- Average technical score: ${profile?.averageTechnical || 0}`,
    `- Average grammar score: ${profile?.averageGrammar || 0}`,
    `- Suitable role signal: ${profile?.recommendedRole || 'Needs more completed skills'}`,
    '',
    'Strengths:',
    ...strengths.map((item) => `- ${item}`),
    '',
    'Improve next:',
    ...(improvementSignals.length
      ? improvementSignals.map((item) => `- ${item}`)
      : ['- Complete more skills and answer theoretical questions with specific, skill-based details.']),
    '',
    'Recent skills:',
    ...(roomRows.length
      ? roomRows.slice(0, 6).map((row) =>
          `- ${row.title} (${row.category || 'Uncategorized'}): ${row.completed_at ? 'completed' : row.started_at ? 'in progress' : 'not started'}${Number(row.technical_score || 0) ? `, tech ${Number(row.technical_score)}` : ''}`,
        )
      : ['- No skill activity found.']),
  ].join('\n')
}

function isUserCountQuestion(text) {
  return /\b(how\s+many|number\s+of|count\s+of|total)\b[\s\S]*\b(users?|operators?)\b/i.test(text)
}

function detectCountTarget(text) {
  if (/\b(users?|operators?)\b/i.test(text)) return 'users'
  if (/\brooms?|labs?\b/i.test(text)) return 'rooms'
  if (/\b(career\s*paths?|paths?)\b/i.test(text)) return 'careerPaths'
  if (/\bmodules?\b/i.test(text)) return 'modules'
  if (/\b(cves?|vulnerabilit(?:y|ies))\b/i.test(text)) return 'cves'
  return null
}

function isEntityCountQuestion(text) {
  return /\b(how\s+many|number\s+of|count\s+of|total)\b/i.test(text) && Boolean(detectCountTarget(text))
}

function isPlatformInsightsQuestion(text) {
  return /(platf\w*|dashboard|system)\b[\s\S]*\b(insights?|overview|summary|status|risks?)\b/i.test(text)
}

function buildTopRisks(insights) {
  const metrics = insights?.metrics || {}
  const risks = []

  if (Number(metrics.cves || 0) === 0) {
    risks.push('No CVE records are currently stored, which limits vulnerability intelligence coverage.')
  }

  if (Number(metrics.rooms || 0) < 5) {
    risks.push('Skill inventory is small, which can reduce learning variety and learner retention.')
  }

  if (Number(metrics.modules || 0) < Number(metrics.careerPaths || 0)) {
    risks.push('Some career paths may have shallow module depth relative to available tracks.')
  }

  if (!risks.length) {
    risks.push('No critical data-driven risk spikes detected from current aggregate metrics.')
  }

  return risks.slice(0, 3)
}

function isUserListQuestion(text) {
  return /\b(who\s+are\s+those|who\s+are\s+they|who\s+are\s+the\s+users?|who\s+are\s+users?|list\s+users?|show\s+users?|which\s+users?|user\s+list)\b/i.test(
    text,
  )
}

async function buildPlayerStatsAnswer(text) {
  const roleFilter = extractRoleFilter(text)
  const players = await fetchPlayerPerformanceProfiles()
  const lines = []

  for (const player of players) {
    const filteredCategories = player.categories.filter((category) =>
      categoryMatchesRoleFilter(category.category, roleFilter),
    )
    const scopedCompleted = filteredCategories.reduce((sum, category) => sum + category.completedRooms, 0)
    const scopedTechnicalScores = filteredCategories.flatMap((category) => category.technicalScores)
    const scopedGrammarScores = filteredCategories.flatMap((category) => category.grammarScores)
    const avgTechnical = scopedTechnicalScores.length
      ? Math.round(scopedTechnicalScores.reduce((sum, score) => sum + score, 0) / scopedTechnicalScores.length)
      : 0
    const avgGrammar = scopedGrammarScores.length
      ? Math.round(scopedGrammarScores.reduce((sum, score) => sum + score, 0) / scopedGrammarScores.length)
      : 0

    if (roleFilter && scopedCompleted === 0) {
      continue
    }

    lines.push(
      `- ${player.username}: ${roleFilter ? scopedCompleted : player.completedRooms} completed skill(s), ` +
        `technical avg ${roleFilter ? avgTechnical : player.averageTechnical}, ` +
        `grammar avg ${roleFilter ? avgGrammar : player.averageGrammar}, ` +
        `recommended role: ${player.recommendedRole}`,
    )
  }

  return lines.length
    ? `${roleFilter ? roleFilter.toUpperCase() : 'Player'} stats:\n${lines.join('\n')}`
    : `No player stats found${roleFilter ? ` for ${roleFilter.toUpperCase()}` : ''}.`
}

async function buildRoleSuitabilityAnswer(text) {
  const roleFilter = extractRoleFilter(text)
  const players = await fetchPlayerPerformanceProfiles()
  const ranked = players
    .map((player) => {
      const matchingCategories = player.categories.filter((category) =>
        categoryMatchesRoleFilter(category.category, roleFilter),
      )
      const completed = roleFilter
        ? matchingCategories.reduce((sum, category) => sum + category.completedRooms, 0)
        : player.completedRooms
      const technicalScores = roleFilter
        ? matchingCategories.flatMap((category) => category.technicalScores)
        : player.technicalScores
      const averageTechnical = technicalScores.length
        ? Math.round(technicalScores.reduce((sum, score) => sum + score, 0) / technicalScores.length)
        : player.averageTechnical

      return {
        ...player,
        scopedCompleted: completed,
        scopedTechnical: averageTechnical,
      }
    })
    .filter((player) => player.scopedCompleted > 0)
    .sort(
      (a, b) =>
        b.scopedCompleted - a.scopedCompleted ||
        b.scopedTechnical - a.scopedTechnical ||
        a.username.localeCompare(b.username),
    )
    .slice(0, 8)

  if (!ranked.length) {
    return `No suitable player data found${roleFilter ? ` for ${roleFilter.toUpperCase()}` : ''}.`
  }

  return [
    `Best role fit${roleFilter ? ` for ${roleFilter.toUpperCase()}` : ''}:`,
    ...ranked.map((player, index) =>
      `${index + 1}. ${player.username} - ${roleFilter ? roleForCategory(roleFilter) : player.recommendedRole}; ` +
      `${player.scopedCompleted} relevant completion(s), technical avg ${player.scopedTechnical}. ` +
      `Strength signal: ${player.topCategory}.`,
    ),
  ].join('\n')
}

async function tryHandleDirectAdminQuery(message, insights) {
  const text = String(message || '').trim()
  if (!text) {
    return null
  }

  if (isPlatformInsightsQuestion(text)) {
    const metrics = insights?.metrics || {}
    const risks = buildTopRisks(insights)

    return {
      role: 'assistant',
      content: [
        'Platform insights:',
        `- Skills: ${Number(metrics.rooms || 0)}`,
        `- Career paths: ${Number(metrics.careerPaths || 0)}`,
        `- Modules: ${Number(metrics.modules || 0)}`,
        `- CVEs: ${Number(metrics.cves || 0)}`,
        `- Users: ${Number(metrics.users || 0)}`,
        '',
        'Top risks right now:',
        ...risks.map((risk, index) => `${index + 1}. ${risk}`),
      ].join('\n'),
      action: { type: 'none', status: 'ignored', message: 'No action requested.' },
    }
  }

  if (isSinglePlayerInsightQuestion(text)) {
    return {
      role: 'assistant',
      content: await buildSinglePlayerInsightAnswer(text),
      action: { type: 'none', status: 'ignored', message: 'No action requested.' },
    }
  }

  if (isRoleSuitabilityQuestion(text)) {
    return {
      role: 'assistant',
      content: await buildRoleSuitabilityAnswer(text),
      action: { type: 'none', status: 'ignored', message: 'No action requested.' },
    }
  }

  if (isPlayerStatsQuestion(text)) {
    return {
      role: 'assistant',
      content: await buildPlayerStatsAnswer(text),
      action: { type: 'none', status: 'ignored', message: 'No action requested.' },
    }
  }

  if (isEntityCountQuestion(text)) {
    const target = detectCountTarget(text)
    const total = Number(insights?.metrics?.[target] || 0)
    const labelMap = {
      users: 'users',
      rooms: 'rooms',
      careerPaths: 'career paths',
      modules: 'modules',
      cves: 'CVEs',
    }

    return {
      role: 'assistant',
      content: `There are currently ${total} ${labelMap[target]} on the platform.`,
      action: { type: 'none', status: 'ignored', message: 'No action requested.' },
    }
  }

  if (isUserCountQuestion(text)) {
    const totalUsers = Number(insights?.metrics?.users || 0)
    return {
      role: 'assistant',
      content: `There are currently ${totalUsers} users on the platform.`,
      action: { type: 'none', status: 'ignored', message: 'No action requested.' },
    }
  }

  if (isUserListQuestion(text)) {
    const users = await fetchUsersPreview(50)
    if (!users.length) {
      return {
        role: 'assistant',
        content: 'No users were found on the platform.',
        action: { type: 'none', status: 'ignored', message: 'No action requested.' },
      }
    }

    const lines = users.map((user, index) => {
      const name = user.username || `user-${user.id}`
      const email = user.email ? ` | ${user.email}` : ''
      const role = user.role ? ` | role: ${user.role}` : ''
      const status = user.is_active ? 'active' : 'inactive'
      return `${index + 1}. ${name}${email}${role} | status: ${status}`
    })

    return {
      role: 'assistant',
      content: `Current users:\n${lines.join('\n')}`,
      action: { type: 'none', status: 'ignored', message: 'No action requested.' },
    }
  }

  return null
}

async function fetchInsights() {
  const [[roomCount]] = await pool.query('SELECT COUNT(*) AS total FROM rooms')
  const [[pathCount]] = await pool.query('SELECT COUNT(*) AS total FROM career_paths')
  const [[moduleCount]] = await pool.query('SELECT COUNT(*) AS total FROM career_path_modules')
  const [[cveCount]] = await pool.query('SELECT COUNT(*) AS total FROM cves')
  const [[userCount]] = await pool.query('SELECT COUNT(*) AS total FROM users')

  const [latestRooms] = await pool.query(
    'SELECT id, title, category, difficulty, created_at FROM rooms ORDER BY created_at DESC LIMIT 5',
  )
  const [latestPaths] = await pool.query(
    'SELECT id, title, difficulty, created_at FROM career_paths ORDER BY created_at DESC LIMIT 5',
  )
  const [latestCves] = await pool.query(
    'SELECT cve_id, short_description, found_year, created_at FROM cves ORDER BY created_at DESC LIMIT 5',
  )

  return {
    metrics: {
      rooms: Number(roomCount?.total || 0),
      careerPaths: Number(pathCount?.total || 0),
      modules: Number(moduleCount?.total || 0),
      cves: Number(cveCount?.total || 0),
      users: Number(userCount?.total || 0),
    },
    latest: {
      rooms: latestRooms,
      careerPaths: latestPaths,
      cves: latestCves,
    },
  }
}

async function createRoom(payload) {
  const nestedContent = payload?.content && typeof payload.content === 'object' ? payload.content : {}
  const topicSeed = String(payload?.description || payload?.title || 'Cybersecurity Monitoring').trim()
  const generatedTopicContent = buildTopicRoomContent(topicSeed, payload?.title)

  const id = buildId(payload?.slug || payload?.title, 'room')
  const roomPayload = {
    id,
    slug: id,
    category: payload?.category || 'General',
    level: payload?.level || 'Easy',
    title: payload?.title,
    description: payload?.description || generatedTopicContent.missionOverview,
    xp: payload?.xp || '500 XP',
    difficulty: payload?.difficulty || payload?.level || 'Easy',
    estimateTime: payload?.estimateTime || '45 minutes',
    environment: payload?.environment || 'Web Browser',
    categoryTag: payload?.categoryTag || payload?.category || 'General',
    tags: Array.isArray(payload?.tags) ? payload.tags : [],
    requiredKeywords: Array.isArray(payload?.requiredKeywords) ? payload.requiredKeywords : [],
    content: {
      markdown:
        nestedContent?.markdown ||
        payload?.markdown ||
        generatedTopicContent.markdown,
      html: nestedContent?.html || payload?.html || '',
      missionOverview:
        nestedContent?.missionOverview ||
        payload?.missionOverview ||
        payload?.description ||
        generatedTopicContent.missionOverview,
      remediationProtocols:
        nestedContent?.remediationProtocols ||
        payload?.remediationProtocols ||
        generatedTopicContent.remediationProtocols,
      vulnerabilityBriefing: {
        definition:
          nestedContent?.vulnerabilityBriefing?.definition ||
          payload?.vulnerabilityDefinition ||
          generatedTopicContent.vulnerabilityDefinition,
        impact:
          nestedContent?.vulnerabilityBriefing?.impact ||
          payload?.vulnerabilityImpact ||
          generatedTopicContent.vulnerabilityImpact,
      },
      technicalDeepDive:
        nestedContent?.technicalDeepDive || payload?.technicalDeepDive || generatedTopicContent.technicalDeepDive,
      youtubeVideoUrl: nestedContent?.youtubeVideoUrl || payload?.youtubeVideoUrl || '',
      questionsEnabled: Boolean(nestedContent?.questionsEnabled || payload?.questionsEnabled),
      questions: Array.isArray(nestedContent?.questions)
        ? nestedContent.questions
        : Array.isArray(payload?.questions)
          ? payload.questions
          : [],
    },
  }

  if (!roomPayload.title) {
    throw new Error('Skill creation requires a title.')
  }

  await pool.query(
    `INSERT INTO rooms (
      id, slug, category, level, level_tone, dot_tone, title, description, xp,
      difficulty, estimate_time, environment, category_tag, content_markdown,
      content_html, mission_overview, remediation_protocols,
      vulnerability_definition, vulnerability_impact, technical_deep_dive,
      youtube_video_url, questions_enabled, questions_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      roomPayload.id,
      roomPayload.slug,
      roomPayload.category,
      roomPayload.level,
      payload?.levelTone || null,
      payload?.dotTone || null,
      roomPayload.title,
      roomPayload.description,
      roomPayload.xp,
      roomPayload.difficulty,
      roomPayload.estimateTime,
      roomPayload.environment,
      roomPayload.categoryTag,
      roomPayload.content.markdown,
      roomPayload.content.html,
      roomPayload.content.missionOverview,
      roomPayload.content.remediationProtocols,
      roomPayload.content.vulnerabilityBriefing.definition,
      roomPayload.content.vulnerabilityBriefing.impact,
      roomPayload.content.technicalDeepDive,
      roomPayload.content.youtubeVideoUrl || null,
      roomPayload.content.questionsEnabled,
      JSON.stringify(roomPayload.content.questions),
    ],
  )

  for (const tag of roomPayload.tags) {
    await pool.query('INSERT INTO room_tags (room_id, tag) VALUES (?, ?)', [roomPayload.id, tag])
  }

  for (const keyword of roomPayload.requiredKeywords) {
    await pool.query('INSERT INTO room_required_keywords (room_id, keyword) VALUES (?, ?)', [
      roomPayload.id,
      keyword,
    ])
  }

  return { id: roomPayload.id, title: roomPayload.title }
}

async function createCareerPath(payload) {
  const id = buildId(payload?.slug || payload?.title, 'path')
  if (!payload?.title) {
    throw new Error('Career path creation requires a title.')
  }

  await pool.query(
    `INSERT INTO career_paths (
      id, slug, title, description, icon, learning_path_level,
      difficulty, estimated_hours, enrolled_count, mastery, color
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      id,
      payload.title,
      payload.description || '',
      payload.icon || 'school',
      payload.learningPathLevel || 'Basic',
      payload.difficulty || payload.learningPathLevel || 'Basic',
      Number(payload.estimatedHours || 0),
      Number(payload.enrolledCount || 0),
      Number(payload.mastery || 0),
      payload.color || 'primary',
    ],
  )

  return { id, title: payload.title }
}

async function createModule(payload) {
  const pathRef = String(payload?.careerPathId || payload?.pathId || '').trim()
  if (!pathRef) {
    throw new Error('Module creation requires careerPathId or pathId.')
  }

  const [pathRows] = await pool.query(
    'SELECT id, title FROM career_paths WHERE id = ? OR slug = ? LIMIT 1',
    [pathRef, pathRef],
  )

  if (!pathRows.length) {
    throw new Error(`Career path not found for id/slug: ${pathRef}`)
  }

  const path = pathRows[0]
  const baseModuleId = buildId(payload?.moduleId || payload?.title, 'mod')
  let moduleId = baseModuleId

  const [sameTitleRows] = await pool.query(
    'SELECT id, title FROM career_path_modules WHERE career_path_id = ? AND LOWER(title) = LOWER(?) LIMIT 1',
    [path.id, payload?.title || 'New Module'],
  )
  if (sameTitleRows.length) {
    return {
      id: sameTitleRows[0].id,
      title: sameTitleRows[0].title,
      careerPathId: path.id,
      careerPathTitle: path.title,
      reused: true,
    }
  }

  const [existingIdRows] = await pool.query('SELECT id FROM career_path_modules WHERE id = ? LIMIT 1', [
    moduleId,
  ])
  if (existingIdRows.length) {
    moduleId = `${baseModuleId}-${Date.now()}`
  }

  const [sortRows] = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM career_path_modules WHERE career_path_id = ?',
    [path.id],
  )

  const sortOrder = Number(sortRows?.[0]?.next_sort || 0)

  await pool.query(
    'INSERT INTO career_path_modules (id, career_path_id, phase, title, description, module_image_data, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      moduleId,
      path.id,
      payload?.phase || `Module ${sortOrder + 1}`,
      payload?.title || 'New Module',
      payload?.description || '',
      payload?.imageData || null,
      sortOrder,
    ],
  )

  const rooms = Array.isArray(payload?.rooms) ? payload.rooms : []
  for (let i = 0; i < rooms.length; i += 1) {
    await pool.query(
      'INSERT INTO career_path_module_rooms (module_id, room_id, sort_order) VALUES (?, ?, ?)',
      [moduleId, rooms[i], i],
    )
  }

  return { id: moduleId, title: payload?.title || 'New Module', careerPathId: path.id, careerPathTitle: path.title }
}

async function resolveCareerPathId(pathRef) {
  const normalized = String(pathRef || '').trim()
  if (!normalized) {
    return null
  }

  const [rows] = await pool.query(
    `SELECT id, slug, title
     FROM career_paths
     WHERE id = ? OR slug = ? OR LOWER(title) = LOWER(?)
     LIMIT 1`,
    [normalized, normalized, normalized],
  )

  return rows[0] || null
}

async function resolveOrCreateCareerPath(pathRef) {
  const normalized = String(pathRef || '').trim()
  if (!normalized) {
    return null
  }

  const existing = await resolveCareerPathId(normalized)
  if (existing) {
    return existing
  }

  const created = await createCareerPath({
    title: normalized,
    description: `Auto-created path for ${normalized}`,
    learningPathLevel: 'Intermediate',
  })

  return {
    id: created.id,
    slug: created.id,
    title: created.title,
    createdNow: true,
  }
}

async function resolveRoomId(roomRef) {
  const normalized = String(roomRef || '').trim()
  if (!normalized) {
    return null
  }

  const [rows] = await pool.query(
    `SELECT id, title
     FROM rooms
     WHERE id = ? OR slug = ? OR LOWER(title) = LOWER(?)
     LIMIT 1`,
    [normalized, normalized, normalized],
  )

  return rows[0] || null
}

async function findExistingRoomByTitleOrSlug(titleOrSlug) {
  const normalized = String(titleOrSlug || '').trim()
  if (!normalized) {
    return null
  }

  const slug = buildId(normalized, 'room')
  const [rows] = await pool.query(
    `SELECT id, title
     FROM rooms
     WHERE id = ? OR slug = ? OR LOWER(title) = LOWER(?)
     LIMIT 1`,
    [slug, slug, normalized],
  )

  return rows[0] || null
}

function buildTopicRoomContent(topic, roomTitle) {
  const cleanTopic = String(topic || roomTitle || 'Cybersecurity Monitoring').trim()
  const title = String(roomTitle || cleanTopic || 'Monitoring Skill').trim()

  if (/http\s+request\s+smuggling|request\s+smuggling|desync/i.test(`${title} ${cleanTopic}`)) {
    const markdown = [
      `# ${title}`,
      '',
      'This skill focuses on HTTP request smuggling risks in multi-tier web stacks where frontend and backend components parse requests differently.',
      '',
      '## Mission Overview',
      'Identify parser desynchronization conditions, validate impact safely in lab conditions, and implement robust protocol-alignment controls.',
      '',
      '## Key Objectives',
      '- Understand how CL.TE and TE.CL mismatches can desynchronize request boundaries',
      '- Recognize signs of request queue poisoning and user-impacting response mixups',
      '- Verify behavior across reverse proxy, WAF, load balancer, and origin server',
      '- Apply hardening to enforce one canonical parsing strategy end to end',
      '',
      '## Practical Examples',
      '- Example 1: Frontend prioritizes Content-Length while backend prioritizes Transfer-Encoding, creating a desync window.',
      '- Example 2: A malformed chunked body causes backend request reassembly drift and inconsistent routing outcomes.',
      '- Example 3: Conflicting headers are normalized differently by proxy and app server, leading to request queue poisoning risk.',
      '',
      '## Defensive Validation Checklist',
      '- Reject requests containing ambiguous framing headers',
      '- Normalize and re-serialize requests at the edge before forwarding',
      '- Keep proxy and origin parsing behavior consistent across upgrades',
      '- Add telemetry for duplicated framing headers and abnormal chunk patterns',
    ].join('\n')

    return {
      markdown,
      missionOverview:
        'Investigate HTTP parser desynchronization, document realistic impact paths, and ship controls that remove ambiguous request framing.',
      remediationProtocols:
        'Block ambiguous framing combinations, enforce strict RFC-compliant parsing at ingress, and maintain parser consistency between proxy and origin.',
      vulnerabilityDefinition:
        'HTTP request smuggling occurs when chained systems disagree about request boundaries, allowing attackers to smuggle hidden request data.',
      vulnerabilityImpact:
        'Potential impact includes request queue poisoning, cache contamination, authorization bypass side effects, and session exposure between users.',
      technicalDeepDive:
        'Compare CL.TE and TE.CL handling paths, inspect intermediary normalization logic, and validate backend queue behavior using safe test payloads.',
    }
  }

  const markdown = [
    `# ${title}`,
    '',
    `This skill focuses on ${cleanTopic}. You will learn how to identify suspicious activity, triage alerts, and improve detection quality.`,
    '',
    '## Mission Overview',
    `Investigate telemetry related to ${cleanTopic}, separate noise from true positives, and document actionable findings.`,
    '',
    '## Key Objectives',
    `- Understand the attack surface related to ${cleanTopic}`,
    '- Identify high-signal indicators in logs and events',
    '- Build an investigation timeline and isolate root cause',
    '- Recommend tuning and hardening improvements',
    '',
    '## Detection Workflow',
    '- Collect relevant events from endpoint, network, and identity sources',
    '- Correlate indicators across multiple data sources',
    '- Validate suspicious behavior against known baseline',
    '- Escalate confirmed incidents with evidence',
    '',
    '## Response and Hardening',
    '- Contain affected assets quickly',
    '- Patch and remediate vulnerable entry points',
    '- Tune alert thresholds to reduce false positives',
    '- Add continuous monitoring for recurrence',
    '',
    '## Practical Examples',
    `- Example 1: Investigate a suspicious ${cleanTopic} alert and build a timeline from first indicator to containment.`,
    `- Example 2: Correlate repeated ${cleanTopic} anomalies across endpoint and network logs to validate incident scope.`,
    `- Example 3: Improve a noisy ${cleanTopic} detection by refining thresholds and required context fields.`,
  ].join('\n')

  return {
    markdown,
    missionOverview: `Investigate and operationalize ${cleanTopic} monitoring with clear triage and remediation steps.`,
    remediationProtocols:
      'Use least privilege, improve telemetry quality, enforce secure baselines, and continuously tune detection logic.',
    vulnerabilityDefinition: `${cleanTopic} gaps can allow attackers to remain undetected for extended periods.`,
    vulnerabilityImpact:
      'Insufficient monitoring can lead to delayed incident response, data exposure, and lateral movement risk.',
    technicalDeepDive:
      `Deep-dive into ${cleanTopic} data sources, correlation rules, alert fidelity, and SOC triage runbooks.`,
  }
}

async function updateRoomTopicContent(roomId, roomTitle, topic) {
  const content = buildTopicRoomContent(topic, roomTitle)
  await pool.query(
    `UPDATE rooms
     SET content_markdown = ?,
         mission_overview = ?,
         remediation_protocols = ?,
         vulnerability_definition = ?,
         vulnerability_impact = ?,
         technical_deep_dive = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      content.markdown,
      content.missionOverview,
      content.remediationProtocols,
      content.vulnerabilityDefinition,
      content.vulnerabilityImpact,
      content.technicalDeepDive,
      roomId,
    ],
  )
}

function parseListValues(text) {
  return String(text || '')
    .split(/,|\band\b/gi)
    .map((value) => value.trim())
    .filter(Boolean)
}

function parseRoomRefsFromText(text) {
  const match = String(text || '').match(/(?:(?:rooms?|skills?)|with\s+(?:rooms?|skills?))\s*[:=]?\s*(.+)$/i)
  if (!match?.[1]) {
    return []
  }

  return parseListValues(match[1])
}

function parsePathRefFromText(text) {
  const match = String(text || '').match(/(?:path|career\s*path)\s*[:=]?\s*([a-z0-9 _-]+)/i)
  return match?.[1] ? match[1].trim() : ''
}

async function fillPendingModulePayload(payload, message) {
  const next = { ...payload }
  const text = String(message || '').trim()

  if (!next.careerPathId) {
    const pathRef = parsePathRefFromText(text) || text
    const path = await resolveOrCreateCareerPath(pathRef)
    if (path) {
      next.careerPathId = path.id
    }
  }

  const roomRefs = parseRoomRefsFromText(text)
  if ((!next.rooms || !next.rooms.length) && roomRefs.length) {
    const resolved = []
    for (const ref of roomRefs) {
      const room = await resolveRoomId(ref)
      if (room) {
        resolved.push(room.id)
      }
    }

    if (resolved.length) {
      next.rooms = resolved
    }
  }

  return next
}

function extractRoomTitleFromCreatePrompt(text) {
  const match = String(text || '').match(
    /(?:add|create)\s+(?:a\s+)?(?:room|skill)(?:\s+called|\s+named)?\s+(.+?)(?:\s+(?:and\s+add\s+content|with\s+content|which\b|that\b|for\s+the\s+path\b|in\s+the\s+path\b)|$)/i,
  )
  if (!match?.[1]) {
    return ''
  }

  return match[1].trim().replace(/[.?!]+$/, '')
}

function extractModuleTitleFromCreatePrompt(text) {
  const match = String(text || '').match(/(?:add|create)\s+(?:a\s+)?module(?:\s+called|\s+named)?\s+(.+)$/i)
  if (!match?.[1]) {
    return ''
  }

  return match[1].trim().replace(/[.?!]+$/, '')
}

function extractPathRefFromPrompt(text) {
  const match = String(text || '').match(
    /(?:in|for)\s+the\s+path\s+([a-z0-9 _-]+?)(?:\s+(?:add|create|with|which|where|that)\b|$)/i,
  )
  if (match?.[1]) {
    return match[1].trim()
  }

  return parsePathRefFromText(text)
}

function extractRoomTitleFromModulePrompt(text) {
  const match = String(text || '').match(/(?:add|create)\s+(?:a\s+)?(?:room|skill)(?:\s+called|\s+named)?\s+(.+?)(?:\s+(?:which|that)\b|$)/i)
  if (!match?.[1]) {
    return ''
  }

  return match[1].trim().replace(/[.?!]+$/, '')
}

function extractModuleTitleFromCompoundPrompt(text) {
  const match = String(text || '').match(/(?:add|create)\s+(?:a\s+)?module(?:\s+called|\s+named)?\s+(.+?)(?:\s+in\s+which\b|\s+with\s+(?:room|skill)\b|\s+which\s+includes\b|$)/i)
  if (!match?.[1]) {
    return ''
  }

  return match[1].trim().replace(/[.?!]+$/, '')
}

function extractRoomContentFromPrompt(text) {
  const input = String(text || '')
  const aboutMatch = input.match(/(?:content\s+about|about)\s+(.+)$/i)
  if (aboutMatch?.[1]) {
    return aboutMatch[1].trim().replace(/[.?!]+$/, '')
  }

  if (/(?:add\s+content|with\s+content|content\s+to\s+it)(?:\s+with\s+examples)?/i.test(input)) {
    return 'Topic-focused skill content with practical examples'
  }

  return ''
}

async function createOrGetRoomForModule({ title, description }) {
  const existing = await findExistingRoomByTitleOrSlug(title)
  if (existing) {
    await updateRoomTopicContent(existing.id, existing.title, description || title)
    return { id: existing.id, title: existing.title, reused: true }
  }

  const roomContent = buildTopicRoomContent(description || title, title)

  const created = await createRoom({
    title,
    description: description || title,
    content: {
      markdown: roomContent.markdown,
      html: '',
      missionOverview: roomContent.missionOverview,
      remediationProtocols: roomContent.remediationProtocols,
      vulnerabilityBriefing: {
        definition: roomContent.vulnerabilityDefinition,
        impact: roomContent.vulnerabilityImpact,
      },
      technicalDeepDive: roomContent.technicalDeepDive,
      youtubeVideoUrl: '',
      questionsEnabled: false,
      questions: [],
    },
  })

  await updateRoomTopicContent(created.id, created.title, description || title)

  return { ...created, reused: false }
}

async function tryHandleDirectActionIntent({ message, userId }) {
  const text = String(message || '').trim()
  const lower = text.toLowerCase()

  if (!text) {
    return null
  }

  const isCreateModuleIntent = /\b(add|create)\b[\s\S]*\bmodule\b/i.test(lower)
  const isCreateRoomIntent = /\b(add|create)\b[\s\S]*\b(room|skill)\b/i.test(lower)
  const looksLikeFreshCompositeCommand =
    (isCreateModuleIntent || isCreateRoomIntent) && /\b(in\s+the\s+path|path\b|module\s+called|(?:room|skill)\s+called)\b/i.test(lower)

  if (looksLikeFreshCompositeCommand && pendingActionByUser.has(userId)) {
    pendingActionByUser.delete(userId)
  }

  const pending = pendingActionByUser.get(userId)
  if (pending?.type === 'create_module') {
    const filled = await fillPendingModulePayload(pending.payload || {}, text)

    if (!filled.careerPathId) {
      pendingActionByUser.set(userId, { type: 'create_module', payload: filled })
      return {
        role: 'assistant',
        content: 'Which career path should this module belong to? Provide path id, slug, or exact title.',
        action: { type: 'create_module', status: 'needs_input', message: 'careerPathId is required' },
      }
    }

    if (!Array.isArray(filled.rooms) || !filled.rooms.length) {
      pendingActionByUser.set(userId, { type: 'create_module', payload: filled })
      return {
        role: 'assistant',
        content:
          'Which skill(s) should be linked to this module? Provide skill ids, slugs, or titles separated by commas.',
        action: { type: 'create_module', status: 'needs_input', message: 'At least one skill is required' },
      }
    }

    const created = await createModule(filled)
    pendingActionByUser.delete(userId)
    return {
      role: 'assistant',
      content: `Module '${created.title}' created successfully in ${created.careerPathTitle}.`,
      action: {
        type: 'create_module',
        status: 'completed',
        message: `Module created: ${created.title} (${created.id}) in ${created.careerPathTitle}`,
        created,
      },
    }
  }

  if (isCreateModuleIntent && isCreateRoomIntent) {
    const moduleTitle = extractModuleTitleFromCompoundPrompt(text) || extractModuleTitleFromCreatePrompt(text)
    const roomTitle = extractRoomTitleFromModulePrompt(text)
    const contentHint = extractRoomContentFromPrompt(text)
    const pathRef = extractPathRefFromPrompt(text)

    if (!moduleTitle) {
      return {
        role: 'assistant',
        content: 'What should the module title be?',
        action: { type: 'create_module', status: 'needs_input', message: 'module title is required' },
      }
    }

    const path = pathRef ? await resolveOrCreateCareerPath(pathRef) : null
    if (!path) {
      pendingActionByUser.set(userId, {
        type: 'create_module',
        payload: {
          title: moduleTitle,
          rooms: roomTitle ? [roomTitle] : [],
          roomContentHint: contentHint,
        },
      })

      return {
        role: 'assistant',
        content: 'Which career path should this module belong to? I can also create a new path if it does not exist.',
        action: { type: 'create_module', status: 'needs_input', message: 'careerPathId is required' },
      }
    }

    if (!roomTitle) {
      pendingActionByUser.set(userId, {
        type: 'create_module',
        payload: {
          title: moduleTitle,
          careerPathId: path.id,
          rooms: [],
          roomContentHint: contentHint,
        },
      })

      return {
        role: 'assistant',
        content: 'Which skill should be added to this module? Provide its title, id, or slug.',
        action: { type: 'create_module', status: 'needs_input', message: 'At least one skill is required' },
      }
    }

    const room = await createOrGetRoomForModule({
      title: roomTitle,
      description: contentHint || `Introductory content for ${roomTitle}.`,
    })

    const createdModule = await createModule({
      title: moduleTitle,
      description: contentHint || `Module coverage for ${moduleTitle}`,
      careerPathId: path.id,
      rooms: [room.id],
    })

    return {
      role: 'assistant',
      content: `Module '${createdModule.title}' ${createdModule.reused ? 'already existed and was reused' : 'created'} in ${createdModule.careerPathTitle}${path.createdNow ? ' (new path created)' : ''}. Skill '${room.title}' ${room.reused ? 'was linked' : 'was created and linked'} with content context.`,
      action: {
        type: 'create_module',
        status: 'completed',
        message: `Module created: ${createdModule.title} (${createdModule.id}) in ${createdModule.careerPathTitle}; skill linked: ${room.title} (${room.id})`,
        created: {
          module: createdModule,
          room,
        },
      },
    }
  }

  if (isCreateRoomIntent) {
    const title = extractRoomTitleFromCreatePrompt(text)
    if (!title) {
      return {
        role: 'assistant',
        content: 'What should the skill title be?',
        action: { type: 'create_room', status: 'needs_input', message: 'title is required' },
      }
    }

    const contentHintRaw = extractRoomContentFromPrompt(text)
    const topicHint =
      contentHintRaw && contentHintRaw !== 'Topic-focused skill content with practical examples'
        ? contentHintRaw
        : title

    const created = await createOrGetRoomForModule({
      title,
      description: topicHint,
    })

    return {
      role: 'assistant',
      content: `Skill '${created.title}' ${created.reused ? 'was updated with' : 'has been created with'} detailed topic content and examples.`,
      action: {
        type: 'create_room',
        status: 'completed',
        message: `Skill created: ${created.title} (${created.id})`,
        created,
      },
    }
  }

  if (isCreateModuleIntent) {
    const title = extractModuleTitleFromCreatePrompt(text)
    const payload = {
      title: title || 'New Module',
      careerPathId: '',
      rooms: [],
    }

    const pathRef = extractPathRefFromPrompt(text)
    if (pathRef) {
      const path = await resolveOrCreateCareerPath(pathRef)
      if (path) {
        payload.careerPathId = path.id
      }
    }

    const roomRefs = parseRoomRefsFromText(text)
    if (roomRefs.length) {
      const resolved = []
      for (const ref of roomRefs) {
        const room = await resolveRoomId(ref)
        if (room) {
          resolved.push(room.id)
        }
      }
      payload.rooms = resolved
    }

    pendingActionByUser.set(userId, { type: 'create_module', payload })

    if (!payload.careerPathId) {
      return {
        role: 'assistant',
        content: 'Which career path should this module belong to? Provide path id, slug, or exact title.',
        action: { type: 'create_module', status: 'needs_input', message: 'careerPathId is required' },
      }
    }

    if (!payload.rooms.length) {
      return {
        role: 'assistant',
        content:
          'Which skill(s) should be linked to this module? Provide skill ids, slugs, or titles separated by commas.',
        action: { type: 'create_module', status: 'needs_input', message: 'At least one skill is required' },
      }
    }

    const created = await createModule(payload)
    pendingActionByUser.delete(userId)
    return {
      role: 'assistant',
      content: `Module '${created.title}' created successfully in ${created.careerPathTitle}.`,
      action: {
        type: 'create_module',
        status: 'completed',
        message: `Module created: ${created.title} (${created.id}) in ${created.careerPathTitle}`,
        created,
      },
    }
  }

  return null
}

async function executeAction(action) {
  if (!action || typeof action !== 'object') {
    return { type: 'none', status: 'ignored', message: 'No action requested.' }
  }

  const type = String(action.type || 'none')
  const payload = action.payload && typeof action.payload === 'object' ? action.payload : {}

  if (type === 'none') {
    return { type: 'none', status: 'ignored', message: 'No action requested.' }
  }

  if (type === 'create_room') {
    const title = String(payload?.title || '').trim()
    if (!title) {
      throw new Error('Skill creation requires a title.')
    }

    const hasExplicitContent = Boolean(
      payload?.content ||
        payload?.markdown ||
        payload?.missionOverview ||
        payload?.remediationProtocols ||
        payload?.vulnerabilityDefinition ||
        payload?.vulnerabilityImpact ||
        payload?.technicalDeepDive,
    )

    const created = hasExplicitContent
      ? await createRoom(payload)
      : await createOrGetRoomForModule({
          title,
          description: String(payload?.description || title).trim(),
        })

    return { type, status: 'completed', message: `Skill created: ${created.title} (${created.id})`, created }
  }

  if (type === 'create_career_path') {
    const created = await createCareerPath(payload)
    return { type, status: 'completed', message: `Career path created: ${created.title} (${created.id})`, created }
  }

  if (type === 'create_module') {
    const created = await createModule(payload)
    return {
      type,
      status: 'completed',
      message: `Module created: ${created.title} (${created.id}) in ${created.careerPathTitle}`,
      created,
    }
  }

  return { type: 'none', status: 'ignored', message: `Unsupported action type: ${type}` }
}

function extractPlanFromText(rawText) {
  const parsed = parseAiJson(rawText)
  if (!parsed || typeof parsed !== 'object') {
    return {
      assistantReply: String(rawText || '').trim(),
      action: { type: 'none', payload: {} },
    }
  }

  return {
    assistantReply: String(parsed.assistantReply || '').trim(),
    action: normalizeAction(parsed.action),
  }
}

function normalizeHistoryEntries(entries) {
  if (!Array.isArray(entries)) {
    return []
  }

  return entries
    .map((entry) => ({
      role: entry?.role === 'assistant' ? 'assistant' : 'user',
      message: String(entry?.message || '').trim(),
    }))
    .filter((entry) => entry.message)
}

function toSafeLimit(value, fallback = 24, max = 100) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(1, Math.min(Math.trunc(parsed), max))
}

function parseSessionId(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return Math.trunc(parsed)
}

async function ensureSessionBelongsToUser(userId, sessionId) {
  const parsed = parseSessionId(sessionId)
  if (!parsed) {
    return null
  }

  const [rows] = await pool.query(
    `SELECT id, title, created_at, updated_at
     FROM admin_ai_chat_sessions
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [parsed, userId],
  )

  return rows[0] || null
}

async function createChatSession(userId, title = 'New Session') {
  const normalizedTitle = String(title || 'New Session').trim() || 'New Session'
  const [result] = await pool.query(
    `INSERT INTO admin_ai_chat_sessions (user_id, title)
     VALUES (?, ?)`,
    [userId, normalizedTitle.slice(0, 255)],
  )

  return {
    id: Number(result.insertId),
    title: normalizedTitle.slice(0, 255),
  }
}

async function migrateLegacyHistoryIfNeeded(userId) {
  const [[legacyCountRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM admin_ai_chat_history
     WHERE user_id = ? AND session_id IS NULL`,
    [userId],
  )

  const legacyCount = Number(legacyCountRow?.total || 0)
  if (!legacyCount) {
    return
  }

  const [legacySessionRows] = await pool.query(
    `SELECT id
     FROM admin_ai_chat_sessions
     WHERE user_id = ? AND title = 'Legacy Session'
     ORDER BY id ASC
     LIMIT 1`,
    [userId],
  )

  let legacySessionId = legacySessionRows[0]?.id
  if (!legacySessionId) {
    const created = await createChatSession(userId, 'Legacy Session')
    legacySessionId = created.id
  }

  await pool.query(
    `UPDATE admin_ai_chat_history
     SET session_id = ?
     WHERE user_id = ? AND session_id IS NULL`,
    [legacySessionId, userId],
  )
}

async function fetchLatestSession(userId) {
  await migrateLegacyHistoryIfNeeded(userId)

  const [rows] = await pool.query(
    `SELECT id, title, created_at, updated_at
     FROM admin_ai_chat_sessions
     WHERE user_id = ?
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [userId],
  )

  return rows[0] || null
}

async function listChatSessions(userId, limit = 30) {
  await migrateLegacyHistoryIfNeeded(userId)

  const safeLimit = toSafeLimit(limit, 30, 100)
  const [rows] = await pool.query(
    `SELECT
      s.id,
      s.title,
      s.created_at,
      s.updated_at,
      COUNT(h.id) AS message_count,
      SUBSTRING_INDEX(
        GROUP_CONCAT(CASE WHEN h.role = 'user' THEN h.message ELSE NULL END ORDER BY h.id ASC SEPARATOR '\\n'),
        '\\n',
        1
      ) AS first_user_message
     FROM admin_ai_chat_sessions s
     LEFT JOIN admin_ai_chat_history h ON h.session_id = s.id
     WHERE s.user_id = ?
     GROUP BY s.id, s.title, s.created_at, s.updated_at
     ORDER BY s.updated_at DESC, s.id DESC
     LIMIT ${safeLimit}`,
    [userId],
  )

  return rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title || '').trim() || 'New Session',
    messageCount: Number(row.message_count || 0),
    preview: String(row.first_user_message || '').trim(),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }))
}

async function deleteChatSession(userId, sessionId) {
  const session = await ensureSessionBelongsToUser(userId, sessionId)
  if (!session) {
    return { deleted: false, fallbackSessionId: null }
  }

  await pool.query(
    `DELETE FROM admin_ai_chat_history
     WHERE user_id = ? AND session_id = ?`,
    [userId, session.id],
  )

  await pool.query(
    `DELETE FROM admin_ai_chat_sessions
     WHERE user_id = ? AND id = ?`,
    [userId, session.id],
  )

  const fallback = await fetchLatestSession(userId)
  return {
    deleted: true,
    fallbackSessionId: fallback?.id || null,
    deletedSessionId: session.id,
  }
}

async function fetchPersistedHistory(userId, limit = 24, sessionId = null) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Number(limit), 60)) : 24
  try {
    const session = await ensureSessionBelongsToUser(userId, sessionId)
    if (!session) {
      return []
    }

    const [rows] = await pool.query(
      `SELECT id, role, message, session_id, created_at
       FROM admin_ai_chat_history
       WHERE user_id = ? AND session_id = ?
       ORDER BY id DESC
       LIMIT ${safeLimit}`,
      [userId, session.id],
    )

    return rows
      .reverse()
      .map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        role: row.role === 'assistant' ? 'assistant' : 'user',
        message: String(row.message || '').trim(),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      }))
      .filter((row) => row.message)
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return []
    }
    throw error
  }
}

function mergeHistory(serverHistory, clientHistory, limit = 24) {
  const merged = [...normalizeHistoryEntries(serverHistory), ...normalizeHistoryEntries(clientHistory)]
  const compacted = []

  for (const entry of merged) {
    const prev = compacted[compacted.length - 1]
    if (prev && prev.role === entry.role && prev.message === entry.message) {
      continue
    }
    compacted.push(entry)
  }

  return compacted.slice(-limit)
}

async function updateSessionMetadata(sessionId, fallbackTitle) {
  const normalizedTitle = String(fallbackTitle || '').trim()
  if (!parseSessionId(sessionId)) {
    return
  }

  if (normalizedTitle) {
    await pool.query(
      `UPDATE admin_ai_chat_sessions
       SET title = IF(title = 'New Session', ?, title),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [normalizedTitle.slice(0, 255), sessionId],
    )
    return
  }

  await pool.query(
    `UPDATE admin_ai_chat_sessions
     SET updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [sessionId],
  )
}

async function persistHistory(userId, sessionId, userMessage, assistantMessage) {
  const entries = []
  if (String(userMessage || '').trim()) {
    entries.push({ role: 'user', message: String(userMessage).trim() })
  }
  if (String(assistantMessage || '').trim()) {
    entries.push({ role: 'assistant', message: String(assistantMessage).trim() })
  }

  if (!entries.length) {
    return
  }

  try {
    const placeholders = entries.map(() => '(?, ?, ?, ?)').join(', ')
    const params = entries.flatMap((entry) => [userId, sessionId, entry.role, entry.message])

    await pool.query(
      `INSERT INTO admin_ai_chat_history (user_id, session_id, role, message)
       VALUES ${placeholders}`,
      params,
    )

    await updateSessionMetadata(sessionId, entries.find((entry) => entry.role === 'user')?.message || '')

    await pool.query(
      `DELETE FROM admin_ai_chat_history
       WHERE user_id = ?
         AND id NOT IN (
           SELECT id FROM (
             SELECT id
             FROM admin_ai_chat_history
             WHERE user_id = ?
             ORDER BY id DESC
             LIMIT 400
           ) AS recent
         )`,
      [userId, userId],
    )
  } catch (error) {
    console.error('Failed to persist admin AI chat history:', error)
  }
}

router.get('/sessions', async (req, res, next) => {
  try {
    const sessions = await listChatSessions(req.user.id, req.query?.limit)
    return res.json({ items: sessions })
  } catch (error) {
    return next(error)
  }
})

router.post('/sessions', async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim() || 'New Session'
    const created = await createChatSession(req.user.id, title)
    return res.status(201).json(created)
  } catch (error) {
    return next(error)
  }
})

router.delete('/sessions/:id', async (req, res, next) => {
  try {
    const sessionId = parseSessionId(req.params.id)
    if (!sessionId) {
      return res.status(400).json({ message: 'Valid session id is required.' })
    }

    const result = await deleteChatSession(req.user.id, sessionId)
    if (!result.deleted) {
      return res.status(404).json({ message: 'Session not found.' })
    }

    return res.json(result)
  } catch (error) {
    return next(error)
  }
})

router.get('/history', async (req, res, next) => {
  try {
    const limit = toSafeLimit(req.query?.limit, 40, 200)
    const requestedSessionId = parseSessionId(req.query?.sessionId)
    let targetSession = requestedSessionId
      ? await ensureSessionBelongsToUser(req.user.id, requestedSessionId)
      : await fetchLatestSession(req.user.id)

    if (!targetSession) {
      return res.json({
        sessionId: null,
        items: [],
      })
    }

    const history = await fetchPersistedHistory(req.user.id, limit, targetSession.id)

    return res.json({
      sessionId: targetSession.id,
      items: history.map((entry) => ({
        id: entry.id,
        sessionId: entry.sessionId,
        role: entry.role,
        content: entry.message,
        createdAt: entry.createdAt,
      })),
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/insights', async (_req, res, next) => {
  try {
    const insights = await fetchInsights()
    return res.json(insights)
  } catch (error) {
    return next(error)
  }
})

router.post('/chat', async (req, res, next) => {
  try {
    const aiConfig = await getAiRuntimeConfig()
    if (!aiConfig.apiKey) {
      return res.status(503).json({ message: 'AI API key is not configured.' })
    }

    const message = String(req.body?.message || '').trim()
    if (!message) {
      return res.status(400).json({ message: 'message is required' })
    }

    const clientHistory = Array.isArray(req.body?.history) ? req.body.history.slice(-20) : []
    const requestedSessionId = parseSessionId(req.body?.sessionId)

    let activeSession = requestedSessionId
      ? await ensureSessionBelongsToUser(req.user.id, requestedSessionId)
      : await fetchLatestSession(req.user.id)

    if (!activeSession) {
      activeSession = await createChatSession(req.user.id, message.slice(0, 80) || 'New Session')
    }

    const serverHistory = await fetchPersistedHistory(req.user.id, 24, activeSession.id)
    const history = mergeHistory(serverHistory, clientHistory, 24)

    const insights = await fetchInsights()

    const directResponse = await tryHandleDirectAdminQuery(message, insights)
    if (directResponse) {
      await persistHistory(req.user.id, activeSession.id, message, directResponse.content)
      return res.json({
        ...directResponse,
        sessionId: activeSession.id,
        insights,
      })
    }

    const directActionResponse = await tryHandleDirectActionIntent({
      message,
      userId: req.user.id,
    })
    if (directActionResponse) {
      await persistHistory(req.user.id, activeSession.id, message, directActionResponse.content)
      return res.json({
        ...directActionResponse,
        sessionId: activeSession.id,
        insights,
      })
    }

    const client = new OpenAI({
      baseURL: aiConfig.baseUrl,
      apiKey: aiConfig.apiKey,
    })

    const payload = await client.chat.completions.create({
      model: aiConfig.model,
      temperature: 0.2,
      top_p: aiConfig.topP,
      max_tokens: Math.min(aiConfig.maxTokens, 2000),
      stream: false,
      messages: [
        aiSystemMessage(),
        aiTaskMessage('adminAssistant', { platformInsights: insights }),
        ...history.map((entry) => ({
          role: entry.role,
          content: entry.message,
        })),
        { role: 'user', content: message },
      ],
    })

    const raw = extractMessageText(payload?.choices?.[0]?.message)
    const extracted = extractPlanFromText(raw)
    const plan =
      extracted.assistantReply || extracted.action?.type !== 'none'
        ? extracted
        : buildFallbackPlan(raw, message, insights)

    const guardedAction = hasExplicitContentCreationIntent(message)
      ? plan.action
      : { type: 'none', payload: {} }
    const actionResult = await executeAction(guardedAction)

    const reply = String(plan.assistantReply || 'Action processed.').trim()
    const resultSuffix =
      actionResult?.status === 'completed'
        ? `\n\nAction result: ${actionResult.message}`
        : ''

    const finalContent = `${reply}${resultSuffix}`.trim()
    await persistHistory(req.user.id, activeSession.id, message, finalContent)

    return res.json({
      role: 'assistant',
      content: finalContent,
      action: actionResult,
      sessionId: activeSession.id,
      insights,
    })
  } catch (error) {
    return next(error)
  }
})

export default router
