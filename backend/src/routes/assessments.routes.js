import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireTrainer } from '../middleware/auth.js'
import { isRole, ROLES } from '../config/roles.js'

const router = Router()

router.use(authenticate)

function parseOptions(value) {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function toMysqlDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ')
}

function canManage(user, assessment) {
  return isRole(user.role, ROLES.ADMIN) || Number(assessment.created_by) === Number(user.id)
}

async function loadAssessment(id) {
  const [rows] = await pool.query('SELECT * FROM assessments WHERE id = ? LIMIT 1', [id])
  return rows[0] || null
}

function assessmentWindow(assessment) {
  const now = Date.now()
  const opensAt = assessment.opens_at ? new Date(assessment.opens_at).getTime() : null
  const deadline = assessment.deadline ? new Date(assessment.deadline).getTime() : null

  return {
    notYetOpen: Boolean(opensAt && now < opensAt),
    closed: Boolean(deadline && now > deadline),
  }
}

/** Subjects available to attach an assessment to. */
router.get('/subjects', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT name FROM room_categories
     UNION SELECT DISTINCT category FROM rooms WHERE category IS NOT NULL AND category <> ''
     ORDER BY name`,
  )
  return res.json(rows.map((row) => row.name).filter(Boolean))
})

/**
 * Listing. Trainers and admins see everything they can manage; trainees see
 * only published assessments, without the answer key.
 */
router.get('/', async (req, res) => {
  const staff = isRole(req.user.role, ROLES.TRAINER, ROLES.ADMIN)
  const params = []
  const filters = []

  if (!staff) {
    filters.push('a.is_published = true')
  } else if (req.query.mine === 'true') {
    filters.push('a.created_by = ?')
    params.push(req.user.id)
  }

  if (req.query.subject) {
    filters.push('a.subject = ?')
    params.push(String(req.query.subject))
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''

  const [rows] = await pool.query(
    `SELECT a.*, u.username AS creator_username, u.first_name AS creator_first_name,
            r.title AS course_title,
            (SELECT COUNT(*) FROM assessment_questions q WHERE q.assessment_id = a.id) AS question_count,
            (SELECT COUNT(*) FROM assessment_attempts t WHERE t.assessment_id = a.id AND t.submitted_at IS NOT NULL) AS attempt_count
     FROM assessments a
     LEFT JOIN users u ON u.id = a.created_by
     LEFT JOIN rooms r ON r.id = a.room_id
     ${where}
     ORDER BY a.deadline IS NULL, a.deadline ASC, a.created_at DESC
     LIMIT 300`,
    params,
  )

  // Attach the caller's own attempt history so the UI can show status.
  const [attempts] = await pool.query(
    `SELECT assessment_id, MAX(percentage) AS best_percentage, COUNT(*) AS attempts,
            MAX(passed) AS passed
     FROM assessment_attempts WHERE user_id = ? AND submitted_at IS NOT NULL
     GROUP BY assessment_id`,
    [req.user.id],
  )
  const attemptsBy = new Map(attempts.map((row) => [Number(row.assessment_id), row]))

  return res.json(
    rows.map((row) => {
      const mine = attemptsBy.get(Number(row.id))
      const window = assessmentWindow(row)
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        subject: row.subject,
        roomId: row.room_id,
        courseTitle: row.course_title,
        kind: row.kind,
        passPercentage: row.pass_percentage,
        durationMinutes: row.duration_minutes,
        maxAttempts: row.max_attempts,
        opensAt: row.opens_at,
        deadline: row.deadline,
        isPublished: Boolean(row.is_published),
        questionCount: Number(row.question_count || 0),
        attemptCount: Number(row.attempt_count || 0),
        createdBy: row.created_by,
        createdByName: row.creator_first_name || row.creator_username,
        canManage: canManage(req.user, row),
        ...window,
        myAttempts: Number(mine?.attempts || 0),
        myBestPercentage: mine ? Number(mine.best_percentage) : null,
        myPassed: Boolean(mine?.passed),
      }
    }),
  )
})

/** Full detail. The correct answers are only included for the owner/admin. */
router.get('/:id', async (req, res) => {
  const assessment = await loadAssessment(req.params.id)
  if (!assessment) return res.status(404).json({ message: 'Assessment not found' })

  const manage = canManage(req.user, assessment)
  if (!assessment.is_published && !manage) {
    return res.status(403).json({ message: 'This assessment is not published yet' })
  }

  const [questions] = await pool.query(
    'SELECT * FROM assessment_questions WHERE assessment_id = ? ORDER BY sort_order, id',
    [assessment.id],
  )

  return res.json({
    id: assessment.id,
    title: assessment.title,
    description: assessment.description,
    subject: assessment.subject,
    roomId: assessment.room_id,
    kind: assessment.kind,
    passPercentage: assessment.pass_percentage,
    durationMinutes: assessment.duration_minutes,
    maxAttempts: assessment.max_attempts,
    opensAt: assessment.opens_at,
    deadline: assessment.deadline,
    isPublished: Boolean(assessment.is_published),
    canManage: manage,
    ...assessmentWindow(assessment),
    questions: questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: parseOptions(question.options_json),
      marks: question.marks,
      sortOrder: question.sort_order,
      ...(manage
        ? { correctIndex: question.correct_index, explanation: question.explanation }
        : {}),
    })),
  })
})

router.post('/', requireTrainer, async (req, res) => {
  const title = String(req.body?.title || '').trim()
  const subject = String(req.body?.subject || '').trim()

  if (!title || !subject) {
    return res.status(400).json({ message: 'Title and subject are required' })
  }

  const [result] = await pool.query(
    `INSERT INTO assessments (
      title, description, subject, room_id, created_by, kind,
      pass_percentage, duration_minutes, max_attempts, opens_at, deadline, is_published
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      req.body?.description || null,
      subject,
      req.body?.roomId || null,
      req.user.id,
      req.body?.kind || 'mcq',
      Number(req.body?.passPercentage ?? 60),
      Number(req.body?.durationMinutes ?? 0),
      Number(req.body?.maxAttempts ?? 0),
      toMysqlDate(req.body?.opensAt),
      toMysqlDate(req.body?.deadline),
      Boolean(req.body?.isPublished),
    ],
  )

  return res.status(201).json({ id: result.insertId })
})

