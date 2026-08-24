import { Router } from 'express'
import OpenAI from 'openai'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { getAiRuntimeConfig } from '../services/aiSettings.js'
import { executeCodeOnServer } from '../services/codeExecutor.js'

const router = Router()
let schemaReady = false

const PASS_SCORE = 75

function parseJson(value, fallback = []) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value) ?? fallback
  } catch {
    return fallback
  }
}

function normalizeText(value, maxLength = 20000) {
  return String(value || '').trim().slice(0, maxLength)
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

// Mirrors the frontend check (src/utils/codeRunner.js): only true
// resource-loading elements can taint the player's screenshot capture or
// reach the network on their own, so only those are rejected. A plain
// <a href="https://...">, by contrast, is inert until clicked.
const RESOURCE_LOADING_TAGS = new Set(['img', 'script', 'iframe', 'source', 'video', 'audio', 'embed', 'link', 'object'])
const OPENING_TAG_PATTERN = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
const EXTERNAL_ATTR_PATTERN = /\b(?:src|href|poster)\s*=\s*["']\s*(?:https?:)?\/\/[^"'>]+["']/i
const EXTERNAL_CSS_PATTERN = /url\(\s*["']?\s*(?:https?:)?\/\/[^)"']+["']?\s*\)|@import\s+(?:url\(\s*)?["']?\s*(?:https?:)?\/\/[^)"';]+/gi

function findExternalResourceReferences(html) {
  const text = String(html || '')
  const refs = []
  for (const match of text.matchAll(OPENING_TAG_PATTERN)) {
    if (!RESOURCE_LOADING_TAGS.has(match[1].toLowerCase())) continue
    const attrMatch = EXTERNAL_ATTR_PATTERN.exec(match[2])
    if (attrMatch) refs.push(match[0].trim())
  }
  for (const match of text.matchAll(EXTERNAL_CSS_PATTERN)) {
    refs.push(match[0].trim())
  }
  return refs
}

function clampQuestionCount(value) {
  const count = Number(value)
  return Number.isInteger(count) ? Math.max(3, Math.min(15, count)) : 5
}

export async function ensureLabResearchSchema() {
  if (schemaReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_research_projects (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      stack VARCHAR(1000) NULL,
      contributors VARCHAR(1000) NULL,
      summary TEXT NULL,
      explanation LONGTEXT NOT NULL,
      topics LONGTEXT NULL,
      project_type ENUM('web', 'program', 'research') NOT NULL DEFAULT 'research',
      question_count INT NOT NULL DEFAULT 5,
      coding_enabled TINYINT(1) NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_research_progress (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT NOT NULL,
      user_id INT NOT NULL,
      quiz_score INT NOT NULL DEFAULT 0,
      quiz_completed_at DATETIME NULL,
      code_attempts INT NOT NULL DEFAULT 0,
      code_accepted_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_lab_research_progress (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES lab_research_projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_research_quiz_attempts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT NOT NULL,
      user_id INT NOT NULL,
      status ENUM('active', 'completed') NOT NULL DEFAULT 'active',
      score INT NOT NULL DEFAULT 0,
      completed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_lab_quiz_attempt_user (user_id, project_id),
      FOREIGN KEY (project_id) REFERENCES lab_research_projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_research_quiz_questions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      attempt_id BIGINT NOT NULL,
      position INT NOT NULL,
      prompt LONGTEXT NOT NULL,
      ideal_answer LONGTEXT NOT NULL,
      rubric LONGTEXT NULL,
      answer_text LONGTEXT NULL,
      score INT NULL,
      is_correct TINYINT(1) NULL,
      feedback LONGTEXT NULL,
      evaluated_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_lab_quiz_position (attempt_id, position),
      FOREIGN KEY (attempt_id) REFERENCES lab_research_quiz_attempts(id) ON DELETE CASCADE
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_research_code_challenges (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT NOT NULL,
      user_id INT NOT NULL,
      scenario LONGTEXT NOT NULL,
      challenge_kind ENUM('function', 'ui') NOT NULL DEFAULT 'function',
      language VARCHAR(60) NOT NULL DEFAULT 'javascript',
      starter_code LONGTEXT NULL,
      test_cases_json LONGTEXT NOT NULL,
      status ENUM('active', 'accepted') NOT NULL DEFAULT 'active',
      accepted_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_lab_code_challenge_user (user_id, project_id),
      FOREIGN KEY (project_id) REFERENCES lab_research_projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_research_code_submissions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      challenge_id BIGINT NOT NULL,
      code LONGTEXT NOT NULL,
      passed TINYINT(1) NOT NULL DEFAULT 0,
      results_json LONGTEXT NULL,
      feedback LONGTEXT NULL,
      screenshot LONGTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (challenge_id) REFERENCES lab_research_code_challenges(id) ON DELETE CASCADE
    )
  `)
  // Columns added after the initial release; ignore "duplicate column" errors
  // when the table already has them.
  try {
    await pool.query("ALTER TABLE lab_research_code_challenges ADD COLUMN challenge_kind ENUM('function', 'ui') NOT NULL DEFAULT 'function' AFTER scenario")
  } catch { /* column exists */ }
  try {
    await pool.query('ALTER TABLE lab_research_code_submissions ADD COLUMN screenshot LONGTEXT NULL AFTER feedback')
  } catch { /* column exists */ }
  try {
    await pool.query("ALTER TABLE lab_research_quiz_attempts MODIFY status ENUM('active', 'completed', 'terminated') NOT NULL DEFAULT 'active'")
  } catch { /* already migrated */ }
  try {
    await pool.query('ALTER TABLE lab_research_quiz_attempts ADD COLUMN terminated_reason VARCHAR(60) NULL AFTER completed_at')
  } catch { /* column exists */ }
  schemaReady = true
}

function mapProject(row, { includeStats = false } = {}) {
  const project = {
    id: row.id,
    title: row.title,
    stack: row.stack || '',
    contributors: row.contributors || '',
    summary: row.summary || '',
    explanation: row.explanation || '',
    topics: row.topics || '',
    projectType: row.project_type,
    questionCount: Number(row.question_count || 5),
    codingEnabled: Boolean(row.coding_enabled),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  if (includeStats) {
    project.quizCompletions = Number(row.quiz_completions || 0)
    project.codeCompletions = Number(row.code_completions || 0)
  }
  return project
}

async function getProgress(projectId, userId) {
  const [[row]] = await pool.query(
    'SELECT * FROM lab_research_progress WHERE project_id = ? AND user_id = ? LIMIT 1',
    [projectId, userId],
  )
  return {
    quizScore: Number(row?.quiz_score || 0),
    quizCompleted: Boolean(row?.quiz_completed_at),
    quizCompletedAt: row?.quiz_completed_at || null,
    codeAttempts: Number(row?.code_attempts || 0),
    codeAccepted: Boolean(row?.code_accepted_at),
    codeAcceptedAt: row?.code_accepted_at || null,
  }
}

async function upsertProgress(projectId, userId, fields) {
  await pool.query(
    'INSERT IGNORE INTO lab_research_progress (project_id, user_id) VALUES (?, ?)',
    [projectId, userId],
  )
  const assignments = []
  const values = []
  if (fields.quizScore !== undefined) {
    assignments.push('quiz_score = GREATEST(quiz_score, ?)')
    values.push(fields.quizScore)
  }
  if (fields.quizCompleted) {
    assignments.push('quiz_completed_at = COALESCE(quiz_completed_at, NOW())')
  }
  if (fields.incrementCodeAttempts) {
    assignments.push('code_attempts = code_attempts + 1')
  }
  if (fields.codeAccepted) {
    assignments.push('code_accepted_at = COALESCE(code_accepted_at, NOW())')
  }
  if (!assignments.length) return
  values.push(projectId, userId)
  await pool.query(
    `UPDATE lab_research_progress SET ${assignments.join(', ')} WHERE project_id = ? AND user_id = ?`,
    values,
  )
}

function projectContext(project) {
  return {
    title: project.title,
    stack: project.stack,
    contributors: project.contributors,
    summary: project.summary,
    explanation: project.explanation,
    topicsLearnt: project.topics,
    projectType: project.project_type,
  }
}

function buildFallbackQuestions(project, count, priorPrompts = []) {
  const topics = String(project.topics || '')
    .split(/[,;\n•-]/)
    .map((item) => normalizeText(item, 140))
    .filter((item) => item.length > 2)
  const subjects = topics.length
    ? topics
    : [`the architecture of ${project.title}`, `the technology stack (${project.stack || 'the tools used'})`, 'the implementation approach', 'the main challenges of the project']
  const patterns = [
    (subject) => `Based on the project write-up, explain the role of ${subject} in "${project.title}" and how it was applied during implementation.`,
    (subject) => `What would you need to understand about ${subject} to rebuild a project like "${project.title}" yourself? Describe the key concepts.`,
    (subject) => `Describe how ${subject} connects to the overall implementation of "${project.title}" as documented in the research write-up.`,
    (subject) => `If you had to teach a teammate about ${subject} as used in "${project.title}", what are the essential points you would cover?`,
  ]
  const questions = []
  const seen = new Set(priorPrompts.map((item) => String(item).toLowerCase()))
  let index = 0
  while (questions.length < count && index < count * 12) {
    const subject = subjects[index % subjects.length]
    const prompt = patterns[(index + Math.floor(index / patterns.length)) % patterns.length](subject)
    if (!seen.has(prompt.toLowerCase()) && !questions.some((item) => item.prompt === prompt)) {
      seen.add(prompt.toLowerCase())
      questions.push({
        prompt,
        idealAnswer: `A correct answer should accurately describe ${subject} using the details documented in the project explanation, connect it to how "${project.title}" was implemented, and show understanding of why it was needed.`,
        rubric: `Check for accurate understanding of ${subject}, references to the documented implementation, and correct reasoning about why it matters to the project.`,
      })
    }
    index += 1
  }
  return questions
}

async function generateQuizQuestions(project, count, priorPrompts = []) {
  const aiConfig = await getAiRuntimeConfig()
  if (!aiConfig.apiKey) return buildFallbackQuestions(project, count, priorPrompts)
  try {
    const client = new OpenAI({ baseURL: aiConfig.baseUrl, apiKey: aiConfig.apiKey })
    const response = await client.chat.completions.create({
      model: aiConfig.model,
      temperature: Math.max(0.6, Number(aiConfig.temperature || 0.7)),
      top_p: aiConfig.topP,
      max_tokens: Math.min(8000, Math.max(2000, count * 400)),
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'You are a strict examiner for a lab research knowledge check. Using ONLY the supplied project documentation, write comprehension questions that verify the learner truly understood the project: its implementation, its technology stack, and the topics one must learn to build a similar project. Return strict JSON only: {"questions":[{"prompt":"string","idealAnswer":"string","rubric":"string"}]}. Every question must be answerable from the supplied content. Mix conceptual, implementation-detail, and "how would you rebuild this" questions. NEVER repeat or closely paraphrase any prompt in excludedPrompts — every question must be genuinely new; vary the angle, the sub-topic, and the phrasing. Ideal answers must be grounded in the documentation.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            requestedQuestionCount: count,
            nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            excludedPrompts: priorPrompts.slice(0, 100),
            project: projectContext(project),
          }),
        },
      ],
    })
    const parsed = extractJsonObject(extractMessageText(response?.choices?.[0]?.message))
    const seen = new Set(priorPrompts.map((item) => String(item).toLowerCase()))
    const questions = []
    for (const item of Array.isArray(parsed?.questions) ? parsed.questions : []) {
      const question = {
        prompt: normalizeText(item?.prompt, 3000),
        idealAnswer: normalizeText(item?.idealAnswer, 6000),
        rubric: normalizeText(item?.rubric, 3000),
      }
      const key = question.prompt.toLowerCase()
      if (question.prompt && question.idealAnswer && !seen.has(key)) {
        seen.add(key)
        questions.push(question)
      }
      if (questions.length === count) break
    }
    if (questions.length < count) {
      questions.push(...buildFallbackQuestions(project, count - questions.length, [...priorPrompts, ...questions.map((item) => item.prompt)]))
    }
    return questions.slice(0, count)
  } catch (error) {
    console.error('Lab research question generation failed:', error)
    return buildFallbackQuestions(project, count, priorPrompts)
  }
}

function localAnswerEvaluation(question, answer) {
  const answerWords = new Set(answer.toLowerCase().match(/[a-z0-9+#.-]{3,}/g) || [])
  const targetWords = new Set(`${question.ideal_answer} ${question.rubric}`.toLowerCase().match(/[a-z0-9+#.-]{3,}/g) || [])
  const overlap = [...targetWords].filter((word) => answerWords.has(word)).length
  const detailScore = Math.min(40, Math.round(answerWords.size * 1.5))
  const score = Math.min(100, detailScore + Math.min(60, overlap * 6))
  return {
    score,
    isCorrect: score >= PASS_SCORE,
    feedback: score >= PASS_SCORE
      ? 'Your answer covers the key ideas from the project documentation.'
      : 'The answer is missing key details from the project documentation. Re-read the explanation and try again with more specific detail.',
  }
}

async function evaluateQuizAnswer(project, question, answer) {
  const aiConfig = await getAiRuntimeConfig()
  if (!aiConfig.apiKey) return localAnswerEvaluation(question, answer)
  try {
    const client = new OpenAI({ baseURL: aiConfig.baseUrl, apiKey: aiConfig.apiKey })
    const response = await client.chat.completions.create({
      model: aiConfig.model,
      temperature: 0.1,
      top_p: aiConfig.topP,
      max_tokens: 900,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'Grade one knowledge-check answer about a documented lab research project. Return strict JSON only: {"score":0-100,"isCorrect":true|false,"feedback":"string"}. The answer is correct (isCorrect true, score >= 75) only when it demonstrates genuine understanding consistent with the project documentation and ideal answer; accept equivalent correct phrasing. Give short, specific feedback telling the learner what to improve when incorrect.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            project: { title: project.title, stack: project.stack, summary: project.summary },
            prompt: question.prompt,
            rubric: question.rubric,
            idealAnswer: question.ideal_answer,
            learnerAnswer: answer,
          }),
        },
      ],
    })
    const parsed = extractJsonObject(extractMessageText(response?.choices?.[0]?.message))
    if (!parsed || parsed.score === undefined) return localAnswerEvaluation(question, answer)
    const score = Math.max(0, Math.min(100, Number(parsed.score || 0)))
    return {
      score,
      isCorrect: typeof parsed.isCorrect === 'boolean' ? parsed.isCorrect && score >= PASS_SCORE : score >= PASS_SCORE,
      feedback: normalizeText(parsed.feedback, 4000),
    }
  } catch (error) {
    console.error('Lab research answer evaluation failed:', error)
    return localAnswerEvaluation(question, answer)
  }
}

function mapQuizQuestion(row) {
  const answered = Boolean(row.evaluated_at)
  return {
    id: row.id,
    position: Number(row.position),
    prompt: row.prompt,
    answer: row.answer_text || '',
    answered,
    isCorrect: answered ? Boolean(row.is_correct) : null,
    score: answered ? Number(row.score || 0) : null,
    feedback: answered ? row.feedback : null,
    idealAnswer: answered && row.is_correct ? row.ideal_answer : null,
  }
}

async function getQuizAttempt(attemptId, userId) {
  const [[attempt]] = await pool.query(
    'SELECT * FROM lab_research_quiz_attempts WHERE id = ? AND user_id = ? LIMIT 1',
    [attemptId, userId],
  )
  if (!attempt) return null
  const [questions] = await pool.query(
    'SELECT * FROM lab_research_quiz_questions WHERE attempt_id = ? ORDER BY position',
    [attemptId],
  )
  const mapped = questions.map(mapQuizQuestion)
  const correctCount = mapped.filter((item) => item.isCorrect).length
  const score = mapped.length ? Math.round((correctCount / mapped.length) * 100) : 0
  return {
    id: attempt.id,
    projectId: attempt.project_id,
    status: attempt.status,
    terminatedReason: attempt.terminated_reason || null,
    score,
    correctCount,
    totalQuestions: mapped.length,
    completedAt: attempt.completed_at,
    questions: mapped,
  }
}

const UI_STARTER_CODE = `<!DOCTYPE html>
<html>
<head>
  <style>
    /* Your styles here */
  </style>
</head>
<body>
  <!-- Build the requested UI here -->
  <script>
    // Your interactivity here
  </script>
</body>
</html>
`

function buildFallbackCodeChallenge(project) {
  if (project.project_type === 'web') {
    return {
      kind: 'ui',
      scenario: `UI scenario based on "${project.title}": build a small status dashboard widget as a single HTML page. Requirements: (1) a heading element with id "dashboard-title" containing the project name, (2) at least three elements with the class "stat-card", each containing a child element with the class "stat-value", (3) a button with id "refresh-btn" that, when clicked, updates an element with id "last-updated" to show a new timestamp. Style it so the cards sit side by side.`,
      language: 'html',
      starterCode: UI_STARTER_CODE,
      testCases: [
        { description: 'A heading with id "dashboard-title" exists and is not empty', expression: '!!document.querySelector("#dashboard-title") && document.querySelector("#dashboard-title").textContent.trim().length > 0' },
        { description: 'At least three elements with class "stat-card" exist', expression: 'document.querySelectorAll(".stat-card").length >= 3' },
        { description: 'Every stat card contains a ".stat-value" child', expression: 'Array.from(document.querySelectorAll(".stat-card")).every(function(card){ return card.querySelector(".stat-value"); })' },
        { description: 'Clicking #refresh-btn fills #last-updated with text', expression: '(function(){ var btn = document.querySelector("#refresh-btn"); var out = document.querySelector("#last-updated"); if (!btn || !out) return false; btn.click(); return out.textContent.trim().length > 0; })()' },
      ],
    }
  }
  return {
    kind: 'function',
    scenario: `Scenario based on "${project.title}": write a function named solve(input) in JavaScript. The input is a string of space-separated integers. Return an object {"sum": sumOfAll, "max": largestValue, "evens": countOfEvenNumbers}. Handle an empty string by returning {"sum":0,"max":null,"evens":0}.`,
    language: 'javascript',
    starterCode: 'function solve(input) {\n  // Write your implementation here\n}\n',
    testCases: [
      { input: '3 8 5 2', expectedOutput: '{"sum":18,"max":8,"evens":2}', description: 'Mixed integers' },
      { input: '7', expectedOutput: '{"sum":7,"max":7,"evens":0}', description: 'Single value' },
      { input: '', expectedOutput: '{"sum":0,"max":null,"evens":0}', description: 'Empty input edge case' },
    ],
  }
}

const FUNCTION_CHALLENGE_PROMPT =
  'Design one self-contained coding challenge inspired by a documented lab research project. Return strict JSON only: {"scenario":"string","language":"string","starterCode":"string","testCases":[{"input":"string","expectedOutput":"string","description":"string"}]}. Rules: the challenge must be solvable as a single pure function named solve(input) that takes one string input and returns a value whose JSON serialization is compared to expectedOutput; pick the language that matches the project stack (javascript or python); write a realistic scenario tied to the project domain (2-3 paragraphs); provide 3-6 deterministic test cases including at least one edge case; expectedOutput must be exact JSON-serializable text.'

const UI_CHALLENGE_PROMPT =
  'Design one self-contained front-end UI coding challenge inspired by a documented web project. The player writes a SINGLE standalone HTML file (inline CSS and JavaScript, no external resources) that is rendered in a sandboxed iframe. Return strict JSON only: {"scenario":"string","testCases":[{"description":"string","expression":"string"}]}. Rules: the scenario (2-3 paragraphs) must describe a concrete small UI feature tied to the project domain, listing exact required element ids/classes and behaviors; provide 4-8 test cases where each expression is a single synchronous JavaScript boolean expression evaluated inside the rendered page with full DOM access (document, querySelector, simulated .click() calls are allowed); expressions must be deterministic, self-contained, must not use async/await, timers, network, or alert/confirm/prompt; each expression must verify exactly what its description says; include at least one interaction check that clicks an element and asserts the resulting DOM change.'

async function generateCodeChallenge(project) {
  const aiConfig = await getAiRuntimeConfig()
  if (!aiConfig.apiKey) return buildFallbackCodeChallenge(project)
  const isUi = project.project_type === 'web'
  try {
    const client = new OpenAI({ baseURL: aiConfig.baseUrl, apiKey: aiConfig.apiKey })
    const response = await client.chat.completions.create({
      model: aiConfig.model,
      temperature: 0.7,
      top_p: aiConfig.topP,
      max_tokens: 3000,
      stream: false,
      messages: [
        { role: 'system', content: isUi ? UI_CHALLENGE_PROMPT : FUNCTION_CHALLENGE_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            project: projectContext(project),
          }),
        },
      ],
    })
    const parsed = extractJsonObject(extractMessageText(response?.choices?.[0]?.message))
    const scenario = normalizeText(parsed?.scenario, 8000)

    if (isUi) {
      const testCases = (Array.isArray(parsed?.testCases) ? parsed.testCases : [])
        .map((item) => ({
          description: normalizeText(item?.description, 500),
          expression: normalizeText(item?.expression, 2000),
        }))
        .filter((item) => item.description && item.expression)
        // A syntactically broken expression (stray await, unbalanced parens,
        // reserved-word misuse, etc.) can never be satisfied by any HTML the
        // player writes — it would fail every single attempt. Only keep
        // checks that at least parse as valid JavaScript.
        .filter((item) => {
          try {
            new Function(`return !!(${item.expression})`)
            return true
          } catch {
            return false
          }
        })
        .slice(0, 8)
      if (!scenario || testCases.length < 3) return buildFallbackCodeChallenge(project)
      return { kind: 'ui', scenario, language: 'html', starterCode: UI_STARTER_CODE, testCases }
    }

    const testCases = (Array.isArray(parsed?.testCases) ? parsed.testCases : [])
      .map((item) => ({
        input: normalizeText(item?.input, 4000),
        expectedOutput: normalizeText(item?.expectedOutput, 4000),
        description: normalizeText(item?.description, 500),
      }))
      .filter((item) => item.expectedOutput)
      .slice(0, 6)
    if (!scenario || testCases.length < 2) return buildFallbackCodeChallenge(project)
    const language = ['javascript', 'python'].includes(String(parsed?.language || '').toLowerCase())
      ? String(parsed.language).toLowerCase()
      : 'javascript'
    return {
      kind: 'function',
      scenario,
      language,
      starterCode: normalizeText(parsed?.starterCode, 4000) ||
        (language === 'python' ? 'def solve(input):\n    # Write your implementation here\n    pass\n' : 'function solve(input) {\n  // Write your implementation here\n}\n'),
      testCases,
    }
  } catch (error) {
    console.error('Lab research code challenge generation failed:', error)
    return buildFallbackCodeChallenge(project)
  }
}

function localCodeEvaluation(challenge, code) {
  const testCases = parseJson(challenge.test_cases_json, [])
  const hasSolve = /(function\s+solve\s*\(|def\s+solve\s*\(|const\s+solve\s*=|let\s+solve\s*=)/.test(code)
  const results = testCases.map((testCase, index) => ({
    index: index + 1,
    description: testCase.description || `Test case ${index + 1}`,
    passed: false,
    detail: hasSolve
      ? 'AI judge is unavailable, so this submission could not be verified. Ask an admin to configure the AI provider.'
      : 'No solve(...) implementation was found in the submission.',
  }))
  return {
    passed: false,
    results,
    feedback: 'The AI judge is not configured, so submissions cannot be verified right now. Please try again once the platform AI is enabled.',
  }
}

async function evaluateCodeSubmission(project, challenge, code) {
  const aiConfig = await getAiRuntimeConfig()
  if (!aiConfig.apiKey) return localCodeEvaluation(challenge, code)
  const testCases = parseJson(challenge.test_cases_json, [])
  try {
    const client = new OpenAI({ baseURL: aiConfig.baseUrl, apiKey: aiConfig.apiKey })
    const response = await client.chat.completions.create({
      model: aiConfig.model,
      temperature: 0,
      top_p: aiConfig.topP,
      max_tokens: 2500,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'You are a meticulous code judge. Execute the submitted solve(input) implementation mentally against each supplied test case, exactly as an interpreter would. Return strict JSON only: {"results":[{"index":1,"passed":true|false,"actualOutput":"string","detail":"string"}],"passed":true|false,"feedback":"string"}. Mark a test passed ONLY when the code, run correctly, would produce output whose JSON serialization matches expectedOutput exactly. Syntax errors, missing solve function, hardcoding expected outputs without real logic, or wrong results fail the relevant tests. "passed" is true only when every test passes. Feedback must be short, concrete, and mention the first failing behavior when failing.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            scenario: challenge.scenario,
            language: challenge.language,
            testCases,
            submittedCode: normalizeText(code, 30000),
          }),
        },
      ],
    })
    const parsed = extractJsonObject(extractMessageText(response?.choices?.[0]?.message))
    if (!parsed || !Array.isArray(parsed.results)) return localCodeEvaluation(challenge, code)
    const results = testCases.map((testCase, index) => {
      const result = parsed.results.find((item) => Number(item?.index) === index + 1) || parsed.results[index]
      return {
        index: index + 1,
        description: testCase.description || `Test case ${index + 1}`,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: normalizeText(result?.actualOutput, 2000),
        passed: Boolean(result?.passed),
        detail: normalizeText(result?.detail, 1000),
      }
    })
    const passed = results.length > 0 && results.every((item) => item.passed) && Boolean(parsed.passed)
    return {
      passed,
      results,
      feedback: normalizeText(parsed.feedback, 4000),
    }
  } catch (error) {
    console.error('Lab research code evaluation failed:', error)
    return localCodeEvaluation(challenge, code)
  }
}

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (typeof a === 'number') return Number.isNaN(a) && Number.isNaN(b)
  if (a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => deepEqual(a[key], b[key]))
}

function outputsMatch(expectedOutput, actualSerialized) {
  const expectedText = String(expectedOutput ?? '').trim()
  const actualText = String(actualSerialized ?? '').trim()
  if (expectedText === actualText) return true
  try {
    return deepEqual(JSON.parse(expectedText), JSON.parse(actualText))
  } catch {
    try {
      const parsedActual = JSON.parse(actualText)
      return typeof parsedActual === 'string' && parsedActual.trim() === expectedText
    } catch {
      return false
    }
  }
}

// Grades a run produced by the server-side executor (authoritative).
function gradeServerRun(challenge, execution) {
  const testCases = parseJson(challenge.test_cases_json, [])
  if (execution.error) {
    return {
      passed: false,
      results: testCases.map((testCase, index) => ({
        index: index + 1,
        description: testCase.description || `Test case ${index + 1}`,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: '',
        passed: false,
        detail: execution.error,
      })),
      feedback: execution.error,
    }
  }
  const results = testCases.map((testCase, index) => {
    const run = execution.runs[index]
    if (!run?.ok) {
      return {
        index: index + 1,
        description: testCase.description || `Test case ${index + 1}`,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: '',
        passed: false,
        detail: `Runtime error: ${normalizeText(run?.message, 1000) || 'unknown error'}`,
      }
    }
    const actualOutput = normalizeText(run.output, 4000)
    const passed = outputsMatch(testCase.expectedOutput, actualOutput)
    return {
      index: index + 1,
      description: testCase.description || `Test case ${index + 1}`,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput,
      passed,
      detail: passed ? '' : 'Output does not match the expected output.',
    }
  })
  const passed = results.length > 0 && results.every((item) => item.passed)
  return {
    passed,
    results,
    feedback: passed
      ? 'Verified on the server: all test cases passed. Solution accepted.'
      : `Verified on the server: ${results.filter((item) => !item.passed).length} of ${results.length} test cases failed.`,
  }
}

// Grades a UI submission. The DOM checks ran in the player's browser, so the
// reported outcomes are cross-verified here by an AI review of the submitted
// HTML against each check; the rendered-page screenshot is stored for the
// admin as the human-audit trail.
async function gradeUiSubmission(challenge, code, browserResults) {
  const testCases = parseJson(challenge.test_cases_json, [])
  const reported = Array.isArray(browserResults) ? browserResults : []
  const clientResults = testCases.map((testCase, index) => {
    const run = reported.find((item) => Number(item?.index) === index + 1) || reported[index]
    return {
      index: index + 1,
      description: testCase.description || `Check ${index + 1}`,
      expression: testCase.expression,
      passed: Boolean(run?.passed),
      detail: normalizeText(run?.detail, 1000),
    }
  })
  const clientPassed = clientResults.length > 0 && clientResults.every((item) => item.passed)
  if (!clientPassed) {
    return {
      passed: false,
      results: clientResults,
      feedback: `${clientResults.filter((item) => !item.passed).length} of ${clientResults.length} UI checks failed in the rendered page.`,
    }
  }

  const aiConfig = await getAiRuntimeConfig()
  if (!aiConfig.apiKey) {
    return {
      passed: true,
      results: clientResults,
      feedback: 'All UI checks passed in the rendered page. The screenshot is attached for admin review.',
    }
  }
  try {
    const client = new OpenAI({ baseURL: aiConfig.baseUrl, apiKey: aiConfig.apiKey })
    const response = await client.chat.completions.create({
      model: aiConfig.model,
      temperature: 0,
      top_p: aiConfig.topP,
      max_tokens: 1500,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'You audit a front-end submission. Given a standalone HTML file and a list of DOM checks (JavaScript boolean expressions with descriptions), decide for each check whether the HTML, when rendered, would genuinely satisfy it. Flag code that games the checks without implementing the described feature (e.g. hidden elements that only satisfy selectors, overriding querySelector, stubbing click handlers to just set text). Return strict JSON only: {"checks":[{"index":1,"satisfied":true|false,"reason":"string"}],"verdict":"pass|fail","feedback":"string"}.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            scenario: challenge.scenario,
            checks: testCases.map((testCase, index) => ({
              index: index + 1,
              description: testCase.description,
              expression: testCase.expression,
            })),
            submittedHtml: normalizeText(code, 40000),
          }),
        },
      ],
    })
    const parsed = extractJsonObject(extractMessageText(response?.choices?.[0]?.message))
    if (!parsed || !Array.isArray(parsed.checks)) {
      return {
        passed: true,
        results: clientResults,
        feedback: 'All UI checks passed in the rendered page. The screenshot is attached for admin review.',
      }
    }
    const results = clientResults.map((item) => {
      const audit = parsed.checks.find((check) => Number(check?.index) === item.index)
      const satisfied = audit ? Boolean(audit.satisfied) : true
      return {
        ...item,
        passed: item.passed && satisfied,
        detail: satisfied ? item.detail : normalizeText(audit?.reason, 1000) || 'The AI audit found this check is not genuinely implemented.',
      }
    })
    const passed = results.every((item) => item.passed) && parsed.verdict !== 'fail'
    return {
      passed,
      results,
      feedback: passed
        ? normalizeText(parsed.feedback, 2000) || 'All UI checks passed and the AI audit confirmed the implementation. Screenshot attached for admin review.'
        : normalizeText(parsed.feedback, 2000) || 'The AI audit rejected the submission: the checks are not genuinely implemented.',
    }
  } catch (error) {
    console.error('Lab research UI audit failed:', error)
    return {
      passed: true,
      results: clientResults,
      feedback: 'All UI checks passed in the rendered page. The screenshot is attached for admin review.',
    }
  }
}

// Grades a submission executed in the player's browser. The client reports the
// actual output per test; pass/fail is recomputed here against the stored
// expected outputs rather than trusting the client's own verdicts.
function gradeBrowserRun(challenge, browserResults) {
  const testCases = parseJson(challenge.test_cases_json, [])
  const reported = Array.isArray(browserResults) ? browserResults : []
  const results = testCases.map((testCase, index) => {
    const run = reported.find((item) => Number(item?.index) === index + 1) || reported[index]
    const actualOutput = normalizeText(run?.actualOutput, 4000)
    const detail = normalizeText(run?.detail, 1000)
    const errored = !run || (!actualOutput && detail)
    const passed = !errored && outputsMatch(testCase.expectedOutput, actualOutput)
    return {
      index: index + 1,
      description: testCase.description || `Test case ${index + 1}`,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput,
      passed,
      detail: passed ? '' : detail || 'Output does not match the expected output.',
    }
  })
  const passed = results.length > 0 && results.every((item) => item.passed)
  return {
    passed,
    results,
    feedback: passed
      ? 'All test cases passed in the browser runner. Solution accepted.'
      : `${results.filter((item) => !item.passed).length} of ${results.length} test cases failed. Review the failing outputs and try again.`,
  }
}

function mapChallenge(challenge, { includeTests = true } = {}) {
  const kind = challenge.challenge_kind === 'ui' ? 'ui' : 'function'
  return {
    id: challenge.id,
    projectId: challenge.project_id,
    kind,
    scenario: challenge.scenario,
    language: challenge.language,
    starterCode: challenge.starter_code || '',
    status: challenge.status,
    acceptedAt: challenge.accepted_at,
    testCases: includeTests
      ? parseJson(challenge.test_cases_json, []).map((testCase, index) => ({
        index: index + 1,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        expression: kind === 'ui' ? testCase.expression : undefined,
        description: testCase.description || `Test case ${index + 1}`,
      }))
      : [],
  }
}

async function getActiveProject(projectId) {
  const [[project]] = await pool.query(
    'SELECT * FROM lab_research_projects WHERE id = ? AND is_active = 1 LIMIT 1',
    [projectId],
  )
  return project || null
}

router.use(authenticate)

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

router.get('/admin/projects', requireAdmin, async (_req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const [rows] = await pool.query(`
      SELECT p.*,
             SUM(CASE WHEN pr.quiz_completed_at IS NOT NULL THEN 1 ELSE 0 END) AS quiz_completions,
             SUM(CASE WHEN pr.code_accepted_at IS NOT NULL THEN 1 ELSE 0 END) AS code_completions
      FROM lab_research_projects p
      LEFT JOIN lab_research_progress pr ON pr.project_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `)
    res.json(rows.map((row) => mapProject(row, { includeStats: true })))
  } catch (error) {
    next(error)
  }
})

function validateProjectPayload(body) {
  const payload = {
    title: normalizeText(body?.title, 255),
    stack: normalizeText(body?.stack, 1000),
    contributors: normalizeText(body?.contributors, 1000),
    summary: normalizeText(body?.summary, 4000),
    explanation: normalizeText(body?.explanation, 60000),
    topics: normalizeText(body?.topics, 20000),
    projectType: ['web', 'program', 'research'].includes(body?.projectType) ? body.projectType : 'research',
    questionCount: clampQuestionCount(body?.questionCount),
    codingEnabled: Boolean(body?.codingEnabled),
    isActive: body?.isActive === undefined ? true : Boolean(body.isActive),
  }
  if (payload.title.length < 3) return { error: 'Project title must be at least 3 characters.' }
  if (payload.explanation.length < 50) return { error: 'The in-depth explanation must be at least 50 characters.' }
  if (payload.codingEnabled && payload.projectType === 'research') {
    return { error: 'The code lab can only be enabled for web-based or program-based projects.' }
  }
  return { payload }
}

router.post('/admin/projects', requireAdmin, async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const { payload, error } = validateProjectPayload(req.body)
    if (error) return res.status(400).json({ message: error })
    const [result] = await pool.query(
      `INSERT INTO lab_research_projects (
        title, stack, contributors, summary, explanation, topics,
        project_type, question_count, coding_enabled, is_active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.title, payload.stack, payload.contributors, payload.summary,
        payload.explanation, payload.topics, payload.projectType,
        payload.questionCount, payload.codingEnabled ? 1 : 0, payload.isActive ? 1 : 0,
        req.user.id,
      ],
    )
    const [[row]] = await pool.query('SELECT * FROM lab_research_projects WHERE id = ?', [result.insertId])
    return res.status(201).json(mapProject(row))
  } catch (error) {
    return next(error)
  }
})

router.put('/admin/projects/:id', requireAdmin, async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const { payload, error } = validateProjectPayload(req.body)
    if (error) return res.status(400).json({ message: error })
    const [result] = await pool.query(
      `UPDATE lab_research_projects SET
        title = ?, stack = ?, contributors = ?, summary = ?, explanation = ?, topics = ?,
        project_type = ?, question_count = ?, coding_enabled = ?, is_active = ?
      WHERE id = ?`,
      [
        payload.title, payload.stack, payload.contributors, payload.summary,
        payload.explanation, payload.topics, payload.projectType,
        payload.questionCount, payload.codingEnabled ? 1 : 0, payload.isActive ? 1 : 0,
        req.params.id,
      ],
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Project not found.' })
    const [[row]] = await pool.query('SELECT * FROM lab_research_projects WHERE id = ?', [req.params.id])
    return res.json(mapProject(row))
  } catch (error) {
    return next(error)
  }
})

router.delete('/admin/projects/:id', requireAdmin, async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const [result] = await pool.query('DELETE FROM lab_research_projects WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ message: 'Project not found.' })
    return res.json({ success: true })
  } catch (error) {
    return next(error)
  }
})

router.get('/admin/projects/:id/completions', requireAdmin, async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const [[project]] = await pool.query('SELECT * FROM lab_research_projects WHERE id = ? LIMIT 1', [req.params.id])
    if (!project) return res.status(404).json({ message: 'Project not found.' })
    const [rows] = await pool.query(
      `SELECT pr.*, u.username, u.email
       FROM lab_research_progress pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.project_id = ?
       ORDER BY pr.quiz_completed_at IS NULL, pr.quiz_completed_at DESC, pr.updated_at DESC`,
      [req.params.id],
    )
    const [submissionRows] = await pool.query(
      `SELECT s.id, s.passed, s.created_at, s.screenshot IS NOT NULL AS has_screenshot, c.user_id, c.challenge_kind
       FROM lab_research_code_submissions s
       JOIN lab_research_code_challenges c ON c.id = s.challenge_id
       WHERE c.project_id = ?
       ORDER BY s.created_at DESC`,
      [req.params.id],
    )
    const latestSubmissionByUser = new Map()
    for (const row of submissionRows) {
      if (!latestSubmissionByUser.has(row.user_id)) {
        latestSubmissionByUser.set(row.user_id, {
          id: row.id,
          passed: Boolean(row.passed),
          kind: row.challenge_kind === 'ui' ? 'ui' : 'function',
          hasScreenshot: Boolean(row.has_screenshot),
          createdAt: row.created_at,
        })
      }
    }
    return res.json({
      project: mapProject(project),
      players: rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        email: row.email,
        quizScore: Number(row.quiz_score || 0),
        quizCompleted: Boolean(row.quiz_completed_at),
        quizCompletedAt: row.quiz_completed_at,
        codeAttempts: Number(row.code_attempts || 0),
        codeAccepted: Boolean(row.code_accepted_at),
        codeAcceptedAt: row.code_accepted_at,
        latestSubmission: latestSubmissionByUser.get(row.user_id) || null,
      })),
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/admin/submissions/:submissionId', requireAdmin, async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const [[row]] = await pool.query(
      `SELECT s.*, c.scenario, c.challenge_kind, c.language, c.project_id, u.username, u.email
       FROM lab_research_code_submissions s
       JOIN lab_research_code_challenges c ON c.id = s.challenge_id
       JOIN users u ON u.id = c.user_id
       WHERE s.id = ? LIMIT 1`,
      [req.params.submissionId],
    )
    if (!row) return res.status(404).json({ message: 'Submission not found.' })
    return res.json({
      id: row.id,
      projectId: row.project_id,
      username: row.username,
      email: row.email,
      kind: row.challenge_kind === 'ui' ? 'ui' : 'function',
      language: row.language,
      scenario: row.scenario,
      code: row.code,
      passed: Boolean(row.passed),
      results: parseJson(row.results_json, []),
      feedback: row.feedback,
      screenshot: row.screenshot || null,
      createdAt: row.created_at,
    })
  } catch (error) {
    return next(error)
  }
})

