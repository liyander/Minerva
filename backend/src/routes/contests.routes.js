import { Router } from 'express'
import jwt from 'jsonwebtoken'
import OpenAI from 'openai'
import { WebSocketServer } from 'ws'
import { pool } from '../db/pool.js'
import { env } from '../config/env.js'
import { authenticate, optionalAuthenticate, requireTrainer } from '../middleware/auth.js'
import { isRole, ROLES } from '../config/roles.js'
import { getAiRuntimeConfig } from '../services/aiSettings.js'
import { CONTEST_TABLE_DDL } from '../db/contestSchema.js'

const router = Router()

let tablesInitialized = false
async function ensureTables() {
  if (tablesInitialized) return
  try {
    const conn = await pool.getConnection()
    try {
      await conn.query(CONTEST_TABLE_DDL)
      tablesInitialized = true
    } finally {
      conn.release()
    }
  } catch (error) {
    console.warn('Contest table init check error:', error?.message)
  }
}

router.use(async (_req, _res, next) => {
  await ensureTables()
  next()
})

/* ------------------------------------------------------------ WebSocket --- */

const contestSockets = new Map() // contestId -> Set<ws>

export function setupContestWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    let parsedUrl
    try {
      parsedUrl = new URL(request.url || '', 'http://localhost')
    } catch {
      return
    }
    if (parsedUrl.pathname !== '/api/contests/ws') return

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, parsedUrl)
    })
  })

  wss.on('connection', (ws, _request, parsedUrl) => {
    let user = null
    try {
      const token = parsedUrl.searchParams.get('token') || ''
      user = jwt.verify(token, env.jwtSecret)
    } catch {
      ws.close()
      return
    }

    let joinedContestId = null

    ws.on('message', async (raw) => {
      let payload
      try {
        payload = JSON.parse(raw.toString())
      } catch {
        return
      }

      if (payload?.type === 'join' && payload.contestId) {
        const contestId = Number(payload.contestId)
        joinedContestId = contestId
        if (!contestSockets.has(contestId)) {
          contestSockets.set(contestId, new Set())
        }
        contestSockets.get(contestId).add(ws)

        // Send confirmation and current state
        broadcastToContest(contestId, {
          type: 'USER_JOINED',
          userId: user.id,
          username: user.username,
        })
      }

      if (payload?.type === 'leave' && payload.contestId) {
        const contestId = Number(payload.contestId)
        contestSockets.get(contestId)?.delete(ws)
        if (joinedContestId === contestId) joinedContestId = null
      }
    })

    ws.on('close', () => {
      if (joinedContestId) {
        const set = contestSockets.get(joinedContestId)
        set?.delete(ws)
        if (set && set.size === 0) contestSockets.delete(joinedContestId)
      }
    })
  })
}

function broadcastToContest(contestId, message) {
  const sockets = contestSockets.get(Number(contestId))
  if (!sockets || sockets.size === 0) return
  const raw = JSON.stringify(message)
  for (const ws of sockets) {
    if (ws.readyState === 1 /* OPEN */) {
      try {
        ws.send(raw)
      } catch {
        // ignore send error
      }
    }
  }
}

/* ------------------------------------------------------------ AI Generator --- */

