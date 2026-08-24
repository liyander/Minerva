import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()

function normalizeDatetime(value) {
  const input = String(value || '').trim()
  if (!input) {
    return null
  }

  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  const pad = (part) => String(part).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:00`
}

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value === 1
  }

  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase()
    return lowered === 'true' || lowered === '1' || lowered === 'yes'
  }

  return false
}

function normalizeCtfTimeDate(value) {
  if (!value) return null
  const numericValue = Number(value)
  const parsed = Number.isFinite(numericValue) && String(value).trim() !== ''
    ? new Date(numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue)
    : new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return normalizeDatetime(parsed.toISOString())
}

function normalizeWeight(value) {
  const weight = Number(value)
  if (!Number.isFinite(weight) || weight < 0) return 0
  return Math.round(weight * 100) / 100
}

function getCtfTimeEventUrl(event) {
  if (event?.ctftime_url) return String(event.ctftime_url)
  if (event?.id) return `https://ctftime.org/event/${event.id}`
  return ''
}

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return typeof value === 'object' ? value : fallback
}

async function getCtfTimeConfig() {
  const [rows] = await pool.query('SELECT api_json FROM platform_config WHERE id = 1 LIMIT 1')
  const apiConfig = parseJsonField(rows[0]?.api_json, {})
  const ctftime = apiConfig?.ctftime || {}
  return {
    enabled: ctftime.enabled !== false,
    baseUrl: String(ctftime.baseUrl || 'https://ctftime.org/api/v1').replace(/\/+$/, ''),
    userAgent: String(ctftime.userAgent || 'Incognitrix-Academy/1.0 CTFtime upcoming event sync'),
    limit: Math.max(1, Math.min(500, Number(ctftime.limit || 100))),
    horizonDays: Math.max(1, Math.min(1095, Number(ctftime.horizonDays || 365))),
  }
}

async function fetchWeightedUpcomingCtfTimeEvents() {
  if (typeof fetch !== 'function') {
    throw new Error('Runtime fetch is not available')
  }

  const config = await getCtfTimeConfig()
  if (!config.enabled) {
    throw new Error('CTFtime sync is disabled in API settings.')
  }

  const now = Math.floor(Date.now() / 1000)
  const finish = now + config.horizonDays * 24 * 60 * 60
  const url = `${config.baseUrl}/events/?limit=${config.limit}&start=${now}&finish=${finish}`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': config.userAgent,
    },
  })

  if (!response.ok) {
    throw new Error(`CTFtime returned HTTP ${response.status}`)
  }

  const data = await response.json()
  const events = Array.isArray(data) ? data : []
  const currentTime = Date.now()

  return events
    .map((event) => {
      const liveTime = normalizeCtfTimeDate(event.start)
      const startsAt = liveTime ? new Date(liveTime).getTime() : NaN
      const weight = normalizeWeight(event.weight)

      return {
        ctftimeEventId: Number(event.id),
        name: String(event.title || event.name || '').trim(),
        registrationDeadline: liveTime,
        liveTime,
        registrationLink: String(event.url || getCtfTimeEventUrl(event)).trim(),
        ctftimeUrl: getCtfTimeEventUrl(event),
        format: String(event.format || '').trim(),
        weight,
        startsAt,
      }
    })
    .filter(
      (event) =>
        Number.isInteger(event.ctftimeEventId) &&
        event.name &&
        event.registrationLink &&
        event.liveTime &&
        event.weight > 0 &&
        Number.isFinite(event.startsAt) &&
        event.startsAt >= currentTime,
    )
}

async function listCtfEventsForUser(userId, isAdmin) {
  const whereClause = isAdmin ? '' : 'WHERE ce.is_active = true AND ce.registration_deadline >= NOW()'

  const [rows] = await pool.query(
    `SELECT
      ce.id,
      ce.name,
      ce.registration_deadline,
      ce.live_time,
      ce.registration_link,
      ce.weight,
      ce.source,
      ce.ctftime_event_id,
      ce.ctftime_url,
      ce.event_format,
      ce.is_active,
      ce.created_at,
      ce.updated_at,
      COALESCE(cer.registered, false) AS is_registered,
      (
        SELECT COUNT(*)
        FROM ctf_event_registrations cer_count
        WHERE cer_count.ctf_event_id = ce.id AND cer_count.registered = true
      ) AS registered_count
     FROM ctf_events ce
     LEFT JOIN ctf_event_registrations cer
       ON cer.ctf_event_id = ce.id AND cer.user_id = ?
     ${whereClause}
     ORDER BY ce.live_time ASC`,
    [userId],
  )

  return rows || []
}

router.get('/', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin'
    const rows = await listCtfEventsForUser(req.user.id, isAdmin)
    return res.json(rows)
  } catch (error) {
    console.error('Error fetching CTF events:', error)
    return res.status(500).json({ message: 'Failed to fetch CTF events' })
  }
})

