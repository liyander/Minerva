import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireTrainer } from '../middleware/auth.js'
import { isRole, ROLES } from '../config/roles.js'
import crypto from 'node:crypto'

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

/**
 * Fisher-Yates using crypto randomness. Question order and option order are
 * shuffled per attempt so two trainees rarely see the same paper.
 */
function shuffle(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Builds the question set for one attempt. When the assessment is backed by a
 * question bank a random subset of `draw_count` items is drawn; otherwise its own
 * questions are used. Returns rows in the shape assessment_questions has, plus
 * an `optionOrder` mapping when options were shuffled.
 */
async function buildAttemptPaper(assessment) {
  let rows

  if (assessment.bank_id) {
    const [bankRows] = await pool.query(
      `SELECT id, prompt, options_json, correct_index, explanation, marks
       FROM question_bank_items WHERE bank_id = ? ORDER BY id`,
      [assessment.bank_id],
    )
    rows = bankRows
  } else {
    const [ownRows] = await pool.query(
      `SELECT id, prompt, options_json, correct_index, explanation, marks
       FROM assessment_questions WHERE assessment_id = ? ORDER BY sort_order, id`,
      [assessment.id],
    )
    rows = ownRows
  }

  const drawCount = Number(assessment.draw_count || 0)
  if (assessment.shuffle_questions || (assessment.bank_id && drawCount > 0)) {
    rows = shuffle(rows)
  }
  if (drawCount > 0 && drawCount < rows.length) {
    rows = rows.slice(0, drawCount)
  }

  return rows.map((row) => {
    const options = parseOptions(row.options_json)

    if (!assessment.shuffle_options) {
      return { ...row, options, optionOrder: options.map((_, index) => index) }
    }

    // optionOrder[displayedIndex] = originalIndex, so grading can map back.
    const order = shuffle(options.map((_, index) => index))
    return {
      ...row,
      options: order.map((originalIndex) => options[originalIndex]),
      correctIndex: order.indexOf(Number(row.correct_index)),
      optionOrder: order,
    }
  })
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
            CASE WHEN a.bank_id IS NOT NULL
              THEN (SELECT COUNT(*) FROM question_bank_items q WHERE q.bank_id = a.bank_id)
              ELSE (SELECT COUNT(*) FROM assessment_questions q WHERE q.assessment_id = a.id)
            END AS question_count,
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

  // Owners always see the authored list; trainees get the paper they will sit.
  let questions
  if (manage) {
    const [authored] = await pool.query(
      'SELECT * FROM assessment_questions WHERE assessment_id = ? ORDER BY sort_order, id',
      [assessment.id],
    )
    questions = authored
  } else {
    questions = await buildAttemptPaper(assessment)
  }

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
    bankId: assessment.bank_id,
    drawCount: assessment.draw_count,
    shuffleQuestions: Boolean(assessment.shuffle_questions),
    shuffleOptions: Boolean(assessment.shuffle_options),
    ...assessmentWindow(assessment),
    questions: questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options || parseOptions(question.options_json),
      marks: question.marks,
      sortOrder: question.sort_order,
      ...(question.optionOrder ? { optionOrder: question.optionOrder } : {}),
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
      pass_percentage, duration_minutes, max_attempts, opens_at, deadline, is_published,
      bank_id, draw_count, shuffle_questions, shuffle_options
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      req.body?.bankId || null,
      Number(req.body?.drawCount ?? 0),
      Boolean(req.body?.shuffleQuestions),
      Boolean(req.body?.shuffleOptions),
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
    bank_id: req.body?.bankId,
    draw_count: req.body?.drawCount,
    shuffle_questions: req.body?.shuffleQuestions,
    shuffle_options: req.body?.shuffleOptions,
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

  // The client echoes back the paper it was shown. Only ids are trusted; the
  // answer key is always re-read from the database.
  const paper = Array.isArray(req.body?.paper) ? req.body.paper : null
  const source = assessment.bank_id ? 'question_bank_items' : 'assessment_questions'

  let questions
  if (paper?.length) {
    const ids = paper.map((entry) => Number(entry.questionId)).filter(Number.isFinite)
    if (!ids.length || new Set(ids).size !== ids.length) {
      return res.status(400).json({ message: 'The submitted paper is malformed' })
    }
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM ${source}
       WHERE ${assessment.bank_id ? 'bank_id' : 'assessment_id'} = ?`,
      [assessment.bank_id || assessment.id],
    )
    const availableCount = Number(countRows[0]?.count || 0)
    const expectedCount = assessment.draw_count > 0
      ? Math.min(Number(assessment.draw_count), availableCount)
      : availableCount
    if (ids.length !== expectedCount) {
      return res.status(400).json({ message: 'The submitted paper has the wrong number of questions' })
    }

    const [rows] = await pool.query(
      `SELECT id, prompt, options_json, correct_index, explanation, marks FROM ${source} WHERE id IN (?)`,
      [ids],
    )
    const byId = new Map(rows.map((row) => [Number(row.id), row]))

    questions = paper
      .map((entry) => {
        const row = byId.get(Number(entry.questionId))
        if (!row) return null
        // Map the displayed option index back to the stored one.
        const order = Array.isArray(entry.optionOrder) ? entry.optionOrder.map(Number) : null
        const optionCount = parseOptions(row.options_json).length
        const validOrder = order
          && order.length === optionCount
          && new Set(order).size === optionCount
          && order.every((value) => Number.isInteger(value) && value >= 0 && value < optionCount)
        if (!validOrder) return null
        return {
          ...row,
          displayCorrectIndex: order.indexOf(Number(row.correct_index)),
        }
      })
      .filter(Boolean)
    if (questions.length !== ids.length) {
      return res.status(400).json({ message: 'The submitted paper contains an invalid question' })
    }
  } else {
    const [rows] = await pool.query(
      `SELECT id, prompt, options_json, correct_index, explanation, marks FROM ${source}
       WHERE ${assessment.bank_id ? 'bank_id' : 'assessment_id'} = ?
       ORDER BY id`,
      [assessment.bank_id || assessment.id],
    )
    questions = rows.map((row) => ({ ...row, displayCorrectIndex: Number(row.correct_index) }))
  }

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
    const correct = chosen === Number(question.displayCorrectIndex)
    if (correct) score += marks

    return {
      questionId: question.id,
      chosenIndex: Number.isInteger(chosen) && chosen >= 0 ? chosen : null,
      correctIndex: question.displayCorrectIndex,
      correct,
      explanation: question.explanation,
    }
  })

  const percentage = maxScore ? Math.round((score / maxScore) * 100) : 0
  const passed = percentage >= Number(assessment.pass_percentage || 0)
  const paperSnapshot = questions.map((question) => {
    const submittedPaper = paper?.find((entry) => Number(entry.questionId) === Number(question.id))
    const storedOptions = parseOptions(question.options_json)
    const optionOrder = submittedPaper?.optionOrder || storedOptions.map((_, index) => index)
    return {
      questionId: question.id,
      prompt: question.prompt,
      options: optionOrder.map((originalIndex) => storedOptions[originalIndex]),
      optionOrder,
    }
  })

  const [result] = await pool.query(
    `INSERT INTO assessment_attempts
       (assessment_id, user_id, score, max_score, percentage, passed, answers_json,
        question_order_json, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      assessment.id,
      req.user.id,
      score,
      maxScore,
      percentage,
      passed,
      JSON.stringify(breakdown),
      JSON.stringify(paperSnapshot),
    ],
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
            t.answers_json, t.question_order_json,
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
    attempts: rows.map((row) => ({
      ...row,
      answers: (() => { try { return JSON.parse(row.answers_json || '[]') } catch { return [] } })(),
      paper: (() => { try { return JSON.parse(row.question_order_json || '[]') } catch { return [] } })(),
      answers_json: undefined,
      question_order_json: undefined,
    })),
  })
})

export default router
