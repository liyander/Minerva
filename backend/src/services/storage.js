import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { env } from '../config/env.js'
import { pool } from '../db/pool.js'

/**
 * File storage with two interchangeable drivers.
 *
 * `local` writes under backend/storage and streams bytes back through the API —
 * fine for a single instance. `s3` puts objects in a bucket and hands out
 * presigned URLs, which is what makes recorded lectures workable at scale.
 * Metadata always lives in `file_objects` so callers never care which is active.
 */

const LOCAL_ROOT = path.resolve(process.cwd(), env.storage.localRoot)

let s3Client = null
let presigner = null

async function loadS3() {
  if (s3Client) return { s3Client, presigner }

  const [{ S3Client }, { getSignedUrl }] = await Promise.all([
    import('@aws-sdk/client-s3'),
    import('@aws-sdk/s3-request-presigner'),
  ])

  s3Client = new S3Client({
    region: env.storage.region,
    ...(env.storage.endpoint
      ? { endpoint: env.storage.endpoint, forcePathStyle: true }
      : {}),
    ...(env.storage.accessKeyId
      ? {
          credentials: {
            accessKeyId: env.storage.accessKeyId,
            secretAccessKey: env.storage.secretAccessKey,
          },
        }
      : {}),
  })
  presigner = getSignedUrl
  return { s3Client, presigner }
}

export function activeDriver() {
  return env.storage.driver === 's3' && env.storage.bucket ? 's3' : 'local'
}

function newId() {
  return crypto.randomBytes(16).toString('hex')
}

function safeName(name) {
  return String(name || 'file')
    .replace(/[^\w.\-]+/g, '_')
    .slice(-120)
}

/**
 * Persists a buffer and records it. `purpose` groups objects so cleanup and
 * quota reporting can target one kind of upload.
 */
export async function putObject({
  buffer,
  fileName,
  contentType,
  ownerId = null,
  purpose = 'general',
}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('Nothing to store')
  }

  if (buffer.length > env.storage.maxBytes) {
    const limitMb = Math.round(env.storage.maxBytes / (1024 * 1024))
    throw new Error(`File is larger than the ${limitMb} MB limit`)
  }

  const id = newId()
  const driver = activeDriver()
  const key = `${purpose}/${id}-${safeName(fileName)}`
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex')

  if (driver === 's3') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    const { s3Client: client } = await loadS3()
    await client.send(
      new PutObjectCommand({
        Bucket: env.storage.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
      }),
    )
  } else {
    const target = path.join(LOCAL_ROOT, key)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, buffer)
  }

  await pool.query(
    `INSERT INTO file_objects
       (id, owner_id, driver, storage_key, bucket, file_name, content_type, byte_size, checksum, purpose)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      ownerId,
      driver,
      key,
      driver === 's3' ? env.storage.bucket : null,
      String(fileName || 'file').slice(0, 255),
      contentType || null,
      buffer.length,
      checksum,
      purpose,
    ],
  )

  return { id, driver, key, byteSize: buffer.length, checksum }
}

/** Accepts a `data:` URL, which is what the browser produces from a file input. */
export async function putDataUrl({ dataUrl, fileName, ownerId, purpose }) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''))
  if (!match) throw new Error('Expected a data URL')

  const [, contentType, isBase64, payload] = match
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8')

  return putObject({ buffer, fileName, contentType, ownerId, purpose })
}

export async function getObjectRecord(id) {
  const [rows] = await pool.query('SELECT * FROM file_objects WHERE id = ? LIMIT 1', [id])
  return rows[0] || null
}

/**
 * Returns either a redirect URL (S3) or a buffer (local), so route handlers can
 * respond appropriately without knowing the driver.
 */
export async function readObject(id) {
  const record = await getObjectRecord(id)
  if (!record) return null

  if (record.driver === 's3') {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const { s3Client: client, presigner: sign } = await loadS3()
    const url = await sign(
      client,
      new GetObjectCommand({ Bucket: record.bucket, Key: record.storage_key }),
      { expiresIn: env.storage.signedUrlSeconds },
    )
    return { record, url }
  }

  const target = path.join(LOCAL_ROOT, record.storage_key)
  const buffer = await fs.readFile(target)
  return { record, buffer }
}

export async function deleteObject(id) {
  const record = await getObjectRecord(id)
  if (!record) return false

  try {
    if (record.driver === 's3') {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
      const { s3Client: client } = await loadS3()
      await client.send(
        new DeleteObjectCommand({ Bucket: record.bucket, Key: record.storage_key }),
      )
    } else {
      await fs.unlink(path.join(LOCAL_ROOT, record.storage_key))
    }
  } catch {
    // The row is removed regardless; a missing blob should not block cleanup.
  }

  await pool.query('DELETE FROM file_objects WHERE id = ?', [id])
  return true
}

export async function storageStats() {
  const [rows] = await pool.query(
    `SELECT purpose, COUNT(*) AS files, COALESCE(SUM(byte_size), 0) AS bytes
     FROM file_objects GROUP BY purpose`,
  )

  return {
    driver: activeDriver(),
    bucket: env.storage.bucket || null,
    maxBytes: env.storage.maxBytes,
    byPurpose: rows.map((row) => ({
      purpose: row.purpose,
      files: Number(row.files),
      bytes: Number(row.bytes),
    })),
  }
}
