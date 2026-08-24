import { Router } from 'express'
import OpenAI from 'openai'
import { pool } from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { getAiRuntimeConfig } from '../services/aiSettings.js'
import { ensureJobSchema, isCyberSecurityListing } from './jobs.routes.js'

const router = Router()
let schemaReady = false

function parseJson(value, fallback = []) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value) ?? fallback
  } catch {
    return fallback
  }
}

function extractMessageText(message) {
  if (typeof message?.content === 'string') return message.content
  if (Array.isArray(message?.content)) {
    return message.content.map((item) => item?.text || item?.content || '').join('')
  }
  return ''
}

function extractJsonObject(value) {
  const text = String(value || '').trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
    if (fenced) {
      try {
        return JSON.parse(fenced)
      } catch {
        // Continue to the balanced-object fallback.
      }
    }
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function normalizeText(value, maxLength = 12000) {
  return String(value || '').trim().slice(0, maxLength)
}

function safeHttpUrl(value) {
  const candidate = normalizeText(value, 2000)
  try {
    const url = new URL(candidate)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function decodeHtml(value) {
  const namedEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
      if (entity.startsWith('#')) {
        const hex = entity[1]?.toLowerCase() === 'x'
        const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
      }
      return namedEntities[entity.toLowerCase()] ?? match
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveDuckDuckGoUrl(value) {
  try {
    const url = new URL(decodeHtml(value), 'https://duckduckgo.com')
    const destination = url.searchParams.get('uddg')
    return safeHttpUrl(destination || url.toString())
  } catch {
    return ''
  }
}

function parseDuckDuckGoResults(html) {
  const results = []
  const blocks = String(html || '').split(/(?=<div[^>]+class="[^"]*\bresult\b)/i)
  for (const block of blocks) {
    const link = block.match(/<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a[^>]+href="([^"]+)"[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
    if (!link) continue
    const snippet = block.match(/<(?:a|div)[^>]+class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i)
    const item = {
      title: normalizeText(decodeHtml(link[2]), 500),
      url: resolveDuckDuckGoUrl(link[1]),
      snippet: normalizeText(decodeHtml(snippet?.[1]), 1500),
    }
    if (item.title && item.url && !results.some((existing) => existing.url === item.url)) {
      results.push(item)
    }
    if (results.length === 8) break
  }
  return results
}

function clampQuestionCount(value) {
  const count = Number(value)
  return Number.isInteger(count) ? Math.max(1, Math.min(25, count)) : 5
}

export async function ensureInterviewSchema() {
  if (schemaReady) return
  await ensureJobSchema()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS interview_practice_sessions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      recommendation_id BIGINT NULL,
      job_id BIGINT NULL,
      source_type ENUM('recommended', 'custom') NOT NULL,
      role_title VARCHAR(255) NOT NULL,
      company VARCHAR(255) NULL,
      job_description LONGTEXT NOT NULL,
      requirements LONGTEXT NULL,
      question_count INT NOT NULL DEFAULT 5,
      research_json LONGTEXT NULL,
      status ENUM('active', 'completed') NOT NULL DEFAULT 'active',
      completed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_interview_session_user_created (user_id, created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recommendation_id) REFERENCES student_job_recommendations(id) ON DELETE SET NULL,
      FOREIGN KEY (job_id) REFERENCES job_listings(id) ON DELETE SET NULL
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS interview_practice_questions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      session_id BIGINT NOT NULL,
      position INT NOT NULL,
      question_type ENUM('role', 'company_past') NOT NULL DEFAULT 'role',
      prompt LONGTEXT NOT NULL,
      competency VARCHAR(180) NULL,
      ideal_answer LONGTEXT NOT NULL,
      rubric LONGTEXT NULL,
      source_title VARCHAR(500) NULL,
      source_url TEXT NULL,
      source_snippet LONGTEXT NULL,
      answer_text LONGTEXT NULL,
      score INT NULL,
      verdict VARCHAR(40) NULL,
      feedback LONGTEXT NULL,
      strengths_json LONGTEXT NULL,
      improvements_json LONGTEXT NULL,
      evaluated_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_interview_session_position (session_id, position),
      FOREIGN KEY (session_id) REFERENCES interview_practice_sessions(id) ON DELETE CASCADE
    )
  `)
  schemaReady = true
}

async function getSearchConfig() {
  let apiConfig = {}
  try {
    const [[row]] = await pool.query('SELECT api_json FROM platform_config WHERE id = 1 LIMIT 1')
    apiConfig = parseJson(row?.api_json, {})
  } catch {
    apiConfig = {}
  }
  return {
    braveApiKey: normalizeText(
      apiConfig?.webSearch?.braveApiKey ||
      apiConfig?.search?.braveApiKey ||
      process.env.BRAVE_SEARCH_API_KEY,
      500,
    ),
  }
}

async function searchDuckDuckGo(query) {
  try {
    const body = new URLSearchParams({
      q: query,
      kl: 'wt-wt',
      kp: '1',
    })
    const response = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; IncognitrixAcademy/1.0; interview-research)',
      },
      body,
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) return []
    return parseDuckDuckGoResults(await response.text())
  } catch (error) {
    console.warn('DuckDuckGo interview search failed:', error?.message || error)
    return []
  }
}

async function searchInterviewSources({ roleTitle, company }) {
  const query = [company, roleTitle, 'interview questions experience'].filter(Boolean).join(' ')
  const duckDuckGoResults = await searchDuckDuckGo(query)
  if (duckDuckGoResults.length) return duckDuckGoResults

  const { braveApiKey } = await getSearchConfig()
  if (!braveApiKey) return []

  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search')
    url.searchParams.set('q', query)
    url.searchParams.set('count', '8')
    url.searchParams.set('safesearch', 'moderate')
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': braveApiKey,
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) return []
    const body = await response.json()
    return (body?.web?.results || []).slice(0, 8).map((item) => ({
      title: normalizeText(item?.title, 500),
      url: safeHttpUrl(item?.url),
      snippet: normalizeText(item?.description, 1500),
    })).filter((item) => item.title && item.url)
  } catch (error) {
    console.warn('Interview source search failed:', error?.message || error)
    return []
  }
}

function buildFallbackQuestions(context, count, priorPrompts = []) {
  const skills = Array.from(new Set([
    ...parseJson(context.skills, []),
    ...String(context.requirements || '').split(/[,;\n]/),
  ].map((item) => normalizeText(item, 120)).filter(Boolean)))
  const subjects = skills.length ? skills : ['core responsibilities', 'problem solving', 'communication', 'security judgment']
  const patterns = [
    (subject) => `How would you apply ${subject} in your first 30 days as a ${context.roleTitle}?`,
    (subject) => `Describe a project or learning experience that demonstrates your ability with ${subject}.`,
    (subject) => `What risks or common mistakes would you watch for when working with ${subject}?`,
    (subject) => `Explain ${subject} to a non-technical stakeholder and describe why it matters to this role.`,
    (subject) => `You encounter an unfamiliar problem involving ${subject}. Walk through how you would investigate it.`,
    (subject) => `Tell me about a trade-off you might face when applying ${subject} in this role. How would you decide?`,
    (subject) => `What evidence or metrics would you use to show that your work with ${subject} was successful?`,
  ]
  const prior = new Set(priorPrompts.map((item) => item.toLowerCase()))
  const output = []
  let sequence = 0
  while (output.length < count && sequence < count * 8) {
    const subject = subjects[sequence % subjects.length]
    const prompt = patterns[(sequence + Math.floor(sequence / Math.max(1, subjects.length))) % patterns.length](subject)
    if (!prior.has(prompt.toLowerCase()) && !output.some((item) => item.prompt === prompt)) {
      output.push({
        prompt,
        competency: subject,
        questionType: 'role',
        idealAnswer: `A strong answer should connect ${subject} to the responsibilities of the ${context.roleTitle} role, give a concrete example or structured approach, and explain the expected outcome.`,
        rubric: `Look for role relevance, accurate understanding of ${subject}, a clear process, and a concrete example.`,
        sourceTitle: '',
        sourceUrl: '',
        sourceSnippet: '',
      })
    }
    sequence += 1
  }
  return output
}

async function generateInterviewQuestions(context, count, research, priorPrompts) {
  const aiConfig = await getAiRuntimeConfig()
  if (!aiConfig.apiKey) return buildFallbackQuestions(context, count, priorPrompts)

  try {
    const client = new OpenAI({ baseURL: aiConfig.baseUrl, apiKey: aiConfig.apiKey })
    const response = await client.chat.completions.create({
      model: aiConfig.model,
      temperature: Math.max(0.7, Number(aiConfig.temperature || 0.8)),
      top_p: aiConfig.topP,
      max_tokens: Math.min(12000, Math.max(2400, count * 420)),
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'Create a realistic interview practice set. Return strict JSON only: {"questions":[{"prompt":"string","competency":"string","questionType":"role|company_past","idealAnswer":"string","rubric":"string","sourceTitle":"string","sourceUrl":"string","sourceSnippet":"string"}]}. Match the supplied job description and requirements closely. Mix technical, scenario, behavioral, and communication questions. Never repeat an excluded prompt. A company_past question is allowed ONLY when a supplied web result credibly supports that question or a very close form; preserve that result title, URL, and snippet. Otherwise use questionType role and leave source fields empty. Do not claim a question was asked by a company without supporting search evidence. Ideal answers must be educational, accurate, and specific to the role.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            ...context,
            requestedQuestionCount: count,
            sessionNonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            excludedPrompts: priorPrompts.slice(0, 100),
            webResearch: research,
          }),
        },
      ],
    })
    const parsed = extractJsonObject(extractMessageText(response?.choices?.[0]?.message))
    const researchByUrl = new Map(research.map((item) => [item.url, item]))
    const questions = (Array.isArray(parsed?.questions) ? parsed.questions : []).map((item) => {
      const source = researchByUrl.get(normalizeText(item?.sourceUrl, 2000))
      const isSourced = item?.questionType === 'company_past' && source
      return {
        prompt: normalizeText(item?.prompt, 3000),
        competency: normalizeText(item?.competency, 180),
        questionType: isSourced ? 'company_past' : 'role',
        idealAnswer: normalizeText(item?.idealAnswer, 6000),
        rubric: normalizeText(item?.rubric, 3000),
        sourceTitle: isSourced ? source.title : '',
        sourceUrl: isSourced ? source.url : '',
        sourceSnippet: isSourced ? source.snippet : '',
      }
    }).filter((item) => item.prompt && item.idealAnswer)

    const unique = []
    const seen = new Set(priorPrompts.map((item) => item.toLowerCase()))
    for (const question of questions) {
      const key = question.prompt.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(question)
      }
      if (unique.length === count) break
    }
    if (unique.length < count) {
      unique.push(...buildFallbackQuestions(context, count - unique.length, [...priorPrompts, ...unique.map((item) => item.prompt)]))
    }
    return unique.slice(0, count)
  } catch (error) {
    console.error('Interview question generation failed:', error)
    return buildFallbackQuestions(context, count, priorPrompts)
  }
}

function localEvaluation(question, answer) {
  const answerWords = new Set(answer.toLowerCase().match(/[a-z0-9+#.-]{3,}/g) || [])
  const targetWords = new Set(`${question.ideal_answer} ${question.rubric}`.toLowerCase().match(/[a-z0-9+#.-]{3,}/g) || [])
  const overlap = [...targetWords].filter((word) => answerWords.has(word)).length
  const detailScore = Math.min(45, Math.round(answerWords.size * 1.5))
  const score = Math.min(100, detailScore + Math.min(55, overlap * 7))
  return {
    score,
    verdict: score >= 75 ? 'Strong' : score >= 50 ? 'Developing' : 'Needs work',
    feedback: score >= 75
      ? 'Your answer covers the central ideas and gives useful detail.'
      : 'The answer needs a clearer structure, stronger role-specific detail, and a concrete example.',
    strengths: overlap ? ['Uses relevant role terminology'] : [],
    improvements: ['Connect the answer directly to the role', 'Add a concrete example and expected outcome'],
  }
}

async function evaluateAnswer(question, answer, session) {
  const aiConfig = await getAiRuntimeConfig()
  if (!aiConfig.apiKey) return localEvaluation(question, answer)
  try {
    const client = new OpenAI({ baseURL: aiConfig.baseUrl, apiKey: aiConfig.apiKey })
    const response = await client.chat.completions.create({
      model: aiConfig.model,
      temperature: 0.15,
      top_p: aiConfig.topP,
      max_tokens: 1200,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'Evaluate one interview answer fairly and constructively. Return strict JSON only: {"score":0-100,"verdict":"Strong|Developing|Needs work","feedback":"string","strengths":["string"],"improvements":["string"]}. Compare against the ideal answer and rubric, but accept equivalent correct approaches. Reward clear reasoning, honest assumptions, and relevant experience. Give 2-4 specific improvements and concise feedback.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            roleTitle: session.role_title,
            company: session.company,
            jobDescription: session.job_description,
            prompt: question.prompt,
            competency: question.competency,
            rubric: question.rubric,
            idealAnswer: question.ideal_answer,
            candidateAnswer: answer,
          }),
        },
      ],
    })
    const parsed = extractJsonObject(extractMessageText(response?.choices?.[0]?.message))
    if (!parsed || parsed.score === undefined) return localEvaluation(question, answer)
    const score = Math.max(0, Math.min(100, Number(parsed.score || 0)))
    return {
      score,
      verdict: ['Strong', 'Developing', 'Needs work'].includes(parsed.verdict)
        ? parsed.verdict
        : score >= 75 ? 'Strong' : score >= 50 ? 'Developing' : 'Needs work',
      feedback: normalizeText(parsed.feedback, 5000),
      strengths: (Array.isArray(parsed.strengths) ? parsed.strengths : []).map((item) => normalizeText(item, 500)).filter(Boolean).slice(0, 5),
      improvements: (Array.isArray(parsed.improvements) ? parsed.improvements : []).map((item) => normalizeText(item, 500)).filter(Boolean).slice(0, 5),
    }
  } catch (error) {
    console.error('Interview answer evaluation failed:', error)
    return localEvaluation(question, answer)
  }
}

function mapQuestion(row) {
  const answered = Boolean(row.evaluated_at)
  return {
    id: row.id,
    position: Number(row.position),
    questionType: row.question_type,
    prompt: row.prompt,
    competency: row.competency,
    source: row.source_url ? {
      title: row.source_title,
      url: row.source_url,
      snippet: row.source_snippet,
    } : null,
    answer: row.answer_text || '',
    answered,
    score: answered ? Number(row.score || 0) : null,
    verdict: answered ? row.verdict : null,
    feedback: answered ? row.feedback : null,
    correctAnswer: answered ? row.ideal_answer : null,
    strengths: answered ? parseJson(row.strengths_json, []) : [],
    improvements: answered ? parseJson(row.improvements_json, []) : [],
    evaluatedAt: row.evaluated_at,
  }
}

async function getSessionForUser(sessionId, userId) {
  const [[session]] = await pool.query(
    'SELECT * FROM interview_practice_sessions WHERE id = ? AND user_id = ? LIMIT 1',
    [sessionId, userId],
  )
  if (!session) return null
  const [questions] = await pool.query(
    'SELECT * FROM interview_practice_questions WHERE session_id = ? ORDER BY position',
    [sessionId],
  )
  const mapped = questions.map(mapQuestion)
  const answeredCount = mapped.filter((item) => item.answered).length
  const scores = mapped.filter((item) => item.answered).map((item) => item.score)
  return {
    id: session.id,
    sourceType: session.source_type,
    recommendationId: session.recommendation_id,
    jobId: session.job_id,
    roleTitle: session.role_title,
    company: session.company,
    jobDescription: session.job_description,
    requirements: session.requirements,
    questionCount: Number(session.question_count),
    status: session.status,
    answeredCount,
    averageScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    sourcedQuestionCount: mapped.filter((item) => item.questionType === 'company_past').length,
    questions: mapped,
    createdAt: session.created_at,
    completedAt: session.completed_at,
  }
}

router.use(authenticate)

router.get('/options', async (req, res, next) => {
  try {
    await ensureInterviewSchema()
    const [rows] = await pool.query(
      `SELECT sjr.id AS recommendation_id, sjr.job_id, sjr.match_score, sjr.probability_label,
              jl.title, jl.company, jl.location, jl.about_role, jl.requirements_json,
              jl.responsibilities_json, jl.skills_json, jl.details_markdown
       FROM student_job_recommendations sjr
       JOIN job_listings jl ON jl.id = sjr.job_id
       WHERE sjr.user_id = ? AND jl.is_active = true
       ORDER BY sjr.match_score DESC, sjr.updated_at DESC`,
      [req.user.id],
    )
    const seen = new Set()
    const options = rows.filter((row) => isCyberSecurityListing(row)).filter((row) => {
      const key = `${String(row.company).toLowerCase()}|${String(row.title).toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).map((row) => ({
      recommendationId: row.recommendation_id,
      jobId: row.job_id,
      title: row.title,
      company: row.company,
      location: row.location,
      matchScore: Number(row.match_score || 0),
      probabilityLabel: row.probability_label,
      description: row.about_role || row.details_markdown || '',
      requirements: parseJson(row.requirements_json, []),
      responsibilities: parseJson(row.responsibilities_json, []),
      skills: parseJson(row.skills_json, []),
    }))
    res.json(options)
  } catch (error) {
    next(error)
  }
})