// Full drill-down for one player on one project: every quiz attempt with the
// questions asked and the answers given, plus all code submissions.
router.get('/admin/projects/:id/players/:userId', requireAdmin, async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const [[project]] = await pool.query('SELECT * FROM lab_research_projects WHERE id = ? LIMIT 1', [req.params.id])
    if (!project) return res.status(404).json({ message: 'Project not found.' })
    const [[user]] = await pool.query('SELECT id, username, email FROM users WHERE id = ? LIMIT 1', [req.params.userId])
    if (!user) return res.status(404).json({ message: 'Player not found.' })

    const [attemptRows] = await pool.query(
      `SELECT * FROM lab_research_quiz_attempts
       WHERE project_id = ? AND user_id = ?
       ORDER BY created_at DESC LIMIT 20`,
      [project.id, user.id],
    )
    const attempts = []
    for (const attempt of attemptRows) {
      const [questionRows] = await pool.query(
        'SELECT * FROM lab_research_quiz_questions WHERE attempt_id = ? ORDER BY position',
        [attempt.id],
      )
      attempts.push({
        id: attempt.id,
        status: attempt.status,
        terminatedReason: attempt.terminated_reason || null,
        score: Number(attempt.score || 0),
        createdAt: attempt.created_at,
        completedAt: attempt.completed_at,
        questions: questionRows.map((row) => ({
          position: Number(row.position),
          prompt: row.prompt,
          answer: row.answer_text || '',
          answered: Boolean(row.evaluated_at),
          isCorrect: row.evaluated_at ? Boolean(row.is_correct) : null,
          score: row.evaluated_at ? Number(row.score || 0) : null,
          feedback: row.evaluated_at ? row.feedback : null,
          idealAnswer: row.ideal_answer,
        })),
      })
    }

    const [submissionRows] = await pool.query(
      `SELECT s.id, s.passed, s.created_at, s.screenshot IS NOT NULL AS has_screenshot, c.challenge_kind, c.language
       FROM lab_research_code_submissions s
       JOIN lab_research_code_challenges c ON c.id = s.challenge_id
       WHERE c.project_id = ? AND c.user_id = ?
       ORDER BY s.created_at DESC LIMIT 20`,
      [project.id, user.id],
    )

    const [[progress]] = await pool.query(
      'SELECT * FROM lab_research_progress WHERE project_id = ? AND user_id = ? LIMIT 1',
      [project.id, user.id],
    )

    return res.json({
      project: { id: project.id, title: project.title, codingEnabled: Boolean(project.coding_enabled) },
      player: { userId: user.id, username: user.username, email: user.email },
      progress: {
        quizScore: Number(progress?.quiz_score || 0),
        quizCompleted: Boolean(progress?.quiz_completed_at),
        quizCompletedAt: progress?.quiz_completed_at || null,
        codeAttempts: Number(progress?.code_attempts || 0),
        codeAccepted: Boolean(progress?.code_accepted_at),
        codeAcceptedAt: progress?.code_accepted_at || null,
      },
      attempts,
      submissions: submissionRows.map((row) => ({
        id: row.id,
        passed: Boolean(row.passed),
        kind: row.challenge_kind === 'ui' ? 'ui' : 'function',
        language: row.language,
        hasScreenshot: Boolean(row.has_screenshot),
        createdAt: row.created_at,
      })),
    })
  } catch (error) {
    return next(error)
  }
})

