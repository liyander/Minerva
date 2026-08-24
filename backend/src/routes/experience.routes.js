import crypto from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, optionalAuthenticate, requireTrainer } from '../middleware/auth.js'
import { recordAudit } from '../services/audit.js'

const router = Router()
const json = (value, fallback = []) => {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return fallback }
}
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const nameOf = (row) => [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username

async function canManageEvent(req, eventId) {
  const [rows] = await pool.query('SELECT trainer_id,created_by FROM calendar_events WHERE id=? LIMIT 1', [eventId])
  if (!rows.length) return { status: 404, message: 'Event not found' }
  if (req.user.role !== 'admin' && ![rows[0].trainer_id, rows[0].created_by].includes(req.user.id)) {
    return { status: 403, message: 'You can only manage your own events' }
  }
  return null
}

router.get('/public/:token', optionalAuthenticate, async (req, res) => {
  const [shares] = await pool.query(
    `SELECT * FROM public_profile_shares
     WHERE token_hash = ? AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
    [hash(req.params.token)],
  )
  if (!shares.length) return res.status(404).json({ message: 'Share link is invalid or expired' })
  const share = shares[0]
  const [users] = await pool.query('SELECT username, first_name, last_name, headline FROM users WHERE id = ?', [share.user_id])
  const user = users[0]
  if (!user) return res.status(404).json({ message: 'Profile not found' })

  if (share.share_type === 'transcript') {
    return res.json({
      type: 'transcript',
      verified: true,
      verifiedAt: share.created_at,
      person: { name: nameOf(user), headline: user.headline },
      report: await gradeReport(share.user_id),
    })
  }

  if (share.share_type === 'portfolio') {
    const [items] = await pool.query(
      `SELECT id, title, description, evidence_url, skills_json, reflection, created_at
       FROM portfolio_items WHERE user_id = ? AND is_approved = true AND privacy = 'public'
       ORDER BY created_at DESC`,
      [share.user_id],
    )
    return res.json({ type: 'portfolio', person: { name: nameOf(user), headline: user.headline }, items: items.map((item) => ({ ...item, skills: json(item.skills_json) })) })
  }

  const [evidence] = await pool.query(
    `SELECT skill, proficiency, evidence_type, evidence_label, evidence_url,
            demonstrated_at, expires_at, verified_by IS NOT NULL AS verified
     FROM skill_evidence WHERE user_id = ? ORDER BY skill, verified DESC`,
    [share.user_id],
  )
  return res.json({ type: 'passport', person: { name: nameOf(user), headline: user.headline }, skills: evidence.map((row) => ({ ...row, verified: Boolean(row.verified) })) })
})

router.use(authenticate)

function eventScope(req) {
  if (req.user.role === 'admin') return { sql: '1=1', params: [] }
  if (req.user.role === 'trainer') return { sql: '(e.trainer_id = ? OR e.created_by = ?)', params: [req.user.id, req.user.id] }
  return {
    sql: `e.is_published = true AND (e.cohort_id IS NULL OR EXISTS (
      SELECT 1 FROM cohort_members audience WHERE audience.cohort_id = e.cohort_id AND audience.user_id = ?
    ))`,
    params: [req.user.id],
  }
}

router.get('/events', async (req, res) => {
  const scope = eventScope(req)
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const to = req.query.to || new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10)
  const [rows] = await pool.query(
    `SELECT e.*, c.name AS cohort_name, u.first_name, u.last_name, u.username,
            content.recording_file_id, content.transcript, content.materials_json, content.follow_up_json,
            attendance.status AS my_attendance, attendance.joined_at, attendance.left_at,
            leave_request.status AS leave_status
     FROM calendar_events e
     LEFT JOIN cohorts c ON c.id = e.cohort_id
     LEFT JOIN users u ON u.id = e.trainer_id
     LEFT JOIN live_session_content content ON content.event_id = e.id
     LEFT JOIN attendance_records attendance ON attendance.event_id = e.id AND attendance.user_id = ?
     LEFT JOIN leave_requests leave_request ON leave_request.event_id = e.id AND leave_request.user_id = ?
     WHERE ${scope.sql} AND e.starts_at >= ? AND e.starts_at < DATE_ADD(?, INTERVAL 1 DAY)
     ORDER BY e.starts_at`,
    [req.user.id, req.user.id, ...scope.params, from, to],
  )
  res.json(rows.map((row) => ({
    id: row.id, title: row.title, description: row.description, type: row.event_type,
    startsAt: row.starts_at, endsAt: row.ends_at, trainerId: row.trainer_id,
    trainerName: nameOf(row), cohortId: row.cohort_id, cohortName: row.cohort_name,
    roomId: row.room_id, moduleId: row.module_id, assessmentId: row.assessment_id,
    meetingUrl: row.meeting_url, capacity: row.capacity, shortageThreshold: Number(row.shortage_threshold || 75),
    isPublished: Boolean(row.is_published), recordingFileId: row.recording_file_id,
    transcript: row.transcript, materials: json(row.materials_json), followUp: json(row.follow_up_json),
    myAttendance: row.my_attendance, joinedAt: row.joined_at, leftAt: row.left_at, leaveStatus: row.leave_status,
  })))
})

router.post('/events', requireTrainer, async (req, res) => {
  const title = String(req.body?.title || '').trim()
  const startsAt = req.body?.startsAt
  const endsAt = req.body?.endsAt
  if (!title || !startsAt || !endsAt) return res.status(400).json({ message: 'Title, start and end are required' })
  if (new Date(endsAt) <= new Date(startsAt)) return res.status(400).json({ message: 'End must be after start' })
  const [result] = await pool.query(
    `INSERT INTO calendar_events
      (title, description, event_type, starts_at, ends_at, trainer_id, cohort_id, room_id,
       module_id, assessment_id, meeting_url, capacity, checkin_code, shortage_threshold,
       is_published, created_by, integration_data_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, req.body.description || null, req.body.type || 'class', startsAt, endsAt,
      req.body.trainerId || req.user.id, req.body.cohortId || null, req.body.roomId || null,
      req.body.moduleId || null, req.body.assessmentId || null, req.body.meetingUrl || null,
      Number(req.body.capacity || 0), req.body.checkinCode || null, Number(req.body.shortageThreshold || 75),
      req.body.isPublished !== false, req.user.id, JSON.stringify(req.body.integrationData || {})],
  )
  await recordAudit(req, { action: 'calendar.eventCreated', entityType: 'calendar_event', entityId: result.insertId, summary: `Created ${req.body.type || 'class'} "${title}"` })
  res.status(201).json({ id: result.insertId })
})

router.put('/events/:id', requireTrainer, async (req, res) => {
  const denied = await canManageEvent(req, req.params.id)
  if (denied) return res.status(denied.status).json({ message: denied.message })
  const allowed = { title: 'title', description: 'description', type: 'event_type', startsAt: 'starts_at', endsAt: 'ends_at', trainerId: 'trainer_id', cohortId: 'cohort_id', roomId: 'room_id', moduleId: 'module_id', assessmentId: 'assessment_id', meetingUrl: 'meeting_url', capacity: 'capacity', checkinCode: 'checkin_code', shortageThreshold: 'shortage_threshold', isPublished: 'is_published' }
  const updates = Object.entries(allowed).filter(([key]) => req.body?.[key] !== undefined)
  if (!updates.length) return res.status(400).json({ message: 'Nothing to update' })
  const [result] = await pool.query(`UPDATE calendar_events SET ${updates.map(([, col]) => `${col} = ?`).join(', ')} WHERE id = ?`, [...updates.map(([key]) => req.body[key] === '' ? null : req.body[key]), req.params.id])
  if (!result.affectedRows) return res.status(404).json({ message: 'Event not found' })
  res.json({ updated: true })
})

router.put('/sessions/:eventId/content', requireTrainer, async (req, res) => {
  const denied = await canManageEvent(req, req.params.eventId)
  if (denied) return res.status(denied.status).json({ message: denied.message })
  await pool.query(
    `INSERT INTO live_session_content (event_id, recording_file_id, transcript, materials_json, follow_up_json, published_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE recording_file_id=VALUES(recording_file_id), transcript=VALUES(transcript),
       materials_json=VALUES(materials_json), follow_up_json=VALUES(follow_up_json), published_at=VALUES(published_at)`,
    [req.params.eventId, req.body?.recordingFileId || null, req.body?.transcript || null,
      JSON.stringify(req.body?.materials || []), JSON.stringify(req.body?.followUp || []),
      req.body?.published === false ? null : new Date()],
  )
  res.json({ saved: true })
})

router.get('/events/:id/attendance', requireTrainer, async (req, res) => {
  const denied = await canManageEvent(req, req.params.id)
  if (denied) return res.status(denied.status).json({ message: denied.message })
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.email,
            a.status, a.checkin_at, a.joined_at, a.left_at, a.absence_reason, a.notes
     FROM calendar_events e
     JOIN cohort_members member ON member.cohort_id = e.cohort_id AND member.member_role = 'trainee'
     JOIN users u ON u.id = member.user_id
     LEFT JOIN attendance_records a ON a.event_id = e.id AND a.user_id = u.id
     WHERE e.id = ? ORDER BY u.first_name, u.username`,
    [req.params.id],
  )
  res.json(rows.map((row) => ({ ...row, name: nameOf(row), status: row.status || 'absent' })))
})

router.put('/events/:eventId/attendance/:userId', requireTrainer, async (req, res) => {
  const denied = await canManageEvent(req, req.params.eventId)
  if (denied) return res.status(denied.status).json({ message: denied.message })
  const status = ['present', 'absent', 'late', 'excused'].includes(req.body?.status) ? req.body.status : 'absent'
  const [existing] = await pool.query('SELECT id, status FROM attendance_records WHERE event_id = ? AND user_id = ?', [req.params.eventId, req.params.userId])
  await pool.query(
    `INSERT INTO attendance_records (event_id, user_id, status, joined_at, left_at, absence_reason, notes, recorded_by, corrected_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status=VALUES(status), joined_at=VALUES(joined_at), left_at=VALUES(left_at),
       absence_reason=VALUES(absence_reason), notes=VALUES(notes), corrected_by=VALUES(corrected_by)`,
    [req.params.eventId, req.params.userId, status, req.body?.joinedAt || null, req.body?.leftAt || null,
      req.body?.absenceReason || null, req.body?.notes || null, req.user.id, existing.length ? req.user.id : null],
  )
  await recordAudit(req, { action: existing.length ? 'attendance.corrected' : 'attendance.recorded', entityType: 'attendance', entityId: `${req.params.eventId}:${req.params.userId}`, summary: `${existing[0]?.status || 'unrecorded'} → ${status}` })
  res.json({ saved: true, status })
})

router.post('/events/:id/check-in', async (req, res) => {
  const [events] = await pool.query('SELECT checkin_code, starts_at, ends_at, capacity FROM calendar_events WHERE id = ?', [req.params.id])
  if (!events.length) return res.status(404).json({ message: 'Event not found' })
  if (events[0].checkin_code && String(req.body?.code || '') !== events[0].checkin_code) return res.status(403).json({ message: 'Incorrect check-in code' })
  if (Number(events[0].capacity) > 0) {
    const [count] = await pool.query("SELECT COUNT(*) total FROM attendance_records WHERE event_id=? AND status IN ('present','late') AND user_id<>?", [req.params.id, req.user.id])
    if (Number(count[0].total) >= Number(events[0].capacity)) return res.status(409).json({ message: 'This session has reached capacity' })
  }
  await pool.query(
    `INSERT INTO attendance_records (event_id, user_id, status, checkin_at, joined_at, recorded_by)
     VALUES (?, ?, 'present', NOW(), NOW(), ?)
     ON DUPLICATE KEY UPDATE status='present', checkin_at=NOW(), joined_at=COALESCE(joined_at, NOW())`,
    [req.params.id, req.user.id, req.user.id],
  )
  res.json({ checkedIn: true })
})

router.post('/events/:id/leave', async (req, res) => {
  const reason = String(req.body?.reason || '').trim()
  if (!reason) return res.status(400).json({ message: 'Reason is required' })
  await pool.query(
    `INSERT INTO leave_requests (event_id, user_id, reason) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE reason=VALUES(reason), status='pending', reviewed_by=NULL, reviewed_at=NULL`,
    [req.params.id, req.user.id, reason],
  )
  res.status(201).json({ requested: true })
})

router.post('/events/:id/leave-session', async (req, res) => {
  const [result] = await pool.query('UPDATE attendance_records SET left_at=NOW() WHERE event_id=? AND user_id=?', [req.params.id, req.user.id])
  if (!result.affectedRows) return res.status(404).json({ message: 'Check in before leaving the session' })
  res.json({ left: true })
})

router.get('/leave', requireTrainer, async (req, res) => {
  const ownership = req.user.role === 'admin' ? '' : 'AND (event.trainer_id=? OR event.created_by=?)'
  const [rows] = await pool.query(
    `SELECT request.id,request.reason,request.status,request.created_at,event.id event_id,event.title,
            user.id user_id,user.username,user.first_name,user.last_name
     FROM leave_requests request JOIN calendar_events event ON event.id=request.event_id
     JOIN users user ON user.id=request.user_id WHERE 1=1 ${ownership}
     ORDER BY request.status='pending' DESC,request.created_at DESC`,
    req.user.role === 'admin' ? [] : [req.user.id, req.user.id],
  )
  res.json(rows.map((row) => ({ ...row, name: nameOf(row) })))
})

router.put('/leave/:id', requireTrainer, async (req, res) => {
  const [requests] = await pool.query('SELECT event_id FROM leave_requests WHERE id=? LIMIT 1', [req.params.id])
  if (!requests.length) return res.status(404).json({ message: 'Leave request not found' })
  const denied = await canManageEvent(req, requests[0].event_id)
  if (denied) return res.status(denied.status).json({ message: denied.message })
  const status = req.body?.status === 'approved' ? 'approved' : 'rejected'
  await pool.query('UPDATE leave_requests SET status=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?', [status, req.user.id, req.params.id])
  res.json({ updated: true, status })
})

router.get('/attendance/me', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT COUNT(e.id) AS total, SUM(a.status IN ('present','late')) AS attended,
            SUM(a.status='late') AS late, SUM(a.status='excused') AS excused,
            COALESCE(MIN(e.shortage_threshold),75) AS threshold
     FROM calendar_events e
     LEFT JOIN attendance_records a ON a.event_id=e.id AND a.user_id=?
     WHERE e.ends_at < NOW() AND (e.cohort_id IS NULL OR EXISTS (
       SELECT 1 FROM cohort_members m WHERE m.cohort_id=e.cohort_id AND m.user_id=?))`,
    [req.user.id, req.user.id],
  )
  const row = rows[0] || {}
  const percentage = Number(row.total) ? Math.round(Number(row.attended || 0) / Number(row.total) * 100) : 100
  res.json({ total: Number(row.total || 0), attended: Number(row.attended || 0), late: Number(row.late || 0), excused: Number(row.excused || 0), percentage, threshold: Number(row.threshold || 75), shortage: percentage < Number(row.threshold || 75) })
})

router.get('/calendar.ics', async (req, res) => {
  const scope = eventScope(req)
  const [events] = await pool.query(`SELECT id,title,description,starts_at,ends_at,meeting_url FROM calendar_events e WHERE ${scope.sql} ORDER BY starts_at`, scope.params)
  const stamp = (value) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const clean = (value) => String(value || '').replace(/[\\;,\n]/g, ' ')
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Minerva//Learning Calendar//EN', ...events.flatMap((event) => ['BEGIN:VEVENT', `UID:minerva-${event.id}`, `DTSTART:${stamp(event.starts_at)}`, `DTEND:${stamp(event.ends_at)}`, `SUMMARY:${clean(event.title)}`, `DESCRIPTION:${clean(event.description)}`, `URL:${clean(event.meeting_url)}`, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n')
  res.type('text/calendar').set('Content-Disposition', 'attachment; filename="minerva-calendar.ics"').send(body)
})

router.post('/gradebook/items', requireTrainer, async (req, res) => {
  const title = String(req.body?.title || '').trim()
  if (!title) return res.status(400).json({ message: 'Title is required' })
  const [result] = await pool.query(
    `INSERT INTO gradebook_items (title,category,room_id,cohort_id,max_score,weight,pass_score,grading_scale_json,created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [title, req.body.category || 'manual', req.body.roomId || null, req.body.cohortId || null,
      Number(req.body.maxScore || 100), Number(req.body.weight || 1), Number(req.body.passScore || 50),
      JSON.stringify(req.body.gradingScale || []), req.user.id],
  )
  res.status(201).json({ id: result.insertId })
})

router.put('/gradebook/items/:itemId/users/:userId', requireTrainer, async (req, res) => {
  const score = Number(req.body?.score)
  if (!Number.isFinite(score)) return res.status(400).json({ message: 'Numeric score is required' })
  const [old] = await pool.query('SELECT id,score FROM gradebook_entries WHERE item_id=? AND user_id=?', [req.params.itemId, req.params.userId])
  await pool.query(
    `INSERT INTO gradebook_entries (item_id,user_id,score,letter_grade,grade_points,outcome,feedback,moderation_status,graded_by,moderated_by)
     VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE score=VALUES(score),letter_grade=VALUES(letter_grade),
       grade_points=VALUES(grade_points),outcome=VALUES(outcome),feedback=VALUES(feedback),
       moderation_status=VALUES(moderation_status),graded_by=VALUES(graded_by),moderated_by=VALUES(moderated_by),graded_at=NOW()`,
    [req.params.itemId, req.params.userId, score, req.body.letterGrade || null, req.body.gradePoints ?? null,
      req.body.outcome || null, req.body.feedback || null, req.body.moderationStatus || 'released', req.user.id,
      req.body.moderationStatus === 'moderated' ? req.user.id : null],
  )
  const [entry] = await pool.query('SELECT id FROM gradebook_entries WHERE item_id=? AND user_id=?', [req.params.itemId, req.params.userId])
  await pool.query('INSERT INTO gradebook_history (entry_id,old_score,new_score,changed_by,reason) VALUES (?,?,?,?,?)', [entry[0].id, old[0]?.score ?? null, score, req.user.id, req.body.reason || null])
  await recordAudit(req, { action: 'grade.changed', entityType: 'gradebook_entry', entityId: entry[0].id, summary: `Grade changed to ${score}` })
  res.json({ saved: true })
})

async function gradeReport(userId) {
  const [manual] = await pool.query(
    `SELECT i.title,i.category,e.score,i.max_score,i.weight,i.pass_score,e.letter_grade,e.grade_points,e.outcome,e.feedback,e.graded_at
     FROM gradebook_entries e JOIN gradebook_items i ON i.id=e.item_id
     WHERE e.user_id=? AND e.moderation_status IN ('released','moderated')`, [userId])
  const [assessments] = await pool.query(
    `SELECT a.title,'assessment' category,t.score,t.max_score,1 weight,
            a.pass_percentage pass_score,NULL letter_grade,NULL grade_points,NULL outcome,NULL feedback,t.submitted_at graded_at
     FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id
     WHERE t.user_id=? AND t.submitted_at IS NOT NULL`, [userId])
  const [assignments] = await pool.query(
    `SELECT a.title,'assignment' category,s.score,a.max_score,1 weight,a.pass_score,NULL letter_grade,NULL grade_points,
            IF(s.passed,'pass','not-yet') outcome,s.feedback,s.graded_at
     FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id
     WHERE s.user_id=? AND s.graded_at IS NOT NULL`, [userId])
  const [projects] = await pool.query(
    `SELECT CONCAT(p.title, ': ',m.title) title,'project' category,m.score,100 max_score,1 weight,
            50 pass_score,NULL letter_grade,NULL grade_points,
            IF(m.score >= 50,'pass','not-yet') outcome,m.feedback,m.reviewed_at graded_at
     FROM project_milestones m
     JOIN learning_projects p ON p.id=m.project_id
     JOIN learning_project_members member ON member.project_id=p.id AND member.user_id=?
     WHERE m.score IS NOT NULL`, [userId])
  const [activities] = await pool.query(
    `SELECT p.title,'activity' category,pr.quiz_score score,100 max_score,1 weight,
            60 pass_score,NULL letter_grade,NULL grade_points,
            IF(pr.quiz_score >= 60,'pass','not-yet') outcome,NULL feedback,pr.quiz_completed_at graded_at
     FROM lab_research_progress pr JOIN lab_research_projects p ON p.id=pr.project_id
     WHERE pr.user_id=? AND pr.quiz_completed_at IS NOT NULL`, [userId])
  const entries = [...manual, ...assessments, ...assignments, ...projects, ...activities].map((entry) => ({ ...entry, percentage: Number(entry.max_score) ? Math.round(Number(entry.score || 0) / Number(entry.max_score) * 100) : 0 }))
  const weighted = entries.reduce((sum, entry) => sum + entry.percentage * Number(entry.weight || 1), 0)
  const weight = entries.reduce((sum, entry) => sum + Number(entry.weight || 1), 0)
  const percentage = weight ? Math.round(weighted / weight) : 0
  return { entries, totals: { percentage, letterGrade: percentage >= 90 ? 'A' : percentage >= 80 ? 'B' : percentage >= 70 ? 'C' : percentage >= 60 ? 'D' : 'F', gpa: Number(Math.min(4, percentage / 25).toFixed(2)) } }
}

router.get('/gradebook/me', async (req, res) => res.json(await gradeReport(req.user.id)))
router.get('/gradebook/users/:userId', requireTrainer, async (req, res) => res.json(await gradeReport(req.params.userId)))

router.get('/projects', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.*,u.first_name mentor_first_name,u.username mentor_username,
            (SELECT COUNT(*) FROM learning_project_members m WHERE m.project_id=p.id) member_count,
            (SELECT COUNT(*) FROM project_milestones ms WHERE ms.project_id=p.id) milestone_count
     FROM learning_projects p LEFT JOIN users u ON u.id=p.mentor_id
     WHERE ? IN (p.created_by,p.mentor_id) OR EXISTS (SELECT 1 FROM learning_project_members m WHERE m.project_id=p.id AND m.user_id=?)
     ORDER BY p.created_at DESC`, [req.user.id, req.user.id])
  const ids = rows.map((row) => row.id)
  const [milestones] = ids.length ? await pool.query('SELECT * FROM project_milestones WHERE project_id IN (?) ORDER BY due_on,id', [ids]) : [[]]
  res.json(rows.map((row) => ({
    ...row,
    rubric: json(row.rubric_json),
    mentorName: row.mentor_first_name || row.mentor_username,
    milestones: milestones.filter((milestone) => milestone.project_id === row.id),
  })))
})

router.post('/projects', requireTrainer, async (req, res) => {
  const title = String(req.body?.title || '').trim()
  if (!title) return res.status(400).json({ message: 'Title is required' })
  const [result] = await pool.query(
    `INSERT INTO learning_projects (title,description,project_type,privacy,cohort_id,mentor_id,review_on,rubric_json,created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [title, req.body.description || null, req.body.projectType || 'individual', req.body.privacy || 'private',
      req.body.cohortId || null, req.body.mentorId || req.user.id, req.body.reviewOn || null,
      JSON.stringify(req.body.rubric || []), req.user.id],
  )
  for (const userId of req.body?.memberIds || []) await pool.query('INSERT IGNORE INTO learning_project_members (project_id,user_id) VALUES (?,?)', [result.insertId, userId])
  res.status(201).json({ id: result.insertId })
})

router.post('/projects/:id/milestones', async (req, res) => {
  const title = String(req.body?.title || '').trim()
  if (!title) return res.status(400).json({ message: 'Title is required' })
  const [result] = await pool.query('INSERT INTO project_milestones (project_id,title,description,due_on,evidence_url) VALUES (?,?,?,?,?)', [req.params.id, title, req.body.description || null, req.body.dueOn || null, req.body.evidenceUrl || null])
  res.status(201).json({ id: result.insertId })
})

router.put('/milestones/:id/review', requireTrainer, async (req, res) => {
  await pool.query('UPDATE project_milestones SET status=?,score=?,feedback=?,reviewed_by=?,reviewed_at=NOW() WHERE id=?', [req.body.status || 'reviewed', req.body.score ?? null, req.body.feedback || null, req.user.id, req.params.id])
  res.json({ saved: true })
})

router.get('/portfolio/me', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM portfolio_items WHERE user_id=? ORDER BY updated_at DESC', [req.user.id])
  res.json(rows.map((row) => ({ ...row, skills: json(row.skills_json), isApproved: Boolean(row.is_approved) })))
})

router.get('/portfolio/review', requireTrainer, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT item.*,user.username,user.first_name,user.last_name
     FROM portfolio_items item JOIN users user ON user.id=item.user_id
     WHERE item.is_approved=false ORDER BY item.created_at`,
  )
  res.json(rows.map((row) => ({ ...row, name: nameOf(row), skills: json(row.skills_json) })))
})

router.post('/portfolio', async (req, res) => {
  const title = String(req.body?.title || '').trim()
  if (!title) return res.status(400).json({ message: 'Title is required' })
  const [result] = await pool.query(
    `INSERT INTO portfolio_items (user_id,project_id,title,description,evidence_url,skills_json,reflection,privacy)
     VALUES (?,?,?,?,?,?,?,?)`, [req.user.id, req.body.projectId || null, title, req.body.description || null,
      req.body.evidenceUrl || null, JSON.stringify(req.body.skills || []), req.body.reflection || null, req.body.privacy || 'private'])
  res.status(201).json({ id: result.insertId })
})

router.put('/portfolio/:id', async (req, res) => {
  const owns = req.user.role === 'admin' ? '' : 'AND user_id = ?'
  const params = [req.body.title, req.body.description, req.body.evidenceUrl, JSON.stringify(req.body.skills || []), req.body.reflection, req.body.privacy, req.params.id, ...(owns ? [req.user.id] : [])]
  const [result] = await pool.query(`UPDATE portfolio_items SET title=?,description=?,evidence_url=?,skills_json=?,reflection=?,privacy=? WHERE id=? ${owns}`, params)
  if (!result.affectedRows) return res.status(404).json({ message: 'Portfolio item not found' })
  res.json({ saved: true })
})

router.put('/portfolio/:id/approval', requireTrainer, async (req, res) => {
  await pool.query('UPDATE portfolio_items SET is_approved=?,approved_by=? WHERE id=?', [req.body?.approved !== false, req.user.id, req.params.id])
  res.json({ saved: true })
})

router.get('/skills/me', async (req, res) => {
  const [declared] = await pool.query('SELECT skill,proficiency FROM user_skills WHERE user_id=?', [req.user.id])
  const [evidence] = await pool.query('SELECT * FROM skill_evidence WHERE user_id=? ORDER BY skill,verified_by IS NOT NULL DESC', [req.user.id])
  const [derived] = await pool.query(
    `SELECT a.subject skill,'intermediate' proficiency,'assessment' evidence_type,a.title evidence_label,
            NULL evidence_url,NULL verified_by,t.submitted_at demonstrated_at,NULL expires_at
     FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id
     WHERE t.user_id=? AND t.passed=true
     UNION ALL
     SELECT a.subject,'intermediate','assignment',a.title,NULL,s.graded_by,s.graded_at,NULL
     FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id
     WHERE s.user_id=? AND s.passed=true
     UNION ALL
     SELECT p.title,'intermediate','project',m.title,m.evidence_url,m.reviewed_by,m.reviewed_at,NULL
     FROM learning_project_members member JOIN learning_projects p ON p.id=member.project_id
     JOIN project_milestones m ON m.project_id=p.id
     WHERE member.user_id=? AND m.status IN ('reviewed','completed','approved')
     UNION ALL
     SELECT job_title,'intermediate','work-experience',organisation,NULL,NULL,COALESCE(ended_on,started_on),NULL
     FROM user_work_experience WHERE user_id=?`,
    [req.user.id, req.user.id, req.user.id, req.user.id],
  )
  res.json({
    declared: declared.map((row) => ({ ...row, evidenceType: 'declared' })),
    evidence: [...evidence, ...derived].map((row) => ({ ...row, verified: Boolean(row.verified_by) })),
  })
})

router.post('/skills/evidence', async (req, res) => {
  const userId = req.user.role === 'admin' || req.user.role === 'trainer' ? req.body?.userId || req.user.id : req.user.id
  const skill = String(req.body?.skill || '').trim()
  if (!skill) return res.status(400).json({ message: 'Skill is required' })
  const verifier = req.user.role === 'trainer' || req.user.role === 'admin' ? req.user.id : null
  const [result] = await pool.query(
    `INSERT INTO skill_evidence (user_id,skill,proficiency,evidence_type,evidence_label,evidence_url,verified_by,demonstrated_at,expires_at)
     VALUES (?,?,?,?,?,?,?,?,?)`, [userId, skill, req.body.proficiency || 'beginner', verifier ? 'trainer-verified' : req.body.evidenceType || 'demonstrated',
      req.body.evidenceLabel || null, req.body.evidenceUrl || null, verifier, req.body.demonstratedAt || null, req.body.expiresAt || null])
  res.status(201).json({ id: result.insertId })
})

router.post('/shares', async (req, res) => {
  const type = ['portfolio', 'passport', 'transcript'].includes(req.body?.type) ? req.body.type : 'passport'
  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = req.body?.expiresAt || null
  const [result] = await pool.query('INSERT INTO public_profile_shares (user_id,share_type,token_hash,include_json,expires_at) VALUES (?,?,?,?,?)', [req.user.id, type, hash(token), JSON.stringify(req.body?.include || []), expiresAt])
  res.status(201).json({ id: result.insertId, token, path: `/share/${token}` })
})

router.get('/shares', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id,share_type,expires_at,revoked_at,created_at
     FROM public_profile_shares WHERE user_id=? ORDER BY created_at DESC`, [req.user.id])
  res.json(rows.map((row) => ({ ...row, active: !row.revoked_at && (!row.expires_at || new Date(row.expires_at) > new Date()) })))
})

router.delete('/shares/:id', async (req, res) => {
  await pool.query('UPDATE public_profile_shares SET revoked_at=NOW() WHERE id=? AND user_id=?', [req.params.id, req.user.id])
  res.json({ revoked: true })
})

export default router