router.get('/sessions', async (req, res, next) => {
  try {
    await ensureInterviewSchema()
    const [rows] = await pool.query(
      `SELECT s.*, COUNT(q.id) AS total_questions,
              SUM(CASE WHEN q.evaluated_at IS NOT NULL THEN 1 ELSE 0 END) AS answered_questions,
              ROUND(AVG(CASE WHEN q.evaluated_at IS NOT NULL THEN q.score END)) AS average_score
       FROM interview_practice_sessions s
       LEFT JOIN interview_practice_questions q ON q.session_id = s.id
       WHERE s.user_id = ?
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT 20`,
      [req.user.id],
    )
    res.json(rows.map((row) => ({
      id: row.id,
      roleTitle: row.role_title,
      company: row.company,
      sourceType: row.source_type,
      status: row.status,
      questionCount: Number(row.total_questions || row.question_count || 0),
      answeredCount: Number(row.answered_questions || 0),
      averageScore: row.average_score === null ? null : Number(row.average_score),
      createdAt: row.created_at,
    })))
  } catch (error) {
    next(error)
  }
})

router.get('/sessions/:sessionId', async (req, res, next) => {
  try {
    await ensureInterviewSchema()
    const session = await getSessionForUser(req.params.sessionId, req.user.id)
    if (!session) return res.status(404).json({ message: 'Interview session not found.' })
    return res.json(session)
  } catch (error) {
    return next(error)
  }
})

