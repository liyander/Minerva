import { Router } from 'express'
import { authenticate, requireAdmin, requireTrainer } from '../middleware/auth.js'
import { isRole, ROLES } from '../config/roles.js'
import {
  activeDriver,
  deleteObject,
  putDataUrl,
  readObject,
  storageStats,
} from '../services/storage.js'
import { recordAudit } from '../services/audit.js'
import { env } from '../config/env.js'

const router = Router()

router.use(authenticate)

/** Upload limits and driver, so the client can validate before sending bytes. */
router.get('/config', (_req, res) => {
  res.json({
    driver: activeDriver(),
    maxBytes: env.storage.maxBytes,
    maxMegabytes: Math.round(env.storage.maxBytes / (1024 * 1024)),
  })
})

/**
 * Uploads a base64 data URL. Trainees may only upload assignment work and
 * profile documents; anything published to others requires a trainer.
 */
router.post('/', async (req, res) => {
  const purpose = String(req.body?.purpose || 'general')
  const traineeAllowed = ['submission', 'certificate', 'avatar', 'general']

  if (!traineeAllowed.includes(purpose) && !isRole(req.user.role, ROLES.TRAINER, ROLES.ADMIN)) {
    return res.status(403).json({ message: 'You cannot upload files for that purpose' })
  }

  if (!req.body?.dataUrl) {
    return res.status(400).json({ message: 'dataUrl is required' })
  }

  try {
    const stored = await putDataUrl({
      dataUrl: req.body.dataUrl,
      fileName: req.body?.fileName || 'upload',
      ownerId: req.user.id,
      purpose,
    })

    return res.status(201).json(stored)
  } catch (error) {
    return res.status(400).json({ message: error.message })
  }
})

/**
 * Streams a stored object, or redirects to a presigned URL when the S3 driver is
 * active. Callers that need the raw bytes in JS can pass ?mode=json.
 */
router.get('/:id', async (req, res) => {
  const found = await readObject(req.params.id)
  if (!found) return res.status(404).json({ message: 'File not found' })

  const { record, url, buffer } = found

  if (url) {
    if (req.query.mode === 'json') return res.json({ url, fileName: record.file_name })
    return res.redirect(url)
  }

  res.setHeader('Content-Type', record.content_type || 'application/octet-stream')
  res.setHeader('Content-Length', String(record.byte_size))
  res.setHeader(
    'Content-Disposition',
    `${req.query.download === 'true' ? 'attachment' : 'inline'}; filename="${encodeURIComponent(record.file_name)}"`,
  )
  // Objects are immutable once written, so they can be cached hard.
  res.setHeader('Cache-Control', 'private, max-age=86400')
  return res.end(buffer)
})

router.delete('/:id', requireTrainer, async (req, res) => {
  const deleted = await deleteObject(req.params.id)
  if (!deleted) return res.status(404).json({ message: 'File not found' })

  await recordAudit(req, {
    action: 'file.deleted',
    entityType: 'file',
    entityId: req.params.id,
    summary: 'Stored file deleted',
  })

  return res.json({ deleted: true })
})

router.get('/admin/stats', requireAdmin, async (_req, res) => {
  res.json(await storageStats())
})

export default router