function buildFallbackQuestions(topic, count = 5) {
  const safeTopic = topic || 'General Cybersecurity & Coding'
  const templates = [
    {
      prompt: `In ${safeTopic}, what is the primary security objective of adhering to the principle of least privilege?`,
      options: [
        'Granting users only the minimum access necessary to perform their jobs',
        'Giving all team members administrative access for seamless collaboration',
        'Encrypting data only when transmitted over the public internet',
        'Disabling audit logs to save disk storage',
      ],
      correctIndex: 0,
      explanation: 'Least privilege minimizes the potential attack surface by granting users and systems only the essential permissions needed.',
    },
    {
      prompt: `Which of the following best describes a key defensive safeguard against injection vulnerabilities in ${safeTopic}?`,
      options: [
        'Concatenating user inputs directly into runtime queries',
        'Using parameterized queries / prepared statements and input validation',
        'Trusting client-side HTML validations completely',
        'Turning off error monitoring in production',
      ],
      correctIndex: 1,
      explanation: 'Parameterized queries ensure user input is treated strictly as data rather than executable code.',
    },
    {
      prompt: `When troubleshooting and monitoring ${safeTopic} deployments, why are structured logs with correlation IDs essential?`,
      options: [
        'They replace the need for unit tests',
        'They reduce network bandwidth by 90%',
        'They allow end-to-end traceability of requests across distributed services',
        'They automatically fix software bugs in production',
      ],
      correctIndex: 2,
      explanation: 'Correlation IDs tie log entries together across microservices and asynchronous workers for end-to-end incident investigation.',
    },
    {
      prompt: `What is the recommended cryptographic approach for securely storing user passwords in ${safeTopic}?`,
      options: [
        'Plain text in a restricted database column',
        'Base64 encoding',
        'MD5 with no salt',
        'Adaptive, salted hashing algorithms such as bcrypt, Argon2, or PBKDF2',
      ],
      correctIndex: 3,
      explanation: 'Modern password hashing functions with work factors (salts and multiple rounds) resist rainbow tables and brute-force attacks.',
    },
    {
      prompt: `What role does rate limiting and throttling play in securing ${safeTopic} APIs?`,
      options: [
        'Mitigating brute-force attacks and denial-of-service abuse',
        'Speeding up individual database queries',
        'Enabling automatic code refactoring',
        'Allowing unlimited API requests per client',
      ],
      correctIndex: 0,
      explanation: 'Rate limiting constrains request frequency per IP or API key, preventing automated credential stuffing and resource exhaustion.',
    },
    {
      prompt: `In the context of ${safeTopic}, what is the primary advantage of automated continuous integration (CI) test suites?`,
      options: [
        'Catching regressions and vulnerabilities early in the development lifecycle',
        'Replacing manual code reviews entirely',
        'Eliminating the need for staging environments',
        'Increasing runtime memory consumption',
      ],
      correctIndex: 0,
      explanation: 'Continuous integration runs automated tests and security scanners on every commit, identifying defects before production deployment.',
    },
  ]

  const selected = []
  for (let i = 0; i < count; i++) {
    const base = templates[i % templates.length]
    selected.push({
      prompt: i >= templates.length ? `[${safeTopic}] Question ${i + 1}: ${base.prompt}` : base.prompt,
      options: base.options,
      correctIndex: base.correctIndex,
      timeLimitSeconds: 20,
      points: 1000,
      explanation: base.explanation,
      sortOrder: i,
    })
  }
  return selected
}