// Resets a player's progress on a project so they can attempt again.
// scope: 'code' clears the code challenge and submissions, 'quiz' clears
// assessment attempts, 'all' clears both.
router.post('/admin/projects/:id/players/:userId/reset', requireAdmin, async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const scope = ['code', 'quiz', 'all'].includes(req.body?.scope) ? req.body.scope : 'all'
    const [[project]] = await pool.query('SELECT id FROM lab_research_projects WHERE id = ? LIMIT 1', [req.params.id])
    if (!project) return res.status(404).json({ message: 'Project not found.' })
    const [[user]] = await pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [req.params.userId])
    if (!user) return res.status(404).json({ message: 'Player not found.' })

    if (scope === 'code' || scope === 'all') {
      await pool.query(
        'DELETE FROM lab_research_code_challenges WHERE project_id = ? AND user_id = ?',
        [project.id, user.id],
      )
      await pool.query(
        'UPDATE lab_research_progress SET code_attempts = 0, code_accepted_at = NULL WHERE project_id = ? AND user_id = ?',
        [project.id, user.id],
      )
    }
    if (scope === 'quiz' || scope === 'all') {
      await pool.query(
        'DELETE FROM lab_research_quiz_attempts WHERE project_id = ? AND user_id = ?',
        [project.id, user.id],
      )
      await pool.query(
        'UPDATE lab_research_progress SET quiz_score = 0, quiz_completed_at = NULL WHERE project_id = ? AND user_id = ?',
        [project.id, user.id],
      )
    }
    return res.json({ success: true, scope })
  } catch (error) {
    return next(error)
  }
})

