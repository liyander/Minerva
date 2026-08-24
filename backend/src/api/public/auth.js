import { env } from '../../config/env.js'
import { pool } from '../../db/pool.js'

function parseApiKeys(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function extractApiKey(req) {
  const headerKey = req.get('x-api-key') || req.get('X-API-Key') || ''
  if (headerKey) {
    return headerKey.trim()
  }

  const authorization = String(req.get('authorization') || '').trim()
  if (!authorization) {
    return ''
  }

  const [scheme, ...rest] = authorization.split(/\s+/)
  const token = rest.join(' ').trim()

  if (!token) {
    return ''
  }

  if (/^(bearer|apikey|token)$/i.test(scheme)) {
    return token
  }

  return ''
}

async function getConfiguredApiKeys() {
  try {
    const [rows] = await pool.query('SELECT api_json FROM platform_config WHERE id = 1 LIMIT 1')
    const raw = rows[0]?.api_json
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
    const storedKeys = parseApiKeys(parsed?.publicApi?.keys || '')
    if (storedKeys.length) return storedKeys
  } catch {
    // Fall back to .env keys below.
  }

  return parseApiKeys(env.publicApiKeys.join(','))
}

export async function requirePublicApiKey(req, res, next) {
  try {
    const configuredApiKeys = await getConfiguredApiKeys()
    if (!configuredApiKeys.length) {
      return res.status(503).json({
        message: 'Public API key is not configured on this server.',
      })
    }

    const presentedKey = extractApiKey(req)
    if (!presentedKey) {
      return res.status(401).json({ message: 'Missing API key.' })
    }

    if (!configuredApiKeys.includes(presentedKey)) {
      return res.status(401).json({ message: 'Invalid API key.' })
    }

    req.publicApiKey = presentedKey
    return next()
  } catch (error) {
    return next(error)
  }
}

export async function getPublicApiKeyState() {
  const configuredApiKeys = await getConfiguredApiKeys()
  return {
    configured: configuredApiKeys.length > 0,
    keyCount: configuredApiKeys.length,
  }
}
