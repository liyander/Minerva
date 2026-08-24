import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireTrainer } from '../middleware/auth.js'
import { isRole, ROLES } from '../config/roles.js'
import { putDataUrl } from '../services/storage.js'
import { sendMail } from '../services/mailer.js'
import { recordAudit } from '../services/audit.js'

const router = Router()

router.use(authenticate)

const SUBMISSION_KINDS = ['file', 'text', 'link', 'any']

function toMysqlDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ')
}

function canManage(user, assignment) {
  return isRole(user.role, ROLES.ADMIN) || Number(assignment.created_by) === Number(user.id)
}

async function loadAssignment(id) {
  const [rows] = await pool.query('SELECT * FROM assignments WHERE id = ? LIMIT 1', [id])
  return rows[0] || null
}

async function loadRubric(assignmentId) {
  const [rows] = await pool.query(
    'SELECT * FROM assignment_rubric_criteria WHERE assignment_id = ? ORDER BY sort_order, id',
    [assignmentId],
  )
  return rows
}

function windowFor(assignment) {
  const now = Date.now()
  const opensAt = assignment.opens_at ? new Date(assignment.opens_at).getTime() : null
  const deadline = assignment.deadline ? new Date(assignment.deadline).getTime() : null

  return {
    notYetOpen: Boolean(opensAt && now < opensAt),
    pastDeadline: Boolean(deadline && now > deadline),
  }
}