router.post('/ai/generate', authenticate, requireTrainer, async (req, res) => {
  const { topic, courseTitle, count = 5, difficulty = 'medium' } = req.body || {}
  const parsedCount = Math.max(1, Math.min(15, Number(count) || 5))
  const effectiveTopic = String(topic || courseTitle || 'Web Development & Security').trim()

  const config = await getAiRuntimeConfig()

  if (!config.apiKey && !env.nvidiaApiKey) {
    const fallback = buildFallbackQuestions(effectiveTopic, parsedCount)
    return res.json({
      questions: fallback,
      generatedBy: 'template',
      message: 'Generated dynamic high-quality quiz template.',
    })
  }

  try {
    const client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey || env.nvidiaApiKey,
    })

    const systemPrompt = `You are a dynamic quiz game master creating vibrant, competitive Kahoot-style questions for technical learners.
Return a STRICT JSON object in this exact schema without extra formatting:
{
  "questions": [
    {
      "prompt": "Clear, engaging question prompt",
      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
      "correctIndex": 0,
      "timeLimitSeconds": 20,
      "points": 1000,
      "explanation": "Brief explanation of why the correct answer is right"
    }
  ]
}
Rules:
- Exactly 4 options per question. Options must be concise, distinct, and plausible.
- "correctIndex" must be 0, 1, 2, or 3 pointing to the right option.
- Target difficulty: ${difficulty}.
- Topic: ${effectiveTopic}.
- Produce exactly ${parsedCount} questions.
`

    const completion = await client.chat.completions.create({
      model: config.model,
      temperature: Number(config.temperature || 0.6),
      max_tokens: Math.min(4000, parsedCount * 450),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate ${parsedCount} Kahoot-style quiz questions on the topic: ${effectiveTopic}` },
      ],
    })

    const raw = completion.choices?.[0]?.message?.content || ''
    let parsed = null

    try {
      parsed = JSON.parse(raw)
    } catch {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
      if (match?.[1]) {
        try {
          parsed = JSON.parse(match[1].trim())
        } catch {
          // ignore
        }
      }
    }

    if (parsed?.questions && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      const sanitized = parsed.questions.map((q, idx) => ({
        prompt: String(q.prompt || `Question ${idx + 1}`).trim(),
        options: Array.isArray(q.options) && q.options.length === 4
          ? q.options.map((opt) => String(opt).trim())
          : ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
        correctIndex: Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < 4
          ? q.correctIndex
          : 0,
        timeLimitSeconds: Number(q.timeLimitSeconds) || 20,
        points: Number(q.points) || 1000,
        explanation: String(q.explanation || '').trim(),
        sortOrder: idx,
      }))

      return res.json({
        questions: sanitized,
        generatedBy: 'ai',
        model: config.model,
      })
    }

    const fallback = buildFallbackQuestions(effectiveTopic, parsedCount)
    return res.json({
      questions: fallback,
      generatedBy: 'template',
    })
  } catch (err) {
    console.error('AI question generation error:', err.message)
    const fallback = buildFallbackQuestions(effectiveTopic, parsedCount)
    return res.json({
      questions: fallback,
      generatedBy: 'template',
      error: err.message,
    })
  }
})

/* ------------------------------------------------------------ Contests CRUD --- */

// GET /api/contests - List contests
router.get('/', optionalAuthenticate, async (req, res) => {
  const { status, courseId, my } = req.query || {}
  const userId = req.user?.id || null
  const isTrainerOrAdmin = isRole(req.user?.role, ROLES.TRAINER, ROLES.ADMIN)

  let sql = `
    SELECT 
      c.id, c.title, c.description, c.subject, c.course_id, c.trainer_id,
      c.status, c.join_code, c.current_question_index, c.leaderboard_duration_seconds,
      c.default_time_limit, c.created_at, c.updated_at,
      u.username AS trainer_username,
      u.first_name AS trainer_first_name,
      u.last_name AS trainer_last_name,
      r.title AS course_title,
      COUNT(DISTINCT q.id) AS question_count,
      COUNT(DISTINCT p.id) AS participant_count,
      COUNT(DISTINCT CASE WHEN p.status = 'approved' THEN p.id END) AS approved_participant_count
    FROM contests c
    LEFT JOIN users u ON u.id = c.trainer_id
    LEFT JOIN rooms r ON r.id = c.course_id OR r.slug = c.course_id
    LEFT JOIN contest_questions q ON q.contest_id = c.id
    LEFT JOIN contest_participants p ON p.contest_id = c.id
  `

  const conditions = []
  const params = []

  if (status) {
    conditions.push('c.status = ?')
    params.push(status)
  }

  if (courseId) {
    conditions.push('c.course_id = ?')
    params.push(courseId)
  }

  if (my && userId) {
    if (isTrainerOrAdmin) {
      conditions.push('c.trainer_id = ?')
      params.push(userId)
    } else {
      conditions.push('EXISTS (SELECT 1 FROM contest_participants cp WHERE cp.contest_id = c.id AND cp.user_id = ?)')
      params.push(userId)
    }
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }

  sql += ' GROUP BY c.id ORDER BY (CASE WHEN c.status = "live" THEN 1 WHEN c.status = "waiting" THEN 2 WHEN c.status = "draft" THEN 3 ELSE 4 END), c.created_at DESC LIMIT 100'

  const [rows] = await pool.query(sql, params)

  // Fetch caller's participation status
  let userParticipationMap = new Map()
  if (userId) {
    const [partRows] = await pool.query(
      'SELECT contest_id, status, score, streak FROM contest_participants WHERE user_id = ?',
      [userId],
    )
    for (const p of partRows) {
      userParticipationMap.set(Number(p.contest_id), p)
    }
  }

  const output = rows.map((r) => {
    const trainerName = [r.trainer_first_name, r.trainer_last_name].filter(Boolean).join(' ') || r.trainer_username || 'Trainer'
    const part = userParticipationMap.get(Number(r.id))
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      subject: r.subject,
      courseId: r.course_id,
      courseTitle: r.course_title,
      trainerId: r.trainer_id,
      trainerName,
      status: r.status,
      joinCode: r.join_code,
      currentQuestionIndex: r.current_question_index,
      leaderboardDurationSeconds: r.leaderboard_duration_seconds,
      defaultTimeLimit: r.default_time_limit,
      questionCount: Number(r.question_count || 0),
      participantCount: Number(r.participant_count || 0),
      approvedParticipantCount: Number(r.approved_participant_count || 0),
      createdAt: r.created_at,
      myStatus: part?.status || null,
      myScore: part?.score || 0,
      myStreak: part?.streak || 0,
      isHost: userId && (r.trainer_id === userId || req.user?.role === 'admin'),
    }
  })

  res.json(output)
})

// POST /api/contests - Create contest
router.post('/', authenticate, requireTrainer, async (req, res) => {
  const {
    title,
    description = '',
    subject = 'General',
    courseId = null,
    defaultTimeLimit = 20,
    leaderboardDurationSeconds = 6,
    questions = [],
  } = req.body || {}

  if (!title || !String(title).trim()) {
    return res.status(400).json({ message: 'Contest title is required.' })
  }

  const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase()
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [contestResult] = await conn.query(
      `INSERT INTO contests 
        (title, description, subject, course_id, trainer_id, status, join_code, default_time_limit, leaderboard_duration_seconds)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      [
        String(title).trim(),
        String(description || '').trim(),
        String(subject || 'General').trim(),
        courseId ? String(courseId).trim() : null,
        req.user.id,
        joinCode,
        Number(defaultTimeLimit) || 20,
        Number(leaderboardDurationSeconds) || 6,
      ],
    )

    const contestId = contestResult.insertId

    if (Array.isArray(questions) && questions.length > 0) {
      for (const [idx, q] of questions.entries()) {
        const prompt = String(q.prompt || '').trim()
        if (!prompt) continue
        const options = Array.isArray(q.options) ? q.options.map(String) : ['A', 'B', 'C', 'D']
        const correctIndex = Number(q.correctIndex) || 0
        const timeLimit = Number(q.timeLimitSeconds) || Number(defaultTimeLimit) || 20
        const points = Number(q.points) || 1000
        const explanation = String(q.explanation || '').trim()

        await conn.query(
          `INSERT INTO contest_questions 
            (contest_id, prompt, options_json, correct_index, time_limit_seconds, points, explanation, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [contestId, prompt, JSON.stringify(options), correctIndex, timeLimit, points, explanation || null, idx],
        )
      }
    }

    await conn.commit()
    res.status(201).json({ id: contestId, message: 'Contest created successfully.' })
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
})

// GET /api/contests/:id - Get contest details
router.get('/:id', optionalAuthenticate, async (req, res) => {
  const contestId = req.params.id
  const userId = req.user?.id || null

  const [contests] = await pool.query(
    `SELECT c.*, u.username AS trainer_username, u.first_name AS trainer_first_name, u.last_name AS trainer_last_name,
            r.title AS course_title
     FROM contests c
     LEFT JOIN users u ON u.id = c.trainer_id
     LEFT JOIN rooms r ON r.id = c.course_id OR r.slug = c.course_id
     WHERE c.id = ? LIMIT 1`,
    [contestId],
  )

  if (!contests.length) {
    return res.status(404).json({ message: 'Contest not found.' })
  }

  const contest = contests[0]
  const isHost = userId && (contest.trainer_id === userId || req.user?.role === 'admin')

  // Fetch questions
  const [questions] = await pool.query(
    'SELECT * FROM contest_questions WHERE contest_id = ? ORDER BY sort_order, id',
    [contestId],
  )

  // Fetch user's participant record if logged in
  let myParticipant = null
  if (userId) {
    const [parts] = await pool.query(
      'SELECT * FROM contest_participants WHERE contest_id = ? AND user_id = ? LIMIT 1',
      [contestId, userId],
    )
    myParticipant = parts[0] || null
  }

  // Count approved participants
  const [countRows] = await pool.query(
    `SELECT 
      COUNT(*) AS total,
      COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending
     FROM contest_participants WHERE contest_id = ?`,
    [contestId],
  )

  const counts = countRows[0] || { total: 0, approved: 0, pending: 0 }

  // Format questions: trainees don't see answers unless finished
  const canSeeAnswers = isHost || contest.status === 'completed'

  const formattedQuestions = questions.map((q) => {
    let options = []
    try {
      options = JSON.parse(q.options_json)
    } catch {
      options = []
    }
    return {
      id: q.id,
      prompt: q.prompt,
      options,
      correctIndex: canSeeAnswers ? q.correct_index : undefined,
      timeLimitSeconds: q.time_limit_seconds,
      points: q.points,
      explanation: canSeeAnswers ? q.explanation : undefined,
      sortOrder: q.sort_order,
    }
  })

  const trainerName = [contest.trainer_first_name, contest.trainer_last_name].filter(Boolean).join(' ') || contest.trainer_username || 'Trainer'

  res.json({
    id: contest.id,
    title: contest.title,
    description: contest.description,
    subject: contest.subject,
    courseId: contest.course_id,
    courseTitle: contest.course_title,
    trainerId: contest.trainer_id,
    trainerName,
    status: contest.status,
    joinCode: contest.join_code,
    currentQuestionIndex: contest.current_question_index,
    currentQuestionStartedAt: contest.current_question_started_at,
    leaderboardDurationSeconds: contest.leaderboard_duration_seconds,
    defaultTimeLimit: contest.default_time_limit,
    createdAt: contest.created_at,
    isHost,
    questions: formattedQuestions,
    participantCounts: counts,
    myParticipation: myParticipant
      ? {
          id: myParticipant.id,
          status: myParticipant.status,
          score: myParticipant.score,
          streak: myParticipant.streak,
          lastAnsweredIndex: myParticipant.last_answered_index,
        }
      : null,
  })
})

// PUT /api/contests/:id - Update contest
router.put('/:id', authenticate, requireTrainer, async (req, res) => {
  const contestId = req.params.id
  const [existing] = await pool.query('SELECT * FROM contests WHERE id = ? LIMIT 1', [contestId])
  if (!existing.length) return res.status(404).json({ message: 'Contest not found.' })

  const contest = existing[0]
  if (contest.trainer_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'You can only edit your own contests.' })
  }

  const {
    title,
    description,
    subject,
    courseId,
    defaultTimeLimit,
    leaderboardDurationSeconds,
  } = req.body || {}

  await pool.query(
    `UPDATE contests SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      subject = COALESCE(?, subject),
      course_id = ?,
      default_time_limit = COALESCE(?, default_time_limit),
      leaderboard_duration_seconds = COALESCE(?, leaderboard_duration_seconds)
     WHERE id = ?`,
    [
      title ? String(title).trim() : null,
      description !== undefined ? String(description).trim() : null,
      subject ? String(subject).trim() : null,
      courseId !== undefined ? (courseId ? String(courseId).trim() : null) : contest.course_id,
      defaultTimeLimit ? Number(defaultTimeLimit) : null,
      leaderboardDurationSeconds ? Number(leaderboardDurationSeconds) : null,
      contestId,
    ],
  )

  res.json({ message: 'Contest updated successfully.' })
})

// DELETE /api/contests/:id - Delete contest
router.delete('/:id', authenticate, requireTrainer, async (req, res) => {
  const contestId = req.params.id
  const [existing] = await pool.query('SELECT * FROM contests WHERE id = ? LIMIT 1', [contestId])
  if (!existing.length) return res.status(404).json({ message: 'Contest not found.' })

  const contest = existing[0]
  if (contest.trainer_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'You can only delete your own contests.' })
  }

  await pool.query('DELETE FROM contests WHERE id = ?', [contestId])
  broadcastToContest(contestId, { type: 'CONTEST_DELETED', contestId })
  res.json({ message: 'Contest deleted successfully.' })
})

// PUT /api/contests/:id/questions - Save/replace questions
router.put('/:id/questions', authenticate, requireTrainer, async (req, res) => {
  const contestId = req.params.id
  const [existing] = await pool.query('SELECT * FROM contests WHERE id = ? LIMIT 1', [contestId])
  if (!existing.length) return res.status(404).json({ message: 'Contest not found.' })

  const contest = existing[0]
  if (contest.trainer_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized.' })
  }

  const { questions = [] } = req.body || {}
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query('DELETE FROM contest_questions WHERE contest_id = ?', [contestId])

    for (const [idx, q] of questions.entries()) {
      const prompt = String(q.prompt || '').trim()
      if (!prompt) continue
      const options = Array.isArray(q.options) ? q.options.map(String) : ['A', 'B', 'C', 'D']
      const correctIndex = Number(q.correctIndex) || 0
      const timeLimit = Number(q.timeLimitSeconds) || Number(contest.default_time_limit) || 20
      const points = Number(q.points) || 1000
      const explanation = String(q.explanation || '').trim()

      await conn.query(
        `INSERT INTO contest_questions 
          (contest_id, prompt, options_json, correct_index, time_limit_seconds, points, explanation, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [contestId, prompt, JSON.stringify(options), correctIndex, timeLimit, points, explanation || null, idx],
      )
    }

    await conn.commit()
    res.json({ message: 'Questions updated successfully.', count: questions.length })
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
})

/* ------------------------------------------------------------ Participants & Enrollment --- */

// POST /api/contests/:id/enroll - Trainee enrolls
router.post('/:id/enroll', authenticate, async (req, res) => {
  const contestId = req.params.id
  const userId = req.user.id

  const [contests] = await pool.query('SELECT * FROM contests WHERE id = ? LIMIT 1', [contestId])
  if (!contests.length) return res.status(404).json({ message: 'Contest not found.' })

  const contest = contests[0]
  if (contest.status === 'completed') {
    return res.status(400).json({ message: 'This contest has already ended.' })
  }

  // Insert or return existing
  await pool.query(
    `INSERT INTO contest_participants (contest_id, user_id, status)
     VALUES (?, ?, 'pending')
     ON DUPLICATE KEY UPDATE status = status`,
    [contestId, userId],
  )

  const [parts] = await pool.query(
    'SELECT * FROM contest_participants WHERE contest_id = ? AND user_id = ? LIMIT 1',
    [contestId, userId],
  )

  broadcastToContest(contestId, {
    type: 'PARTICIPANT_ENROLLED',
    contestId: Number(contestId),
    userId,
    username: req.user.username,
    status: parts[0]?.status,
  })

  res.status(200).json({
    message: 'Enrollment requested. Waiting for trainer approval.',
    participant: parts[0],
  })
})

// GET /api/contests/:id/participants - List participants
router.get('/:id/participants', authenticate, async (req, res) => {
  const contestId = req.params.id

  const [rows] = await pool.query(
    `SELECT p.id, p.contest_id, p.user_id, p.status, p.score, p.streak, p.last_answered_index,
            p.enrolled_at, p.approved_at,
            u.username, u.first_name, u.last_name, u.email
     FROM contest_participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.contest_id = ?
     ORDER BY p.score DESC, p.enrolled_at ASC`,
    [contestId],
  )

  const mapped = rows.map((r, idx) => ({
    id: r.id,
    userId: r.user_id,
    username: r.username,
    name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.username,
    email: r.email,
    status: r.status,
    score: r.score,
    streak: r.streak,
    lastAnsweredIndex: r.last_answered_index,
    rank: idx + 1,
    enrolledAt: r.enrolled_at,
    approvedAt: r.approved_at,
  }))

  res.json(mapped)
})

// PUT /api/contests/:id/participants/:userId/status - Approve or reject
router.put('/:id/participants/:userId/status', authenticate, requireTrainer, async (req, res) => {
  const { id: contestId, userId } = req.params
  const { status } = req.body || {}

  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status.' })
  }

  const [contests] = await pool.query('SELECT * FROM contests WHERE id = ? LIMIT 1', [contestId])
  if (!contests.length) return res.status(404).json({ message: 'Contest not found.' })

  const contest = contests[0]
  if (contest.trainer_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized.' })
  }

  const approvedAt = status === 'approved' ? new Date() : null

  await pool.query(
    `UPDATE contest_participants 
     SET status = ?, approved_at = ?
     WHERE contest_id = ? AND user_id = ?`,
    [status, approvedAt, contestId, userId],
  )

  broadcastToContest(contestId, {
    type: 'PARTICIPANT_STATUS_CHANGED',
    contestId: Number(contestId),
    userId: Number(userId),
    status,
  })

  res.json({ message: `Participant ${status} successfully.` })
})

// POST /api/contests/:id/participants/approve-all - Approve all pending
router.post('/:id/participants/approve-all', authenticate, requireTrainer, async (req, res) => {
  const contestId = req.params.id

  const [contests] = await pool.query('SELECT * FROM contests WHERE id = ? LIMIT 1', [contestId])
  if (!contests.length) return res.status(404).json({ message: 'Contest not found.' })

  const contest = contests[0]
  if (contest.trainer_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized.' })
  }

  await pool.query(
    `UPDATE contest_participants 
     SET status = 'approved', approved_at = NOW()
     WHERE contest_id = ? AND status = 'pending'`,
    [contestId],
  )

  broadcastToContest(contestId, {
    type: 'ALL_PARTICIPANTS_APPROVED',
    contestId: Number(contestId),
  })

  res.json({ message: 'All pending participants approved.' })
})

/* ------------------------------------------------------------ Live Arena State & Gameplay --- */

// POST /api/contests/:id/state - Update contest flow
router.post('/:id/state', authenticate, requireTrainer, async (req, res) => {
  const contestId = req.params.id
  const { action, questionIndex } = req.body || {}

  const [contests] = await pool.query('SELECT * FROM contests WHERE id = ? LIMIT 1', [contestId])
  if (!contests.length) return res.status(404).json({ message: 'Contest not found.' })

  const contest = contests[0]
  if (contest.trainer_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized.' })
  }

  const [questions] = await pool.query(
    'SELECT * FROM contest_questions WHERE contest_id = ? ORDER BY sort_order, id',
    [contestId],
  )

  let newStatus = contest.status
  let newIndex = contest.current_question_index
  let startedAt = contest.current_question_started_at

  if (action === 'open_waiting') {
    newStatus = 'waiting'
    newIndex = -1
    startedAt = null
    // Reset participant scores if restarting
    await pool.query(
      'UPDATE contest_participants SET score = 0, streak = 0, last_answered_index = -1 WHERE contest_id = ?',
      [contestId],
    )
    await pool.query('DELETE FROM contest_answers WHERE contest_id = ?', [contestId])
  } else if (action === 'start_question') {
    newStatus = 'live'
    newIndex = typeof questionIndex === 'number' ? questionIndex : newIndex + 1
    if (newIndex >= questions.length) {
      newStatus = 'completed'
    } else {
      startedAt = new Date()
    }
  } else if (action === 'end_question') {
    newStatus = 'question_ended'
  } else if (action === 'show_leaderboard') {
    newStatus = 'leaderboard'
  } else if (action === 'finish') {
    newStatus = 'completed'
  }

  await pool.query(
    `UPDATE contests SET
      status = ?,
      current_question_index = ?,
      current_question_started_at = ?
     WHERE id = ?`,
    [newStatus, newIndex, startedAt, contestId],
  )

  const payload = {
    type: 'CONTEST_STATE_CHANGED',
    contestId: Number(contestId),
    status: newStatus,
    currentQuestionIndex: newIndex,
    currentQuestionStartedAt: startedAt,
  }

  broadcastToContest(contestId, payload)
  res.json({ message: `Contest state updated to ${newStatus}.`, state: payload })
})

// POST /api/contests/:id/answer - Trainee submits answer
router.post('/:id/answer', authenticate, async (req, res) => {
  const contestId = req.params.id
  const userId = req.user.id
  const { questionIndex, selectedIndex, responseTimeMs } = req.body || {}

  const [contests] = await pool.query('SELECT * FROM contests WHERE id = ? LIMIT 1', [contestId])
  if (!contests.length) return res.status(404).json({ message: 'Contest not found.' })

  const contest = contests[0]
  if (contest.status !== 'live' || contest.current_question_index !== questionIndex) {
    return res.status(400).json({ message: 'Question is not currently active for answering.' })
  }

  const [participants] = await pool.query(
    'SELECT * FROM contest_participants WHERE contest_id = ? AND user_id = ? LIMIT 1',
    [contestId, userId],
  )

  if (!participants.length || participants[0].status !== 'approved') {
    return res.status(403).json({ message: 'You must be an approved participant in this contest.' })
  }

  const participant = participants[0]

  const [questions] = await pool.query(
    'SELECT * FROM contest_questions WHERE contest_id = ? ORDER BY sort_order, id',
    [contestId],
  )

  const currentQuestion = questions[questionIndex]
  if (!currentQuestion) {
    return res.status(400).json({ message: 'Invalid question index.' })
  }

  const isCorrect = Number(selectedIndex) === Number(currentQuestion.correct_index)
  const timeLimitMs = (Number(currentQuestion.time_limit_seconds) || 20) * 1000
  const effectiveResponseTime = Math.min(timeLimitMs, Math.max(0, Number(responseTimeMs) || 0))

  let pointsAwarded = 0
  let newStreak = participant.streak
  if (isCorrect) {
    newStreak += 1
    // Kahoot-style speed points: 500 base + 500 * (1 - responseTime/timeLimit)
    const speedRatio = Math.max(0, 1 - effectiveResponseTime / timeLimitMs)
    const baseSpeedPoints = Math.round(500 + 500 * speedRatio)
    const streakBonus = Math.min(300, Math.max(0, (newStreak - 1) * 100))
    pointsAwarded = baseSpeedPoints + streakBonus
  } else {
    newStreak = 0
  }

  const newScore = participant.score + pointsAwarded

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    await conn.query(
      `INSERT INTO contest_answers 
        (contest_id, question_id, participant_id, user_id, selected_index, is_correct, response_time_ms, points_awarded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        selected_index = VALUES(selected_index),
        is_correct = VALUES(is_correct),
        response_time_ms = VALUES(response_time_ms),
        points_awarded = VALUES(points_awarded)`,
      [
        contestId,
        currentQuestion.id,
        participant.id,
        userId,
        Number(selectedIndex),
        isCorrect,
        effectiveResponseTime,
        pointsAwarded,
      ],
    )

    await conn.query(
      `UPDATE contest_participants 
       SET score = ?, streak = ?, last_answered_index = ?
       WHERE id = ?`,
      [newScore, newStreak, questionIndex, participant.id],
    )

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }

  // Count total answers for current question
  const [ansCount] = await pool.query(
    'SELECT COUNT(*) AS count FROM contest_answers WHERE contest_id = ? AND question_id = ?',
    [contestId, currentQuestion.id],
  )

  broadcastToContest(contestId, {
    type: 'ANSWER_SUBMITTED',
    contestId: Number(contestId),
    questionIndex,
    answersCount: Number(ansCount[0]?.count || 0),
  })

  res.json({
    isCorrect,
    pointsAwarded,
    newScore,
    streak: newStreak,
    correctIndex: contest.status === 'question_ended' || contest.status === 'completed' ? currentQuestion.correct_index : undefined,
  })
})