router.post('/sync-ctftime', authenticate, requireAdmin, async (req, res) => {
  try {
    const events = await fetchWeightedUpcomingCtfTimeEvents()
    let created = 0
    let updated = 0

    for (const event of events) {
      const [existingRows] = await pool.query(
        `SELECT id
         FROM ctf_events
         WHERE source = 'ctftime' AND ctftime_event_id = ?
         LIMIT 1`,
        [event.ctftimeEventId],
      )

      if (existingRows.length) {
        await pool.query(
          `UPDATE ctf_events
           SET name = ?,
               registration_deadline = ?,
               live_time = ?,
               registration_link = ?,
               weight = ?,
               ctftime_url = ?,
               event_format = ?,
               is_active = true
           WHERE id = ?`,
          [
            event.name,
            event.registrationDeadline,
            event.liveTime,
            event.registrationLink,
            event.weight,
            event.ctftimeUrl,
            event.format,
            existingRows[0].id,
          ],
        )
        updated += 1
      } else {
        await pool.query(
          `INSERT INTO ctf_events (
            name,
            registration_deadline,
            live_time,
            registration_link,
            weight,
            source,
            ctftime_event_id,
            ctftime_url,
            event_format,
            is_active
          ) VALUES (?, ?, ?, ?, ?, 'ctftime', ?, ?, ?, true)`,
          [
            event.name,
            event.registrationDeadline,
            event.liveTime,
            event.registrationLink,
            event.weight,
            event.ctftimeEventId,
            event.ctftimeUrl,
            event.format,
          ],
        )
        created += 1
      }
    }

    await pool.query(
      `UPDATE ctf_events
       SET is_active = false
       WHERE source = 'ctftime' AND registration_deadline < NOW()`,
    )

    return res.json({
      source: 'ctftime',
      scanned: events.length,
      created,
      updated,
    })
  } catch (error) {
    console.error('Error syncing CTFtime events:', error)
    return res.status(502).json({ message: error.message || 'Failed to sync CTFtime events' })
  }
})

