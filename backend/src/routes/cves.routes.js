import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()

const PUBLICATION_IMAGE_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,/i

function normalizePublicationFields(body = {}) {
  const publicationTitle = String(body.publication_title || '').trim().slice(0, 255)
  const publicationSourceUrl = String(body.publication_source_url || '').trim()
  const publicationDate = body.publication_date || null
  const publicationImageData = String(body.publication_image_data || '').trim()

  if (publicationSourceUrl) {
    try {
      const parsed = new URL(publicationSourceUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol')
    } catch {
      return { error: 'Published page URL must be a valid HTTP or HTTPS URL.' }
    }
  }

  if (publicationImageData && !PUBLICATION_IMAGE_PATTERN.test(publicationImageData)) {
    return { error: 'Publication proof must be a PNG, JPEG, or WebP image.' }
  }

  if (publicationImageData.length > 4.2 * 1024 * 1024) {
    return { error: 'Publication proof image must be 3 MB or smaller.' }
  }

  return {
    publicationTitle,
    publicationSourceUrl,
    publicationDate,
    publicationImageData,
  }
}

// Default CVEs for initial DB seeding (optional logic)
router.get('/', async (req, res) => {
  try {
    const [cves] = await pool.query('SELECT * FROM cves ORDER BY created_at DESC')
    res.json(cves)
  } catch (error) {
    console.error('Error fetching CVEs:', error)
    res.status(500).json({ message: 'Failed to retrieve CVEs' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const [cves] = await pool.query('SELECT * FROM cves WHERE id = ? LIMIT 1', [req.params.id])
    if (!cves.length) {
      return res.status(404).json({ message: 'CVE not found' })
    }
    res.json(cves[0])
  } catch (error) {
    console.error('Error fetching CVE:', error)
    res.status(500).json({ message: 'Failed to retrieve CVE details' })
  }
})

router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { cve_id, short_description, found_year, credit, vulnerability_report, method_followed, references_text } = req.body
  const publication = normalizePublicationFields(req.body)

  if (!cve_id || !short_description) {
    return res.status(400).json({ message: 'CVE ID and Short Description are required.' })
  }
  if (publication.error) return res.status(400).json({ message: publication.error })

  try {
    const [result] = await pool.query(
      `INSERT INTO cves 
       (cve_id, short_description, found_year, credit, vulnerability_report, method_followed, references_text,
        publication_title, publication_source_url, publication_date, publication_image_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cve_id, short_description, found_year || null, credit || '', vulnerability_report || '', method_followed || '', references_text || '',
        publication.publicationTitle, publication.publicationSourceUrl, publication.publicationDate, publication.publicationImageData]
    )
    
    res.status(201).json({ 
      id: result.insertId, 
      cve_id, short_description, found_year, credit, vulnerability_report, method_followed, references_text,
      publication_title: publication.publicationTitle,
      publication_source_url: publication.publicationSourceUrl,
      publication_date: publication.publicationDate,
      publication_image_data: publication.publicationImageData,
    })
  } catch (error) {
    console.error('Error creating CVE:', error)
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'CVE ID already exists.' })
    }
    res.status(500).json({ message: 'Failed to create CVE' })
  }
})

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const { cve_id, short_description, found_year, credit, vulnerability_report, method_followed, references_text } = req.body
  const publication = normalizePublicationFields(req.body)

  if (!cve_id || !short_description) {
    return res.status(400).json({ message: 'CVE ID and Short Description are required.' })
  }
  if (publication.error) return res.status(400).json({ message: publication.error })

  try {
    await pool.query(
      `UPDATE cves SET 
         cve_id = ?, 
         short_description = ?, 
         found_year = ?, 
         credit = ?, 
         vulnerability_report = ?, 
         method_followed = ?, 
         references_text = ?,
         publication_title = ?,
         publication_source_url = ?,
         publication_date = ?,
         publication_image_data = ?
       WHERE id = ?`,
      [cve_id, short_description, found_year, credit, vulnerability_report, method_followed, references_text,
        publication.publicationTitle, publication.publicationSourceUrl, publication.publicationDate,
        publication.publicationImageData, req.params.id]
    )
    
    res.json({ message: 'CVE updated successfully' })
  } catch (error) {
    console.error('Error updating CVE:', error)
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'CVE ID already exists.' })
    }
    res.status(500).json({ message: 'Failed to update CVE' })
  }
})

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM cves WHERE id = ?', [req.params.id])
    res.json({ message: 'CVE deleted successfully' })
  } catch (error) {
    console.error('Error deleting CVE:', error)
    res.status(500).json({ message: 'Failed to delete CVE' })
  }
})

export default router
