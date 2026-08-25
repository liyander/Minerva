import { Router } from 'express'
import OpenAI from 'openai'
import { env } from '../config/env.js'
import { pool } from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { getAiRuntimeConfig } from '../services/aiSettings.js'
import { aiSystemMessage, aiTaskMessage } from '../services/aiPrompts.js'
import { logAiError } from '../services/aiErrors.js'

const router = Router()

const OUT_OF_SCOPE_REPLY =
  'I am here to help you study. Ask me about a course, a topic you are learning, how something on this platform works, or how to approach a piece of work.'

const ACTIVE_ASSESSMENT_REPLY =
  'I cannot answer questions from an assessment you have open. Work from the course material and write your own response, then submit it for marking.'

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokenizeForSimilarity(value) {
  const stopWords = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'for',
    'from',
    'how',
    'in',
    'is',
    'it',
    'of',
    'on',
    'or',
    'that',
    'the',
    'this',
    'to',
    'using',
    'what',
    'when',
    'where',
    'which',
    'why',
    'with',
    'you',
    'your',
  ])

  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token))
}

function hasQuestionOverlap(message, questions) {
  const messageTokens = new Set(tokenizeForSimilarity(message))
  if (!messageTokens.size) {
    return false
  }

  return questions.some((question) => {
    const promptTokens = tokenizeForSimilarity(question?.prompt)
    if (!promptTokens.length) {
      return false
    }

    const overlap = promptTokens.filter((token) => messageTokens.has(token)).length
    return overlap >= 5 || overlap / Math.max(1, Math.min(promptTokens.length, messageTokens.size)) >= 0.38
  })
}

function isAssessmentAnswerRequest(message, questions) {
  const normalized = normalizeText(message)
  if (!normalized) {
    return false
  }

  const answerIntent =
    /\b(answer|solve|write|draft|respond|complete|give me|tell me what|what should i write|help me answer|assessment|question\s*\d+|q\s*\d+)\b/i

  return hasQuestionOverlap(message, questions) || (answerIntent.test(normalized) && /\b(answer|question|assessment|q\s*\d+)\b/i.test(normalized))
}

function getRoomLookupFromContext(context) {
  const route = String(context?.route || '')
  if (!route.startsWith('/learn/lab/')) {
    return ''
  }

  return decodeURIComponent(route.split('/learn/lab/')[1]?.split('/')[0] || '').trim()
}

async function getActiveAssessmentQuestions(userId, context) {
  const roomLookup = getRoomLookupFromContext(context)
  if (!userId || !roomLookup || context?.pageType !== 'room') {
    return []
  }

  const [roomRows] = await pool.query(
    'SELECT id FROM rooms WHERE id = ? OR slug = ? LIMIT 1',
    [roomLookup, roomLookup],
  )

  const roomId = roomRows[0]?.id
  if (!roomId) {
    return []
  }

  const [attemptRows] = await pool.query(
    `SELECT questions_json, passed
     FROM user_room_theoretical_attempts
     WHERE user_id = ? AND room_id = ?
     LIMIT 1`,
    [userId, roomId],
  )

  const attempt = attemptRows[0]
  if (!attempt || Boolean(attempt.passed)) {
    return []
  }

  try {
    const questions = JSON.parse(attempt.questions_json || '[]')
    return Array.isArray(questions) ? questions.filter((question) => question?.prompt) : []
  } catch {
    return []
  }
}

/**
 * Requests that should never reach the model, whatever the subject.
 * This is a narrow blocklist rather than a subject allowlist: the platform
 * teaches many subjects, and new courses must not need a code change here.
 */
const DISALLOWED_PATTERNS = [
  /\b(write|do|complete|finish|solve)\s+(my|the)\s+(assignment|homework|essay|coursework|exam)\b/i,
  /\b(hack|crack|bypass|brute[- ]?force)\s+(into|a|an|the|someone|somebody)\b/i,
  /\b(malware|ransomware|keylogger|botnet)\s+(code|script|sample|payload)\b/i,
  /\bhow (do|can) i (steal|phish|ddos)\b/i,
]

/**
 * Anything that reads as a learning request is allowed. The common system
 * prompt keeps the model on-task, so this gate only needs to catch requests
 * that are clearly not about studying at all.
 */
function isLearningQuestion(message) {
  const normalized = normalizeText(message)
  if (!normalized) {
    return false
  }

  if (DISALLOWED_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false
  }

  // A question of any reasonable length is treated as a study question.
  return normalized.trim().length >= 2
}

function isSiteContextQuestion(message, context) {
  const normalized = normalizeText(message)
  if (!normalized) {
    return false
  }

  const hasContext = Boolean(context?.pageSummary || context?.siteSummary)

  const siteIntentPattern =
    /\b(summarize|summary|summarise|explain|describe|overview|creator|created by|owner|developer|founder|who built|who made|who created|about this site|about this page|tell about this site|tell about this page|tell me about this page|tell me about this site|what is this page|what is this site|what does this page do|what does this site do)\b/i

  if (!siteIntentPattern.test(normalized)) {
    return false
  }

  // Prefer having context, but still allow explicit site/page intent so the gate is not a bottleneck.
  return hasContext || /\b(this site|this page|site|page)\b/i.test(normalized)
}

function trimHistory(history) {
  if (!Array.isArray(history)) {
    return []
  }

  return history
    .slice(-12)
    .filter((entry) => entry && typeof entry.message === 'string')
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      message: entry.message.slice(0, 1200),
    }))
}

function clampText(value, limit = 1200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) {
    return ''
  }

  if (text.length <= limit) {
    return text
  }

  return `${text.slice(0, limit - 1).trimEnd()}…`
}

