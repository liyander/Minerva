import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireTrainer } from '../middleware/auth.js'
import { isRole, ROLES } from '../config/roles.js'
import { recordAudit } from '../services/audit.js'

const router = Router()

router.use(authenticate, requireTrainer)

const DIFFICULTIES = ['easy', 'medium', 'hard']

function parseOptions(value) {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function loadBank(id) {
  const [rows] = await pool.query('SELECT * FROM question_banks WHERE id = ? LIMIT 1', [id])
  return rows[0] || null
}

function canManage(user, bank) {
  return isRole(user.role, ROLES.ADMIN) || Number(bank.owner_id) === Number(user.id)
}

router.get('/', async (req, res) => {
  const filters = ['(b.is_shared = true OR b.owner_id = ?)']
  const params = [req.user.id]

  if (req.query.subject) {
    filters.push('b.subject = ?')
    params.push(String(req.query.subject))
  }
  if (req.query.mine === 'true') {
    filters.push('b.owner_id = ?')
    params.push(req.user.id)
  }

  const [rows] = await pool.query(
    `SELECT b.*, u.username AS owner_username, u.first_name AS owner_first_name,
            (SELECT COUNT(*) FROM question_bank_items i WHERE i.bank_id = b.id) AS item_count,
            (SELECT COUNT(*) FROM assessments a WHERE a.bank_id = b.id) AS used_by
     FROM question_banks b
     LEFT JOIN users u ON u.id = b.owner_id
     WHERE ${filters.join(' AND ')}
     ORDER BY b.updated_at DESC LIMIT 200`,
    params,
  )

  return res.json(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      subject: row.subject,
      isShared: Boolean(row.is_shared),
      ownerId: row.owner_id,
      ownerName: row.owner_first_name || row.owner_username,
      itemCount: Number(row.item_count || 0),
      usedBy: Number(row.used_by || 0),
      canManage: canManage(req.user, row),
      updatedAt: row.updated_at,
    })),
  )
})

router.get('/:id', async (req, res) => {
  const bank = await loadBank(req.params.id)
  if (!bank) return res.status(404).json({ message: 'Question bank not found' })
  if (!bank.is_shared && !canManage(req.user, bank)) {
    return res.status(403).json({ message: 'That bank is private' })
  }

  const [items] = await pool.query(
    'SELECT * FROM question_bank_items WHERE bank_id = ? ORDER BY id',
    [bank.id],
  )

  return res.json({
    id: bank.id,
    title: bank.title,
    description: bank.description,
    subject: bank.subject,
    isShared: Boolean(bank.is_shared),
    canManage: canManage(req.user, bank),
    items: items.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      options: parseOptions(item.options_json),
      correctIndex: item.correct_index,
      explanation: item.explanation,
      marks: item.marks,
      difficulty: item.difficulty,
      tags: item.tags,
    })),
  })
})

router.post('/', async (req, res) => {
  const title = String(req.body?.title || '').trim()
  const subject = String(req.body?.subject || '').trim()
  if (!title || !subject) {
    return res.status(400).json({ message: 'Title and subject are required' })
  }

  const [result] = await pool.query(
    'INSERT INTO question_banks (title, description, subject, owner_id, is_shared) VALUES (?, ?, ?, ?, ?)',
    [
      title,
      req.body?.description || null,
      subject,
      req.user.id,
      req.body?.isShared === false ? false : true,
    ],
  )

  return res.status(201).json({ id: result.insertId })
})