// ---------------------------------------------------------------------------
// Player endpoints
// ---------------------------------------------------------------------------

router.get('/projects', async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const [rows] = await pool.query(
      `SELECT p.*, pr.quiz_score, pr.quiz_completed_at, pr.code_attempts, pr.code_accepted_at
       FROM lab_research_projects p
       LEFT JOIN lab_research_progress pr ON pr.project_id = p.id AND pr.user_id = ?
       WHERE p.is_active = 1
       ORDER BY p.created_at DESC`,
      [req.user.id],
    )
    res.json(rows.map((row) => ({
      ...mapProject(row),
      explanation: undefined,
      progress: {
        quizScore: Number(row.quiz_score || 0),
        quizCompleted: Boolean(row.quiz_completed_at),
        codeAttempts: Number(row.code_attempts || 0),
        codeAccepted: Boolean(row.code_accepted_at),
      },
    })))
  } catch (error) {
    next(error)
  }
})

router.get('/projects/:id', async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const project = await getActiveProject(req.params.id)
    if (!project) return res.status(404).json({ message: 'Research project not found.' })
    const progress = await getProgress(project.id, req.user.id)
    const [[activeAttempt]] = await pool.query(
      `SELECT id FROM lab_research_quiz_attempts
       WHERE project_id = ? AND user_id = ? AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [project.id, req.user.id],
    )
    const [[activeChallenge]] = await pool.query(
      `SELECT * FROM lab_research_code_challenges
       WHERE project_id = ? AND user_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [project.id, req.user.id],
    )
    return res.json({
      ...mapProject(project),
      progress,
      activeQuizAttemptId: activeAttempt?.id || null,
      codeChallenge: activeChallenge ? mapChallenge(activeChallenge) : null,
    })
  } catch (error) {
    return next(error)
  }
})

