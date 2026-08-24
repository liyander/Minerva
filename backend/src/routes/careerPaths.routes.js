import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { mapCareerPath } from '../services/careerPathMapper.js'

const router = Router()

function buildId(input, prefix = 'path') {
  const base = (input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  return base || `${prefix}-${Date.now()}`
}

async function fetchCareerPathById(id) {
  const [rows] = await pool.query('SELECT * FROM career_paths WHERE id = ? OR slug = ? LIMIT 1', [id, id])
  if (!rows.length) {
    return null
  }

  const path = rows[0]
  const [moduleRows] = await pool.query(
    'SELECT * FROM career_path_modules WHERE career_path_id = ? ORDER BY sort_order ASC',
    [path.id],
  )
  const [resourceRows] = await pool.query(
    'SELECT * FROM career_path_resources WHERE career_path_id = ? ORDER BY sort_order ASC',
    [path.id],
  )

  const modules = []
  for (const moduleRow of moduleRows) {
    const [moduleRoomRows] = await pool.query(
      'SELECT room_id FROM career_path_module_rooms WHERE module_id = ? ORDER BY sort_order ASC',
      [moduleRow.id],
    )
    modules.push({
      id: moduleRow.id,
      phase: moduleRow.phase,
      title: moduleRow.title,
      description: moduleRow.description,
      imageData: moduleRow.module_image_data || null,
      linkedPathId: moduleRow.linked_path_id || null,
      rooms: moduleRoomRows.map((row) => row.room_id),
    })
  }

  const resources = resourceRows.map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    type: row.type,
  }))

  return mapCareerPath(path, modules, resources)
}

router.get('/', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM career_paths ORDER BY roadmap_sort_order ASC, created_at ASC, title ASC')
  const result = []

  for (const row of rows) {
    const item = await fetchCareerPathById(row.id)
    if (item) {
      result.push(item)
    }
  }

  return res.json(result)
})

router.get('/:id', async (req, res) => {
  const path = await fetchCareerPathById(req.params.id)
  if (!path) {
    return res.status(404).json({ message: 'Career path not found' })
  }
  return res.json(path)
})

router.post('/', authenticate, requireAdmin, async (req, res) => {
  const payload = req.body || {}
  if (!payload.title) {
    return res.status(400).json({ message: 'title is required' })
  }

  const id = buildId(payload.slug || payload.title, 'path')
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    await conn.query(
      `INSERT INTO career_paths (
        id, slug, title, description, icon, learning_path_level,
        difficulty, estimated_hours, enrolled_count, mastery, color, roadmap_sort_order, certificate_image_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        id,
        id,
        payload.title,
        payload.description || null,
        payload.icon || null,
        payload.learningPathLevel || null,
        payload.difficulty || payload.learningPathLevel || null,
        payload.estimatedHours || 0,
        payload.enrolledCount || 0,
        payload.mastery || 0,
        payload.color || null,
        payload.roadmapSortOrder ?? payload.roadmap_sort_order ?? 0,
        payload.certificateImageData || null,
      ],
    )

    for (let i = 0; i < (payload.modules || []).length; i += 1) {
      const module = payload.modules[i]
      const moduleId = module.id || buildId(module.title, 'mod')
      await conn.query(
        'INSERT INTO career_path_modules (id, career_path_id, phase, title, description, module_image_data, linked_path_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          moduleId,
          id,
          module.phase || null,
          module.title,
          module.description || null,
          module.imageData || null,
          module.linkedPathId || module.linked_path_id || null,
          i,
        ],
      )

      for (let j = 0; j < (module.rooms || []).length; j += 1) {
        await conn.query(
          'INSERT INTO career_path_module_rooms (module_id, room_id, sort_order) VALUES (?, ?, ?)',
          [moduleId, module.rooms[j], j],
        )
      }
    }

    for (let i = 0; i < (payload.resources || []).length; i += 1) {
      const resource = payload.resources[i]
      const resourceId = resource.id || buildId(resource.title, 'res')
      await conn.query(
        'INSERT INTO career_path_resources (id, career_path_id, title, url, type, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [resourceId, id, resource.title, resource.url || null, resource.type || null, i],
      )
    }

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    return res.status(500).json({ message: error.message })
  } finally {
    conn.release()
  }

  const created = await fetchCareerPathById(id)
  return res.status(201).json(created)
})

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const existing = await fetchCareerPathById(req.params.id)
  if (!existing) {
    return res.status(404).json({ message: 'Career path not found' })
  }

  const payload = req.body || {}
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    await conn.query(
      `UPDATE career_paths SET
        title = ?, description = ?, icon = ?, learning_path_level = ?, difficulty = ?,
        estimated_hours = ?, enrolled_count = ?, mastery = ?, color = ?, roadmap_sort_order = ?, certificate_image_data = ?
      WHERE id = ?`,
      [
        payload.title ?? existing.title,
        payload.description ?? existing.description,
        payload.icon ?? existing.icon,
        payload.learningPathLevel ?? existing.learningPathLevel,
        payload.difficulty ?? payload.learningPathLevel ?? existing.difficulty,
        payload.estimatedHours ?? existing.estimatedHours,
        payload.enrolledCount ?? existing.enrolledCount,
        payload.mastery ?? existing.mastery,
        payload.color ?? existing.color,
        payload.roadmapSortOrder ?? payload.roadmap_sort_order ?? existing.roadmapSortOrder ?? 0,
        payload.certificateImageData ?? existing.certificateImageData,
        existing.id,
      ],
    )

    await conn.query(
      'DELETE mrm FROM career_path_module_rooms mrm JOIN career_path_modules m ON mrm.module_id = m.id WHERE m.career_path_id = ?',
      [existing.id],
    )
    await conn.query('DELETE FROM career_path_modules WHERE career_path_id = ?', [existing.id])
    await conn.query('DELETE FROM career_path_resources WHERE career_path_id = ?', [existing.id])

    for (let i = 0; i < (payload.modules || []).length; i += 1) {
      const module = payload.modules[i]
      const moduleId = module.id || buildId(module.title, 'mod')
      await conn.query(
        'INSERT INTO career_path_modules (id, career_path_id, phase, title, description, module_image_data, linked_path_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          moduleId,
          existing.id,
          module.phase || null,
          module.title,
          module.description || null,
          module.imageData || null,
          module.linkedPathId || module.linked_path_id || null,
          i,
        ],
      )
      for (let j = 0; j < (module.rooms || []).length; j += 1) {
        await conn.query(
          'INSERT INTO career_path_module_rooms (module_id, room_id, sort_order) VALUES (?, ?, ?)',
          [moduleId, module.rooms[j], j],
        )
      }
    }

    for (let i = 0; i < (payload.resources || []).length; i += 1) {
      const resource = payload.resources[i]
      const resourceId = resource.id || buildId(resource.title, 'res')
      await conn.query(
        'INSERT INTO career_path_resources (id, career_path_id, title, url, type, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [resourceId, existing.id, resource.title, resource.url || null, resource.type || null, i],
      )
    }

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    return res.status(500).json({ message: error.message })
  } finally {
    conn.release()
  }

  const updated = await fetchCareerPathById(existing.id)
  return res.json(updated)
})

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const existing = await fetchCareerPathById(req.params.id)
  if (!existing) {
    return res.status(404).json({ message: 'Career path not found' })
  }

  await pool.query('DELETE FROM career_paths WHERE id = ?', [existing.id])
  return res.status(204).send()
})

export default router