router.put('/:id', async (req, res) => {
  const bank = await loadBank(req.params.id)
  if (!bank) return res.status(404).json({ message: 'Question bank not found' })
  if (!canManage(req.user, bank)) {
    return res.status(403).json({ message: 'You can only edit your own banks' })
  }

  const fields = {
    title: req.body?.title,
    description: req.body?.description,
    subject: req.body?.subject,
    is_shared: req.body?.isShared,
  }
  const updates = Object.entries(fields).filter(([, value]) => value !== undefined)
  if (!updates.length) return res.status(400).json({ message: 'Nothing to update' })

  await pool.query(
    `UPDATE question_banks SET ${updates.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...updates.map(([, value]) => value), bank.id],
  )

  return res.json({ updated: true })
})

router.delete('/:id', async (req, res) => {
  const bank = await loadBank(req.params.id)
  if (!bank) return res.status(404).json({ message: 'Question bank not found' })
  if (!canManage(req.user, bank)) {
    return res.status(403).json({ message: 'You can only delete your own banks' })
  }

  await pool.query('DELETE FROM question_banks WHERE id = ?', [bank.id])
  await recordAudit(req, {
    action: 'questionBank.deleted',
    entityType: 'questionBank',
    entityId: bank.id,
    summary: `Deleted question bank "${bank.title}"`,
  })

  return res.json({ deleted: true })
})

/** Replaces every item in the bank. */
router.put('/:id/items', async (req, res) => {
  const bank = await loadBank(req.params.id)
  if (!bank) return res.status(404).json({ message: 'Question bank not found' })
  if (!canManage(req.user, bank)) {
    return res.status(403).json({ message: 'You can only edit your own banks' })
  }

  const items = Array.isArray(req.body?.items) ? req.body.items : []

  for (const [index, item] of items.entries()) {
    const options = parseOptions(item.options).map((option) => String(option || '').trim())
    if (!String(item.prompt || '').trim()) {
      return res.status(400).json({ message: `Question ${index + 1} needs a prompt` })
    }
    if (options.filter(Boolean).length < 2) {
      return res.status(400).json({ message: `Question ${index + 1} needs at least two options` })
    }
    const correct = Number(item.correctIndex)
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
      return res.status(400).json({ message: `Question ${index + 1} needs a valid correct answer` })
    }
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.query('DELETE FROM question_bank_items WHERE bank_id = ?', [bank.id])

    for (const item of items) {
      await connection.query(
        `INSERT INTO question_bank_items
           (bank_id, prompt, options_json, correct_index, explanation, marks, difficulty, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          bank.id,
          String(item.prompt).trim(),
          JSON.stringify(parseOptions(item.options)),
          Number(item.correctIndex),
          item.explanation || null,
          Number(item.marks || 1),
          DIFFICULTIES.includes(item.difficulty) ? item.difficulty : 'medium',
          item.tags || null,
        ],
      )
    }

    await connection.query('UPDATE question_banks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      bank.id,
    ])
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  return res.json({ saved: items.length })
})

/** Copies the whole bank into an assessment's own question list. */
router.post('/:id/copy-to-assessment/:assessmentId', async (req, res) => {
  const bank = await loadBank(req.params.id)
  if (!bank) return res.status(404).json({ message: 'Question bank not found' })

  const [assessmentRows] = await pool.query(
    'SELECT id, created_by, title FROM assessments WHERE id = ? LIMIT 1',
    [req.params.assessmentId],
  )
  if (!assessmentRows.length) return res.status(404).json({ message: 'Assessment not found' })

  const assessment = assessmentRows[0]
  if (!isRole(req.user.role, ROLES.ADMIN) && Number(assessment.created_by) !== Number(req.user.id)) {
    return res.status(403).json({ message: 'You can only edit your own assessments' })
  }

  const [items] = await pool.query(
    'SELECT prompt, options_json, correct_index, explanation, marks FROM question_bank_items WHERE bank_id = ? ORDER BY id',
    [bank.id],
  )

  const [existing] = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) AS last FROM assessment_questions WHERE assessment_id = ?',
    [assessment.id],
  )
  let sortOrder = Number(existing[0].last) + 1

  for (const item of items) {
    await pool.query(
      `INSERT INTO assessment_questions
         (assessment_id, prompt, options_json, correct_index, explanation, marks, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        assessment.id,
        item.prompt,
        item.options_json,
        item.correct_index,
        item.explanation,
        item.marks,
        sortOrder,
      ],
    )
    sortOrder += 1
  }

  return res.json({ copied: items.length })
})

export default router