/** Listing. Trainees see published assignments plus their own submission state. */
router.get('/', async (req, res) => {
  const staff = isRole(req.user.role, ROLES.TRAINER, ROLES.ADMIN)
  const filters = []
  const params = []

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
            (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) AS submission_count,
            (SELECT COUNT(*) FROM assignment_submissions s
              WHERE s.assignment_id = a.id AND s.status = 'submitted') AS pending_count
     FROM assignments a
     LEFT JOIN users u ON u.id = a.created_by
     LEFT JOIN rooms r ON r.id = a.room_id
     ${where}
     ORDER BY a.deadline IS NULL, a.deadline ASC, a.created_at DESC
     LIMIT 300`,
    params,
  )

  const [mine] = await pool.query(
    'SELECT assignment_id, status, score, passed, is_late, submitted_at FROM assignment_submissions WHERE user_id = ?',
    [req.user.id],
  )
  const mineBy = new Map(mine.map((row) => [Number(row.assignment_id), row]))

  return res.json(
    rows.map((row) => {
      const submission = mineBy.get(Number(row.id))
      return {
        id: row.id,
        title: row.title,
        brief: row.brief,
        subject: row.subject,
        roomId: row.room_id,
        courseTitle: row.course_title,
        submissionKind: row.submission_kind,
        maxScore: row.max_score,
        passScore: row.pass_score,
        allowResubmission: Boolean(row.allow_resubmission),
        opensAt: row.opens_at,
        deadline: row.deadline,
        lateSubmission: Boolean(row.late_submission),
        isPublished: Boolean(row.is_published),
        attachmentFileId: row.attachment_file_id,
        createdBy: row.created_by,
        createdByName: row.creator_first_name || row.creator_username,
        canManage: canManage(req.user, row),
        submissionCount: Number(row.submission_count || 0),
        pendingCount: Number(row.pending_count || 0),
        ...windowFor(row),
        mySubmission: submission
          ? {
              status: submission.status,
              score: submission.score,
              passed: submission.passed === null ? null : Boolean(submission.passed),
              isLate: Boolean(submission.is_late),
              submittedAt: submission.submitted_at,
            }
          : null,
      }
    }),
  )
})

router.get('/:id', async (req, res) => {
  const assignment = await loadAssignment(req.params.id)
  if (!assignment) return res.status(404).json({ message: 'Assignment not found' })

  const manage = canManage(req.user, assignment)
  if (!assignment.is_published && !manage) {
    return res.status(403).json({ message: 'This assignment is not published yet' })
  }

  const rubric = await loadRubric(assignment.id)

  const [submissionRows] = await pool.query(
    'SELECT * FROM assignment_submissions WHERE assignment_id = ? AND user_id = ? LIMIT 1',
    [assignment.id, req.user.id],
  )

  let rubricScores = []
  if (submissionRows.length) {
    const [scoreRows] = await pool.query(
      'SELECT criterion_id, points, comment FROM assignment_rubric_scores WHERE submission_id = ?',
      [submissionRows[0].id],
    )
    rubricScores = scoreRows
  }

  return res.json({
    id: assignment.id,
    title: assignment.title,
    brief: assignment.brief,
    subject: assignment.subject,
    roomId: assignment.room_id,
    submissionKind: assignment.submission_kind,
    maxScore: assignment.max_score,
    passScore: assignment.pass_score,
    allowResubmission: Boolean(assignment.allow_resubmission),
    opensAt: assignment.opens_at,
    deadline: assignment.deadline,
    lateSubmission: Boolean(assignment.late_submission),
    isPublished: Boolean(assignment.is_published),
    attachmentFileId: assignment.attachment_file_id,
    canManage: manage,
    ...windowFor(assignment),
    rubric: rubric.map((row) => ({
      id: row.id,
      label: row.label,
      description: row.description,
      maxPoints: row.max_points,
    })),
    mySubmission: submissionRows.length
      ? {
          id: submissionRows[0].id,
          bodyText: submissionRows[0].body_text,
          linkUrl: submissionRows[0].link_url,
          fileId: submissionRows[0].file_id,
          status: submissionRows[0].status,
          isLate: Boolean(submissionRows[0].is_late),
          score: submissionRows[0].score,
          passed: submissionRows[0].passed === null ? null : Boolean(submissionRows[0].passed),
          feedback: submissionRows[0].feedback,
          gradedAt: submissionRows[0].graded_at,
          submittedAt: submissionRows[0].submitted_at,
          rubricScores,
        }
      : null,
  })
})

router.post('/', requireTrainer, async (req, res) => {
  const title = String(req.body?.title || '').trim()
  const subject = String(req.body?.subject || '').trim()

  if (!title || !subject) {
    return res.status(400).json({ message: 'Title and subject are required' })
  }

  const kind = SUBMISSION_KINDS.includes(req.body?.submissionKind)
    ? req.body.submissionKind
    : 'file'

  let attachmentFileId = null
  if (req.body?.attachmentDataUrl) {
    const stored = await putDataUrl({
      dataUrl: req.body.attachmentDataUrl,
      fileName: req.body?.attachmentFileName || 'brief',
      ownerId: req.user.id,
      purpose: 'assignment-brief',
    })
    attachmentFileId = stored.id
  }

  const [result] = await pool.query(
    `INSERT INTO assignments
       (title, brief, subject, room_id, created_by, submission_kind, max_score, pass_score,
        allow_resubmission, opens_at, deadline, late_submission, is_published, attachment_file_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      req.body?.brief || null,
      subject,
      req.body?.roomId || null,
      req.user.id,
      kind,
      Number(req.body?.maxScore ?? 100),
      Number(req.body?.passScore ?? 50),
      req.body?.allowResubmission === false ? false : true,
      toMysqlDate(req.body?.opensAt),
      toMysqlDate(req.body?.deadline),
      Boolean(req.body?.lateSubmission),
      Boolean(req.body?.isPublished),
      attachmentFileId,
    ],
  )

  await recordAudit(req, {
    action: 'assignment.created',
    entityType: 'assignment',
    entityId: result.insertId,
    summary: `Created assignment "${title}"`,
  })

  return res.status(201).json({ id: result.insertId })
})