router.post('/', authenticate, requireAdmin, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const registrationLink = String(req.body?.registrationLink || '').trim()
  const registrationDeadline = normalizeDatetime(req.body?.registrationDeadline)
  const liveTime = normalizeDatetime(req.body?.liveTime)
  const weight = normalizeWeight(req.body?.weight)

  if (!name || !registrationLink || !registrationDeadline || !liveTime) {
    return res.status(400).json({
      message: 'name, registrationDeadline, liveTime, and registrationLink are required',
    })
  }

  if (new Date(liveTime).getTime() < new Date(registrationDeadline).getTime()) {
    return res.status(400).json({
      message: 'CTF live time must be after registration deadline',
    })
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO ctf_events (
        name,
        registration_deadline,
        live_time,
        registration_link,
        weight,
        source,
        is_active
      ) VALUES (?, ?, ?, ?, ?, 'manual', true)`,
      [name, registrationDeadline, liveTime, registrationLink, weight],
    )

    return res.status(201).json({
      id: result.insertId,
      name,
      registration_deadline: registrationDeadline,
      live_time: liveTime,
      registration_link: registrationLink,
      weight,
      source: 'manual',
      is_active: true,
    })
  } catch (error) {
    console.error('Error creating CTF event:', error)
    return res.status(500).json({ message: 'Failed to create CTF event' })
  }
})

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const eventId = Number(req.params.id)
  if (!Number.isFinite(eventId)) {
    return res.status(400).json({ message: 'Invalid event id' })
  }

  const updates = []
  const values = []

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
    const name = String(req.body.name || '').trim()
    if (!name) {
      return res.status(400).json({ message: 'name cannot be empty' })
    }
    updates.push('name = ?')
    values.push(name)
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'registrationDeadline')) {
    const registrationDeadline = normalizeDatetime(req.body.registrationDeadline)
    if (!registrationDeadline) {
      return res.status(400).json({ message: 'registrationDeadline is invalid' })
    }
    updates.push('registration_deadline = ?')
    values.push(registrationDeadline)
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'liveTime')) {
    const liveTime = normalizeDatetime(req.body.liveTime)
    if (!liveTime) {
      return res.status(400).json({ message: 'liveTime is invalid' })
    }
    updates.push('live_time = ?')
    values.push(liveTime)
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'registrationLink')) {
    const registrationLink = String(req.body.registrationLink || '').trim()
    if (!registrationLink) {
      return res.status(400).json({ message: 'registrationLink cannot be empty' })
    }
    updates.push('registration_link = ?')
    values.push(registrationLink)
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'weight')) {
    updates.push('weight = ?')
    values.push(normalizeWeight(req.body.weight))
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'isActive')) {
    updates.push('is_active = ?')
    values.push(parseBoolean(req.body.isActive))
  }

  if (!updates.length) {
    return res.status(400).json({ message: 'No fields to update' })
  }

  try {
    values.push(eventId)
    await pool.query(`UPDATE ctf_events SET ${updates.join(', ')} WHERE id = ?`, values)

    const [rows] = await pool.query(
      `SELECT
        id,
        name,
        registration_deadline,
        live_time,
        registration_link,
        weight,
        source,
        ctftime_event_id,
        ctftime_url,
        event_format,
        is_active,
        created_at,
        updated_at
       FROM ctf_events
       WHERE id = ?
       LIMIT 1`,
      [eventId],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'CTF event not found' })
    }

    return res.json(rows[0])
  } catch (error) {
    console.error('Error updating CTF event:', error)
    return res.status(500).json({ message: 'Failed to update CTF event' })
  }
})

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const eventId = Number(req.params.id)
  if (!Number.isFinite(eventId)) {
    return res.status(400).json({ message: 'Invalid event id' })
  }

  try {
    await pool.query('DELETE FROM ctf_events WHERE id = ?', [eventId])
    return res.json({ message: 'CTF event deleted successfully' })
  } catch (error) {
    console.error('Error deleting CTF event:', error)
    return res.status(500).json({ message: 'Failed to delete CTF event' })
  }
})

router.post('/:id/registration', authenticate, async (req, res) => {
  const eventId = Number(req.params.id)
  const registered = parseBoolean(req.body?.registered)

  if (!Number.isFinite(eventId)) {
    return res.status(400).json({ message: 'Invalid event id' })
  }

  try {
    const [eventRows] = await pool.query(
      `SELECT id, registration_deadline, is_active
       FROM ctf_events
       WHERE id = ?
       LIMIT 1`,
      [eventId],
    )

    if (!eventRows.length) {
      return res.status(404).json({ message: 'CTF event not found' })
    }

    const event = eventRows[0]
    if (!event.is_active || new Date(event.registration_deadline).getTime() < Date.now()) {
      return res.status(400).json({ message: 'Registration deadline has passed for this event' })
    }

    await pool.query(
      `INSERT INTO ctf_event_registrations (ctf_event_id, user_id, registered)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE registered = VALUES(registered), updated_at = CURRENT_TIMESTAMP`,
      [eventId, req.user.id, registered],
    )

    return res.json({
      ctfEventId: eventId,
      userId: req.user.id,
      registered,
    })
  } catch (error) {
    console.error('Error updating CTF registration:', error)
    return res.status(500).json({ message: 'Failed to update registration state' })
  }
})

router.post('/trigger-notifications', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        ce.id,
        ce.name,
        ce.registration_deadline,
        ce.live_time,
        ce.registration_link
       FROM ctf_events ce
       JOIN ctf_event_registrations cer
         ON cer.ctf_event_id = ce.id
       WHERE cer.user_id = ? AND cer.registered = true AND ce.is_active = true`,
      [req.user.id],
    )

    const events = rows || []
    const todayKey = new Date().toISOString().slice(0, 10)
    let createdCount = 0

    const tryCreateNotification = async ({ eventId, kind, title, message, type }) => {
      const [existing] = await pool.query(
        `SELECT id
         FROM ctf_notification_logs
         WHERE ctf_event_id = ? AND user_id = ? AND notification_kind = ? AND notification_date = ?
         LIMIT 1`,
        [eventId, req.user.id, kind, todayKey],
      )

      if (existing.length) {
        return
      }

      await pool.query(
        'INSERT INTO notifications (title, message, type, is_active, target_user_id) VALUES (?, ?, ?, true, ?)',
        [title, message, type, req.user.id],
      )

      await pool.query(
        `INSERT INTO ctf_notification_logs (
          ctf_event_id,
          user_id,
          notification_kind,
          notification_date
        ) VALUES (?, ?, ?, ?)`,
        [eventId, req.user.id, kind, todayKey],
      )

      createdCount += 1
    }

    for (const event of events) {
      const deadlineKey = new Date(event.registration_deadline).toISOString().slice(0, 10)
      const liveKey = new Date(event.live_time).toISOString().slice(0, 10)

      if (deadlineKey === todayKey) {
        await tryCreateNotification({
          eventId: event.id,
          kind: 'deadline',
          title: `CTF deadline today: ${event.name}`,
          message: `Registration closes today for ${event.name}. Confirm your readiness and access details: ${event.registration_link}`,
          type: 'warning',
        })
      }

      if (liveKey === todayKey) {
        await tryCreateNotification({
          eventId: event.id,
          kind: 'live_day',
          title: `CTF live today: ${event.name}`,
          message: `${event.name} is live today. Launch your participation flow here: ${event.registration_link}`,
          type: 'success',
        })
      }
    }

    return res.json({ created: createdCount })
  } catch (error) {
    console.error('Error triggering CTF notifications:', error)
    return res.status(500).json({ message: 'Failed to trigger CTF notifications' })
  }
})

export default router