// GET /api/contests/:id/live - Live polling endpoint
router.get('/:id/live', optionalAuthenticate, async (req, res) => {
  const contestId = req.params.id
  const userId = req.user?.id || null

  const [contests] = await pool.query('SELECT * FROM contests WHERE id = ? LIMIT 1', [contestId])
  if (!contests.length) return res.status(404).json({ message: 'Contest not found.' })

  const contest = contests[0]
  const isHost = userId && (contest.trainer_id === userId || req.user?.role === 'admin')

  const [questions] = await pool.query(
    'SELECT * FROM contest_questions WHERE contest_id = ? ORDER BY sort_order, id',
    [contestId],
  )

  const [approvedParts] = await pool.query(
    `SELECT p.id, p.user_id, p.score, p.streak, p.last_answered_index,
            u.username, u.first_name, u.last_name
     FROM contest_participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.contest_id = ? AND p.status = 'approved'
     ORDER BY p.score DESC`,
    [contestId],
  )

  const currentIdx = contest.current_question_index
  const currentQ = questions[currentIdx] || null

  let options = []
  if (currentQ) {
    try {
      options = JSON.parse(currentQ.options_json)
    } catch {
      options = []
    }
  }

  // Count answers for current question
  let currentAnswersCount = 0
  let optionDistribution = [0, 0, 0, 0]
  if (currentQ) {
    const [answers] = await pool.query(
      'SELECT selected_index, is_correct, points_awarded FROM contest_answers WHERE contest_id = ? AND question_id = ?',
      [contestId, currentQ.id],
    )
    currentAnswersCount = answers.length
    for (const a of answers) {
      if (a.selected_index >= 0 && a.selected_index < 4) {
        optionDistribution[a.selected_index]++
      }
    }
  }

  // Fetch caller's status and submitted answer for current question
  let myAnswer = null
  let myParticipant = null
  if (userId) {
    const [myParts] = await pool.query(
      'SELECT * FROM contest_participants WHERE contest_id = ? AND user_id = ? LIMIT 1',
      [contestId, userId],
    )
    myParticipant = myParts[0] || null

    if (myParticipant && currentQ) {
      const [ans] = await pool.query(
        'SELECT * FROM contest_answers WHERE participant_id = ? AND question_id = ? LIMIT 1',
        [myParticipant.id, currentQ.id],
      )
      myAnswer = ans[0] || null
    }
  }

  const revealAnswer = isHost || contest.status === 'question_ended' || contest.status === 'leaderboard' || contest.status === 'completed'

  res.json({
    contestId: contest.id,
    title: contest.title,
    status: contest.status,
    currentQuestionIndex: currentIdx,
    totalQuestions: questions.length,
    currentQuestionStartedAt: contest.current_question_started_at,
    leaderboardDurationSeconds: contest.leaderboard_duration_seconds,
    currentQuestion: currentQ
      ? {
          id: currentQ.id,
          prompt: currentQ.prompt,
          options,
          timeLimitSeconds: currentQ.time_limit_seconds,
          points: currentQ.points,
          correctIndex: revealAnswer ? currentQ.correct_index : undefined,
          explanation: revealAnswer ? currentQ.explanation : undefined,
        }
      : null,
    answersCount: currentAnswersCount,
    optionDistribution: revealAnswer ? optionDistribution : undefined,
    approvedParticipantsCount: approvedParts.length,
    leaderboard: approvedParts.slice(0, 10).map((p, idx) => ({
      rank: idx + 1,
      userId: p.user_id,
      username: p.username,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username,
      score: p.score,
      streak: p.streak,
    })),
    myParticipant: myParticipant
      ? {
          id: myParticipant.id,
          status: myParticipant.status,
          score: myParticipant.score,
          streak: myParticipant.streak,
          rank: approvedParts.findIndex((p) => p.user_id === userId) + 1 || null,
        }
      : null,
    myAnswer: myAnswer
      ? {
          selectedIndex: myAnswer.selected_index,
          isCorrect: myAnswer.is_correct,
          pointsAwarded: myAnswer.points_awarded,
          responseTimeMs: myAnswer.response_time_ms,
        }
      : null,
  })
})

// GET /api/contests/:id/leaderboard - Detailed leaderboard
router.get('/:id/leaderboard', optionalAuthenticate, async (req, res) => {
  const contestId = req.params.id

  const [rows] = await pool.query(
    `SELECT p.id, p.user_id, p.score, p.streak, p.last_answered_index,
            u.username, u.first_name, u.last_name,
            COUNT(a.id) AS total_answered,
            COUNT(CASE WHEN a.is_correct = 1 THEN 1 END) AS total_correct
     FROM contest_participants p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN contest_answers a ON a.participant_id = p.id
     WHERE p.contest_id = ? AND p.status = 'approved'
     GROUP BY p.id
     ORDER BY p.score DESC, total_correct DESC`,
    [contestId],
  )

  const ranked = rows.map((r, idx) => ({
    rank: idx + 1,
    id: r.id,
    userId: r.user_id,
    username: r.username,
    name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.username,
    score: r.score,
    streak: r.streak,
    totalAnswered: Number(r.total_answered || 0),
    totalCorrect: Number(r.total_correct || 0),
    accuracy: r.total_answered ? Math.round((r.total_correct / r.total_answered) * 100) : 0,
  }))

  res.json(ranked)
})

export default router
