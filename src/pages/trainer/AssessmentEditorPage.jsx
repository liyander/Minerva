import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import {
  createAssessment,
  fetchAssessment,
  fetchAssessmentSubjects,
  fetchAssessmentTargetUsers,
  generateAssessmentQuestions,
  saveAssessmentQuestions,
  updateAssessment,
} from '../../services/training'
import { fetchQuestionBanks } from '../../services/platform'
import { fetchClassrooms } from '../../services/community'

const emptyQuestion = (kind = 'quiz') => ({
  questionType: kind === 'coding' ? 'coding' : 'single_choice',
  difficulty: 'medium',
  prompt: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  explanation: '',
  marks: 1,
  correctAnswer: [],
  starterCode: 'function solve(input) {\n  // Return your answer\n}\n',
  solutionCode: '',
  testCases: [{ input: '', expectedOutput: '', hidden: false, marks: 1 }],
})

// <input type="datetime-local"> needs `YYYY-MM-DDTHH:mm` in local time.
function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function AssessmentEditorPage() {
  const { assessmentId } = useParams()
  const navigate = useNavigate()
  const isNew = !assessmentId || assessmentId === 'new'

  const [form, setForm] = useState({
    title: '',
    description: '',
    instructions: '',
    subject: '',
    kind: 'quiz',
    difficulty: 'medium',
    creationMethod: 'manual',
    passPercentage: 60,
    durationMinutes: 0,
    maxAttempts: 0,
    opensAt: '',
    deadline: '',
    isPublished: false,
    bankId: '',
    drawCount: 0,
    shuffleQuestions: false,
    shuffleOptions: false,
    gradeMethod: 'highest',
    negativeMark: 0,
    allowLateSubmission: false,
    autoSubmit: true,
    accessPassword: '',
    targetMode: 'all',
    classroomId: '',
    targetUserIds: [],
    resultsMode: 'immediate',
    resultsReleaseAt: '',
    showCorrectAnswers: true,
    showExplanations: true,
    discussionEnabled: false,
    allowedLanguages: ['javascript', 'python'],
    security: { trackTabChanges: true, trackCopyPaste: true },
  })
  const [questions, setQuestions] = useState([emptyQuestion()])
  const [subjects, setSubjects] = useState([])
  const [banks, setBanks] = useState([])
  const [targetUsers, setTargetUsers] = useState([])
  const [classrooms, setClassrooms] = useState([])
  const [isLoading, setIsLoading] = useState(!isNew)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [subjectRows, bankRows, userRows, classroomRows] = await Promise.all([
        fetchAssessmentSubjects(),
        fetchQuestionBanks(),
        fetchAssessmentTargetUsers(),
        fetchClassrooms(),
      ])
      setSubjects(subjectRows)
      setBanks(bankRows)
      setTargetUsers(userRows)
      setClassrooms(classroomRows)

      if (isNew) return

      const assessment = await fetchAssessment(assessmentId)
      setForm({
        title: assessment.title || '',
        description: assessment.description || '',
        instructions: assessment.instructions || '',
        subject: assessment.subject || '',
        kind: assessment.kind || 'quiz',
        difficulty: assessment.difficulty || 'medium',
        creationMethod: assessment.creationMethod || 'manual',
        passPercentage: assessment.passPercentage ?? 60,
        durationMinutes: assessment.durationMinutes ?? 0,
        maxAttempts: assessment.maxAttempts ?? 0,
        opensAt: toLocalInput(assessment.opensAt),
        deadline: toLocalInput(assessment.deadline),
        isPublished: Boolean(assessment.isPublished),
        bankId: assessment.bankId || '',
        drawCount: Number(assessment.drawCount || 0),
        shuffleQuestions: Boolean(assessment.shuffleQuestions),
        shuffleOptions: Boolean(assessment.shuffleOptions),
        gradeMethod: assessment.gradeMethod || 'highest', negativeMark: assessment.negativeMark || 0,
        allowLateSubmission: Boolean(assessment.allowLateSubmission), autoSubmit: assessment.autoSubmit !== false,
        accessPassword: '', targetMode: assessment.targetMode || 'all', classroomId: assessment.classroomId || '', targetUserIds: assessment.targetUserIds || [], resultsMode: assessment.resultsMode || 'immediate',
        resultsReleaseAt: toLocalInput(assessment.resultsReleaseAt), showCorrectAnswers: assessment.showCorrectAnswers !== false,
        showExplanations: assessment.showExplanations !== false, discussionEnabled: Boolean(assessment.discussionEnabled),
        allowedLanguages: assessment.allowedLanguages || ['javascript', 'python'], security: assessment.security || { trackTabChanges: true, trackCopyPaste: true },
      })
      setQuestions(
        assessment.questions?.length
          ? assessment.questions.map((question) => ({
              prompt: question.prompt,
              questionType: assessment.kind === 'coding' ? 'coding' : question.questionType || 'single_choice', difficulty: question.difficulty || 'medium',
              options: question.options.length ? question.options : ['', ''],
              correctIndex: question.correctIndex ?? 0,
              explanation: question.explanation || '',
              marks: question.marks ?? 1,
              correctAnswer: question.correctAnswer ?? [], starterCode: question.starterCode || '', solutionCode: question.solutionCode || '',
              testCases: question.testCases?.length ? question.testCases : [{ input: '', expectedOutput: '', hidden: false, marks: 1 }],
            }))
          : [emptyQuestion()],
      )
    } catch (loadError) {
      setError(loadError?.message || 'Could not load the questionnaire.')
    } finally {
      setIsLoading(false)
    }
  }, [assessmentId, isNew])

  useEffect(() => {
    void load()
  }, [load])

  const updateQuestion = (index, patch) => {
    setQuestions((current) =>
      current.map((question, position) => (position === index ? { ...question, ...patch } : question)),
    )
  }

  const updateOption = (questionIndex, optionIndex, value) => {
    setQuestions((current) =>
      current.map((question, position) =>
        position === questionIndex
          ? {
              ...question,
              options: question.options.map((option, spot) =>
                spot === optionIndex ? value : option,
              ),
            }
          : question,
      ),
    )
  }

  const validate = () => {
    if (!form.title.trim()) return 'Give the questionnaire a title.'
    if (!form.subject.trim()) return 'Choose a subject.'
    if (form.targetMode === 'selected' && !form.targetUserIds.length) return 'Choose at least one trainee.'
    if (form.targetMode === 'classroom' && !form.classroomId) return 'Choose a classroom.'

    if (form.bankId) {
      const bank = banks.find((item) => Number(item.id) === Number(form.bankId))
      if (!bank) return 'Choose a valid question bank.'
      if (Number(form.drawCount) < 1) return 'Choose how many questions to draw.'
      if (Number(form.drawCount) > Number(bank.itemCount)) {
        return `This bank only contains ${bank.itemCount} questions.`
      }
      return ''
    }

    for (const [index, question] of questions.entries()) {
      if (!question.prompt.trim()) return `Question ${index + 1} needs a prompt.`
      if (['single_choice', 'multiple_choice', 'true_false', 'ordering', 'output_prediction'].includes(question.questionType)) {
        const filled = question.options.filter((option) => option.trim())
        if (filled.length < 2) return `Question ${index + 1} needs at least two options.`
      }
      if (['single_choice', 'true_false', 'output_prediction'].includes(question.questionType) && !question.options[question.correctIndex]?.trim()) {
        return `Question ${index + 1} needs its correct answer filled in.`
      }
      if (question.questionType === 'coding' && !question.testCases?.length) return `Coding question ${index + 1} needs a test case.`
    }

    return ''
  }

  const handleSave = async (publish) => {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }

    setIsSaving(true)
    setError('')

    const payload = {
      ...form,
      isPublished: publish ?? form.isPublished,
      opensAt: form.opensAt || null,
      deadline: form.deadline || null,
      resultsReleaseAt: form.resultsReleaseAt || null,
    }
    if (!isNew && !form.accessPassword) delete payload.accessPassword

    try {
      const id = isNew ? (await createAssessment(payload)).id : assessmentId
      if (!isNew) await updateAssessment(id, payload)

      // Options are trimmed so blank slots do not become real answers.
      if (!form.bankId) {
        await saveAssessmentQuestions(
          id,
          questions.map((question) => {
            const options = question.options
              .map((option, originalIndex) => ({ option: option.trim(), originalIndex }))
              .filter((entry) => entry.option)
            return {
              ...question,
              options: options.map((entry) => entry.option),
              correctIndex: options.findIndex((entry) => entry.originalIndex === question.correctIndex),
              correctAnswer: ['multiple_choice', 'ordering'].includes(question.questionType)
                ? (question.correctAnswer || []).map((value) => options.findIndex((entry) => entry.originalIndex === value)).filter((value) => value >= 0)
                : question.correctAnswer,
            }
          }),
        )
      }

      setNotice('Saved.')
      if (isNew) {
        navigate(`/trainer/assessments/${id}`, { replace: true })
      }
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the questionnaire.')
    } finally {
      setIsSaving(false)
    }
  }

  const fieldClass =
    'mt-1.5 w-full rounded-xl bg-surface-container border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none'
  const pill = 'rounded-full px-5 py-2.5 font-headline text-sm font-bold transition-opacity hover:opacity-90'

  if (isLoading) {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center pt-24">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24">
      <div className="mx-auto max-w-4xl space-y-6">
        <button
          className="inline-flex items-center gap-1 font-headline text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={() => navigate('/trainer')}
          type="button"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to workspace
        </button>

        <PageHeader
          accent="lavender"
          description="Set the subject, the deadline and the questions. Trainees only see published questionnaires."
          eyebrow="Questionnaire"
          icon="quiz"
          title={isNew ? 'New questionnaire' : form.title || 'Edit questionnaire'}
        />

        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-2xl bg-mint p-4">
            <p className="font-body text-sm text-on-mint">{notice}</p>
          </div>
        ) : null}

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-4">
          <h2 className="font-headline text-lg font-extrabold text-on-background">Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Title</span>
              <input
                className={fieldClass}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Module 2 knowledge check"
                value={form.title}
              />
            </label>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Subject</span>
              <input
                className={fieldClass}
                list="assessment-subjects"
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Data"
                value={form.subject}
              />
              <datalist id="assessment-subjects">
                {subjects.map((subject) => (
                  <option key={subject} value={subject} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="block">
            <span className="font-headline text-xs font-bold text-on-surface-variant">
              Description
            </span>
            <textarea
              className={fieldClass}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              value={form.description}
            />
          </label>

          <label className="block">
            <span className="font-headline text-xs font-bold text-on-surface-variant">Instructions shown before starting</span>
            <textarea className={fieldClass} onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))} rows={3} value={form.instructions} />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label><span className="font-headline text-xs font-bold text-on-surface-variant">Assessment type</span><select className={fieldClass} onChange={(e) => { const kind=e.target.value; setForm((f) => ({ ...f, kind })); if(kind==='coding')setQuestions((current)=>current.map((question)=>question.questionType==='coding'?question:{...emptyQuestion('coding'),prompt:question.prompt,explanation:question.explanation,difficulty:question.difficulty})) }} value={form.kind}><option value="quiz">Quiz</option><option value="coding">Coding</option><option value="combined">Combined</option></select></label>
            <label><span className="font-headline text-xs font-bold text-on-surface-variant">Difficulty</span><select className={fieldClass} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))} value={form.difficulty}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
            <label><span className="font-headline text-xs font-bold text-on-surface-variant">Creation method</span><select className={fieldClass} onChange={(e) => setForm((f) => ({ ...f, creationMethod: e.target.value }))} value={form.creationMethod}><option value="manual">Manual</option><option value="ai_edit">AI + edit</option></select></label>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">
                Pass mark %
              </span>
              <input
                className={fieldClass}
                max="100"
                min="0"
                onChange={(e) => setForm((f) => ({ ...f, passPercentage: Number(e.target.value) }))}
                type="number"
                value={form.passPercentage}
              />
            </label>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">
                Duration (min)
              </span>
              <input
                className={fieldClass}
                min="0"
                onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}
                type="number"
                value={form.durationMinutes}
              />
            </label>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">
                Max attempts
              </span>
              <input
                className={fieldClass}
                min="0"
                onChange={(e) => setForm((f) => ({ ...f, maxAttempts: Number(e.target.value) }))}
                placeholder="0 = unlimited"
                type="number"
                value={form.maxAttempts}
              />
            </label>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Opens</span>
              <input
                className={fieldClass}
                onChange={(e) => setForm((f) => ({ ...f, opensAt: e.target.value }))}
                type="datetime-local"
                value={form.opensAt}
              />
            </label>
          </div>

          <label className="block max-w-xs">
            <span className="font-headline text-xs font-bold text-on-surface-variant">Deadline</span>
            <input
              className={fieldClass}
              onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
              type="datetime-local"
              value={form.deadline}
            />
          </label>
        </section>

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-4">
          <div><h2 className="font-headline text-lg font-extrabold">Access, grading and release</h2><p className="mt-1 text-xs text-on-surface-variant">Control attempts, late work, passwords, result visibility and assessment integrity.</p></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label><span className="font-headline text-xs font-bold text-on-surface-variant">Access password</span><input className={fieldClass} onChange={(e)=>setForm((f)=>({...f,accessPassword:e.target.value}))} placeholder={isNew?'Optional':'Leave blank to keep current'} type="password" value={form.accessPassword}/></label>
            <label><span className="font-headline text-xs font-bold text-on-surface-variant">Attempt grade</span><select className={fieldClass} onChange={(e)=>setForm((f)=>({...f,gradeMethod:e.target.value}))} value={form.gradeMethod}><option value="highest">Highest score</option><option value="latest">Latest attempt</option><option value="average">Average score</option></select></label>
            <label><span className="font-headline text-xs font-bold text-on-surface-variant">Negative marks / wrong answer</span><input className={fieldClass} min="0" onChange={(e)=>setForm((f)=>({...f,negativeMark:Number(e.target.value)}))} step="0.25" type="number" value={form.negativeMark}/></label>
            <label><span className="font-headline text-xs font-bold text-on-surface-variant">Assign to</span><select className={fieldClass} onChange={(e)=>setForm((f)=>({...f,targetMode:e.target.value}))} value={form.targetMode}><option value="all">All trainees</option><option value="selected">Selected trainees</option><option value="classroom">Classroom members</option></select></label>
            <label><span className="font-headline text-xs font-bold text-on-surface-variant">Release results</span><select className={fieldClass} onChange={(e)=>setForm((f)=>({...f,resultsMode:e.target.value}))} value={form.resultsMode}><option value="immediate">Immediately</option><option value="scheduled">Scheduled</option><option value="manual">Manually</option></select></label>
            {form.resultsMode==='scheduled'?<label><span className="font-headline text-xs font-bold text-on-surface-variant">Release date</span><input className={fieldClass} onChange={(e)=>setForm((f)=>({...f,resultsReleaseAt:e.target.value}))} type="datetime-local" value={form.resultsReleaseAt}/></label>:null}
          </div>
          {form.targetMode === 'selected' ? <div className="max-h-52 overflow-y-auto rounded-2xl bg-surface-container p-3"><p className="mb-2 font-headline text-xs font-bold">Choose trainees</p>{targetUsers.map((user)=><label className="flex items-center gap-3 border-b border-outline-variant px-2 py-2 text-sm last:border-0" key={user.id}><input checked={form.targetUserIds.includes(Number(user.id))} onChange={(e)=>setForm((current)=>({...current,targetUserIds:e.target.checked?[...current.targetUserIds,Number(user.id)]:current.targetUserIds.filter((id)=>id!==Number(user.id))}))} type="checkbox"/><span>{[user.first_name,user.last_name].filter(Boolean).join(' ')||user.username} <small className="text-on-surface-variant">{user.email}</small></span></label>)}</div> : null}
          {form.targetMode === 'classroom' ? <label className="block max-w-sm"><span className="font-headline text-xs font-bold text-on-surface-variant">Classroom</span><select className={fieldClass} onChange={(e)=>setForm((f)=>({...f,classroomId:e.target.value}))} value={form.classroomId}><option value="">Choose a classroom</option>{classrooms.map((room)=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label> : null}
          <div className="flex flex-wrap gap-5 text-sm">{[['allowLateSubmission','Allow late submissions'],['autoSubmit','Auto-submit when time ends'],['showCorrectAnswers','Show correct answers'],['showExplanations','Show explanations'],['discussionEnabled','Enable result discussion']].map(([key,label])=><label className="flex items-center gap-2" key={key}><input checked={Boolean(form[key])} onChange={(e)=>setForm((f)=>({...f,[key]:e.target.checked}))} type="checkbox"/>{label}</label>)}</div>
        </section>

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-4">
          <div>
            <h2 className="font-headline text-lg font-extrabold text-on-background">Question source and randomisation</h2>
            <p className="mt-1 font-body text-xs text-on-surface-variant">Use questions written below, or draw a different paper from a reusable bank on every attempt.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Question bank</span>
              <select className={fieldClass} onChange={(event) => setForm((current) => ({ ...current, bankId: event.target.value, drawCount: event.target.value ? current.drawCount || 1 : 0 }))} value={form.bankId}>
                <option value="">Use questions in this assessment</option>
                {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.title} ({bank.itemCount})</option>)}
              </select>
            </label>
            {form.bankId ? (
              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">Questions per attempt</span>
                <input className={fieldClass} max={banks.find((bank) => Number(bank.id) === Number(form.bankId))?.itemCount || undefined} min="1" onChange={(event) => setForm((current) => ({ ...current, drawCount: Number(event.target.value) }))} type="number" value={form.drawCount} />
              </label>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-3"><input checked={form.shuffleQuestions} className="h-4 w-4 rounded" onChange={(event) => setForm((current) => ({ ...current, shuffleQuestions: event.target.checked }))} type="checkbox" /><span className="font-body text-sm text-on-surface">Shuffle question order</span></label>
            <label className="flex items-center gap-3"><input checked={form.shuffleOptions} className="h-4 w-4 rounded" onChange={(event) => setForm((current) => ({ ...current, shuffleOptions: event.target.checked }))} type="checkbox" /><span className="font-body text-sm text-on-surface">Shuffle answer options</span></label>
          </div>
        </section>

        {!form.bankId ? <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-headline text-lg font-extrabold text-on-background">
              Questions ({questions.length})
            </h2>
            <button
              className={`${pill} bg-surface-container-high text-on-surface`}
              onClick={() => setQuestions((current) => [...current, emptyQuestion(form.kind)])}
              type="button"
            >
              Add question
            </button>
            <button className={`${pill} bg-lavender text-on-lavender`} onClick={async()=>{if(!form.subject){setError('Choose a subject before using AI.');return}setIsSaving(true);setError('');try{const output=await generateAssessmentQuestions({subject:form.subject,topic:form.title,difficulty:form.difficulty,kind:form.kind,count:5});setQuestions(output.questions.map((question)=>({...emptyQuestion(form.kind),...question,questionType:form.kind==='coding'?'coding':question.questionType,options:form.kind==='coding'?[]:question.options?.length?question.options:['','']})));setForm((current)=>({...current,creationMethod:'ai_edit'}));setNotice(output.generatedBy==='ai'?'AI draft generated. Review every answer before publishing.':'Draft templates generated because no AI provider was available.')}catch(e){setError(e.message)}finally{setIsSaving(false)}}} type="button">Generate with AI</button>
          </div>

          {questions.map((question, index) => (
            <article className="rounded-2xl bg-surface-container p-5 space-y-4" key={index}>
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-primary-container text-on-primary-container px-3 py-1 font-headline text-xs font-bold shrink-0">
                  Q{index + 1}
                </span>
                {questions.length > 1 ? (
                  <button
                    aria-label="Remove question"
                    className="text-on-surface-variant hover:text-error transition-colors"
                    onClick={() =>
                      setQuestions((current) => current.filter((_, position) => position !== index))
                    }
                    type="button"
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label><span className="font-headline text-xs font-bold text-on-surface-variant">Question type</span><select className={fieldClass} disabled={form.kind==='coding'} onChange={(e)=>updateQuestion(index,{questionType:e.target.value,options:e.target.value==='true_false'?['True','False']:question.options})} value={question.questionType}>{form.kind!=='coding'?<><option value="single_choice">Single choice</option><option value="multiple_choice">Multiple choice</option><option value="true_false">True / false</option><option value="fill_blank">Fill in blank</option><option value="short_answer">Short answer</option><option value="long_answer">Long answer</option><option value="scenario">Scenario / reasoning</option><option value="output_prediction">Output prediction</option><option value="ordering">Ordering</option><option value="bug_finding">Bug finding</option><option value="code_analysis">Code analysis</option><option value="security_scenario">Security scenario</option></>:null}<option value="coding">Coding problem</option></select></label>
                <label><span className="font-headline text-xs font-bold text-on-surface-variant">Difficulty</span><select className={fieldClass} onChange={(e)=>updateQuestion(index,{difficulty:e.target.value})} value={question.difficulty}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
              </div>

              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">
                  Question
                </span>
                <textarea
                  className={fieldClass}
                  onChange={(e) => updateQuestion(index, { prompt: e.target.value })}
                  rows={2}
                  value={question.prompt}
                />
              </label>

              {['single_choice','multiple_choice','true_false','output_prediction','ordering'].includes(question.questionType) ? <div className="space-y-2">
                <span className="font-headline text-xs font-bold text-on-surface-variant">
                  Options — select the correct one
                </span>
                {question.options.map((option, optionIndex) => (
                  <div className="flex items-center gap-3" key={optionIndex}>
                    {['single_choice','true_false','output_prediction'].includes(question.questionType) ? <input
                      aria-label={`Mark option ${optionIndex + 1} correct`}
                      checked={question.correctIndex === optionIndex}
                      className="h-4 w-4 shrink-0 accent-current text-primary"
                      name={`correct-${index}`}
                      onChange={() => updateQuestion(index, { correctIndex: optionIndex })}
                      type="radio"
                    /> : null}
                    {question.questionType === 'multiple_choice' ? <input
                      aria-label={`Mark option ${optionIndex + 1} correct`}
                      checked={(question.correctAnswer || []).includes(optionIndex)}
                      onChange={() => updateQuestion(index, { correctAnswer: (question.correctAnswer || []).includes(optionIndex) ? question.correctAnswer.filter((value) => value !== optionIndex) : [...(question.correctAnswer || []), optionIndex] })}
                      type="checkbox"
                    /> : null}
                    <input
                      className="flex-1 rounded-xl bg-surface-container-lowest border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none"
                      onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                      placeholder={`Option ${optionIndex + 1}`}
                      value={option}
                    />
                    {question.options.length > 2 ? (
                      <button
                        aria-label="Remove option"
                        className="text-on-surface-variant hover:text-error transition-colors shrink-0"
                        onClick={() =>
                          updateQuestion(index, {
                            options: question.options.filter((_, spot) => spot !== optionIndex),
                            correctIndex:
                              question.correctIndex >= optionIndex && question.correctIndex > 0
                                ? question.correctIndex - 1
                                : question.correctIndex,
                          })
                        }
                        type="button"
                      >
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  className="font-headline text-xs font-bold text-primary hover:opacity-80"
                  onClick={() =>
                    updateQuestion(index, { options: [...question.options, ''] })
                  }
                  type="button"
                >
                  + Add option
                </button>
              </div> : null}

              {question.questionType === 'ordering' ? <label className="block"><span className="font-headline text-xs font-bold text-on-surface-variant">Correct order (option letters, comma separated)</span><input className={fieldClass} onChange={(e)=>updateQuestion(index,{correctAnswer:e.target.value.split(',').map((v)=>Number(v.trim().toUpperCase().charCodeAt(0)-65)).filter((v)=>v>=0)})} placeholder="B, A, C" value={(question.correctAnswer||[]).map((v)=>String.fromCharCode(65+Number(v))).join(', ')}/></label> : null}

              {['fill_blank','short_answer'].includes(question.questionType)?<label className="block"><span className="font-headline text-xs font-bold text-on-surface-variant">Accepted answers (one per line; optional for manual short-answer grading)</span><textarea className={fieldClass} onChange={(e)=>updateQuestion(index,{correctAnswer:e.target.value.split('\n').filter(Boolean)})} rows={3} value={(question.correctAnswer||[]).join('\n')}/></label>:null}

              {question.questionType==='coding'?<div className="space-y-4"><label className="block"><span className="font-headline text-xs font-bold text-on-surface-variant">Starter code</span><textarea className={`${fieldClass} font-mono`} onChange={(e)=>updateQuestion(index,{starterCode:e.target.value})} rows={7} value={question.starterCode}/></label><div><div className="flex justify-between"><span className="font-headline text-xs font-bold">Visible and hidden test cases</span><button className="text-xs font-bold text-primary" onClick={()=>updateQuestion(index,{testCases:[...(question.testCases||[]),{input:'',expectedOutput:'',hidden:true,marks:1}]})} type="button">+ Test case</button></div>{(question.testCases||[]).map((test,testIndex)=><div className="mt-2 grid grid-cols-[1fr_1fr_auto_auto] gap-2" key={testIndex}><input className={fieldClass} onChange={(e)=>updateQuestion(index,{testCases:question.testCases.map((t,j)=>j===testIndex?{...t,input:e.target.value}:t)})} placeholder="Input (JSON supported)" value={test.input}/><input className={fieldClass} onChange={(e)=>updateQuestion(index,{testCases:question.testCases.map((t,j)=>j===testIndex?{...t,expectedOutput:e.target.value}:t)})} placeholder="Expected output" value={test.expectedOutput}/><label className="flex items-center gap-1 text-xs"><input checked={test.hidden} onChange={(e)=>updateQuestion(index,{testCases:question.testCases.map((t,j)=>j===testIndex?{...t,hidden:e.target.checked}:t)})} type="checkbox"/>Hidden</label><button onClick={()=>updateQuestion(index,{testCases:question.testCases.filter((_,j)=>j!==testIndex)})} type="button">×</button></div>)}</div></div>:null}

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <label className="block sm:col-span-3">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    Explanation (shown after submission)
                  </span>
                  <input
                    className={fieldClass}
                    onChange={(e) => updateQuestion(index, { explanation: e.target.value })}
                    value={question.explanation}
                  />
                </label>
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    Marks
                  </span>
                  <input
                    className={fieldClass}
                    min="1"
                    onChange={(e) => updateQuestion(index, { marks: Number(e.target.value) })}
                    type="number"
                    value={question.marks}
                  />
                </label>
              </div>
            </article>
          ))}
        </section> : (
          <section className="rounded-3xl bg-mint p-6 text-on-mint">
            <h2 className="font-headline text-lg font-extrabold">Bank-powered assessment</h2>
            <p className="mt-1 font-body text-sm">Each attempt draws {form.drawCount} question(s) from the selected bank. Edit the reusable questions from Question banks.</p>
            <button className={`${pill} mt-4 bg-surface-container-lowest text-on-surface`} onClick={() => navigate('/trainer/question-banks')} type="button">Manage question banks</button>
          </section>
        )}

        <div className="flex flex-wrap gap-3 pb-8">
          <button
            className={`${pill} bg-surface-container-high text-on-surface disabled:opacity-60`}
            disabled={isSaving}
            onClick={() => handleSave(false)}
            type="button"
          >
            {isSaving ? 'Saving…' : 'Save as draft'}
          </button>
          <button
            className={`${pill} bg-primary text-on-primary disabled:opacity-60`}
            disabled={isSaving}
            onClick={() => handleSave(true)}
            type="button"
          >
            {isSaving ? 'Saving…' : 'Save & publish'}
          </button>
        </div>
      </div>
    </main>
  )
}

export default AssessmentEditorPage