router.put('/:id', requireTrainer, async (req, res) => {
  const assessment = await loadAssessment(req.params.id)
  if (!assessment) return res.status(404).json({ message: 'Assessment not found' })
  if (!canManage(req.user, assessment)) {
    return res.status(403).json({ message: 'You can only edit your own assessments' })
  }

  const fields = {
    title: req.body?.title,
    description: req.body?.description,
    subject: req.body?.subject,
    room_id: req.body?.roomId,
    kind: req.body?.kind,
    pass_percentage: req.body?.passPercentage,
    duration_minutes: req.body?.durationMinutes,
    max_attempts: req.body?.maxAttempts,
    opens_at: req.body?.opensAt !== undefined ? toMysqlDate(req.body.opensAt) : undefined,
    deadline: req.body?.deadline !== undefined ? toMysqlDate(req.body.deadline) : undefined,
    is_published: req.body?.isPublished,
  }

  const updates = Object.entries(fields).filter(([, value]) => value !== undefined)
  if (!updates.length) return res.status(400).json({ message: 'Nothing to update' })

  await pool.query(
    `UPDATE assessments SET ${updates.map(([column]) => `${column} = ?`).join(', ')} WHERE id = ?`,
    [...updates.map(([, value]) => (value === '' ? null : value)), assessment.id],
  )

  return res.json({ updated: true })
})

router.delete('/:id', requireTrainer, async (req, res) => {
  const assessment = await loadAssessment(req.params.id)
  if (!assessment) return res.status(404).json({ message: 'Assessment not found' })
  if (!canManage(req.user, assessment)) {
    return res.status(403).json({ message: 'You can only delete your own assessments' })
  }

  await pool.query('DELETE FROM assessments WHERE id = ?', [assessment.id])
  return res.json({ deleted: true })
})

