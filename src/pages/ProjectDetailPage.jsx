import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  answerLabQuizQuestion,
  fetchLabCodeChallenge,
  fetchLabProject,
  startLabQuiz,
  submitLabCode,
  terminateLabQuiz,
} from '../services/labResearch'
import {
  captureFrameScreenshot,
  findExternalResourceReferences,
  isRunnableInBrowser,
  runCodeAgainstTests,
  runUiChecksInFrame,
} from '../utils/codeRunner'

const TABS = {
  research: 'research',
  quiz: 'quiz',
  code: 'code',
}

function ContentBlock({ text }) {
  const paragraphs = useMemo(
    () => String(text || '').split(/\n{2,}/).map((item) => item.trim()).filter(Boolean),
    [text],
  )
  return (
    <div className="space-y-4">
      {paragraphs.map((paragraph, index) => (
        <p className="text-sm leading-7 text-on-surface whitespace-pre-line" key={index}>
          {paragraph}
        </p>
      ))}
    </div>
  )
}

function ProjectDetailPage() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState(TABS.research)

  // Quiz state
  const [attempt, setAttempt] = useState(null)
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizError, setQuizError] = useState('')
  const [answers, setAnswers] = useState({})
  const [submittingQuestionId, setSubmittingQuestionId] = useState(null)

  // Code lab state
  const [challenge, setChallenge] = useState(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [code, setCode] = useState('')
  const [submittingCode, setSubmittingCode] = useState(false)
  const [submission, setSubmission] = useState(null)
  const [runningTests, setRunningTests] = useState(false)
  const [runStatus, setRunStatus] = useState('')
  const [localRun, setLocalRun] = useState(null)
  const [preview, setPreview] = useState(null)
  const [screenshotNote, setScreenshotNote] = useState('')
  const codeInitializedRef = useRef(false)
  const previewFrameRef = useRef(null)
  const previewLoadResolveRef = useRef(null)
  const lastScreenshotRef = useRef(null)

  const loadProject = async () => {
    try {
      const data = await fetchLabProject(projectId)
      setProject(data)
      setError('')
      if (data.codeChallenge) {
        setChallenge(data.codeChallenge)
        if (!codeInitializedRef.current) {
          setCode(data.codeChallenge.starterCode || '')
          codeInitializedRef.current = true
        }
      }
      // Active attempts are never resumed: the assessment is proctored, so a
      // refresh or crash forfeits the attempt and the next one gets new questions.
      return data
    } catch (err) {
      setError(err.message || 'Failed to load research project')
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProject()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Proctoring state lives in refs so the global event listeners always see
  // the current values without re-binding.
  const proctorRef = useRef({ active: false, violated: false, attemptId: null })

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }

  const handleViolation = async (reason) => {
    const proctor = proctorRef.current
    if (!proctor.active || proctor.violated || !proctor.attemptId) return
    proctorRef.current = { active: false, violated: true, attemptId: null }
    setQuizError(reason === 'tab-switch'
      ? 'Assessment auto-submitted: you switched tabs or left the window.'
      : 'Assessment auto-submitted: fullscreen mode was exited.')
    exitFullscreen()
    try {
      const updated = await terminateLabQuiz(proctor.attemptId, reason)
      setAttempt(updated)
      void loadProject()
    } catch {
      setAttempt((current) => (current ? { ...current, status: 'terminated', terminatedReason: reason } : current))
    }
  }

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) void handleViolation('tab-switch')
    }
    const onFullscreen = () => {
      if (!document.fullscreenElement) void handleViolation('fullscreen-exit')
    }
    // Alt-Tab to another application keeps the page visible, so
    // visibilitychange never fires — window blur is what catches it.
    const onBlur = () => {
      void handleViolation('tab-switch')
    }
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('fullscreenchange', onFullscreen)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('fullscreenchange', onFullscreen)
      window.removeEventListener('blur', onBlur)
      proctorRef.current = { active: false, violated: false, attemptId: null }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStartQuiz = async () => {
    setQuizError('')
    // Fullscreen must be requested inside the click gesture and is mandatory.
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      } catch {
        setQuizError('Fullscreen is required to attend this assessment. Allow fullscreen and try again.')
        return
      }
    }
    try {
      setQuizLoading(true)
      const data = await startLabQuiz(projectId)
      setAttempt(data)
      setAnswers({})
      setActiveTab(TABS.quiz)
      proctorRef.current = { active: true, violated: false, attemptId: data.id }
      if (document.hidden || !document.fullscreenElement) {
        void handleViolation(document.hidden ? 'tab-switch' : 'fullscreen-exit')
      }
    } catch (err) {
      setQuizError(err.message || 'Failed to start the knowledge check')
      exitFullscreen()
    } finally {
      setQuizLoading(false)
    }
  }

  const handleAnswerSubmit = async (question) => {
    const answer = (answers[question.id] || '').trim()
    if (answer.length < 5) {
      setQuizError('Write a more complete answer before submitting.')
      return
    }
    try {
      setSubmittingQuestionId(question.id)
      setQuizError('')
      const updated = await answerLabQuizQuestion(attempt.id, question.id, answer)
      setAttempt(updated)
      if (updated.status !== 'active') {
        proctorRef.current = { active: false, violated: false, attemptId: null }
        exitFullscreen()
        void loadProject()
      }
    } catch (err) {
      setQuizError(err.message || 'Failed to submit the answer')
    } finally {
      setSubmittingQuestionId(null)
    }
  }

  const handleLoadChallenge = async ({ regenerate = false } = {}) => {
    try {
      setCodeLoading(true)
      setCodeError('')
      setSubmission(null)
      setLocalRun(null)
      setScreenshotNote('')
      lastScreenshotRef.current = null
      setPreview(null)
      const data = await fetchLabCodeChallenge(projectId, { regenerate })
      setChallenge(data)
      if (regenerate || !codeInitializedRef.current) {
        setCode(data.starterCode || '')
        codeInitializedRef.current = true
      }
    } catch (err) {
      setCodeError(err.message || 'Failed to load the code challenge')
    } finally {
      setCodeLoading(false)
    }
  }

  const isUiChallenge = challenge?.kind === 'ui'

  // Renders the player's HTML into the sandboxed preview iframe and resolves
  // once it has loaded (the changing key forces a fresh document each run).
  const renderPreview = (html) =>
    new Promise((resolve) => {
      previewLoadResolveRef.current = resolve
      setPreview({ html, nonce: Date.now() })
      // Safety net in case the load event never fires.
      setTimeout(() => {
        if (previewLoadResolveRef.current === resolve) {
          previewLoadResolveRef.current = null
          resolve()
        }
      }, 3000)
    })

  const handlePreviewLoad = () => {
    const resolve = previewLoadResolveRef.current
    previewLoadResolveRef.current = null
    // Give inline scripts a moment to run before checks execute.
    if (resolve) setTimeout(resolve, 200)
  }

  const runUiChallenge = async () => {
    const externalRefs = findExternalResourceReferences(code)
    if (externalRefs.length) {
      throw new Error(
        `Your page must be fully self-contained: remove the external resource reference(s) — e.g. ${externalRefs[0]} — and inline images as data URIs instead. External resources cannot be captured for grading.`,
      )
    }
    setRunStatus('Rendering your page...')
    await renderPreview(code)
    setRunStatus('Verifying UI requirements...')
    const run = runUiChecksInFrame(previewFrameRef.current, challenge.testCases)
    // Capture eagerly while the preview is fresh; submit reuses this if a
    // fresh capture fails at submission time.
    try {
      lastScreenshotRef.current = await captureFrameScreenshot(previewFrameRef.current)
    } catch (screenshotError) {
      console.warn('Screenshot capture during run failed:', screenshotError)
    }
    return run
  }

  const handleRunTests = async () => {
    if (code.trim().length < 10) {
      setCodeError('Write your solution before running the tests.')
      return null
    }
    try {
      setRunningTests(true)
      setCodeError('')
      setRunStatus('Running tests in your browser...')
      const run = isUiChallenge
        ? await runUiChallenge()
        : await runCodeAgainstTests({
          language: challenge.language,
          code,
          testCases: challenge.testCases,
          onStatus: setRunStatus,
        })
      setLocalRun(run)
      setSubmission(null)
      return run
    } catch (err) {
      setCodeError(err.message || 'Failed to run the tests')
      return null
    } finally {
      setRunningTests(false)
      setRunStatus('')
    }
  }

  const handleCodeSubmit = async () => {
    if (code.trim().length < 10) {
      setCodeError('Write your solution before submitting.')
      return
    }
    try {
      setSubmittingCode(true)
      setCodeError('')
      let browserResults = null
      let screenshot = null
      if (isUiChallenge) {
        const run = await runUiChallenge()
        setLocalRun(run)
        browserResults = run.results
        if (!run.passed) {
          setSubmission(null)
          setCodeError(
            'Some UI requirements failed in the rendered page — check the details below each requirement. ' +
            'If a requirement shows "Check failed to run", it is not something your code can fix; use "New Scenario" to generate a corrected set of requirements.',
          )
          return
        }
        setRunStatus('Capturing a screenshot of your rendered page for the admin...')
        try {
          screenshot = await captureFrameScreenshot(previewFrameRef.current)
        } catch (screenshotError) {
          console.error('Screenshot capture failed:', screenshotError)
          screenshot = lastScreenshotRef.current
        }
        setScreenshotNote(screenshot ? '' : 'The rendered-page screenshot could not be captured; the submission was sent without it.')
        setRunStatus('Submitting for verification...')
      } else if (isRunnableInBrowser(challenge.language)) {
        setRunStatus('Running tests in your browser...')
        const run = await runCodeAgainstTests({
          language: challenge.language,
          code,
          testCases: challenge.testCases,
          onStatus: setRunStatus,
        })
        setLocalRun(run)
        browserResults = run.results
        if (!run.passed) {
          setSubmission(null)
          setCodeError('Some test cases failed in the browser runner. Fix your solution and submit again.')
          return
        }
        setRunStatus('Verifying on the server...')
      }
      const result = await submitLabCode(challenge.id, code, browserResults, screenshot)
      setSubmission(result)
      setLocalRun(null)
      if (result.accepted) {
        setChallenge((current) => (current ? { ...current, status: 'accepted' } : current))
        void loadProject()
      }
    } catch (err) {
      setCodeError(err.message || 'Failed to submit the code')
    } finally {
      setSubmittingCode(false)
      setRunStatus('')
    }
  }

  const handleEditorKeyDown = (event) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      const target = event.target
      const start = target.selectionStart
      const end = target.selectionEnd
      const next = `${code.slice(0, start)}  ${code.slice(end)}`
      setCode(next)
      requestAnimationFrame(() => {
        target.selectionStart = start + 2
        target.selectionEnd = start + 2
      })
    }
  }

  if (loading) {
    return (
      <div className="flex-1 px-6 md:px-10 pt-24 pb-10">
        <div className="rounded-2xl bg-surface-container-lowest p-8 text-center">
          <p className="text-on-surface-variant">Loading research project...</p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex-1 px-6 md:px-10 pt-24 pb-10">
        <div className="rounded-2xl bg-error/10 shadow-soft p-6">
          <p className="text-error font-headline text-xs font-bold">
            {error || 'Research project not found'}
          </p>
          <Link
            className="rounded-lg inline-flex items-center gap-2 mt-4 px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-primary transition-colors"
            to="/projects"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to Lab Research
          </Link>
        </div>
      </div>
    )
  }

  const tabButtonClass = (tab) =>
    `px-5 py-3 font-headline text-xs font-bold transition-colors border-b-4 ${
      activeTab === tab
        ? 'border-primary text-primary bg-surface-container-lowest'
        : 'border-transparent text-on-surface-variant hover:text-on-surface'
    }`

  return (
    <div className="flex-1 px-6 md:px-10 pt-24 pb-24 md:pb-10">
      <Link
        className="rounded-lg inline-flex items-center gap-2 mb-6 px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-primary transition-colors"
        to="/projects"
      >
        <span className="material-symbols-outlined text-sm">arrow_back</span>
        Back to Lab Research
      </Link>

      <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10 mb-6">
        <p className="font-headline text-xs text-primary font-bold">
          {project.projectType === 'web' ? 'Web-Based Project' : project.projectType === 'program' ? 'Program-Based Project' : 'Research Project'}
        </p>
        <h1 className="font-headline text-3xl md:text-4xl font-extrabold tracking-tight mt-3">
          {project.title}
        </h1>
        {project.summary ? (
          <p className="text-sm text-on-surface-variant mt-4 max-w-3xl">{project.summary}</p>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {project.stack ? (
            <div className="rounded-2xl bg-surface-container-high p-4">
              <p className="font-headline text-xs font-bold text-on-surface-variant">Stack Used</p>
              <p className="text-sm mt-1">{project.stack}</p>
            </div>
          ) : null}
          {project.contributors ? (
            <div className="rounded-2xl bg-surface-container-high p-4">
              <p className="font-headline text-xs font-bold text-on-surface-variant">Persons Contributed</p>
              <p className="text-sm mt-1">{project.contributors}</p>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 mt-6">
          <span className={`px-3 py-1.5 text-xs font-headline font-bold ${project.progress.quizCompleted ? 'bg-secondary/15 text-secondary' : 'bg-surface-container-high text-on-surface-variant'}`}>
            Knowledge Check: {project.progress.quizCompleted ? 'Completed 100/100' : `${project.progress.quizScore}/100`}
          </span>
          {project.codingEnabled ? (
            <span className={`px-3 py-1.5 text-xs font-headline font-bold ${project.progress.codeAccepted ? 'bg-secondary/15 text-secondary' : 'bg-primary/15 text-primary'}`}>
              Code Lab: {project.progress.codeAccepted ? 'Accepted' : 'Pending'}
            </span>
          ) : null}
        </div>
      </header>

      <div className="flex border-b border-outline-variant mb-6 overflow-x-auto">
        <button className={tabButtonClass(TABS.research)} onClick={() => setActiveTab(TABS.research)} type="button">
          Research
        </button>
        <button className={tabButtonClass(TABS.quiz)} onClick={() => setActiveTab(TABS.quiz)} type="button">
          AI Knowledge Check
        </button>
        {project.codingEnabled ? (
          <button className={tabButtonClass(TABS.code)} onClick={() => setActiveTab(TABS.code)} type="button">
            AI Code Lab
          </button>
        ) : null}
      </div>

      {activeTab === TABS.research ? (
        <div className="space-y-6">
          <section className="rounded-2xl bg-surface-container-lowest shadow-soft p-8">
            <h2 className="font-headline text-xl font-bold tracking-tight mb-4 text-secondary flex items-center gap-2">
              <span className="material-symbols-outlined">construction</span>
              How We Implemented It
            </h2>
            <ContentBlock text={project.explanation} />
          </section>
          {project.topics ? (
            <section className="rounded-2xl bg-surface-container-lowest shadow-soft p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-4 text-primary flex items-center gap-2">
                <span className="material-symbols-outlined">school</span>
                Topics to Learn to Build This
              </h2>
              <ul className="space-y-2">
                {project.topics.split('\n').map((item) => item.trim()).filter(Boolean).map((topic, index) => (
                  <li className="flex items-start gap-3 text-sm leading-6" key={index}>
                    <span className="material-symbols-outlined text-primary text-base mt-0.5">check_circle</span>
                    {topic}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <p className="text-sm text-on-surface-variant">
              Ready? Attend the proctored AI assessment — it runs in fullscreen with fresh questions every attempt, and answering every question correctly scores 100/100.
            </p>
            <button
              className="rounded-full bg-primary text-on-primary px-6 py-3 font-headline text-sm font-bold hover:opacity-90 transition-colors disabled:opacity-60"
              disabled={quizLoading}
              onClick={() => handleStartQuiz()}
              type="button"
            >
              {quizLoading ? 'Preparing Questions...' : 'Attend Assessment'}
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === TABS.quiz ? (
        <div className="space-y-6">
          {quizError ? (
            <div className="rounded-2xl bg-error/10 shadow-soft p-4">
              <p className="text-error font-headline text-xs font-bold">{quizError}</p>
            </div>
          ) : null}

          {project.progress.quizCompleted && !attempt ? (
            <div className="rounded-2xl bg-secondary/10 shadow-soft p-6">
              <p className="font-headline text-sm font-bold text-secondary">
                Knowledge check completed — 100/100
              </p>
              <p className="text-sm text-on-surface-variant mt-2">
                You have already proven your understanding of this project.
              </p>
            </div>
          ) : null}

          {!attempt ? (
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 text-center">
              <p className="font-headline text-lg font-bold">Proctored AI Assessment</p>
              <p className="text-sm text-on-surface-variant mt-2 max-w-xl mx-auto">
                The AI generates a completely new set of questions from this project&apos;s research write-up on every attempt.
                Answer every question correctly to score 100 and mark this project as completed. Incorrect answers can be retried within the attempt.
              </p>
              <div className="rounded-2xl mt-4 mx-auto max-w-xl bg-error/10 shadow-soft p-4 text-left">
                <p className="font-headline text-xs font-bold text-error mb-1">Proctoring Rules</p>
                <ul className="text-xs space-y-1 text-on-surface">
                  <li>• The assessment runs in fullscreen mode.</li>
                  <li>• Switching tabs, minimizing, or leaving the window auto-submits it instantly.</li>
                  <li>• Exiting fullscreen auto-submits it instantly.</li>
                  <li>• A forfeited attempt keeps its score; the next attempt gets new questions.</li>
                </ul>
              </div>
              <button
                className="rounded-full mt-6 bg-primary text-on-primary px-8 py-3 font-headline text-sm font-bold hover:opacity-90 transition-colors disabled:opacity-60"
                disabled={quizLoading}
                onClick={() => handleStartQuiz()}
                type="button"
              >
                {quizLoading ? 'Preparing Questions...' : 'Attend Assessment'}
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="font-headline text-sm font-bold">
                    Score: {attempt.score}/100 · {attempt.correctCount}/{attempt.totalQuestions} correct
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {attempt.status === 'completed'
                      ? 'Completed — every answer was correct.'
                      : attempt.status === 'terminated'
                        ? 'This attempt was auto-submitted. Attend again for a new set of questions.'
                        : 'Proctored mode is active: stay in fullscreen and do not switch tabs, or the assessment is auto-submitted.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {attempt.status === 'completed' ? (
                    <span className="rounded-lg px-4 py-2 bg-secondary/15 text-secondary font-headline text-sm font-bold">
                      Completed
                    </span>
                  ) : null}
                  {attempt.status === 'terminated' ? (
                    <span className="rounded-lg px-4 py-2 bg-error/15 text-error font-headline text-xs font-bold">
                      Auto-Submitted
                    </span>
                  ) : null}
                  {attempt.status !== 'active' && !project.progress.quizCompleted ? (
                    <button
                      className="rounded-full px-4 py-2 bg-primary text-on-primary font-headline text-sm font-bold hover:opacity-90 transition-colors disabled:opacity-60"
                      disabled={quizLoading}
                      onClick={() => handleStartQuiz()}
                      type="button"
                    >
                      {quizLoading ? 'Preparing...' : 'Attend Again (New Questions)'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4">
                {attempt.questions.map((question) => (
                  <div
                    className={`rounded-2xl bg-surface-container-lowest border-l-4 p-6 ${question.isCorrect ? 'border-secondary' : question.answered ? 'border-error' : 'border-outline-variant'}`}
                    key={question.id}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p className="font-headline text-xs font-bold text-on-surface-variant">
                        Question {question.position}
                      </p>
                      {question.answered ? (
                        <span className={`px-2 py-1 text-xs font-headline font-bold ${question.isCorrect ? 'bg-secondary/15 text-secondary' : 'bg-error/15 text-error'}`}>
                          {question.isCorrect ? 'Correct' : 'Incorrect — retry'}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm leading-7 mt-3">{question.prompt}</p>

                    {question.isCorrect ? (
                      <div className="rounded-2xl mt-4 bg-surface-container-high p-4">
                        <p className="font-headline text-xs font-bold text-secondary mb-2">Your Answer</p>
                        <p className="text-sm whitespace-pre-line">{question.answer}</p>
                        {question.feedback ? (
                          <p className="text-xs text-on-surface-variant mt-3">{question.feedback}</p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {question.answered && question.feedback ? (
                          <div className="rounded-2xl bg-error/10 p-4">
                            <p className="font-headline text-xs font-bold text-error mb-1">AI Feedback</p>
                            <p className="text-sm">{question.feedback}</p>
                          </div>
                        ) : null}
                        <textarea
                          className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 focus:ring-0 font-body text-sm py-3 px-4 outline-none min-h-[110px]"
                          onChange={(event) =>
                            setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                          }
                          placeholder="Write your answer based on the research write-up..."
                          value={answers[question.id] ?? question.answer ?? ''}
                        />
                        <button
                          className="rounded-full bg-primary text-on-primary px-6 py-2.5 font-headline text-sm font-bold hover:opacity-90 transition-colors disabled:opacity-60"
                          disabled={submittingQuestionId === question.id || attempt.status !== 'active'}
                          onClick={() => handleAnswerSubmit(question)}
                          type="button"
                        >
                          {submittingQuestionId === question.id ? 'AI Evaluating...' : question.answered ? 'Retry Answer' : 'Submit Answer'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}

      {activeTab === TABS.code && project.codingEnabled ? (
        <div className="space-y-6">
          {codeError ? (
            <div className="rounded-2xl bg-error/10 shadow-soft p-4">
              <p className="text-error font-headline text-xs font-bold">{codeError}</p>
            </div>
          ) : null}

          {!challenge ? (
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 text-center">
              <p className="font-headline text-lg font-bold">AI Code Lab</p>
              <p className="text-sm text-on-surface-variant mt-2 max-w-xl mx-auto">
                The AI will generate a coding scenario based on this project. Implement the solution and pass every test case to get it accepted.
              </p>
              <button
                className="rounded-full mt-6 bg-primary text-on-primary px-8 py-3 font-headline text-sm font-bold hover:opacity-90 transition-colors disabled:opacity-60"
                disabled={codeLoading}
                onClick={() => handleLoadChallenge()}
                type="button"
              >
                {codeLoading ? 'Generating Scenario...' : 'Generate Coding Scenario'}
              </button>
            </div>
          ) : (
            <>
              <section className="rounded-2xl bg-surface-container-lowest shadow-soft p-8">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2 className="font-headline text-xl font-bold tracking-tight text-secondary flex items-center gap-2">
                    <span className="material-symbols-outlined">terminal</span>
                    Scenario
                  </h2>
                  <div className="flex gap-2 shrink-0">
                    <span className="rounded-full px-2 py-1 text-xs font-headline font-bold bg-surface-container-high text-on-surface-variant">
                      {challenge.language}
                    </span>
                    {challenge.status === 'accepted' ? (
                      <span className="rounded-lg px-2 py-1 text-xs font-headline font-bold bg-secondary/15 text-secondary">
                        Accepted
                      </span>
                    ) : (
                      <button
                        className="rounded-full px-3 py-1 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-primary transition-colors disabled:opacity-60"
                        disabled={codeLoading}
                        onClick={() => handleLoadChallenge({ regenerate: true })}
                        type="button"
                      >
                        {codeLoading ? 'Generating...' : 'New Scenario'}
                      </button>
                    )}
                  </div>
                </div>
                <ContentBlock text={challenge.scenario} />
                {isUiChallenge && challenge.testCases.length ? (
                  <div className="mt-6">
                    <p className="font-headline text-xs font-bold text-on-surface-variant mb-3">
                      UI Requirements ({challenge.testCases.length}) — all must pass in your rendered page
                    </p>
                    <ul className="space-y-2">
                      {challenge.testCases.map((check) => (
                        <li className="flex items-start gap-3 text-sm leading-6" key={check.index}>
                          <span className="material-symbols-outlined text-primary text-base mt-0.5">rule</span>
                          {check.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {!isUiChallenge && challenge.testCases.length ? (
                  <div className="mt-6 overflow-x-auto">
                    <p className="font-headline text-xs font-bold text-on-surface-variant mb-3">
                      Test Cases ({challenge.testCases.length}) — all must pass
                    </p>
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="font-headline text-xs font-bold text-on-surface-variant border-b border-outline-variant">
                          <th className="py-2 pr-4">#</th>
                          <th className="py-2 pr-4">Input</th>
                          <th className="py-2 pr-4">Expected Output</th>
                          <th className="py-2">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {challenge.testCases.map((testCase) => (
                          <tr className="border-b border-outline-variant/40 align-top" key={testCase.index}>
                            <td className="py-2 pr-4">{testCase.index}</td>
                            <td className="py-2 pr-4 font-mono whitespace-pre-wrap break-all">{testCase.input}</td>
                            <td className="py-2 pr-4 font-mono whitespace-pre-wrap break-all">{testCase.expectedOutput}</td>
                            <td className="py-2 text-on-surface-variant">{testCase.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl bg-surface-container-lowest shadow-soft p-8">
                <h2 className="font-headline text-xl font-bold tracking-tight mb-4 text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined">code</span>
                  Code Editor
                </h2>
                <textarea
                  className="w-full bg-[#0d1117] text-[#e6edf3] font-mono text-sm leading-6 p-4 min-h-[320px] outline-none border border-outline-variant focus:border-primary resize-y"
                  disabled={challenge.status === 'accepted'}
                  onChange={(event) => setCode(event.target.value)}
                  onKeyDown={handleEditorKeyDown}
                  spellCheck={false}
                  value={code}
                />
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-4">
                  <p className="text-xs text-on-surface-variant">
                    {isUiChallenge
                      ? 'Write a standalone HTML page (inline CSS and JS). Run it to render it right here and verify every UI requirement. On submit, a screenshot of your rendered page is sent to the admin with the results.'
                      : 'Implement solve(input) exactly as the scenario describes. Your code compiles and runs directly in the browser, and the server re-runs it independently on submit.'}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    {isUiChallenge || isRunnableInBrowser(challenge.language) ? (
                      <button
                        className="rounded-xl bg-surface-container-high text-on-surface px-6 py-3 font-headline text-xs font-bold hover:text-secondary transition-colors disabled:opacity-60"
                        disabled={runningTests || submittingCode || challenge.status === 'accepted'}
                        onClick={handleRunTests}
                        type="button"
                      >
                        {runningTests ? 'Running...' : isUiChallenge ? 'Run & Render' : 'Run Tests'}
                      </button>
                    ) : null}
                    <button
                      className="rounded-full bg-primary text-on-primary px-8 py-3 font-headline text-sm font-bold hover:opacity-90 transition-colors disabled:opacity-60"
                      disabled={submittingCode || runningTests || challenge.status === 'accepted'}
                      onClick={handleCodeSubmit}
                      type="button"
                    >
                      {submittingCode ? 'Verifying...' : challenge.status === 'accepted' ? 'Accepted' : 'Submit Solution'}
                    </button>
                  </div>
                </div>
                {runStatus ? (
                  <p className="mt-3 font-headline text-xs font-bold text-secondary">
                    {runStatus}
                  </p>
                ) : null}
              </section>

              {isUiChallenge && preview ? (
                <section className="rounded-2xl bg-surface-container-lowest shadow-soft p-8">
                  <h2 className="font-headline text-xl font-bold tracking-tight mb-4 text-secondary flex items-center gap-2">
                    <span className="material-symbols-outlined">preview</span>
                    Rendered Page
                  </h2>
                  <iframe
                    className="w-full min-h-[420px] bg-white border border-outline-variant"
                    key={preview.nonce}
                    onLoad={handlePreviewLoad}
                    ref={previewFrameRef}
                    sandbox="allow-scripts allow-same-origin"
                    srcDoc={preview.html}
                    title="Rendered page preview"
                  />
                  <p className="text-xs text-on-surface-variant mt-3">
                    This is your page rendered live. The UI requirement checks run against this exact document, and its screenshot is attached to your submission for the admin.
                  </p>
                </section>
              ) : null}

              {screenshotNote ? (
                <div className="rounded-2xl bg-error/10 shadow-soft p-4">
                  <p className="text-error font-headline text-xs font-bold">{screenshotNote}</p>
                </div>
              ) : null}

              {submission || localRun ? (
                <section className={`rounded-2xl bg-surface-container-lowest border-l-4 p-8 ${(submission ? submission.accepted : localRun.passed) ? 'border-secondary' : 'border-error'}`}>
                  <h2 className={`font-headline text-xl font-bold tracking-tight mb-4 flex items-center gap-2 ${(submission ? submission.accepted : localRun.passed) ? 'text-secondary' : 'text-error'}`}>
                    <span className="material-symbols-outlined">
                      {(submission ? submission.accepted : localRun.passed) ? 'verified' : 'report'}
                    </span>
                    {submission
                      ? submission.accepted
                        ? 'Accepted — All Test Cases Passed'
                        : 'Not Accepted'
                      : localRun.passed
                        ? 'Local Run — All Test Cases Passed (submit to record it)'
                        : 'Local Run — Some Test Cases Failed'}
                  </h2>
                  {submission?.feedback ? (
                    <p className="text-sm mb-4">{submission.feedback}</p>
                  ) : null}
                  <div className="space-y-2">
                    {((submission ? submission.results : localRun.results) || []).map((result) => (
                      <div
                        className={`p-4 flex flex-col gap-1 ${result.passed ? 'bg-secondary/10' : 'bg-error/10'}`}
                        key={result.index}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined text-base ${result.passed ? 'text-secondary' : 'text-error'}`}>
                            {result.passed ? 'check_circle' : 'cancel'}
                          </span>
                          <p className="font-headline text-xs font-bold">
                            Test {result.index}: {result.passed ? 'Passed' : 'Failed'}
                          </p>
                        </div>
                        {result.description ? (
                          <p className="text-xs text-on-surface-variant">{result.description}</p>
                        ) : null}
                        {!result.passed && result.detail ? (
                          <p className="text-xs">{result.detail}</p>
                        ) : null}
                        {!result.passed && result.actualOutput ? (
                          <p className="text-xs font-mono">Got: {result.actualOutput}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default ProjectDetailPage
