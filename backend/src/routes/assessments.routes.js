import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireTrainer } from '../middleware/auth.js'
import { isRole, ROLES } from '../config/roles.js'
import { executeCodeOnServer } from '../services/codeExecutor.js'
import OpenAI from 'openai'
import { getAiRuntimeConfig } from '../services/aiSettings.js'
import { aiSystemMessage, aiTaskMessage } from '../services/aiPrompts.js'

const router = Router()
router.use(authenticate)
const CHOICE_TYPES = new Set(['single_choice', 'multiple_choice', 'true_false', 'ordering', 'output_prediction'])
const MANUAL_TYPES = new Set(['short_answer', 'long_answer', 'scenario', 'reasoning', 'bug_finding', 'code_analysis', 'security_scenario'])
const TYPES = new Set([...CHOICE_TYPES, ...MANUAL_TYPES, 'fill_blank', 'coding'])

function parseJson(value, fallback = []) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value
  try { return JSON.parse(value || '') } catch { return fallback }
}
function mysqlDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ')
}
function shuffle(items) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1); [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
function canManage(user, assessment) { return isRole(user.role, ROLES.ADMIN) || Number(assessment.created_by) === Number(user.id) }
async function getAssessment(id) { const [rows] = await pool.query('SELECT * FROM assessments WHERE id=? LIMIT 1', [id]); return rows[0] || null }
async function getOverride(id, userId) { const [rows] = await pool.query('SELECT * FROM assessment_overrides WHERE assessment_id=? AND user_id=? LIMIT 1', [id, userId]); return rows[0] || null }
function effective(row, override) {
  if (!override) return row
  return { ...row, duration_minutes: override.duration_minutes ?? row.duration_minutes, max_attempts: override.max_attempts ?? row.max_attempts,
    opens_at: override.opens_at ?? row.opens_at, deadline: override.deadline ?? row.deadline,
    access_password_hash: override.access_password_hash ?? row.access_password_hash }
}
function windowState(row) {
  const now = Date.now(), opens = row.opens_at ? new Date(row.opens_at).getTime() : 0, closes = row.deadline ? new Date(row.deadline).getTime() : 0
  return { notYetOpen: Boolean(opens && now < opens), closed: Boolean(closes && now > closes) }
}
function released(row) {
  if (row.results_mode === 'manual') return false
  return row.results_mode !== 'scheduled' || Boolean(row.results_release_at && Date.now() >= new Date(row.results_release_at).getTime())
}
async function eligible(row, userId) {
  if (!row.target_mode || row.target_mode === 'all') return true
  if (row.target_mode === 'classroom' && row.classroom_id) {
    const [rows] = await pool.query('SELECT 1 FROM classroom_members WHERE classroom_id=? AND user_id=? LIMIT 1', [row.classroom_id, userId]); return Boolean(rows.length)
  }
  const [rows] = await pool.query('SELECT 1 FROM assessment_targets WHERE assessment_id=? AND user_id=? LIMIT 1', [row.id, userId]); return Boolean(rows.length)
}
function dto(row, user, extra = {}) {
  return { id: row.id, title: row.title, description: row.description, instructions: row.instructions, subject: row.subject,
    roomId: row.room_id, classroomId: row.classroom_id, kind: row.kind, difficulty: row.difficulty, creationMethod: row.creation_method,
    passPercentage: Number(row.pass_percentage), totalMarks: Number(row.total_marks || 0), durationMinutes: Number(row.duration_minutes || 0),
    maxAttempts: Number(row.max_attempts || 0), gradeMethod: row.grade_method, negativeMark: Number(row.negative_mark || 0),
    opensAt: row.opens_at, deadline: row.deadline, allowLateSubmission: Boolean(row.allow_late_submission), autoSubmit: Boolean(row.auto_submit),
    passwordRequired: Boolean(row.access_password_hash), targetMode: row.target_mode, resultsMode: row.results_mode,
    resultsReleaseAt: row.results_release_at, showCorrectAnswers: Boolean(row.show_correct_answers), showExplanations: Boolean(row.show_explanations),
    discussionEnabled: Boolean(row.discussion_enabled), allowedLanguages: parseJson(row.allowed_languages_json, ['javascript', 'python']),
    security: parseJson(row.security_json, {}), isPublished: Boolean(row.is_published), bankId: row.bank_id,
    drawCount: Number(row.draw_count || 0), shuffleQuestions: Boolean(row.shuffle_questions), shuffleOptions: Boolean(row.shuffle_options),
    canManage: canManage(user, row), ...windowState(row), ...extra }
}
function fields(body, creator) {
  const password = Object.prototype.hasOwnProperty.call(body || {}, 'accessPassword')
  return { title: body?.title, description: body?.description, instructions: body?.instructions, subject: body?.subject,
    room_id: body?.roomId, classroom_id: body?.classroomId, kind: body?.kind, difficulty: body?.difficulty,
    creation_method: body?.creationMethod, pass_percentage: body?.passPercentage, total_marks: body?.totalMarks,
    duration_minutes: body?.durationMinutes, max_attempts: body?.maxAttempts, grade_method: body?.gradeMethod,
    negative_mark: body?.negativeMark, opens_at: body?.opensAt !== undefined ? mysqlDate(body.opensAt) : undefined,
    deadline: body?.deadline !== undefined ? mysqlDate(body.deadline) : undefined, allow_late_submission: body?.allowLateSubmission,
    auto_submit: body?.autoSubmit, access_password_hash: password ? (String(body.accessPassword || '').trim() ? bcrypt.hashSync(String(body.accessPassword), 10) : null) : undefined,
    target_mode: body?.targetMode, results_mode: body?.resultsMode,
    results_release_at: body?.resultsReleaseAt !== undefined ? mysqlDate(body.resultsReleaseAt) : undefined,
    show_correct_answers: body?.showCorrectAnswers, show_explanations: body?.showExplanations,
    discussion_enabled: body?.discussionEnabled, allowed_languages_json: body?.allowedLanguages !== undefined ? JSON.stringify(body.allowedLanguages) : undefined,
    security_json: body?.security !== undefined ? JSON.stringify(body.security) : undefined, is_published: body?.isPublished,
    bank_id: body?.bankId, draw_count: body?.drawCount, shuffle_questions: body?.shuffleQuestions, shuffle_options: body?.shuffleOptions,
    ...(creator ? { created_by: creator } : {}) }
}
async function replaceTargets(conn, id, targets) {
  if (!Array.isArray(targets)) return
  await conn.query('DELETE FROM assessment_targets WHERE assessment_id=?', [id])
  for (const userId of [...new Set(targets.map(Number).filter(Number.isInteger))]) await conn.query('INSERT IGNORE INTO assessment_targets (assessment_id,user_id) VALUES (?,?)', [id, userId])
}
async function makePaper(row) {
  let questions
  if (row.bank_id) {
    const [rows] = await pool.query("SELECT id,prompt,options_json,marks,'single_choice' question_type,'medium' difficulty,NULL settings_json,NULL starter_code FROM question_bank_items WHERE bank_id=? ORDER BY id", [row.bank_id]); questions = rows
  } else {
    const [rows] = await pool.query('SELECT id,prompt,options_json,marks,question_type,difficulty,settings_json,starter_code FROM assessment_questions WHERE assessment_id=? ORDER BY sort_order,id', [row.id]); questions = rows
  }
  if (row.shuffle_questions || row.bank_id) questions = shuffle(questions)
  if (Number(row.draw_count) > 0) questions = questions.slice(0, Number(row.draw_count))
  return questions.map((q) => {
    const options = parseJson(q.options_json, []), optionOrder = row.shuffle_options && ['single_choice','multiple_choice'].includes(q.question_type) ? shuffle(options.map((_, i) => i)) : options.map((_, i) => i)
    return { questionId: Number(q.id), prompt: q.prompt, questionType: q.question_type || 'single_choice', difficulty: q.difficulty || 'medium',
      options: optionOrder.map((i) => options[i]), optionOrder, marks: Number(q.marks || 1), settings: parseJson(q.settings_json, {}), starterCode: q.starter_code || '' }
  })
}

router.get('/subjects', async (_req, res) => { const [rows] = await pool.query("SELECT name FROM room_categories UNION SELECT DISTINCT category FROM rooms WHERE category IS NOT NULL AND category<>'' ORDER BY name"); res.json(rows.map((r) => r.name).filter(Boolean)) })
router.get('/target-users', requireTrainer, async (req, res) => {
  const params = []; const join = req.query.classroomId ? (params.push(Number(req.query.classroomId)), 'JOIN classroom_members cm ON cm.user_id=u.id AND cm.classroom_id=?') : ''
  const [rows] = await pool.query(`SELECT DISTINCT u.id,u.username,u.first_name,u.last_name,u.email FROM users u ${join} WHERE u.is_active=true AND u.role IN ('trainee','student','operator') ORDER BY u.first_name,u.username LIMIT 500`, params); res.json(rows)
})

const AI_QUESTION_TYPES = new Set([
  'single_choice', 'multiple_choice', 'true_false', 'fill_blank', 'short_answer',
  'long_answer', 'scenario', 'reasoning', 'output_prediction', 'bug_finding',
  'code_analysis', 'security_scenario', 'coding',
])

const AI_QUESTION_TYPE_ALIASES = {
  mcq: 'single_choice',
  singlechoice: 'single_choice',
  multiplechoice: 'multiple_choice',
  truefalse: 'true_false',
  fillblank: 'fill_blank',
  shortanswer: 'short_answer',
  longanswer: 'long_answer',
  outputprediction: 'output_prediction',
  bugfinding: 'bug_finding',
  codeanalysis: 'code_analysis',
  securityscenario: 'security_scenario',
  codingquestion: 'coding',
}

function normalizeAiQuestionType(value) {
  const normalized = String(value || '').trim().replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_').toLowerCase()
  if (AI_QUESTION_TYPES.has(normalized)) return normalized
  return AI_QUESTION_TYPE_ALIASES[normalized.replaceAll('_', '')] || ''
}

function parseAiJson(message) {
  const content = Array.isArray(message?.content)
    ? message.content.map((part) => part?.text || part?.content || '').join('')
    : String(message?.content || '')
  const candidates = [content, String(message?.reasoning_content || '')].filter(Boolean)
  for (const candidate of candidates) {
    const cleaned = candidate
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    const objectStart = cleaned.indexOf('{')
    const objectEnd = cleaned.lastIndexOf('}')
    for (const value of [cleaned, objectStart >= 0 && objectEnd > objectStart ? cleaned.slice(objectStart, objectEnd + 1) : '']) {
      if (!value) continue
      try { return JSON.parse(value) } catch { /* Try the next representation. */ }
    }
  }
  throw new Error('AI response did not contain a complete JSON object')
}

function normalizeGeneratedQuestion(question, kind, difficulty) {
  const requestedType = normalizeAiQuestionType(question?.questionType || question?.type) || 'single_choice'
  const questionType = kind === 'coding' ? 'coding' : kind === 'quiz' && requestedType === 'coding' ? 'scenario' : requestedType
  const options = Array.isArray(question?.options)
    ? question.options.map((option) => String(option || '').trim()).filter(Boolean)
    : []
  const tests = Array.isArray(question?.testCases)
    ? question.testCases.map((test, index) => ({
        input: String(test?.input ?? ''),
        expectedOutput: String(test?.expectedOutput ?? ''),
        hidden: index > 0 ? test?.hidden !== false : false,
        marks: Math.max(1, Number(test?.marks || 1)),
      }))
    : []

  return {
    questionType,
    difficulty: ['easy', 'medium', 'hard'].includes(question?.difficulty) ? question.difficulty : difficulty,
    prompt: String(question?.prompt || '').trim(),
    options: questionType === 'coding' ? [] : options,
    correctIndex: Math.max(0, Number(question?.correctIndex || 0)),
    correctAnswer: Array.isArray(question?.correctAnswer) ? question.correctAnswer : [],
    explanation: String(question?.explanation || '').trim(),
    starterCode: questionType === 'coding'
      ? String(question?.starterCode || 'function solve(input) {\n  // Return your answer\n}\n')
      : '',
    solutionCode: questionType === 'coding' ? String(question?.solutionCode || '') : '',
    settings: question?.settings && typeof question.settings === 'object' ? question.settings : {},
    testCases: questionType === 'coding' ? tests : [],
    marks: Math.max(1, Number(question?.marks || (questionType === 'coding' ? 10 : 1))),
  }
}

function generatedQuestionIsUsable(question) {
  if (question.prompt.length < 25 || /generated practice question|option a|edit this/i.test(question.prompt)) return false
  if (['single_choice', 'multiple_choice', 'true_false', 'output_prediction'].includes(question.questionType)) {
    if (question.options.length < 2 || new Set(question.options.map((value) => value.toLowerCase())).size !== question.options.length) return false
    if (question.explanation.length < 12) return false
  }
  if (['single_choice', 'true_false', 'output_prediction'].includes(question.questionType) && question.correctIndex >= question.options.length) return false
  if (question.questionType === 'multiple_choice' && !question.correctAnswer.length) return false
  if (question.questionType === 'fill_blank' && !question.correctAnswer.length) return false
  if (question.questionType === 'coding') {
    if (question.prompt.length < 60 || question.testCases.length < 2) return false
    if (!question.settings?.inputFormat || !question.settings?.outputFormat || question.solutionCode.length < 20) return false
    if (!question.testCases.some((test) => !test.hidden) || !question.testCases.some((test) => test.hidden)) return false
    if (question.testCases.some((test) => !test.expectedOutput)) return false
  }
  return true
}

router.post('/ai/generate', requireTrainer, async (req, res) => {
  const subject = String(req.body?.subject || '').trim(), topic = String(req.body?.topic || subject).trim()
  const count = Math.min(20, Math.max(1, Number(req.body?.count || 5))), difficulty = String(req.body?.difficulty || 'medium')
  const kind = ['quiz', 'coding', 'combined'].includes(req.body?.kind) ? req.body.kind : 'quiz'
  const brief = String(req.body?.prompt || '').trim()
  const learningOutcomes = String(req.body?.learningOutcomes || '').trim()
  const requestedTypes = [...new Set((Array.isArray(req.body?.questionTypes) ? req.body.questionTypes : [])
    .filter((type) => AI_QUESTION_TYPES.has(type)))]
  if (!subject) return res.status(400).json({ message: 'Choose a subject before generating questions' })
  if (brief.length < 20) return res.status(400).json({ message: 'Give AI a specific prompt of at least 20 characters' })

  const allowedTypes = kind === 'coding'
    ? ['coding']
    : kind === 'quiz'
      ? (requestedTypes.length ? requestedTypes.filter((type) => type !== 'coding') : ['single_choice', 'multiple_choice', 'true_false', 'fill_blank'])
      : (requestedTypes.length ? requestedTypes : ['single_choice', 'scenario', 'coding'])
  if (!allowedTypes.length) return res.status(400).json({ message: 'Choose at least one question type suitable for this assessment' })

  const config = await getAiRuntimeConfig()
  if (!config.apiKey) return res.status(503).json({ message: 'AI generation is not configured. Add an AI API key in Platform Configuration.' })
  try {
    const client = new OpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey })
    const response = await client.chat.completions.create({
      model: config.model,
      temperature: Math.min(0.7, Number(config.temperature || 0.45)),
      top_p: config.topP,
      max_tokens: Math.min(Number(config.maxTokens) || 16000, 16000, Math.max(5000, count * (kind === 'coding' ? 2200 : 1400))),
      stream: false,
      messages: [
        aiSystemMessage(),
        aiTaskMessage('generateAssessmentQuestions'),
        {
          role: 'user',
          content: `SUBJECT: ${subject}\nTOPIC: ${topic}\nASSESSMENT TYPE: ${kind}\nDIFFICULTY: ${difficulty}\nQUESTION COUNT: ${count}\nALLOWED QUESTION TYPES: ${allowedTypes.join(', ')}\nLEARNING OUTCOMES:\n${learningOutcomes || 'Use the trainer brief.'}\nTRAINER BRIEF:\n${brief}\n\nGenerate exactly ${count} questions. Use only the allowed types and cover the brief and learning outcomes without repeating the same concept.`,
        },
      ],
    })
    const choice = response.choices?.[0]
    if (choice?.finish_reason === 'length') throw new Error('AI response exceeded the generation token limit')
    const parsed = parseAiJson(choice?.message)
    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .slice(0, count)
      .map((question) => normalizeGeneratedQuestion(question, kind, difficulty))
    if (questions.length !== count || questions.some((question) => !allowedTypes.includes(question.questionType) || !generatedQuestionIsUsable(question))) {
      return res.status(502).json({ message: 'AI returned an incomplete or vague draft. Make the prompt more specific and generate again.' })
    }
    return res.json({ questions, generatedBy: 'ai', model: config.model })
  } catch (error) {
    const providerStatus = Number(error?.status || 0)
    console.error('Assessment AI generation failed', {
      status: providerStatus || undefined,
      code: error?.code,
      message: error?.message || String(error),
    })
    if ([404, 410].includes(providerStatus)) {
      return res.status(503).json({ message: 'The selected AI model is no longer available. Choose another model in Platform Configuration and try again.' })
    }
    if ([401, 403].includes(providerStatus)) {
      return res.status(503).json({ message: 'The AI provider rejected the configured API key. Update it in Platform Configuration.' })
    }
    if (providerStatus === 429) {
      return res.status(429).json({ message: 'The AI provider is busy or its request limit was reached. Wait briefly and try again.' })
    }
    if (providerStatus >= 500) {
      return res.status(502).json({ message: 'The AI provider is temporarily unavailable. Try again shortly.' })
    }
    const message = /token limit/i.test(error?.message || '')
      ? 'The AI response was too long. Generate fewer questions at once.'
      : 'AI returned an unreadable assessment. Try again or make the prompt more specific.'
    return res.status(502).json({ message })
  }
})
router.get('/attempts/me', async (req, res) => {
  const [rows] = await pool.query('SELECT t.id,t.assessment_id,t.score,t.max_score,t.percentage,t.passed,t.status,t.submitted_at,a.title,a.subject,a.results_mode,a.results_release_at FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id WHERE t.user_id=? ORDER BY t.started_at DESC LIMIT 200', [req.user.id])
  res.json(rows.map((r) => ({ ...r, resultReleased: released(r) })))
})
router.get('/', async (req, res) => {
  const staff = isRole(req.user.role, ROLES.TRAINER, ROLES.ADMIN), where = [], params = []
  if (!staff) where.push('a.is_published=true'); else if (req.query.mine === 'true') { where.push('a.created_by=?'); params.push(req.user.id) }
  if (req.query.subject) { where.push('a.subject=?'); params.push(String(req.query.subject)) }
  const [rows] = await pool.query(`SELECT a.*,u.username creator_username,u.first_name creator_first_name,r.title course_title,
    CASE WHEN a.bank_id IS NOT NULL THEN (SELECT COUNT(*) FROM question_bank_items q WHERE q.bank_id=a.bank_id) ELSE (SELECT COUNT(*) FROM assessment_questions q WHERE q.assessment_id=a.id) END question_count,
    (SELECT COUNT(*) FROM assessment_attempts t WHERE t.assessment_id=a.id AND t.submitted_at IS NOT NULL) attempt_count
    FROM assessments a LEFT JOIN users u ON u.id=a.created_by LEFT JOIN rooms r ON r.id=a.room_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.deadline IS NULL,a.deadline,a.created_at DESC LIMIT 300`, params)
  const [mine] = await pool.query('SELECT assessment_id,MAX(percentage) best_percentage,COUNT(*) attempts,MAX(passed) passed FROM assessment_attempts WHERE user_id=? AND submitted_at IS NOT NULL GROUP BY assessment_id', [req.user.id])
  const map = new Map(mine.map((r) => [Number(r.assessment_id), r])), output = []
  for (const row of rows) { if (!staff && !(await eligible(row, req.user.id))) continue; const own = map.get(Number(row.id)); output.push(dto(row, req.user, { courseTitle: row.course_title, questionCount: Number(row.question_count), attemptCount: Number(row.attempt_count), createdBy: row.created_by, createdByName: row.creator_first_name || row.creator_username, myAttempts: Number(own?.attempts || 0), myBestPercentage: own ? Number(own.best_percentage) : null, myPassed: Boolean(own?.passed) })) }
  res.json(output)
})
router.post('/', requireTrainer, async (req, res) => {
  if (!String(req.body?.title || '').trim() || !String(req.body?.subject || '').trim()) return res.status(400).json({ message: 'Title and subject are required' })
  const entries = Object.entries(fields(req.body, req.user.id)).filter(([,v]) => v !== undefined), conn = await pool.getConnection()
  try { await conn.beginTransaction(); const [result] = await conn.query(`INSERT INTO assessments (${entries.map(([k]) => k).join(',')}) VALUES (${entries.map(() => '?').join(',')})`, entries.map(([,v]) => v === '' ? null : v)); await replaceTargets(conn, result.insertId, req.body?.targetUserIds); await conn.commit(); res.status(201).json({ id: result.insertId }) } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
})
router.get('/:id', async (req, res) => {
  const row = await getAssessment(req.params.id); if (!row) return res.status(404).json({ message: 'Assessment not found' })
  const manage = canManage(req.user, row); if (!row.is_published && !manage) return res.status(403).json({ message: 'This assessment is not published yet' }); if (!manage && !(await eligible(row, req.user.id))) return res.status(403).json({ message: 'This assessment is not assigned to you' })
  const current = effective(row, manage ? null : await getOverride(row.id, req.user.id)); let questions = [], targetUserIds = []
  if (manage) {
    const [items] = await pool.query('SELECT * FROM assessment_questions WHERE assessment_id=? ORDER BY sort_order,id', [row.id])
    const [tests] = await pool.query('SELECT tc.* FROM assessment_test_cases tc JOIN assessment_questions q ON q.id=tc.question_id WHERE q.assessment_id=? ORDER BY tc.sort_order,tc.id', [row.id])
    questions = items.map((q) => ({ id:q.id,prompt:q.prompt,questionType:q.question_type,difficulty:q.difficulty,options:parseJson(q.options_json,[]),correctIndex:q.correct_index,correctAnswer:parseJson(q.correct_answer_json,null),explanation:q.explanation,settings:parseJson(q.settings_json,{}),starterCode:q.starter_code || '',solutionCode:q.solution_code || '',marks:Number(q.marks),testCases:tests.filter((t) => Number(t.question_id)===Number(q.id)).map((t) => ({ input:t.input_data,expectedOutput:t.expected_output,hidden:Boolean(t.is_hidden),marks:Number(t.marks) })) }))
    const [targets] = await pool.query('SELECT user_id FROM assessment_targets WHERE assessment_id=?', [row.id]); targetUserIds = targets.map((t) => Number(t.user_id))
  }
  res.json(dto(current, req.user, { questions, targetUserIds }))
})
router.put('/:id', requireTrainer, async (req, res) => {
  const row = await getAssessment(req.params.id); if (!row) return res.status(404).json({ message:'Assessment not found' }); if (!canManage(req.user,row)) return res.status(403).json({ message:'You can only edit your own assessments' })
  const entries = Object.entries(fields(req.body)).filter(([,v]) => v !== undefined), conn = await pool.getConnection()
  try { await conn.beginTransaction(); if (entries.length) await conn.query(`UPDATE assessments SET ${entries.map(([k]) => `${k}=?`).join(',')} WHERE id=?`, [...entries.map(([,v]) => v === '' ? null : v),row.id]); await replaceTargets(conn,row.id,req.body?.targetUserIds); await conn.commit(); res.json({updated:true}) } catch(error){await conn.rollback();throw error} finally{conn.release()}
})
router.delete('/:id', requireTrainer, async (req,res) => { const row=await getAssessment(req.params.id); if(!row)return res.status(404).json({message:'Assessment not found'}); if(!canManage(req.user,row))return res.status(403).json({message:'You can only delete your own assessments'}); await pool.query('DELETE FROM assessments WHERE id=?',[row.id]);res.json({deleted:true}) })

