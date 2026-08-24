import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchLabPlayerDetail, fetchLabSubmission, resetLabPlayerProgress } from '../../services/labResearch'

function AdminProjectSubmissionPage() {
  const navigate = useNavigate()
  const { projectId, userId } = useParams()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submissionView, setSubmissionView] = useState(null)
  const [submissionLoading, setSubmissionLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [success, setSuccess] = useState('')

  const loadDetail = async () => {
    try {
      setLoading(true)
      const data = await fetchLabPlayerDetail(projectId, userId)
      setDetail(data)
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load the player details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDetail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId])

  const handleReset = async (scope) => {
    const labels = {
      code: 'code lab progress (challenge, submissions, and acceptance)',
      quiz: 'assessment progress (all attempts and the completion status)',
      all: 'entire progress on this project (assessment and code lab)',
    }
    if (!window.confirm(`Reset this player's ${labels[scope]}? The player will be able to attempt again from scratch.`)) {
      return
    }
    try {
      setResetting(true)
      setError('')
      setSuccess('')
      setSubmissionView(null)
      await resetLabPlayerProgress(projectId, userId, scope)
      setSuccess(
        scope === 'code'
          ? 'Code lab progress reset — the player can generate a new scenario and resubmit.'
          : scope === 'quiz'
            ? 'Assessment progress reset — the player can attend again with new questions.'
            : 'All progress reset — the player starts this project from scratch.',
      )
      await loadDetail()
    } catch (err) {
      setError(err.message || 'Failed to reset the player progress')
    } finally {
      setResetting(false)
    }
  }

  const handleViewSubmission = async (submissionId) => {
    try {
      setSubmissionLoading(true)
      setError('')
      const data = await fetchLabSubmission(submissionId)
      setSubmissionView(data)
    } catch (err) {
      setError(err.message || 'Failed to load the submission')
    } finally {
      setSubmissionLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-6xl mx-auto">
        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10 mb-8">
          <button
            className="rounded-lg inline-flex items-center gap-2 mb-6 px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-primary transition-colors"
            onClick={() => navigate('/admin/projects')}
            type="button"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to Lab Research Manager
          </button>
          <p className="font-headline text-xs text-secondary font-bold">
            Player Activity
          </p>
          <h1 className="font-headline text-3xl md:text-4xl font-extrabold tracking-tight mt-3">
            {detail ? detail.player.username : 'Loading...'}
          </h1>
          {detail ? (
            <>
              <p className="text-sm text-on-surface-variant mt-2">
                {detail.player.email} · Project: {detail.project.title}
              </p>
              <div className="flex flex-wrap gap-2 mt-5">
                <span className={`px-2 py-1 text-xs font-headline font-bold ${detail.progress.quizCompleted ? 'bg-secondary/15 text-secondary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                  Knowledge Check {detail.progress.quizCompleted ? 'Completed 100/100' : `${detail.progress.quizScore}/100`}
                </span>
                {detail.project.codingEnabled || detail.progress.codeAccepted ? (
                  <span className={`px-2 py-1 text-xs font-headline font-bold ${detail.progress.codeAccepted ? 'bg-secondary/15 text-secondary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    Code Lab {detail.progress.codeAccepted ? 'Accepted' : 'Not Accepted'} · {detail.progress.codeAttempts} attempt{detail.progress.codeAttempts === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 mt-6">
                <button
                  className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-error transition-colors disabled:opacity-60"
                  disabled={resetting}
                  onClick={() => handleReset('quiz')}
                  type="button"
                >
                  Reset Assessment
                </button>
                {detail.project.codingEnabled || detail.progress.codeAccepted || detail.submissions.length ? (
                  <button
                    className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-error transition-colors disabled:opacity-60"
                    disabled={resetting}
                    onClick={() => handleReset('code')}
                    type="button"
                  >
                    Reset Code Submission
                  </button>
                ) : null}
                <button
                  className="rounded-lg px-4 py-2 bg-error/15 text-error font-headline text-xs font-bold hover:bg-error/25 transition-colors disabled:opacity-60"
                  disabled={resetting}
                  onClick={() => handleReset('all')}
                  type="button"
                >
                  {resetting ? 'Resetting...' : 'Reset All Progress'}
                </button>
              </div>
            </>
          ) : null}
        </header>

        {success ? (
          <div className="rounded-2xl mb-6 bg-secondary/10 shadow-soft p-4">
            <p className="text-secondary font-headline text-xs font-bold">{success}</p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl mb-6 bg-error/10 shadow-soft p-4">
            <p className="text-error font-headline text-xs font-bold">{error}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl bg-surface-container-lowest p-8 text-center">
            <p className="text-on-surface-variant">Loading player details...</p>
          </div>
        ) : detail ? (
          <>
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 mb-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-5 text-primary flex items-center gap-2">
                <span className="material-symbols-outlined">quiz</span>
                Assessment Attempts ({detail.attempts.length})
              </h2>
              {detail.attempts.length === 0 ? (
                <p className="text-sm text-on-surface-variant">This player has not attended the assessment yet.</p>
              ) : (
                <div className="space-y-4">
                  {detail.attempts.map((attempt) => (
                    <details className="bg-surface-container-high" key={attempt.id} open={detail.attempts.length === 1}>
                      <summary className="cursor-pointer p-4 flex flex-wrap items-center gap-3">
                        <span className="font-headline text-xs font-bold">
                          {new Date(attempt.createdAt).toLocaleString()}
                        </span>
                        <span className={`px-2 py-1 text-xs font-headline font-bold ${
                          attempt.status === 'completed'
                            ? 'bg-secondary/15 text-secondary'
                            : attempt.status === 'terminated'
                              ? 'bg-error/15 text-error'
                              : 'bg-surface-container-highest text-on-surface-variant'
                        }`}>
                          {attempt.status === 'terminated'
                            ? `Auto-Submitted (${attempt.terminatedReason || 'left session'})`
                            : attempt.status}
                        </span>
                        <span className="font-headline text-xs font-bold">{attempt.score}/100</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-3">
                        {attempt.questions.map((question) => (
                          <div
                            className={`rounded-2xl bg-surface-container-lowest border-l-4 p-4 ${question.isCorrect ? 'border-secondary' : question.answered ? 'border-error' : 'border-outline-variant'}`}
                            key={question.position}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm leading-6">
                                <span className="font-headline text-xs font-bold text-on-surface-variant mr-2">
                                  Q{question.position}
                                </span>
                                {question.prompt}
                              </p>
                              <span className={`shrink-0 px-2 py-1 text-xs font-headline font-bold ${
                                question.isCorrect
                                  ? 'bg-secondary/15 text-secondary'
                                  : question.answered
                                    ? 'bg-error/15 text-error'
                                    : 'bg-surface-container-high text-on-surface-variant'
                              }`}>
                                {question.isCorrect ? 'Correct' : question.answered ? 'Incorrect' : 'Unanswered'}
                              </span>
                            </div>
                            {question.answered ? (
                              <div className="rounded-xl mt-3 bg-surface-container-high p-3">
                                <p className="font-headline text-xs font-bold text-on-surface-variant mb-1">
                                  Player&apos;s Answer{question.score !== null ? ` · scored ${question.score}/100` : ''}
                                </p>
                                <p className="text-sm whitespace-pre-line">{question.answer || '—'}</p>
                                {question.feedback ? (
                                  <p className="text-xs text-on-surface-variant mt-2">AI feedback: {question.feedback}</p>
                                ) : null}
                              </div>
                            ) : (
                              <p className="mt-3 text-xs text-on-surface-variant">No answer submitted.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-5 text-secondary flex items-center gap-2">
                <span className="material-symbols-outlined">code</span>
                Code Submissions ({detail.submissions.length})
              </h2>
              {detail.submissions.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No code submissions yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.submissions.map((item) => (
                    <div className="rounded-xl bg-surface-container-high p-3 flex flex-wrap items-center justify-between gap-3" key={item.id}>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-headline text-xs font-bold">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                        <span className="rounded-full px-2 py-1 text-xs font-headline font-bold bg-surface-container-highest text-on-surface-variant">
                          {item.kind === 'ui' ? 'UI Feature' : item.language}
                        </span>
                        <span className={`px-2 py-1 text-xs font-headline font-bold ${item.passed ? 'bg-secondary/15 text-secondary' : 'bg-error/15 text-error'}`}>
                          {item.passed ? 'Accepted' : 'Failed'}
                        </span>
                        {item.hasScreenshot ? (
                          <span className="rounded-lg px-2 py-1 text-xs font-headline font-bold bg-primary/15 text-primary">
                            Screenshot
                          </span>
                        ) : null}
                      </div>
                      <button
                        className="rounded-full px-3 py-1.5 bg-surface-container-highest text-on-surface font-headline text-xs font-bold hover:text-primary transition-colors disabled:opacity-60"
                        disabled={submissionLoading}
                        onClick={() => handleViewSubmission(item.id)}
                        type="button"
                      >
                        View Code &amp; Tests
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {submissionLoading ? (
                <p className="mt-6 text-sm text-on-surface-variant">Loading submission...</p>
              ) : submissionView ? (
                <div className="mt-8 border-t border-outline-variant pt-6">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="font-headline text-lg font-bold tracking-tight">
                        Submission — {new Date(submissionView.createdAt).toLocaleString()}
                      </h3>
                      <p className="text-xs text-on-surface-variant mt-1">
                        {submissionView.kind === 'ui' ? 'UI Feature Challenge' : `Function Challenge (${submissionView.language})`}
                        {' · '}
                        <span className={submissionView.passed ? 'text-secondary' : 'text-error'}>
                          {submissionView.passed ? 'Accepted' : 'Not Accepted'}
                        </span>
                      </p>
                    </div>
                    <button
                      className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-error transition-colors"
                      onClick={() => setSubmissionView(null)}
                      type="button"
                    >
                      Close
                    </button>
                  </div>

                  {submissionView.screenshot ? (
                    <div className="mb-6">
                      <p className="font-headline text-xs font-bold text-on-surface-variant mb-2">
                        Rendered Page Screenshot
                      </p>
                      <img
                        alt={`Rendered page submitted by ${detail.player.username}`}
                        className="max-w-full border border-outline-variant bg-white"
                        src={submissionView.screenshot}
                      />
                    </div>
                  ) : null}

                  {submissionView.feedback ? (
                    <p className="text-sm mb-4">{submissionView.feedback}</p>
                  ) : null}

                  {Array.isArray(submissionView.results) && submissionView.results.length ? (
                    <div className="space-y-2 mb-6">
                      {submissionView.results.map((result) => (
                        <div
                          className={`p-3 flex items-start gap-2 ${result.passed ? 'bg-secondary/10' : 'bg-error/10'}`}
                          key={result.index}
                        >
                          <span className={`material-symbols-outlined text-base ${result.passed ? 'text-secondary' : 'text-error'}`}>
                            {result.passed ? 'check_circle' : 'cancel'}
                          </span>
                          <div>
                            <p className="font-headline text-xs font-bold">
                              Test {result.index}: {result.passed ? 'Passed' : 'Failed'}
                            </p>
                            {result.description ? (
                              <p className="text-xs text-on-surface-variant">{result.description}</p>
                            ) : null}
                            {!result.passed && result.detail ? (
                              <p className="text-xs">{result.detail}</p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <details open>
                    <summary className="cursor-pointer font-headline text-xs font-bold text-on-surface-variant">
                      Submitted Code
                    </summary>
                    <pre className="mt-3 max-h-96 overflow-auto bg-[#0d1117] text-[#e6edf3] font-mono text-xs leading-6 p-4">
                      {submissionView.code}
                    </pre>
                  </details>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </main>
  )
}

export default AdminProjectSubmissionPage
