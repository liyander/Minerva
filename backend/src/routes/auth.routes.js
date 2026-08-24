import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, signToken } from '../middleware/auth.js'
import { APPROVAL, initialApprovalFor, normaliseRole, ROLES } from '../config/roles.js'
import { env } from '../config/env.js'
import { sendMail } from '../services/mailer.js'
import { recordAudit } from '../services/audit.js'

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

function normalizeRangeNumber(value, fallback) {
  const number = Number(value)
  if (!Number.isInteger(number)) return fallback
  return Math.max(0, Math.min(999999, number))
}

function isAllowedPublicRegistrationNumber(registrationNumber, features = {}) {
  const min = normalizeRangeNumber(features.registrationDynamicMin, 23)
  const max = normalizeRangeNumber(features.registrationDynamicMax, 30)
  const lower = Math.min(min, max)
  const upper = Math.max(min, max)
  const match = String(registrationNumber || '').match(/^7140(\d+)1490(\d+)$/)
  if (!match) return false

  const dynamicSegment = Number(match[1])
  return Number.isInteger(dynamicSegment) && dynamicSegment >= lower && dynamicSegment <= upper
}

router.post('/register', async (req, res) => {
  const registrationNumber = String(req.body?.registrationNumber || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')

  if (!registrationNumber || !email || !password) {
    return res.status(400).json({ message: 'registrationNumber, email, and password are required' })
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' })
  }

  const [configRows] = await pool.query('SELECT features_json FROM platform_config WHERE id = 1 LIMIT 1')
  const features = parseJsonField(configRows[0]?.features_json, {})
  if (features.publicRegistration === false) {
    return res.status(403).json({ message: 'Public registration is currently disabled' })
  }

  if (!isAllowedPublicRegistrationNumber(registrationNumber, features)) {
    return res.status(400).json({ message: 'Unable to create account with the provided details' })
  }

  const usernameBase = `operator_${registrationNumber.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`
  const safeUsernameBase = usernameBase || `operator_${Date.now()}`
  let username = safeUsernameBase

  let suffix = 1
  // Ensure generated username uniqueness.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [existingRows] = await pool.query('SELECT 1 FROM users WHERE username = ? LIMIT 1', [username])
    if (!existingRows.length) {
      break
    }
    username = `${safeUsernameBase}_${suffix}`
    suffix += 1
  }

  try {
    const hash = await bcrypt.hash(password, 10)
    const [result] = await pool.query(
      `INSERT INTO users (username, registration_number, email, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, 'operator', true)`,
      [username, registrationNumber, email, hash],
    )

    const token = signToken({ id: result.insertId, username, role: 'operator' })
    return res.status(201).json({
      token,
      user: {
        id: result.insertId,
        username,
        registrationNumber,
        email,
        role: 'operator',
      },
    })
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email or registration number already exists' })
    }
    throw error
  }
})

function slugifyUsername(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

async function uniqueUsername(base) {
  const safeBase = base || `user_${Date.now()}`
  let username = safeBase
  let suffix = 1

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [rows] = await pool.query('SELECT 1 FROM users WHERE username = ? LIMIT 1', [username])
    if (!rows.length) return username
    username = `${safeBase}_${suffix}`
    suffix += 1
  }
}

/**
 * General signup for the three platform roles. Trainees are usable straight
 * away; trainers are created in a pending state and cannot sign in until an
 * admin approves them. Admin accounts are never self-registered.
 */
router.post('/signup', async (req, res) => {
  const firstName = String(req.body?.firstName || '').trim()
  const lastName = String(req.body?.lastName || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const requestedRole = normaliseRole(req.body?.role || ROLES.TRAINEE)

  if (!firstName || !email || !password) {
    return res.status(400).json({ message: 'First name, email and password are required' })
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address' })
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' })
  }

  if (![ROLES.TRAINEE, ROLES.TRAINER].includes(requestedRole)) {
    return res.status(400).json({ message: 'Choose either the trainee or trainer role' })
  }

  const [configRows] = await pool.query(
    'SELECT features_json FROM platform_config WHERE id = 1 LIMIT 1',
  )
  const features = parseJsonField(configRows[0]?.features_json, {})
  if (features.publicRegistration === false) {
    return res.status(403).json({ message: 'Public registration is currently disabled' })
  }

  const [existingAccounts] = await pool.query(
    `SELECT id, role, approval_status
     FROM users
     WHERE LOWER(email) = LOWER(?)
     LIMIT 1`,
    [email],
  )
  if (existingAccounts.length) {
    const existingRole = normaliseRole(existingAccounts[0].role)
    if (requestedRole === ROLES.TRAINER && existingRole === ROLES.TRAINER) {
      return res.status(409).json({
        message: 'A trainer account with this email already exists',
      })
    }
    return res.status(409).json({ message: 'An account with this email already exists' })
  }

  const username = await uniqueUsername(
    slugifyUsername(`${firstName}${lastName ? `_${lastName}` : ''}`) || slugifyUsername(email.split('@')[0]),
  )
  const approvalStatus = initialApprovalFor(requestedRole)

  try {
    const hash = await bcrypt.hash(password, 10)
    const [result] = await pool.query(
      `INSERT INTO users (username, first_name, last_name, email, password_hash, role, is_active, approval_status)
       VALUES (?, ?, ?, ?, ?, ?, true, ?)`,
      [username, firstName, lastName || null, email, hash, requestedRole, approvalStatus],
    )

    if (approvalStatus === APPROVAL.PENDING) {
      return res.status(201).json({
        pendingApproval: true,
        message: 'Your trainer account has been created and is awaiting admin approval.',
        user: { id: result.insertId, username, email, role: requestedRole },
      })
    }

    const token = signToken({ id: result.insertId, username, role: requestedRole })
    return res.status(201).json({
      token,
      user: {
        id: result.insertId,
        username,
        firstName,
        lastName,
        email,
        role: requestedRole,
      },
    })
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message:
          requestedRole === ROLES.TRAINER
            ? 'A trainer account with this email already exists'
            : 'An account with this email already exists',
      })
    }
    throw error
  }
})