router.post('/sessions', async (req, res, next) => {
  try {
    await ensureInterviewSchema()
    const sourceType = req.body?.sourceType === 'custom' ? 'custom' : 'recommended'
    const questionCount = clampQuestionCount(req.body?.questionCount)
    let context
    let recommendationId = null
    let jobId = null

    if (sourceType === 'recommended') {
      recommendationId = Number(req.body?.recommendationId)
      if (!Number.isInteger(recommendationId)) {
        return res.status(400).json({ message: 'Select a recommended job.' })
      }
      const [[row]] = await pool.query(
        `SELECT sjr.id AS recommendation_id, sjr.job_id, jl.*
         FROM student_job_recommendations sjr
         JOIN job_listings jl ON jl.id = sjr.job_id
         WHERE sjr.id = ? AND sjr.user_id = ? AND jl.is_active = true LIMIT 1`,
        [recommendationId, req.user.id],
      )
      if (!row) return res.status(404).json({ message: 'Recommended job not found.' })
      jobId = row.job_id
      context = {
        roleTitle: row.title,
        company: row.company,
        jobDescription: row.about_role || row.details_markdown || '',
        requirements: parseJson(row.requirements_json, []).join('\n'),
        responsibilities: parseJson(row.responsibilities_json, []),
        skills: parseJson(row.skills_json, []),
      }
    } else {
      context = {
        roleTitle: normalizeText(req.body?.roleTitle, 255),
        company: normalizeText(req.body?.company, 255),
        jobDescription: normalizeText(req.body?.jobDescription, 12000),
        requirements: normalizeText(req.body?.requirements, 12000),
        responsibilities: [],
        skills: [],
      }
      if (context.roleTitle.length < 2 || context.jobDescription.length < 30) {
        return res.status(400).json({ message: 'Add a role title and a job description of at least 30 characters.' })
      }
    }

    const [priorRows] = await pool.query(
      `SELECT q.prompt FROM interview_practice_questions q
       JOIN interview_practice_sessions s ON s.id = q.session_id
       WHERE s.user_id = ? AND LOWER(s.role_title) = LOWER(?)
       ORDER BY q.created_at DESC LIMIT 100`,
      [req.user.id, context.roleTitle],
    )
    const priorPrompts = priorRows.map((row) => row.prompt)
    const research = await searchInterviewSources(context)
    const questions = await generateInterviewQuestions(context, questionCount, research, priorPrompts)

    const [result] = await pool.query(
      `INSERT INTO interview_practice_sessions (
        user_id, recommendation_id, job_id, source_type, role_title, company,
        job_description, requirements, question_count, research_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        recommendationId,
        jobId,
        sourceType,
        context.roleTitle,
        context.company || null,
        context.jobDescription,
        context.requirements,
        questions.length,
        JSON.stringify(research),
      ],
    )
    for (const [index, question] of questions.entries()) {
      await pool.query(
        `INSERT INTO interview_practice_questions (
          session_id, position, question_type, prompt, competency, ideal_answer, rubric,
          source_title, source_url, source_snippet
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.insertId,
          index + 1,
          question.questionType,
          question.prompt,
          question.competency,
          question.idealAnswer,
          question.rubric,
          question.sourceTitle || null,
          question.sourceUrl || null,
          question.sourceSnippet || null,
        ],
      )
    }
    const session = await getSessionForUser(result.insertId, req.user.id)
    return res.status(201).json(session)
  } catch (error) {
    return next(error)
  }
})

