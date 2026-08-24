import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { buildAiPlatformConfig } from '../services/aiSettings.js'
import { env } from '../config/env.js'

const router = Router()

function parseJsonField(value, fallback = {}) {
  if (!value) {
    return fallback
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }

  return value
}

function requireAdminOr404(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(404).json({ message: 'Not found' })
  }

  return next()
}

async function getStoredPlatformConfig() {
  const [rows] = await pool.query(
    'SELECT routes_json, features_json, ai_json, api_json FROM platform_config WHERE id = 1 LIMIT 1',
  )

  const row = rows[0] || {}
  return {
    routes: parseJsonField(row.routes_json, {}),
    features: parseJsonField(row.features_json, {}),
    ai: parseJsonField(row.ai_json, {}),
    api: parseJsonField(row.api_json, {}),
  }
}

async function saveStoredPlatformConfig(config) {
  await pool.query(
    `INSERT INTO platform_config (id, routes_json, features_json, ai_json, api_json)
     VALUES (1, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       routes_json = VALUES(routes_json),
       features_json = VALUES(features_json),
       ai_json = VALUES(ai_json),
       api_json = VALUES(api_json)`,
    [
      JSON.stringify(config.routes || {}),
      JSON.stringify(config.features || {}),
      JSON.stringify(config.ai || {}),
      JSON.stringify(config.api || {}),
    ],
  )
}

const DEFAULT_API_CONFIG = {
  ai: {
    baseUrl: '',
    apiKey: '',
    temperature: '',
    topP: '',
    maxTokens: '',
  },
  ctftime: {
    enabled: true,
    baseUrl: 'https://ctftime.org/api/v1',
    userAgent: 'Incognitrix-Academy/1.0 CTFtime upcoming event sync',
    limit: 100,
    horizonDays: 365,
  },
  publicApi: {
    keys: '',
  },
}

function parseKeyList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

function buildApiConfigForStorage(input = {}, existing = {}) {
  const incomingAiKey = String(input?.ai?.apiKey || '').trim()
  const incomingPublicKeys = String(input?.publicApi?.keys || '').trim()
  return {
    ai: {
      baseUrl: String(input?.ai?.baseUrl ?? existing?.ai?.baseUrl ?? DEFAULT_API_CONFIG.ai.baseUrl).trim(),
      apiKey: incomingAiKey ? incomingAiKey : String(existing?.ai?.apiKey || ''),
      temperature: input?.ai?.temperature === '' || input?.ai?.temperature === undefined
        ? ''
        : normalizeNumber(input.ai.temperature, env.aiTemperature, 0, 2),
      topP: input?.ai?.topP === '' || input?.ai?.topP === undefined
        ? ''
        : normalizeNumber(input.ai.topP, env.aiTopP, 0, 1),
      maxTokens: input?.ai?.maxTokens === '' || input?.ai?.maxTokens === undefined
        ? ''
        : Math.round(normalizeNumber(input.ai.maxTokens, env.aiMaxTokens, 256, 131072)),
    },
    ctftime: {
      enabled: input?.ctftime?.enabled !== false,
      baseUrl: String(input?.ctftime?.baseUrl || existing?.ctftime?.baseUrl || DEFAULT_API_CONFIG.ctftime.baseUrl).trim(),
      userAgent: String(input?.ctftime?.userAgent || existing?.ctftime?.userAgent || DEFAULT_API_CONFIG.ctftime.userAgent).trim(),
      limit: Math.round(normalizeNumber(input?.ctftime?.limit, DEFAULT_API_CONFIG.ctftime.limit, 1, 500)),
      horizonDays: Math.round(normalizeNumber(input?.ctftime?.horizonDays, DEFAULT_API_CONFIG.ctftime.horizonDays, 1, 1095)),
    },
    publicApi: {
      keys: incomingPublicKeys ? incomingPublicKeys : String(existing?.publicApi?.keys || ''),
    },
  }
}