router.put('/:id/questions', requireTrainer, async (req,res) => {
  const row=await getAssessment(req.params.id); if(!row)return res.status(404).json({message:'Assessment not found'}); if(!canManage(req.user,row))return res.status(403).json({message:'You can only edit your own assessments'})
  const questions=Array.isArray(req.body?.questions)?req.body.questions:[]
  for(const [i,q] of questions.entries()) { const type=row.kind==='coding'?'coding':TYPES.has(q.questionType)?q.questionType:'single_choice'; if(!String(q.prompt||'').trim())return res.status(400).json({message:`Question ${i+1} needs a prompt`}); if(CHOICE_TYPES.has(type)&&parseJson(q.options,[]).filter(Boolean).length<2)return res.status(400).json({message:`Question ${i+1} needs at least two options`}); if(type==='coding'&&!(q.testCases||[]).length)return res.status(400).json({message:`Coding question ${i+1} needs a test case`}) }
  const conn=await pool.getConnection()
  try { await conn.beginTransaction(); await conn.query('DELETE FROM assessment_questions WHERE assessment_id=?',[row.id]); let total=0
    for(const [i,q] of questions.entries()) { const type=row.kind==='coding'?'coding':TYPES.has(q.questionType)?q.questionType:'single_choice', options=parseJson(q.options,[]).map(String).map((v)=>v.trim()).filter(Boolean), marks=Number(q.marks||1); total+=marks
      const [insert]=await conn.query(`INSERT INTO assessment_questions (assessment_id,prompt,question_type,difficulty,options_json,correct_index,correct_answer_json,explanation,settings_json,starter_code,solution_code,marks,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[row.id,String(q.prompt).trim(),type,q.difficulty||'medium',JSON.stringify(options),Number(q.correctIndex||0),q.correctAnswer==null?null:JSON.stringify(q.correctAnswer),q.explanation||null,JSON.stringify(q.settings||{}),q.starterCode||null,q.solutionCode||null,marks,i])
      for(const [j,test] of (q.testCases||[]).entries()) await conn.query('INSERT INTO assessment_test_cases (question_id,input_data,expected_output,is_hidden,marks,sort_order) VALUES (?,?,?,?,?,?)',[insert.insertId,String(test.input??''),String(test.expectedOutput??''),Boolean(test.hidden),Number(test.marks||1),j])
    }
    await conn.query('UPDATE assessments SET total_marks=? WHERE id=?',[total,row.id]); await conn.commit();res.json({saved:questions.length})
  } catch(error){await conn.rollback();throw error} finally{conn.release()}
})

router.put('/:id/overrides/:userId',requireTrainer,async(req,res)=>{const row=await getAssessment(req.params.id);if(!row)return res.status(404).json({message:'Assessment not found'});if(!canManage(req.user,row))return res.status(403).json({message:'You cannot manage this assessment'});const hash=String(req.body?.accessPassword||'').trim()?bcrypt.hashSync(String(req.body.accessPassword),10):null;await pool.query(`INSERT INTO assessment_overrides (assessment_id,user_id,duration_minutes,max_attempts,opens_at,deadline,access_password_hash) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE duration_minutes=VALUES(duration_minutes),max_attempts=VALUES(max_attempts),opens_at=VALUES(opens_at),deadline=VALUES(deadline),access_password_hash=VALUES(access_password_hash)`,[row.id,Number(req.params.userId),req.body?.durationMinutes??null,req.body?.maxAttempts??null,mysqlDate(req.body?.opensAt),mysqlDate(req.body?.deadline),hash]);res.json({updated:true})})

router.post('/:id/start',async(req,res)=>{
  const base=await getAssessment(req.params.id);if(!base)return res.status(404).json({message:'Assessment not found'});if(!base.is_published)return res.status(403).json({message:'This assessment is not open'});if(!(await eligible(base,req.user.id)))return res.status(403).json({message:'This assessment is not assigned to you'})
  const row=effective(base,await getOverride(base.id,req.user.id)),state=windowState(row);if(state.notYetOpen)return res.status(403).json({message:'This assessment has not opened yet'});if(state.closed&&!row.allow_late_submission)return res.status(403).json({message:'The deadline has passed'});if(row.access_password_hash&&!(await bcrypt.compare(String(req.body?.password||''),row.access_password_hash)))return res.status(403).json({message:'Incorrect assessment password'})
  const [active]=await pool.query("SELECT * FROM assessment_attempts WHERE assessment_id=? AND user_id=? AND status='in_progress' ORDER BY id DESC LIMIT 1",[row.id,req.user.id]);let attempt=active[0]
  if(attempt?.expires_at&&Date.now()>new Date(attempt.expires_at).getTime()){await pool.query("UPDATE assessment_attempts SET status='expired' WHERE id=?",[attempt.id]);attempt=null}
  if(!attempt){const [counts]=await pool.query('SELECT COUNT(*) count FROM assessment_attempts WHERE assessment_id=? AND user_id=?',[row.id,req.user.id]);const number=Number(counts[0].count)+1;if(row.max_attempts>0&&number>row.max_attempts)return res.status(403).json({message:'You have used all available attempts'});const paper=await makePaper(row);if(!paper.length)return res.status(400).json({message:'This assessment has no questions yet'});const expires=row.duration_minutes>0?new Date(Date.now()+row.duration_minutes*60000):null;const [insert]=await pool.query("INSERT INTO assessment_attempts (assessment_id,user_id,status,attempt_number,paper_json,question_order_json,draft_json,flagged_json,expires_at) VALUES (?,?,'in_progress',?,?,?,'{}','[]',?)",[row.id,req.user.id,number,JSON.stringify(paper),JSON.stringify(paper),expires]);const [created]=await pool.query('SELECT * FROM assessment_attempts WHERE id=?',[insert.insertId]);attempt=created[0]}
  res.json({attemptId:attempt.id,attemptNumber:attempt.attempt_number,expiresAt:attempt.expires_at,answers:parseJson(attempt.draft_json,{}),flagged:parseJson(attempt.flagged_json,[]),questions:parseJson(attempt.paper_json||attempt.question_order_json,[]),assessment:dto(row,req.user)})
})

router.patch('/attempts/:attemptId/autosave',async(req,res)=>{const [rows]=await pool.query("SELECT id FROM assessment_attempts WHERE id=? AND user_id=? AND status='in_progress'",[req.params.attemptId,req.user.id]);if(!rows.length)return res.status(404).json({message:'Active attempt not found'});await pool.query('UPDATE assessment_attempts SET draft_json=?,flagged_json=?,last_saved_at=CURRENT_TIMESTAMP WHERE id=?',[JSON.stringify(req.body?.answers||{}),JSON.stringify(req.body?.flagged||[]),rows[0].id]);res.json({savedAt:new Date().toISOString()})})
router.post('/attempts/:attemptId/security-events',async(req,res)=>{const [rows]=await pool.query('SELECT id FROM assessment_attempts WHERE id=? AND user_id=?',[req.params.attemptId,req.user.id]);if(!rows.length)return res.status(404).json({message:'Attempt not found'});const allowed=new Set(['tab_hidden','window_blur','copy','paste','fullscreen_exit','network_reconnect']);await pool.query('INSERT INTO assessment_security_events (attempt_id,user_id,event_type,details_json) VALUES (?,?,?,?)',[rows[0].id,req.user.id,allowed.has(req.body?.type)?req.body.type:'other',JSON.stringify(req.body?.details||{})]);res.status(201).json({recorded:true})})

function inputValue(value){try{return JSON.parse(value)}catch{return value}}
function canonical(value){const text=String(value??'').trim();try{return JSON.stringify(JSON.parse(text))}catch{return text.replace(/\r\n/g,'\n')}}
router.post('/attempts/:attemptId/run-code',async(req,res)=>{const [rows]=await pool.query("SELECT * FROM assessment_attempts WHERE id=? AND user_id=? AND status='in_progress'",[req.params.attemptId,req.user.id]);if(!rows.length)return res.status(404).json({message:'Active attempt not found'});const assessment=await getAssessment(rows[0].assessment_id),language=String(req.body?.language||'').toLowerCase(),allowed=parseJson(assessment?.allowed_languages_json,['javascript','python']);if(!allowed.includes(language))return res.status(400).json({message:'This language is not allowed for this assessment.'});const qid=Number(req.body?.questionId),paper=parseJson(rows[0].paper_json,[]);if(!paper.some((q)=>Number(q.questionId)===qid&&q.questionType==='coding'))return res.status(400).json({message:'Coding question not found'});const [cases]=await pool.query('SELECT input_data,expected_output FROM assessment_test_cases WHERE question_id=? AND is_hidden=false ORDER BY sort_order,id',[qid]);const run=await executeCodeOnServer(language,String(req.body?.code||''),cases.map((t)=>({input:inputValue(t.input_data)})));if(!run.supported)return res.status(400).json({message:run.error||'The selected language runtime is unavailable.'});res.json({error:run.error,runs:(run.runs||[]).map((item,i)=>({...item,input:cases[i]?.input_data,expectedOutput:cases[i]?.expected_output,passed:Boolean(item.ok&&canonical(item.output)===canonical(cases[i]?.expected_output))}))})})

async function grade(attempt,assessment,submitted){
  const paper=parseJson(attempt.paper_json||attempt.question_order_json,[]),ids=paper.map((q)=>Number(q.questionId)).filter(Number.isFinite);const [rows]=assessment.bank_id
    ? await pool.query("SELECT *, 'single_choice' question_type, NULL correct_answer_json FROM question_bank_items WHERE id IN (?) AND bank_id=?",[ids,assessment.bank_id])
    : await pool.query('SELECT * FROM assessment_questions WHERE id IN (?)',[ids]);const questions=new Map(rows.map((q)=>[Number(q.id),q]));let score=0,maxScore=0,needsReview=false;const breakdown=[],codeResults=[]
  for(const shown of paper){const q=questions.get(Number(shown.questionId));if(!q)continue;const type=q.question_type||'single_choice',marks=Number(q.marks||shown.marks||1),answer=submitted[String(q.id)]??submitted[q.id],order=shown.optionOrder||parseJson(q.options_json,[]).map((_,i)=>i);maxScore+=marks;let earned=0,correct=false,pendingReview=false
    if(['single_choice','true_false','output_prediction'].includes(type)){correct=Number(answer)===order.indexOf(Number(q.correct_index));earned=correct?marks:(answer==null?0:-Number(assessment.negative_mark||0))}
    else if(type==='multiple_choice'){const expected=parseJson(q.correct_answer_json,[]).map((v)=>order.indexOf(Number(v))).sort(),actual=(Array.isArray(answer)?answer:[]).map(Number).sort();correct=JSON.stringify(expected)===JSON.stringify(actual);earned=correct?marks:(actual.length?-Number(assessment.negative_mark||0):0)}
    else if(type==='fill_blank'||(type==='short_answer'&&q.correct_answer_json)){const expected=parseJson(q.correct_answer_json,[]).flat().map((v)=>String(v).trim().toLowerCase());correct=expected.includes(String(answer??'').trim().toLowerCase());earned=correct?marks:0}
    else if(type==='ordering'){correct=JSON.stringify(answer||[])===JSON.stringify(parseJson(q.correct_answer_json,[]));earned=correct?marks:0}
    else if(type==='coding'){const payload=answer&&typeof answer==='object'?answer:{};const [cases]=await pool.query('SELECT * FROM assessment_test_cases WHERE question_id=? ORDER BY sort_order,id',[q.id]);const run=await executeCodeOnServer(payload.language,String(payload.code||''),cases.map((t)=>({input:inputValue(t.input_data)})));let possible=0;const results=cases.map((test,i)=>{const caseMarks=Number(test.marks||0),passed=Boolean(run.runs?.[i]?.ok&&canonical(run.runs[i].output)===canonical(test.expected_output));possible+=caseMarks;if(passed)earned+=caseMarks;return{testCaseId:test.id,hidden:Boolean(test.is_hidden),passed,marks:caseMarks,message:run.runs?.[i]?.message||run.error||null}});if(possible&&possible!==marks)earned=earned/possible*marks;correct=results.length>0&&results.every((r)=>r.passed);codeResults.push({questionId:q.id,language:payload.language,runs:results})}
    else{pendingReview=MANUAL_TYPES.has(type);needsReview||=pendingReview}
    earned=Math.max(-marks,earned);score+=earned;breakdown.push({questionId:q.id,answer,correct,score:earned,maxScore:marks,pendingReview,correctIndex:assessment.show_correct_answers?order.indexOf(Number(q.correct_index)):undefined,correctAnswer:assessment.show_correct_answers?parseJson(q.correct_answer_json,null):undefined,explanation:assessment.show_explanations?q.explanation:undefined})
  }
  score=Math.max(0,score);const percentage=maxScore?Math.round(score/maxScore*100):0;return{breakdown,codeResults,score,maxScore,percentage,passed:percentage>=Number(assessment.pass_percentage||0),needsReview}
}
router.post('/attempts/:attemptId/submit',async(req,res)=>{const [rows]=await pool.query("SELECT * FROM assessment_attempts WHERE id=? AND user_id=? AND status='in_progress'",[req.params.attemptId,req.user.id]);if(!rows.length)return res.status(404).json({message:'Active attempt not found'});const assessment=await getAssessment(rows[0].assessment_id),submitted=req.body?.answers&&typeof req.body.answers==='object'?req.body.answers:parseJson(rows[0].draft_json,{}),result=await grade(rows[0],assessment,submitted),status=result.needsReview?'pending_review':'submitted';await pool.query('UPDATE assessment_attempts SET status=?,score=?,max_score=?,percentage=?,passed=?,answers_json=?,draft_json=?,code_results_json=?,submitted_at=CURRENT_TIMESTAMP,last_saved_at=CURRENT_TIMESTAMP WHERE id=?',[status,result.score,result.maxScore,result.percentage,result.passed,JSON.stringify(result.breakdown),JSON.stringify(submitted),JSON.stringify(result.codeResults),rows[0].id]);const show=released(assessment)&&!result.needsReview;res.status(201).json({attemptId:rows[0].id,status,resultReleased:show,...(show?{score:result.score,maxScore:result.maxScore,percentage:result.percentage,passed:result.passed,breakdown:result.breakdown}:{})})})
router.post('/:id/attempts',async(_req,res)=>res.status(409).json({message:'Start this assessment before submitting it'}))

router.get('/:id/results',requireTrainer,async(req,res)=>{const assessment=await getAssessment(req.params.id);if(!assessment)return res.status(404).json({message:'Assessment not found'});if(!canManage(req.user,assessment))return res.status(403).json({message:'You can only view your own results'});const [rows]=await pool.query(`SELECT t.*,u.username,u.first_name,u.last_name,u.email,(SELECT COUNT(*) FROM assessment_security_events se WHERE se.attempt_id=t.id) security_event_count FROM assessment_attempts t JOIN users u ON u.id=t.user_id WHERE t.assessment_id=? ORDER BY t.started_at DESC`,[assessment.id]);const done=rows.filter((r)=>r.submitted_at),percentages=done.map((r)=>Number(r.percentage)),stats=new Map();for(const row of done)for(const answer of parseJson(row.answers_json,[])){const item=stats.get(Number(answer.questionId))||{questionId:Number(answer.questionId),attempts:0,correct:0,totalScore:0};item.attempts++;item.correct+=answer.correct?1:0;item.totalScore+=Number(answer.score||0);stats.set(item.questionId,item)}res.json({assessment:dto(assessment,req.user),summary:{attempts:done.length,inProgress:rows.filter((r)=>r.status==='in_progress').length,pendingReview:rows.filter((r)=>r.status==='pending_review').length,uniqueTrainees:new Set(done.map((r)=>Number(r.user_id))).size,passed:done.filter((r)=>r.passed).length,averagePercentage:percentages.length?Math.round(percentages.reduce((a,b)=>a+b,0)/percentages.length):0,securityEvents:rows.reduce((sum,r)=>sum+Number(r.security_event_count||0),0)},questionAnalytics:[...stats.values()].map((s)=>({...s,correctRate:s.attempts?Math.round(s.correct/s.attempts*100):0,averageScore:s.attempts?Number((s.totalScore/s.attempts).toFixed(2)):0})),attempts:rows.map((r)=>({...r,answers:parseJson(r.answers_json,[]),paper:parseJson(r.paper_json||r.question_order_json,[]),codeResults:parseJson(r.code_results_json,[]),answers_json:undefined,paper_json:undefined,question_order_json:undefined,draft_json:undefined,code_results_json:undefined}))})})

router.put('/attempts/:attemptId/grades/:questionId',requireTrainer,async(req,res)=>{const [rows]=await pool.query('SELECT t.*,a.created_by,a.pass_percentage FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id WHERE t.id=?',[req.params.attemptId]);const attempt=rows[0];if(!attempt||(!isRole(req.user.role,ROLES.ADMIN)&&Number(attempt.created_by)!==Number(req.user.id)))return res.status(403).json({message:'You cannot grade this attempt'});const value=Math.max(0,Number(req.body?.score||0));await pool.query(`INSERT INTO assessment_manual_grades (attempt_id,question_id,score,feedback,graded_by,graded_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE score=VALUES(score),feedback=VALUES(feedback),graded_by=VALUES(graded_by),graded_at=CURRENT_TIMESTAMP`,[attempt.id,Number(req.params.questionId),value,req.body?.feedback||null,req.user.id]);const [totals]=await pool.query('SELECT COALESCE(SUM(score),0) manual_score FROM assessment_manual_grades WHERE attempt_id=?',[attempt.id]),answers=parseJson(attempt.answers_json,[]),auto=answers.reduce((sum,a)=>sum+(a.pendingReview?0:Number(a.score||0)),0),score=auto+Number(totals[0].manual_score),percentage=Number(attempt.max_score)?Math.round(score/Number(attempt.max_score)*100):0;await pool.query("UPDATE assessment_attempts SET score=?,percentage=?,passed=?,status='submitted' WHERE id=?",[score,percentage,percentage>=Number(attempt.pass_percentage),attempt.id]);res.json({updated:true,score,percentage})})

export default router