router.post('/sessions/:sessionId/questions/:questionId/answer', async (req, res, next) => {
  try {
    await ensureInterviewSchema()
    const answer = normalizeText(req.body?.answer, 20000)
    if (answer.length < 10) {
      return res.status(400).json({ message: 'Write a more complete answer before submitting.' })
    }
    const [[session]] = await pool.query(
      'SELECT * FROM interview_practice_sessions WHERE id = ? AND user_id = ? LIMIT 1',
      [req.params.sessionId, req.user.id],
    )
    if (!session) return res.status(404).json({ message: 'Interview session not found.' })
    const [[question]] = await pool.query(
      'SELECT * FROM interview_practice_questions WHERE id = ? AND session_id = ? LIMIT 1',
      [req.params.questionId, session.id],
    )
    if (!question) return res.status(404).json({ message: 'Interview question not found.' })
    if (question.evaluated_at) {
      return res.status(409).json({ message: 'This answer has already been evaluated.' })
    }

    const evaluation = await evaluateAnswer(question, answer, session)
    await pool.query(
      `UPDATE interview_practice_questions
       SET answer_text = ?, score = ?, verdict = ?, feedback = ?, strengths_json = ?,
           improvements_json = ?, evaluated_at = NOW()
       WHERE id = ? AND session_id = ?`,
      [
        answer,
        evaluation.score,
        evaluation.verdict,
        evaluation.feedback,
        JSON.stringify(evaluation.strengths),
        JSON.stringify(evaluation.improvements),
        question.id,
        session.id,
      ],
    )
    const [[remaining]] = await pool.query(
      'SELECT COUNT(*) AS count FROM interview_practice_questions WHERE session_id = ? AND evaluated_at IS NULL',
      [session.id],
    )
    if (Number(remaining.count) === 0) {
      await pool.query(
        "UPDATE interview_practice_sessions SET status = 'completed', completed_at = NOW() WHERE id = ?",
        [session.id],
      )
    }
    const updatedSession = await getSessionForUser(session.id, req.user.id)
    return res.json(updatedSession)
  } catch (error) {
    return next(error)
  }
})

export default router