router.post('/login', async (req, res) => {
  const { password } = req.body || {}
  const identifier = String(
    req.body?.identifier || req.body?.username || req.body?.email || req.body?.registrationNumber || '',
  ).trim()

  if (!identifier || !password) {
    return res.status(400).json({ message: 'identifier and password are required' })
  }

  const [rows] = await pool.query(
    `SELECT id, username, email, registration_number, role, password_hash, is_active,
            approval_status, first_name, last_name
     FROM users
     WHERE username = ? OR email = ? OR registration_number = ?
     LIMIT 1`,
    [identifier, identifier, identifier],
  )

  if (!rows.length) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  const user = rows[0]
  if (!user.is_active) {
    return res.status(403).json({ message: 'Account is disabled. Contact admin.' })
  }

  const approval = String(user.approval_status || APPROVAL.APPROVED)
  if (approval === APPROVAL.PENDING) {
    return res.status(403).json({ message: 'Your account is waiting for admin approval.' })
  }
  if (approval === APPROVAL.REJECTED) {
    return res.status(403).json({ message: 'Your account request was declined. Contact an admin.' })
  }

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  const role = normaliseRole(user.role)
  const token = signToken({ id: user.id, username: user.username, role })
  await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', [
    user.id,
  ])

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      registrationNumber: user.registration_number,
      firstName: user.first_name,
      lastName: user.last_name,
      role,
    },
  })
})

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Starts a password reset. The response is deliberately identical whether or not
 * the address exists, so this cannot be used to enumerate accounts.
 */
router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const generic = { message: 'If that address has an account, a reset link is on its way.' }

  if (!email) {
    return res.status(400).json({ message: 'Email is required' })
  }

  const [rows] = await pool.query(
    'SELECT id, email, first_name, username FROM users WHERE email = ? AND is_active = true LIMIT 1',
    [email],
  )

  if (!rows.length) {
    return res.json(generic)
  }

  const user = rows[0]
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + env.security.passwordResetMinutes * 60000)

  // Any earlier unused token is invalidated so only the newest link works.
  await pool.query(
    'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL',
    [user.id],
  )
  await pool.query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [user.id, hashToken(token), expiresAt.toISOString().slice(0, 19).replace('T', ' ')],
  )

  void sendMail({
    to: user.email,
    template: 'passwordReset',
    data: {
      name: user.first_name || user.username,
      resetUrl: `${env.appUrl}/reset-password?token=${token}`,
      expiresMinutes: env.security.passwordResetMinutes,
    },
  })

  return res.json(generic)
})

router.post('/reset-password', async (req, res) => {
  const token = String(req.body?.token || '')
  const password = String(req.body?.password || '')

  if (!token || !password) {
    return res.status(400).json({ message: 'Token and new password are required' })
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' })
  }

  const [rows] = await pool.query(
    `SELECT t.id, t.user_id, u.username
     FROM password_reset_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [hashToken(token)],
  )

  if (!rows.length) {
    return res.status(400).json({ message: 'That reset link is invalid or has expired.' })
  }

  const hash = await bcrypt.hash(password, 10)
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, rows[0].user_id])
  await pool.query('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [
    rows[0].id,
  ])

  await recordAudit(req, {
    action: 'password.reset',
    entityType: 'user',
    entityId: rows[0].user_id,
    summary: `Password reset completed for ${rows[0].username}`,
  })

  return res.json({ message: 'Your password has been changed. You can sign in now.' })
})

/** Changing a password while signed in still requires the current one. */
router.post('/change-password', authenticate, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '')
  const newPassword = String(req.body?.newPassword || '')

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Both the current and new password are required' })
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' })
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ message: 'Choose a password different from the current one' })
  }

  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [
    req.user.id,
  ])
  if (!rows.length) {
    return res.status(404).json({ message: 'Account not found' })
  }

  if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    return res.status(401).json({ message: 'Your current password is not correct' })
  }

  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [
    await bcrypt.hash(newPassword, 10),
    req.user.id,
  ])

  await recordAudit(req, {
    action: 'password.changed',
    entityType: 'user',
    entityId: req.user.id,
    summary: 'Password changed by the account holder',
  })

  return res.json({ message: 'Password updated.' })
})

router.post('/heartbeat', authenticate, async (req, res) => {
  await pool.query('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', [req.user.id])
  return res.json({ alive: true })
})

router.post('/logout', authenticate, async (req, res) => {
  await pool.query('UPDATE users SET last_seen_at = NULL WHERE id = ?', [req.user.id])
  return res.json({ loggedOut: true })
})

router.get('/me', authenticate, async (req, res) => {
  return res.json({ user: req.user })
})

export default router