function trimContext(rawContext) {
  if (!rawContext || typeof rawContext !== 'object') {
    return null
  }

  const mode = rawContext.mode === 'detailed' ? 'detailed' : 'brief'

  return {
    mode,
    pageType: clampText(rawContext.pageType, 80),
    route: clampText(rawContext.route, 120),
    siteSummary: clampText(rawContext.siteSummary, 1200),
    pageSummary: clampText(rawContext.pageSummary, 1200),
  }
}

function buildSystemPrompt(mode, context) {
  const styleInstruction =
    mode === 'detailed'
      ? 'Answer in detailed mode: deeper explanation, structured sections, a worked example where it helps, and any caveats worth knowing.'
      : 'Answer in brief mode: exactly one short paragraph. No bullets, numbered lists or headings.'

  const contextInstruction = context
    ? [
        context.siteSummary ? `Site context: ${context.siteSummary}` : '',
        context.pageSummary ? `Current page context: ${context.pageSummary}` : '',
        context.route ? `Current route: ${context.route}` : '',
      ]
        .filter(Boolean)
        .join(' ')
    : ''

  return [
    'Help the learner with their studies.',
    'Answer questions about any subject the learner is studying, explain concepts at the level they are working at, and suggest how to approach a topic or piece of work.',
    'Also answer questions about this platform itself — what a page shows, how a feature works, how to find something.',
    'When the learner asks you to summarise or explain the current page, use the supplied page context and answer directly.',
    'Do not do a learner\'s assessed work for them. Explain the underlying idea and show a comparable worked example instead, so they can do their own.',
    styleInstruction,
    contextInstruction,
  ]
    .filter(Boolean)
    .join(' ')
}

function formatAssistantReply(content, mode) {
  const text = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!text) {
    return ''
  }

  if (mode !== 'brief') {
    return text
  }

  const normalized = text
    .split(/\n\s*\n/)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .find(Boolean)
    || text.replace(/\s+/g, ' ').trim()

  const strippedLists = normalized
    .replace(/^[-*•]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const sentences = strippedLists.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [strippedLists]
  const briefParts = []

  const appendPart = (part) => {
    const candidate = part.replace(/\s{2,}/g, ' ').trim()
    if (!candidate) {
      return false
    }

    const nextText = [...briefParts, candidate].join(' ').replace(/\s{2,}/g, ' ').trim()
    if (nextText.length <= 360) {
      briefParts.push(candidate)
      return true
    }

    return false
  }

  for (const sentence of sentences) {
    if (appendPart(sentence)) {
      continue
    }

    if (!briefParts.length) {
      const clauses = sentence
        .split(/(?<=[,;:—-])\s+/)
        .map((segment) => segment.replace(/\s+/g, ' ').trim())
        .filter(Boolean)

      for (const clause of clauses) {
        if (appendPart(clause)) {
          continue
        }

        break
      }
    }

    if (briefParts.length) {
      break
    }
  }

  const briefText = briefParts.join(' ').replace(/\s{2,}/g, ' ').trim()
  if (briefText) {
    return briefText.endsWith('.') || briefText.endsWith('!') || briefText.endsWith('?')
      ? briefText
      : `${briefText}.`
  }

  return clampText(strippedLists, 360)
}

router.post('/message', authenticate, async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim()
    const history = trimHistory(req.body?.history)
    const context = trimContext(req.body?.context)

    if (!message) {
      return res.status(400).json({ message: 'Message is required.' })
    }

    if (!isLearningQuestion(message) && !isSiteContextQuestion(message, context)) {
      return res.json({
        role: 'assistant',
        content: OUT_OF_SCOPE_REPLY,
        restricted: true,
      })
    }

    const activeAssessmentQuestions = await getActiveAssessmentQuestions(req.user?.id, context)
    if (activeAssessmentQuestions.length && isAssessmentAnswerRequest(message, activeAssessmentQuestions)) {
      return res.json({
        role: 'assistant',
        content: ACTIVE_ASSESSMENT_REPLY,
        restricted: true,
      })
    }

    let content = ''
    let aiModel = ''
    try {
      const aiConfig = await getAiRuntimeConfig()
      aiModel = aiConfig.model
      const client = new OpenAI({
        baseURL: aiConfig.baseUrl,
        apiKey: aiConfig.apiKey,
      })

      const prompt = buildSystemPrompt(context?.mode || 'brief', context)
      const payload = await client.chat.completions.create({
        model: aiConfig.model,
        temperature: context?.mode === 'detailed' ? Math.max(aiConfig.temperature, 0.7) : Math.min(aiConfig.temperature, 0.5),
        top_p: aiConfig.topP,
        max_tokens: context?.mode === 'detailed' ? aiConfig.maxTokens : Math.min(aiConfig.maxTokens, 900),
        stream: false,
        messages: [
          aiSystemMessage(),
          ...history.map((entry) => ({ role: entry.role, content: entry.message })),
          aiTaskMessage(prompt),
          { role: 'user', content: message },
        ],
      })

      const reply = payload?.choices?.[0]?.message?.content
      content = formatAssistantReply(reply, context?.mode || 'brief')
    } catch (error) {
      const described = logAiError('chatbot', error, aiModel)
      return res.status(described.status).json({ message: described.message })
    }

    if (!content) {
      return res.status(503).json({
        message: 'Chatbot did not return content. Please retry.',
      })
    }

    return res.json({
      role: 'assistant',
      content,
      restricted: false,
    })
  } catch (error) {
    return next(error)
  }
})

export default router
