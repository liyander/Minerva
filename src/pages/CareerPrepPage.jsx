import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../services/api'

const initialCustomRole = {
  roleTitle: '',
  company: '',
  jobDescription: '',
  requirements: '',
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function scoreColor(score) {
  if (score >= 75) return 'text-secondary'
  if (score >= 50) return 'text-amber-500'
  return 'text-primary'
}

function CareerPrepPage() {
  const [jobs, setJobs] = useState([])
  const [sessions, setSessions] = useState([])
  const [session, setSession] = useState(null)
  const [sourceType, setSourceType] = useState('recommended')
  const [recommendationId, setRecommendationId] = useState('')
  const [questionCount, setQuestionCount] = useState(5)
  const [customRole, setCustomRole] = useState(initialCustomRole)
  const [activeIndex, setActiveIndex] = useState(0)
  const [draftAnswers, setDraftAnswers] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [error, setError] = useState('')

  const loadLandingData = async () => {
    setIsLoading(true)
    setError('')
    try {
      const [jobResponse, sessionResponse] = await Promise.all([
        apiFetch('/interviews/options'),
        apiFetch('/interviews/sessions'),
      ])
      const availableJobs = Array.isArray(jobResponse) ? jobResponse : []
      setJobs(availableJobs)
      setSessions(Array.isArray(sessionResponse) ? sessionResponse : [])
      setRecommendationId((current) => current || String(availableJobs[0]?.recommendationId || ''))
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load Interview Point.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadLandingData()
  }, [])

  const activeQuestion = session?.questions?.[activeIndex] || null
  const progress = session?.questionCount
    ? Math.round((Number(session.answeredCount || 0) / session.questionCount) * 100)
    : 0

  const sessionSummary = useMemo(() => {
    if (!session?.questions?.length) return null
    const answered = session.questions.filter((question) => question.answered)
    return {
      strong: answered.filter((question) => question.score >= 75).length,
      developing: answered.filter((question) => question.score >= 50 && question.score < 75).length,
      needsWork: answered.filter((question) => question.score < 50).length,
    }
  }, [session])

  const startSession = async () => {
    setIsGenerating(true)
    setError('')
    try {
      const payload = sourceType === 'custom'
        ? { sourceType, questionCount, ...customRole }
        : { sourceType, questionCount, recommendationId: Number(recommendationId) }
      const response = await apiFetch('/interviews/sessions', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSession(response)
      setActiveIndex(0)
      setDraftAnswers({})
      setSessions((current) => [{
        id: response.id,
        roleTitle: response.roleTitle,
        company: response.company,
        sourceType: response.sourceType,
        status: response.status,
        questionCount: response.questionCount,
        answeredCount: response.answeredCount,
        averageScore: response.averageScore,
        createdAt: response.createdAt,
      }, ...current])
    } catch (generationError) {
      setError(generationError?.message || 'Unable to prepare interview questions.')
    } finally {
      setIsGenerating(false)
    }
  }

  const openSession = async (sessionId) => {
    setIsLoading(true)
    setError('')
    try {
      const response = await apiFetch(`/interviews/sessions/${sessionId}`)
      setSession(response)
      const firstUnanswered = response.questions?.findIndex((question) => !question.answered)
      setActiveIndex(firstUnanswered >= 0 ? firstUnanswered : 0)
      setDraftAnswers(Object.fromEntries(
        (response.questions || []).map((question) => [question.id, question.answer || '']),
      ))
    } catch (loadError) {
      setError(loadError?.message || 'Unable to resume this interview.')
    } finally {
      setIsLoading(false)
    }
  }

  const submitAnswer = async () => {
    if (!activeQuestion || activeQuestion.answered) return
    const answer = String(draftAnswers[activeQuestion.id] || '').trim()
    setIsEvaluating(true)
    setError('')
    try {
      const response = await apiFetch(
        `/interviews/sessions/${session.id}/questions/${activeQuestion.id}/answer`,
        {
          method: 'POST',
          body: JSON.stringify({ answer }),
        },
      )
      setSession(response)
      setSessions((current) => current.map((item) => item.id === response.id ? {
        ...item,
        status: response.status,
        answeredCount: response.answeredCount,
        averageScore: response.averageScore,
      } : item))
    } catch (evaluationError) {
      setError(evaluationError?.message || 'Unable to evaluate this answer.')
    } finally {
      setIsEvaluating(false)
    }
  }

  const closeSession = () => {
    setSession(null)
    setActiveIndex(0)
    setDraftAnswers({})
    void loadLandingData()
  }

  return (
    <main className="min-h-screen bg-surface px-4 pb-20 pt-24 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="rounded-3xl bg-mint px-6 py-7 md:px-9 md:py-9">
          <p className="font-headline text-xs font-bold text-on-mint opacity-70">
            Interview practice
          </p>
          <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-headline text-3xl md:text-4xl font-extrabold text-on-mint">Career prep</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-on-mint opacity-80">
                Practice against a recommended job or bring your own role description. Every answer receives a score, a model response, and focused coaching before you move forward.
              </p>
            </div>
            {session ? (
              <button
                className="rounded-full inline-flex items-center justify-center gap-2 bg-surface-container-lowest px-5 py-3 font-headline text-sm font-bold text-on-mint hover:opacity-90 transition-opacity"
                onClick={closeSession}
                type="button"
              >
                <span className="material-symbols-outlined text-base">add</span>
                New Interview
              </button>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl shadow-soft bg-error/10 px-5 py-4 text-sm text-error" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-xl flex min-h-80 items-center justify-center bg-surface-container-lowest">
            <div className="text-center">
              <span className="material-symbols-outlined animate-spin text-4xl text-secondary">progress_activity</span>
              <p className="mt-3 font-headline text-xs font-bold text-on-surface-variant">Loading interview workspace</p>
            </div>
          </div>
        ) : session ? (
          <section className="grid min-w-0 gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="rounded-2xl min-w-0 bg-surface-container-lowest p-5 xl:sticky xl:top-24 xl:self-start">
              <p className="font-headline text-xs font-bold text-secondary">Question Map</p>
              <h2 className="mt-2 break-words font-headline text-xl font-extrabold">{session.roleTitle}</h2>
              <p className="mt-1 text-sm text-on-surface-variant">{session.company || 'Custom role'}</p>
              <div className="rounded-xl mt-5 h-2 bg-surface-container-highest">
                <div className="h-full bg-secondary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-2 flex justify-between font-headline text-xs text-on-surface-variant">
                <span>{session.answeredCount}/{session.questionCount} answered</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-5 grid grid-cols-5 gap-2">
                {session.questions.map((question, index) => (
                  <button
                    aria-label={`Open question ${index + 1}`}
                    className={`aspect-square min-w-0 border font-headline text-xs font-bold transition-colors ${
                      index === activeIndex
                        ? 'border-primary bg-primary text-on-primary'
                        : question.answered
                          ? 'border-secondary bg-secondary/15 text-secondary'
                          : 'border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-primary'
                    }`}
                    key={question.id}
                    onClick={() => setActiveIndex(index)}
                    type="button"
                  >
                    {question.answered ? <span className="material-symbols-outlined text-sm">check</span> : index + 1}
                  </button>
                ))}
              </div>
              <div className="mt-6 border-t border-outline-variant pt-5">
                <div className="flex items-center justify-between text-xs text-on-surface-variant">
                  <span>Average score</span>
                  <strong className={`font-headline text-xl ${scoreColor(session.averageScore || 0)}`}>
                    {session.averageScore === null ? '--' : `${session.averageScore}%`}
                  </strong>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-on-surface-variant">
                  <span>Web-sourced prompts</span>
                  <strong className="font-headline text-base text-secondary">{session.sourcedQuestionCount}</strong>
                </div>
              </div>
            </aside>

            <div className="min-w-0 space-y-5">
              {session.status === 'completed' && sessionSummary ? (
                <div className="rounded-2xl shadow-soft bg-surface-container-lowest p-6">
                  <p className="font-headline text-xs font-bold text-secondary">Session Complete</p>
                  <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
                    <p className={`font-headline text-4xl font-extrabold ${scoreColor(session.averageScore)}`}>{session.averageScore}%</p>
                    <p className="text-sm text-on-surface-variant">
                      {sessionSummary.strong} strong · {sessionSummary.developing} developing · {sessionSummary.needsWork} needs work
                    </p>
                  </div>
                </div>
              ) : null}

              {activeQuestion ? (
                <article className="min-w-0 border border-outline-variant bg-surface-container-lowest">
                  <div className="rounded-2xl border-b border-outline-variant px-5 py-5 md:px-7">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-surface-container-high px-3 py-1 font-headline text-xs font-bold text-on-surface-variant">
                        Question {activeIndex + 1} of {session.questionCount}
                      </span>
                      <span className="rounded-lg bg-secondary/10 px-3 py-1 font-headline text-sm font-bold text-secondary">
                        {activeQuestion.competency || 'Role readiness'}
                      </span>
                      {activeQuestion.questionType === 'company_past' ? (
                        <span className="rounded-lg bg-primary/10 px-3 py-1 font-headline text-sm font-bold text-primary">Sourced interview pattern</span>
                      ) : null}
                    </div>
                    <h2 className="mt-5 break-words font-headline text-2xl font-extrabold leading-snug md:text-3xl">
                      {activeQuestion.prompt}
                    </h2>
                    {activeQuestion.source ? (
                      <div className="rounded-xl mt-5 border-l-2 border-secondary bg-surface-container-low px-4 py-3">
                        <p className="font-headline text-xs font-bold text-secondary">Public source</p>
                        <a
                          className="mt-1 block break-words text-sm font-semibold text-on-surface hover:text-secondary"
                          href={activeQuestion.source.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {activeQuestion.source.title}
                          <span className="material-symbols-outlined ml-1 align-middle text-sm">open_in_new</span>
                        </a>
                        <p className="mt-1 text-xs leading-5 text-on-surface-variant">{activeQuestion.source.snippet}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="px-5 py-5 md:px-7 md:py-7">
                    <label className="font-headline text-xs font-bold text-on-surface-variant" htmlFor={`answer-${activeQuestion.id}`}>
                      Your answer
                    </label>
                    <textarea
                      className="rounded-2xl mt-3 min-h-52 w-full resize-y border border-outline-variant  bg-surface-container-highest px-4 py-4 text-sm leading-7 text-on-surface outline-none focus:border-primary disabled:opacity-80"
                      disabled={activeQuestion.answered}
                      id={`answer-${activeQuestion.id}`}
                      onChange={(event) => setDraftAnswers((current) => ({ ...current, [activeQuestion.id]: event.target.value }))}
                      placeholder="Structure your answer, explain your reasoning, and include a concrete example..."
                      value={draftAnswers[activeQuestion.id] ?? activeQuestion.answer ?? ''}
                    />
                    {!activeQuestion.answered ? (
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-on-surface-variant">The answer is locked after evaluation.</p>
                        <button
                          className="rounded-xl inline-flex min-h-12 items-center justify-center gap-2 bg-primary px-6 font-headline text-xs font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isEvaluating || String(draftAnswers[activeQuestion.id] || '').trim().length < 10}
                          onClick={submitAnswer}
                          type="button"
                        >
                          {isEvaluating ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <span className="material-symbols-outlined text-base">psychology</span>}
                          {isEvaluating ? 'AI is reviewing' : 'Submit for review'}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {activeQuestion.answered ? (
                    <div className="rounded-2xl border-t border-outline-variant bg-surface-container-low px-5 py-6 md:px-7">
                      <div className="flex flex-wrap items-center gap-4">
                        <span className={`font-headline text-4xl font-extrabold ${scoreColor(activeQuestion.score)}`}>{activeQuestion.score}%</span>
                        <div>
                          <p className="font-headline text-sm font-extrabold">{activeQuestion.verdict}</p>
                          <p className="text-xs text-on-surface-variant">AI answer analysis</p>
                        </div>
                      </div>
                      <p className="mt-5 text-sm leading-7 text-on-surface">{activeQuestion.feedback}</p>
                      <div className="mt-6 grid gap-5 lg:grid-cols-2">
                        <section className="border-l-2 border-secondary pl-4">
                          <h3 className="font-headline text-xs font-bold text-secondary">What worked</h3>
                          <ul className="mt-3 space-y-2 text-sm leading-6 text-on-surface-variant">
                            {(activeQuestion.strengths.length ? activeQuestion.strengths : ['Your submitted response was evaluated against the role rubric.']).map((item) => <li key={item}>• {item}</li>)}
                          </ul>
                        </section>
                        <section className="border-l-2 border-primary pl-4">
                          <h3 className="font-headline text-xs font-bold text-primary">Improve next</h3>
                          <ul className="mt-3 space-y-2 text-sm leading-6 text-on-surface-variant">
                            {activeQuestion.improvements.map((item) => <li key={item}>• {item}</li>)}
                          </ul>
                        </section>
                      </div>
                      <section className="mt-6 border-t border-outline-variant pt-5">
                        <h3 className="font-headline text-xs font-bold text-secondary">Model answer</h3>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-on-surface">{activeQuestion.correctAnswer}</p>
                      </section>
                    </div>
                  ) : null}
                </article>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <button
                  className="rounded-xl inline-flex h-11 w-11 items-center justify-center border border-outline-variant bg-surface-container-lowest disabled:opacity-30"
                  disabled={activeIndex === 0}
                  onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
                  title="Previous question"
                  type="button"
                >
                  <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <button
                  className="rounded-xl inline-flex h-11 w-11 items-center justify-center border border-outline-variant bg-surface-container-lowest disabled:opacity-30"
                  disabled={activeIndex >= session.questions.length - 1}
                  onClick={() => setActiveIndex((index) => Math.min(session.questions.length - 1, index + 1))}
                  title="Next question"
                  type="button"
                >
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="rounded-2xl min-w-0 bg-surface-container-lowest p-6 md:p-8">
              <div className="flex flex-wrap gap-2 border-b border-outline-variant pb-6">
                <button
                  className={`px-5 py-3 font-headline text-xs font-bold ${sourceType === 'recommended' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}
                  onClick={() => setSourceType('recommended')}
                  type="button"
                >
                  Recommended job
                </button>
                <button
                  className={`px-5 py-3 font-headline text-xs font-bold ${sourceType === 'custom' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}
                  onClick={() => setSourceType('custom')}
                  type="button"
                >
                  Custom role
                </button>
              </div>

              {sourceType === 'recommended' ? (
                <div className="mt-6">
                  <label className="font-headline text-xs font-bold text-on-surface-variant" htmlFor="recommended-job">Recommended job</label>
                  {jobs.length ? (
                    <select
                      className="rounded-xl mt-3 min-h-14 w-full border border-outline-variant  bg-surface-container-highest px-4 text-sm outline-none focus:border-secondary"
                      id="recommended-job"
                      onChange={(event) => setRecommendationId(event.target.value)}
                      value={recommendationId}
                    >
                      {jobs.map((job) => (
                        <option key={job.recommendationId} value={job.recommendationId}>
                          {job.title} · {job.company} · {job.matchScore}% match
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="rounded-2xl mt-3 bg-surface-container-high px-5 py-5 text-sm text-on-surface-variant">
                      No recommended jobs are available yet. Add career evidence in Settings or use a custom role.
                    </div>
                  )}
                  {jobs.find((job) => String(job.recommendationId) === recommendationId) ? (
                    <div className="mt-5 border-l-2 border-secondary pl-4">
                      <p className="font-headline text-lg font-extrabold">{jobs.find((job) => String(job.recommendationId) === recommendationId)?.title}</p>
                      <p className="mt-1 text-sm text-on-surface-variant">{jobs.find((job) => String(job.recommendationId) === recommendationId)?.company}</p>
                      <p className="mt-3 line-clamp-4 text-sm leading-6 text-on-surface-variant">{jobs.find((job) => String(job.recommendationId) === recommendationId)?.description}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="font-headline text-xs font-bold text-on-surface-variant">Role title</span>
                    <input className="rounded-xl mt-2 min-h-13 w-full border border-outline-variant  bg-surface-container-highest px-4 outline-none focus:border-primary" onChange={(event) => setCustomRole((current) => ({ ...current, roleTitle: event.target.value }))} placeholder="SOC Analyst" value={customRole.roleTitle} />
                  </label>
                  <label className="block">
                    <span className="font-headline text-xs font-bold text-on-surface-variant">Company (optional)</span>
                    <input className="rounded-xl mt-2 min-h-13 w-full border border-outline-variant  bg-surface-container-highest px-4 outline-none focus:border-secondary" onChange={(event) => setCustomRole((current) => ({ ...current, company: event.target.value }))} placeholder="Company name" value={customRole.company} />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="font-headline text-xs font-bold text-on-surface-variant">Job description</span>
                    <textarea className="rounded-xl mt-2 min-h-40 w-full resize-y border border-outline-variant  bg-surface-container-highest px-4 py-3 outline-none focus:border-primary" onChange={(event) => setCustomRole((current) => ({ ...current, jobDescription: event.target.value }))} placeholder="Paste the role description and responsibilities..." value={customRole.jobDescription} />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="font-headline text-xs font-bold text-on-surface-variant">Requirements</span>
                    <textarea className="rounded-xl mt-2 min-h-32 w-full resize-y border border-outline-variant  bg-surface-container-highest px-4 py-3 outline-none focus:border-secondary" onChange={(event) => setCustomRole((current) => ({ ...current, requirements: event.target.value }))} placeholder="Skills, tools, experience, and qualifications..." value={customRole.requirements} />
                  </label>
                </div>
              )}

              <div className="mt-7 border-t border-outline-variant pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <label className="block sm:w-64">
                    <span className="font-headline text-xs font-bold text-on-surface-variant">Number of questions</span>
                    <div className="mt-2 flex items-center gap-3">
                      <input className="h-2 min-w-0 flex-1 accent-primary" max="25" min="1" onChange={(event) => setQuestionCount(Number(event.target.value))} type="range" value={questionCount} />
                      <output className="rounded-xl flex h-12 w-14 shrink-0 items-center justify-center bg-surface-container-high font-headline text-xl font-extrabold text-primary">{questionCount}</output>
                    </div>
                  </label>
                  <button
                    className="rounded-xl inline-flex min-h-13 items-center justify-center gap-2 bg-primary px-7 font-headline text-xs font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isGenerating || (sourceType === 'recommended' ? !recommendationId : customRole.roleTitle.trim().length < 2 || customRole.jobDescription.trim().length < 30)}
                    onClick={startSession}
                    type="button"
                  >
                    <span className={`material-symbols-outlined text-base ${isGenerating ? 'animate-spin' : ''}`}>{isGenerating ? 'progress_activity' : 'auto_awesome'}</span>
                    {isGenerating ? 'Researching and preparing' : 'Generate interview'}
                  </button>
                </div>
              </div>
            </div>

            <aside className="rounded-2xl bg-surface-container-lowest p-5 md:p-6">
              <p className="font-headline text-xs font-bold text-secondary">Recent Sessions</p>
              <div className="mt-4 space-y-3">
                {sessions.length ? sessions.map((item) => (
                  <button
                    className="rounded-2xl w-full border-l-2 border-outline-variant bg-surface-container-low px-4 py-4 text-left transition-colors hover:border-secondary hover:bg-surface-container-high"
                    key={item.id}
                    onClick={() => openSession(item.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words font-headline text-sm font-extrabold">{item.roleTitle}</p>
                      <span className={`shrink-0 font-headline text-xs font-bold ${item.status === 'completed' ? 'text-secondary' : 'text-primary'}`}>{item.status}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-on-surface-variant">{item.company || 'Custom role'}</p>
                    <div className="mt-3 flex justify-between text-xs text-on-surface-variant">
                      <span>{item.answeredCount}/{item.questionCount} answered</span>
                      <span>{item.averageScore === null ? formatDate(item.createdAt) : `${item.averageScore}% avg`}</span>
                    </div>
                  </button>
                )) : (
                  <p className="rounded-2xl bg-surface-container-high px-4 py-5 text-sm leading-6 text-on-surface-variant">Your completed and active interview sessions will appear here.</p>
                )}
              </div>
            </aside>
          </section>
        )}
      </div>

      {(isGenerating || isEvaluating) ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm" role="status">
          <div className="rounded-2xl w-full max-w-md shadow-soft bg-surface-container-lowest p-8 text-center shadow-2xl">
            <span className="material-symbols-outlined animate-spin text-5xl text-secondary">progress_activity</span>
            <h2 className="mt-5 font-headline text-2xl font-extrabold">{isGenerating ? 'Preparing your interview' : 'Reviewing your answer'}</h2>
            <p className="mt-3 text-sm leading-6 text-on-surface-variant">
              {isGenerating ? 'The AI is reading the role, checking available public interview sources, and creating a fresh question set.' : 'The AI is comparing your reasoning with the job requirements and preparing specific coaching.'}
            </p>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default CareerPrepPage
