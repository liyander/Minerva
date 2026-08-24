import { pool } from '../db/pool.js'

/**
 * Append-only record of consequential actions — approvals, role changes,
 * deletions, grade releases. Writes are best-effort: an audit failure must never
 * roll back the action it describes, but it is logged loudly.
 */
export async function recordAudit(req, { action, entityType, entityId, summary, metadata }) {
  try {
    await pool.query(
      `INSERT INTO audit_log
         (actor_id, actor_username, action, entity_type, entity_id, summary, metadata_json, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req?.user?.id ?? null,
        req?.user?.username ?? null,
        action,
        entityType || null,
        entityId === undefined || entityId === null ? null : String(entityId),
        summary ? String(summary).slice(0, 500) : null,
        metadata ? JSON.stringify(metadata) : null,
        (req?.headers?.['x-forwarded-for'] || req?.ip || '').toString().slice(0, 64) || null,
      ],
    )
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') {
      console.error('Audit write failed:', error.message)
    }
  }
}

export async function listAudit({ action, actorId, entityType, limit = 200, before } = {}) {
  const filters = []
  const params = []

  if (action) {
    filters.push('action = ?')
    params.push(action)
  }
  if (actorId) {
    filters.push('actor_id = ?')
    params.push(actorId)
  }
  if (entityType) {
    filters.push('entity_type = ?')
    params.push(entityType)
  }
  if (before) {
    filters.push('id < ?')
    params.push(before)
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const [rows] = await pool.query(
    `SELECT id, actor_id, actor_username, action, entity_type, entity_id, summary,
            metadata_json, ip_address, created_at
     FROM audit_log ${where}
     ORDER BY id DESC
     LIMIT ?`,
    [...params, Math.min(Number(limit) || 200, 500)],
  )

  return rows.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actor: row.actor_username,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    metadata: row.metadata_json ? safeParse(row.metadata_json) : null,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  }))
}

function safeParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