router.put('/:id', requireTrainer, async (req, res) => {
  const assignment = await loadAssignment(req.params.id)
  if (!assignment) return res.status(404).json({ message: 'Assignment not found' })
  if (!canManage(req.user, assignment)) {
    return res.status(403).json({ message: 'You can only edit your own assignments' })
  }

  const fields = {
    title: req.body?.title,
    brief: req.body?.brief,
    subject: req.body?.subject,
    room_id: req.body?.roomId,
    submission_kind: SUBMISSION_KINDS.includes(req.body?.submissionKind)
      ? req.body.submissionKind
      : undefined,
    max_score: req.body?.maxScore,
    pass_score: req.body?.passScore,
    allow_resubmission: req.body?.allowResubmission,
    opens_at: req.body?.opensAt !== undefined ? toMysqlDate(req.body.opensAt) : undefined,
    deadline: req.body?.deadline !== undefined ? toMysqlDate(req.body.deadline) : undefined,
    late_submission: req.body?.lateSubmission,
    is_published: req.body?.isPublished,
  }

  const updates = Object.entries(fields).filter(([, value]) => value !== undefined)
  if (!updates.length) return res.status(400).json({ message: 'Nothing to update' })

  await pool.query(
    `UPDATE assignments SET ${updates.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...updates.map(([, value]) => (value === '' ? null : value)), assignment.id],
  )

  return res.json({ updated: true })
})

router.delete('/:id', requireTrainer, async (req, res) => {
  const assignment = await loadAssignment(req.params.id)
  if (!assignment) return res.status(404).json({ message: 'Assignment not found' })
  if (!canManage(req.user, assignment)) {
    return res.status(403).json({ message: 'You can only delete your own assignments' })
  }

  await pool.query('DELETE FROM assignments WHERE id = ?', [assignment.id])
  await recordAudit(req, {
    action: 'assignment.deleted',
    entityType: 'assignment',
    entityId: assignment.id,
    summary: `Deleted assignment "${assignment.title}"`,
  })

  return res.json({ deleted: true })
})

/** Replaces the rubric in one call. */
router.put('/:id/rubric', requireTrainer, async (req, res) => {
  const assignment = await loadAssignment(req.params.id)
  if (!assignment) return res.status(404).json({ message: 'Assignment not found' })
  if (!canManage(req.user, assignment)) {
    return res.status(403).json({ message: 'You can only edit your own assignments' })
  }

  const criteria = Array.isArray(req.body?.criteria) ? req.body.criteria : []
  for (const [index, criterion] of criteria.entries()) {
    if (!String(criterion.label || '').trim()) {
      return res.status(400).json({ message: `Criterion ${index + 1} needs a label` })
    }
    if (!Number.isFinite(Number(criterion.maxPoints)) || Number(criterion.maxPoints) <= 0) {
      return res.status(400).json({ message: `Criterion ${index + 1} needs positive points` })
    }
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.query('DELETE FROM assignment_rubric_criteria WHERE assignment_id = ?', [
      assignment.id,
    ])

    for (const [index, criterion] of criteria.entries()) {
      await connection.query(
        `INSERT INTO assignment_rubric_criteria (assignment_id, label, description, max_points, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [
          assignment.id,
          String(criterion.label).trim(),
          criterion.description || null,
          Number(criterion.maxPoints),
          index,
        ],
      )
    }

    // Keep the headline max score consistent with the rubric total.
    const total = criteria.reduce((sum, criterion) => sum + Number(criterion.maxPoints), 0)
    if (total > 0) {
      await connection.query('UPDATE assignments SET max_score = ? WHERE id = ?', [
        total,
        assignment.id,
      ])
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  return res.json({ saved: criteria.length })
})

/** Trainee submission. One row per trainee, updated on resubmission. */
router.post('/:id/submissions', async (req, res) => {
  const assignment = await loadAssignment(req.params.id)
  if (!assignment) return res.status(404).json({ message: 'Assignment not found' })
  if (!assignment.is_published) {
    return res.status(403).json({ message: 'This assignment is not open' })
  }

  const { notYetOpen, pastDeadline } = windowFor(assignment)
  if (notYetOpen) return res.status(403).json({ message: 'This assignment has not opened yet' })
  if (pastDeadline && !assignment.late_submission) {
    return res.status(403).json({ message: 'The deadline has passed' })
  }

  const [existing] = await pool.query(
    'SELECT id, status, attempt_number FROM assignment_submissions WHERE assignment_id = ? AND user_id = ? LIMIT 1',
    [assignment.id, req.user.id],
  )

  if (existing.length && existing[0].status === 'graded' && !assignment.allow_resubmission) {
    return res.status(403).json({ message: 'Your submission has been marked and cannot be replaced' })
  }

  const kind = assignment.submission_kind
  const bodyText = req.body?.bodyText ? String(req.body.bodyText) : null
  const linkUrl = req.body?.linkUrl ? String(req.body.linkUrl) : null

  let fileId = req.body?.fileId || null
  if (req.body?.fileDataUrl) {
    const stored = await putDataUrl({
      dataUrl: req.body.fileDataUrl,
      fileName: req.body?.fileName || 'submission',
      ownerId: req.user.id,
      purpose: 'submission',
    })
    fileId = stored.id
  }

  if (kind === 'file' && !fileId) {
    return res.status(400).json({ message: 'Attach a file to submit' })
  }
  if (kind === 'text' && !bodyText) {
    return res.status(400).json({ message: 'Write your answer to submit' })
  }
  if (kind === 'link' && !linkUrl) {
    return res.status(400).json({ message: 'Provide a link to submit' })
  }
  if (kind === 'any' && !fileId && !bodyText && !linkUrl) {
    return res.status(400).json({ message: 'Provide a file, some text or a link' })
  }

  const attemptNumber = existing.length ? Number(existing[0].attempt_number) + 1 : 1

  await pool.query(
    `INSERT INTO assignment_submissions
       (assignment_id, user_id, body_text, link_url, file_id, status, is_late, attempt_number, submitted_at)
     VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       body_text = VALUES(body_text),
       link_url = VALUES(link_url),
       file_id = VALUES(file_id),
       status = 'submitted',
       is_late = VALUES(is_late),
       attempt_number = VALUES(attempt_number),
       submitted_at = CURRENT_TIMESTAMP,
       score = NULL,
       passed = NULL,
       feedback = NULL,
       graded_by = NULL,
       graded_at = NULL`,
    [assignment.id, req.user.id, bodyText, linkUrl, fileId, pastDeadline, attemptNumber],
  )

  return res.status(201).json({ submitted: true, isLate: pastDeadline, attemptNumber })
})

/** The trainer's grading queue for one assignment. */
router.get('/:id/submissions', requireTrainer, async (req, res) => {
  const assignment = await loadAssignment(req.params.id)
  if (!assignment) return res.status(404).json({ message: 'Assignment not found' })
  if (!canManage(req.user, assignment)) {
    return res.status(403).json({ message: 'You can only view your own assignments' })
  }

  const [rows] = await pool.query(
    `SELECT s.*, u.username, u.first_name, u.last_name, u.email,
            f.file_name, f.content_type, f.byte_size
     FROM assignment_submissions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN file_objects f ON f.id = s.file_id
     WHERE s.assignment_id = ?
     ORDER BY FIELD(s.status, 'submitted', 'graded'), s.submitted_at ASC`,
    [assignment.id],
  )

  const [scoreRows] = await pool.query(
    `SELECT rs.submission_id, rs.criterion_id, rs.points, rs.comment
     FROM assignment_rubric_scores rs
     JOIN assignment_submissions s ON s.id = rs.submission_id
     WHERE s.assignment_id = ?`,
    [assignment.id],
  )

  const scoresBySubmission = new Map()
  for (const row of scoreRows) {
    const list = scoresBySubmission.get(Number(row.submission_id)) || []
    list.push({ criterionId: row.criterion_id, points: row.points, comment: row.comment })
    scoresBySubmission.set(Number(row.submission_id), list)
  }

  const graded = rows.filter((row) => row.status === 'graded')
  const scores = graded.map((row) => Number(row.score || 0))

  return res.json({
    assignment: {
      id: assignment.id,
      title: assignment.title,
      subject: assignment.subject,
      maxScore: assignment.max_score,
      passScore: assignment.pass_score,
    },
    rubric: (await loadRubric(assignment.id)).map((row) => ({
      id: row.id,
      label: row.label,
      description: row.description,
      maxPoints: row.max_points,
    })),
    summary: {
      submissions: rows.length,
      awaiting: rows.length - graded.length,
      graded: graded.length,
      passed: graded.filter((row) => row.passed).length,
      averageScore: scores.length
        ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
        : 0,
    },
    submissions: rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username,
      email: row.email,
      bodyText: row.body_text,
      linkUrl: row.link_url,
      fileId: row.file_id,
      fileName: row.file_name,
      fileSize: row.byte_size,
      status: row.status,
      isLate: Boolean(row.is_late),
      attemptNumber: row.attempt_number,
      submittedAt: row.submitted_at,
      score: row.score,
      passed: row.passed === null ? null : Boolean(row.passed),
      feedback: row.feedback,
      gradedAt: row.graded_at,
      rubricScores: scoresBySubmission.get(Number(row.id)) || [],
    })),
  })
})