/** Replaces the whole question set in one call. */
router.put('/:id/questions', requireTrainer, async (req, res) => {
  const assessment = await loadAssessment(req.params.id)
  if (!assessment) return res.status(404).json({ message: 'Assessment not found' })
  if (!canManage(req.user, assessment)) {
    return res.status(403).json({ message: 'You can only edit your own assessments' })
  }

  const questions = Array.isArray(req.body?.questions) ? req.body.questions : []

  for (const [index, question] of questions.entries()) {
    const options = parseOptions(question.options).map((option) => String(option || '').trim())
    if (!String(question.prompt || '').trim()) {
      return res.status(400).json({ message: `Question ${index + 1} needs a prompt` })
    }
    if (options.filter(Boolean).length < 2) {
      return res.status(400).json({ message: `Question ${index + 1} needs at least two options` })
    }
    const correct = Number(question.correctIndex)
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
      return res.status(400).json({ message: `Question ${index + 1} needs a valid correct answer` })
    }
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.query('DELETE FROM assessment_questions WHERE assessment_id = ?', [assessment.id])

    for (const [index, question] of questions.entries()) {
      await connection.query(
        `INSERT INTO assessment_questions
           (assessment_id, prompt, options_json, correct_index, explanation, marks, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          assessment.id,
          String(question.prompt).trim(),
          JSON.stringify(parseOptions(question.options)),
          Number(question.correctIndex),
          question.explanation || null,
          Number(question.marks || 1),
          index,
        ],
      )
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  return res.json({ saved: questions.length })
})

/** Trainee submission. Grading happens server-side against the stored key. */
router.post('/:id/attempts', async (req, res) => {
  const assessment = await loadAssessment(req.params.id)
  if (!assessment) return res.status(404).json({ message: 'Assessment not found' })
  if (!assessment.is_published) {
    return res.status(403).json({ message: 'This assessment is not open' })
  }

  const { notYetOpen, closed } = assessmentWindow(assessment)
  if (notYetOpen) return res.status(403).json({ message: 'This assessment has not opened yet' })
  if (closed) return res.status(403).json({ message: 'The deadline for this assessment has passed' })

  if (assessment.max_attempts > 0) {
    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS count FROM assessment_attempts WHERE assessment_id = ? AND user_id = ? AND submitted_at IS NOT NULL',
      [assessment.id, req.user.id],
    )
    if (Number(countRows[0].count) >= assessment.max_attempts) {
      return res.status(403).json({ message: 'You have used all available attempts' })
    }
  }

  const [questions] = await pool.query(
    'SELECT id, correct_index, explanation, marks FROM assessment_questions WHERE assessment_id = ? ORDER BY sort_order, id',
    [assessment.id],
  )

  if (!questions.length) {
    return res.status(400).json({ message: 'This assessment has no questions yet' })
  }

  const submitted = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {}

  let score = 0
  let maxScore = 0
  const breakdown = questions.map((question) => {
    const marks = Number(question.marks || 1)
    maxScore += marks
    const chosen = Number(submitted[question.id] ?? submitted[String(question.id)] ?? -1)
    const correct = chosen === Number(question.correct_index)
    if (correct) score += marks

    return {
      questionId: question.id,
      chosenIndex: Number.isInteger(chosen) && chosen >= 0 ? chosen : null,
      correctIndex: question.correct_index,
      correct,
      explanation: question.explanation,
    }
  })

  const percentage = maxScore ? Math.round((score / maxScore) * 100) : 0
  const passed = percentage >= Number(assessment.pass_percentage || 0)

  const [result] = await pool.query(
    `INSERT INTO assessment_attempts
       (assessment_id, user_id, score, max_score, percentage, passed, answers_json, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [assessment.id, req.user.id, score, maxScore, percentage, passed, JSON.stringify(breakdown)],
  )

  return res.status(201).json({ attemptId: result.insertId, score, maxScore, percentage, passed, breakdown })
})

/** A trainee's own attempt history. */
router.get('/attempts/me', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.id, t.assessment_id, t.score, t.max_score, t.percentage, t.passed, t.submitted_at,
            a.title, a.subject
     FROM assessment_attempts t
     JOIN assessments a ON a.id = t.assessment_id
     WHERE t.user_id = ? AND t.submitted_at IS NOT NULL
     ORDER BY t.submitted_at DESC LIMIT 200`,
    [req.user.id],
  )
  return res.json(rows)
})

/** Trainer monitoring: who attempted, and how they did. */
router.get('/:id/results', requireTrainer, async (req, res) => {
  const assessment = await loadAssessment(req.params.id)
  if (!assessment) return res.status(404).json({ message: 'Assessment not found' })
  if (!canManage(req.user, assessment)) {
    return res.status(403).json({ message: 'You can only view results for your own assessments' })
  }

  const [rows] = await pool.query(
    `SELECT t.id, t.user_id, t.score, t.max_score, t.percentage, t.passed, t.submitted_at,
            u.username, u.first_name, u.last_name, u.email
     FROM assessment_attempts t
     JOIN users u ON u.id = t.user_id
     WHERE t.assessment_id = ? AND t.submitted_at IS NOT NULL
     ORDER BY t.submitted_at DESC`,
    [assessment.id],
  )

  const attempted = new Set(rows.map((row) => Number(row.user_id)))
  const percentages = rows.map((row) => Number(row.percentage))

  return res.json({
    assessment: { id: assessment.id, title: assessment.title, subject: assessment.subject },
    summary: {
      attempts: rows.length,
      uniqueTrainees: attempted.size,
      passed: rows.filter((row) => row.passed).length,
      averagePercentage: percentages.length
        ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length)
        : 0,
    },
    attempts: rows,
  })
})

export default router