router.post('/projects/:id/quiz', async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const project = await getActiveProject(req.params.id)
    if (!project) return res.status(404).json({ message: 'Research project not found.' })

    // Terminate any dangling active attempt (e.g. after a refresh or crash)
    // so it can never be resumed outside the proctored session; its questions
    // still count as "seen" so the new attempt gets fresh ones.
    await pool.query(
      `UPDATE lab_research_quiz_attempts
       SET status = 'terminated', terminated_reason = 'abandoned', completed_at = NOW()
       WHERE project_id = ? AND user_id = ? AND status = 'active'`,
      [project.id, req.user.id],
    )

    const [priorRows] = await pool.query(
      `SELECT q.prompt FROM lab_research_quiz_questions q
       JOIN lab_research_quiz_attempts a ON a.id = q.attempt_id
       WHERE a.project_id = ? AND a.user_id = ?
       ORDER BY q.created_at DESC LIMIT 100`,
      [project.id, req.user.id],
    )
    const priorPrompts = priorRows.map((row) => row.prompt)
    const questions = await generateQuizQuestions(project, Number(project.question_count || 5), priorPrompts)
    const [result] = await pool.query(
      'INSERT INTO lab_research_quiz_attempts (project_id, user_id) VALUES (?, ?)',
      [project.id, req.user.id],
    )
    for (const [index, question] of questions.entries()) {
      await pool.query(
        `INSERT INTO lab_research_quiz_questions (attempt_id, position, prompt, ideal_answer, rubric)
         VALUES (?, ?, ?, ?, ?)`,
        [result.insertId, index + 1, question.prompt, question.idealAnswer, question.rubric || null],
      )
    }
    await upsertProgress(project.id, req.user.id, {})
    const attempt = await getQuizAttempt(result.insertId, req.user.id)
    return res.status(201).json(attempt)
  } catch (error) {
    return next(error)
  }
})