function buildApiConfigForClient(stored = {}) {
  const api = buildApiConfigForStorage(stored, DEFAULT_API_CONFIG)
  const storedAiKeys = String(api.ai.apiKey || '')
  const envAiKeys = String(env.nvidiaApiKey || '')
  const publicKeys = parseKeyList(api.publicApi.keys || env.publicApiKeys.join(','))
  return {
    ai: {
      baseUrl: api.ai.baseUrl,
      apiKeyConfigured: Boolean(storedAiKeys || envAiKeys),
      temperature: api.ai.temperature,
      topP: api.ai.topP,
      maxTokens: api.ai.maxTokens,
    },
    ctftime: api.ctftime,
    publicApi: {
      keysConfigured: publicKeys.length > 0,
      keyCount: publicKeys.length,
    },
  }
}

router.get('/', async (_req, res) => {
  const [rows] = await pool.query('SELECT routes_json, features_json, ai_json, api_json FROM platform_config WHERE id = 1')
  if (!rows.length) {
    return res.json({ routes: {}, features: {}, ai: buildAiPlatformConfig(), api: buildApiConfigForClient() })
  }

  return res.json({
    routes: parseJsonField(rows[0].routes_json, {}),
    features: parseJsonField(rows[0].features_json, {}),
    ai: buildAiPlatformConfig(parseJsonField(rows[0].ai_json, {})),
    api: buildApiConfigForClient(parseJsonField(rows[0].api_json, {})),
  })
})

router.post('/0p5-c0r3/s1gn4l-dr0p', authenticate, requireAdminOr404, async (req, res) => {
  const currentConfig = await getStoredPlatformConfig()
  const reason = String(req.body?.reason || 'Controlled platform outage drill').trim()
  const outage = {
    active: true,
    reason,
    triggeredBy: req.user?.username || 'admin',
    triggeredAt: new Date().toISOString(),
  }
  const nextConfig = {
    ...currentConfig,
    features: {
      ...currentConfig.features,
      controlledOutage: outage,
    },
  }

  await saveStoredPlatformConfig(nextConfig)

  return res.json({
    status: 'degraded',
    message: 'Controlled outage drill is active.',
    outage,
  })
})

router.post('/0p5-c0r3/r3st0r3', authenticate, requireAdminOr404, async (req, res) => {
  const currentConfig = await getStoredPlatformConfig()
  const nextConfig = {
    ...currentConfig,
    features: {
      ...currentConfig.features,
      controlledOutage: {
        active: false,
        recoveredBy: req.user?.username || 'admin',
        recoveredAt: new Date().toISOString(),
      },
    },
  }

  await saveStoredPlatformConfig(nextConfig)

  return res.json({
    status: 'recovered',
    message: 'Controlled outage drill has been cleared.',
  })
})

router.put('/', authenticate, requireAdmin, async (req, res) => {
  const { routes, features, ai, api } = req.body || {}
  const [existingRows] = await pool.query('SELECT api_json FROM platform_config WHERE id = 1 LIMIT 1')
  const existingApi = parseJsonField(existingRows[0]?.api_json, {})
  const aiConfig = buildAiPlatformConfig(ai || {})
  const apiConfig = buildApiConfigForStorage(api || {}, existingApi)
  await pool.query(
    `INSERT INTO platform_config (id, routes_json, features_json, ai_json, api_json)
     VALUES (1, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       routes_json = VALUES(routes_json),
       features_json = VALUES(features_json),
       ai_json = VALUES(ai_json),
       api_json = VALUES(api_json)`,
    [JSON.stringify(routes || {}), JSON.stringify(features || {}), JSON.stringify(aiConfig), JSON.stringify(apiConfig)],
  )

  return res.json({ routes: routes || {}, features: features || {}, ai: aiConfig, api: buildApiConfigForClient(apiConfig) })
})

export default router