/**
 * Records a grade. When rubric scores are supplied the total is derived from
 * them, so the headline score and the rubric can never disagree.
 */
router.put('/submissions/:submissionId/grade', requireTrainer, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.*, a.created_by, a.max_score, a.pass_score, a.title,
            u.email, u.first_name, u.username
     FROM assignment_submissions s
     JOIN assignments a ON a.id = s.assignment_id
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? LIMIT 1`,
    [req.params.submissionId],
  )

  if (!rows.length) return res.status(404).json({ message: 'Submission not found' })
  const submission = rows[0]

  if (!isRole(req.user.role, ROLES.ADMIN) && Number(submission.created_by) !== Number(req.user.id)) {
    return res.status(403).json({ message: 'You can only grade your own assignments' })
  }

  const rubricScores = Array.isArray(req.body?.rubricScores) ? req.body.rubricScores : []
  let score = Number(req.body?.score)

  if (rubricScores.length) {
    const criteria = await loadRubric(submission.assignment_id)
    const maxByCriterion = new Map(criteria.map((row) => [Number(row.id), Number(row.max_points)]))

    let total = 0
    for (const entry of rubricScores) {
      const max = maxByCriterion.get(Number(entry.criterionId))
      if (max === undefined) {
        return res.status(400).json({ message: 'A rubric criterion does not belong to this assignment' })
      }
      const points = Number(entry.points)
      if (!Number.isFinite(points) || points < 0 || points > max) {
        return res.status(400).json({ message: `Points must be between 0 and ${max}` })
      }
      total += points
    }
    score = total
  }

  if (!Number.isFinite(score) || score < 0 || score > Number(submission.max_score)) {
    return res
      .status(400)
      .json({ message: `Score must be between 0 and ${submission.max_score}` })
  }

  const passed = score >= Number(submission.pass_score)

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    await connection.query(
      `UPDATE assignment_submissions
       SET score = ?, passed = ?, feedback = ?, status = 'graded',
           graded_by = ?, graded_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [score, passed, req.body?.feedback || null, req.user.id, submission.id],
    )

    if (rubricScores.length) {
      await connection.query('DELETE FROM assignment_rubric_scores WHERE submission_id = ?', [
        submission.id,
      ])
      for (const entry of rubricScores) {
        await connection.query(
          `INSERT INTO assignment_rubric_scores (submission_id, criterion_id, points, comment)
           VALUES (?, ?, ?, ?)`,
          [submission.id, entry.criterionId, Number(entry.points), entry.comment || null],
        )
      }
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  await recordAudit(req, {
    action: 'assignment.graded',
    entityType: 'submission',
    entityId: submission.id,
    summary: `Graded ${submission.username} on "${submission.title}": ${score}/${submission.max_score}`,
    metadata: { score, passed },
  })

  void sendMail({
    to: submission.email,
    template: 'gradeReleased',
    data: {
      name: submission.first_name || submission.username,
      assignmentTitle: submission.title,
      score,
      maxScore: submission.max_score,
      passed,
    },
    dedupeKey: `grade:${submission.id}:${submission.attempt_number}`,
  })

  return res.json({ graded: true, score, passed })
})

/** A trainee's own submissions across all assignments. */
router.get('/submissions/me', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.assignment_id, s.status, s.score, s.passed, s.is_late, s.submitted_at,
            s.graded_at, a.title, a.subject, a.max_score
     FROM assignment_submissions s
     JOIN assignments a ON a.id = s.assignment_id
     WHERE s.user_id = ?
     ORDER BY s.submitted_at DESC LIMIT 200`,
    [req.user.id],
  )

  return res.json(rows)
})

export default router