router.get('/quiz/:attemptId', async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const attempt = await getQuizAttempt(req.params.attemptId, req.user.id)
    if (!attempt) return res.status(404).json({ message: 'Quiz attempt not found.' })
    return res.json(attempt)
  } catch (error) {
    return next(error)
  }
})

// Auto-submits (terminates) an active attempt when the proctored session is
// broken: tab switch, fullscreen exit, or page unload. The current score is
// kept, but the attempt can no longer be continued.
router.post('/quiz/:attemptId/terminate', async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const allowedReasons = ['tab-switch', 'fullscreen-exit', 'abandoned']
    const reason = allowedReasons.includes(req.body?.reason) ? req.body.reason : 'abandoned'
    const [[attempt]] = await pool.query(
      'SELECT * FROM lab_research_quiz_attempts WHERE id = ? AND user_id = ? LIMIT 1',
      [req.params.attemptId, req.user.id],
    )
    if (!attempt) return res.status(404).json({ message: 'Quiz attempt not found.' })
    if (attempt.status !== 'active') {
      const current = await getQuizAttempt(attempt.id, req.user.id)
      return res.json(current)
    }
    const [[counts]] = await pool.query(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
       FROM lab_research_quiz_questions WHERE attempt_id = ?`,
      [attempt.id],
    )
    const total = Number(counts.total || 0)
    const correct = Number(counts.correct || 0)
    const score = total ? Math.round((correct / total) * 100) : 0
    await pool.query(
      "UPDATE lab_research_quiz_attempts SET status = 'terminated', terminated_reason = ?, score = ?, completed_at = NOW() WHERE id = ?",
      [reason, score, attempt.id],
    )
    await upsertProgress(attempt.project_id, req.user.id, score === 100 ? { quizScore: 100, quizCompleted: true } : { quizScore: score })
    const updated = await getQuizAttempt(attempt.id, req.user.id)
    return res.json(updated)
  } catch (error) {
    return next(error)
  }
})

router.post('/quiz/:attemptId/questions/:questionId/answer', async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const answer = normalizeText(req.body?.answer, 20000)
    if (answer.length < 5) {
      return res.status(400).json({ message: 'Write a more complete answer before submitting.' })
    }
    const [[attempt]] = await pool.query(
      'SELECT * FROM lab_research_quiz_attempts WHERE id = ? AND user_id = ? LIMIT 1',
      [req.params.attemptId, req.user.id],
    )
    if (!attempt) return res.status(404).json({ message: 'Quiz attempt not found.' })
    if (attempt.status !== 'active') {
      return res.status(409).json({
        message: attempt.status === 'terminated'
          ? 'This assessment was auto-submitted because the proctored session was broken. Start a new attempt.'
          : 'This knowledge check is already completed.',
      })
    }
    const [[question]] = await pool.query(
      'SELECT * FROM lab_research_quiz_questions WHERE id = ? AND attempt_id = ? LIMIT 1',
      [req.params.questionId, attempt.id],
    )
    if (!question) return res.status(404).json({ message: 'Question not found.' })
    if (question.is_correct) {
      return res.status(409).json({ message: 'This question is already answered correctly.' })
    }

    const [[project]] = await pool.query(
      'SELECT * FROM lab_research_projects WHERE id = ? LIMIT 1',
      [attempt.project_id],
    )
    const evaluation = await evaluateQuizAnswer(project, question, answer)
    await pool.query(
      `UPDATE lab_research_quiz_questions
       SET answer_text = ?, score = ?, is_correct = ?, feedback = ?, evaluated_at = NOW()
       WHERE id = ?`,
      [answer, evaluation.score, evaluation.isCorrect ? 1 : 0, evaluation.feedback, question.id],
    )

    const [[counts]] = await pool.query(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
       FROM lab_research_quiz_questions WHERE attempt_id = ?`,
      [attempt.id],
    )
    const total = Number(counts.total || 0)
    const correct = Number(counts.correct || 0)
    const score = total ? Math.round((correct / total) * 100) : 0
    if (total > 0 && correct === total) {
      await pool.query(
        "UPDATE lab_research_quiz_attempts SET status = 'completed', score = 100, completed_at = NOW() WHERE id = ?",
        [attempt.id],
      )
      await upsertProgress(attempt.project_id, req.user.id, { quizScore: 100, quizCompleted: true })
    } else {
      await pool.query('UPDATE lab_research_quiz_attempts SET score = ? WHERE id = ?', [score, attempt.id])
      await upsertProgress(attempt.project_id, req.user.id, { quizScore: score })
    }

    const updated = await getQuizAttempt(attempt.id, req.user.id)
    return res.json(updated)
  } catch (error) {
    return next(error)
  }
})

router.post('/projects/:id/code', async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const project = await getActiveProject(req.params.id)
    if (!project) return res.status(404).json({ message: 'Research project not found.' })
    if (!project.coding_enabled) {
      return res.status(403).json({ message: 'The code lab is disabled for this project.' })
    }

    const [[existing]] = await pool.query(
      `SELECT * FROM lab_research_code_challenges
       WHERE project_id = ? AND user_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [project.id, req.user.id],
    )
    if (existing && existing.status === 'accepted') {
      return res.json(mapChallenge(existing))
    }
    if (existing && !req.body?.regenerate) {
      return res.json(mapChallenge(existing))
    }
    if (existing) {
      await pool.query('DELETE FROM lab_research_code_challenges WHERE id = ?', [existing.id])
    }

    const generated = await generateCodeChallenge(project)
    const [result] = await pool.query(
      `INSERT INTO lab_research_code_challenges (project_id, user_id, scenario, challenge_kind, language, starter_code, test_cases_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [project.id, req.user.id, generated.scenario, generated.kind || 'function', generated.language, generated.starterCode, JSON.stringify(generated.testCases)],
    )
    await upsertProgress(project.id, req.user.id, {})
    const [[challenge]] = await pool.query('SELECT * FROM lab_research_code_challenges WHERE id = ?', [result.insertId])
    return res.status(201).json(mapChallenge(challenge))
  } catch (error) {
    return next(error)
  }
})

router.post('/code/:challengeId/submit', async (req, res, next) => {
  try {
    await ensureLabResearchSchema()
    const code = String(req.body?.code || '')
    if (code.trim().length < 10) {
      return res.status(400).json({ message: 'Write your solution before submitting.' })
    }
    const [[challenge]] = await pool.query(
      'SELECT * FROM lab_research_code_challenges WHERE id = ? AND user_id = ? LIMIT 1',
      [req.params.challengeId, req.user.id],
    )
    if (!challenge) return res.status(404).json({ message: 'Code challenge not found.' })
    if (challenge.status === 'accepted') {
      return res.status(409).json({ message: 'This challenge is already accepted.' })
    }
    const [[project]] = await pool.query(
      'SELECT * FROM lab_research_projects WHERE id = ? LIMIT 1',
      [challenge.project_id],
    )
    if (!project?.coding_enabled) {
      return res.status(403).json({ message: 'The code lab is disabled for this project.' })
    }

    const kind = challenge.challenge_kind === 'ui' ? 'ui' : 'function'
    const screenshot = typeof req.body?.screenshot === 'string' && req.body.screenshot.startsWith('data:image/')
      ? req.body.screenshot.slice(0, 4 * 1024 * 1024)
      : null

    if (kind === 'ui' && findExternalResourceReferences(code).length) {
      return res.status(400).json({
        message: 'The page must be fully self-contained: remove references to external resources (http/https URLs in src, href, or CSS url()) and inline images as data URIs instead.',
      })
    }

    let evaluation
    if (kind === 'ui') {
      evaluation = await gradeUiSubmission(challenge, code, req.body?.browserResults)
    } else {
      // Cheat-proof path: re-run the code on the server; only fall back to the
      // AI judge (then to re-graded browser results) when execution is not
      // possible on this host.
      const testCases = parseJson(challenge.test_cases_json, [])
      const execution = await executeCodeOnServer(challenge.language, code, testCases.map((testCase) => ({ input: testCase.input })))
      if (execution.supported) {
        evaluation = gradeServerRun(challenge, execution)
      } else if (Array.isArray(req.body?.browserResults)) {
        evaluation = gradeBrowserRun(challenge, req.body.browserResults)
      } else {
        evaluation = await evaluateCodeSubmission(project, challenge, code)
      }
    }

    await pool.query(
      `INSERT INTO lab_research_code_submissions (challenge_id, code, passed, results_json, feedback, screenshot)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [challenge.id, code, evaluation.passed ? 1 : 0, JSON.stringify(evaluation.results), evaluation.feedback, screenshot],
    )
    await upsertProgress(challenge.project_id, req.user.id, {
      incrementCodeAttempts: true,
      codeAccepted: evaluation.passed,
    })
    if (evaluation.passed) {
      await pool.query(
        "UPDATE lab_research_code_challenges SET status = 'accepted', accepted_at = NOW() WHERE id = ?",
        [challenge.id],
      )
    }
    const progress = await getProgress(challenge.project_id, req.user.id)
    return res.json({
      accepted: evaluation.passed,
      results: evaluation.results,
      feedback: evaluation.feedback,
      progress,
    })
  } catch (error) {
    return next(error)
  }
})

export default router
