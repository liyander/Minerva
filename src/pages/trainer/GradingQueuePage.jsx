import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { fetchSubmissions, fileUrl, gradeSubmission } from '../../services/platform'

function GradingQueuePage() {
  const { assignmentId } = useParams()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [scores, setScores] = useState({})
  const [comments, setComments] = useState({})
  const [feedback, setFeedback] = useState('')
  const [filter, setFilter] = useState('awaiting')
  const [isLoading, setIsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const response = await fetchSubmissions(assignmentId)
      setData(response)
      return response
    } catch (loadError) {
      setError(loadError?.message || 'Could not load submissions.')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [assignmentId])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const rows = data?.submissions || []
    if (filter === 'awaiting') return rows.filter((row) => row.status === 'submitted')
    if (filter === 'graded') return rows.filter((row) => row.status === 'graded')
    return rows
  }, [data, filter])

  const active = useMemo(
    () => (data?.submissions || []).find((row) => row.id === activeId) || null,
    [data, activeId],
  )

  // Loading a submission seeds the rubric inputs with any existing marks.
  const openSubmission = (submission) => {
    setActiveId(submission.id)
    setFeedback(submission.feedback || '')
    setNotice('')

    const seededScores = {}
    const seededComments = {}
    for (const criterion of data?.rubric || []) {
      const existing = submission.rubricScores.find(
        (row) => Number(row.criterionId) === Number(criterion.id),
      )
      seededScores[criterion.id] = existing ? existing.points : ''
      seededComments[criterion.id] = existing?.comment || ''
    }
    setScores(seededScores)
    setComments(seededComments)
  }

  const rubricTotal = useMemo(() => {
    if (!data?.rubric?.length) return null
    return (data.rubric || []).reduce((sum, criterion) => {
      const value = Number(scores[criterion.id])
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
  }, [data, scores])

  const submitGrade = async () => {
    if (!active) return

    setBusy(true)
    setError('')

    try {
      const payload = data?.rubric?.length
        ? {
            rubricScores: data.rubric.map((criterion) => ({
              criterionId: criterion.id,
              points: Number(scores[criterion.id] || 0),
              comment: comments[criterion.id] || undefined,
            })),
            feedback,
          }
        : { score: Number(scores.total || 0), feedback }

      const response = await gradeSubmission(active.id, payload)
      setNotice(`Marked ${response.score}/${data.assignment.maxScore} — ${response.passed ? 'pass' : 'not a pass'}.`)

      const refreshed = await load()
      // Jump to the next unmarked submission so grading flows.
      const next = (refreshed?.submissions || []).find((row) => row.status === 'submitted')
      if (next) openSubmission(next)
      else setActiveId(null)
    } catch (gradeError) {
      setError(gradeError?.message || 'Could not save the grade.')
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center pt-24">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      </main>
    )
  }

  const fieldClass =
    'w-full rounded-xl bg-surface-container-lowest border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none'

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24">
      <div className="mx-auto max-w-6xl space-y-6">
        <button
          className="inline-flex items-center gap-1 font-headline text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={() => navigate('/trainer')}
          type="button"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to workspace
        </button>

        <PageHeader
          accent="sky"
          description={data?.assignment?.subject}
          eyebrow="Grading"
          icon="rate_review"
          title={data?.assignment?.title || 'Grading queue'}
        />

        {data?.summary ? (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Submissions', value: data.summary.submissions, accent: 'bg-sky text-on-sky' },
              { label: 'Awaiting', value: data.summary.awaiting, accent: 'bg-butter text-on-butter' },
              { label: 'Passed', value: data.summary.passed, accent: 'bg-mint text-on-mint' },
              {
                label: 'Average',
                value: `${data.summary.averageScore}/${data.assignment.maxScore}`,
                accent: 'bg-lavender text-on-lavender',
              },
            ].map((tile) => (
              <div className={`rounded-2xl px-5 py-4 ${tile.accent}`} key={tile.label}>
                <p className="font-headline text-2xl font-extrabold leading-none">{tile.value}</p>
                <p className="font-body text-xs opacity-80 mt-2">{tile.label}</p>
              </div>
            ))}
          </section>
        ) : null}

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

        <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-6">
          <section className="rounded-3xl bg-surface-container-lowest p-4 shadow-soft">
            <div className="flex gap-1 mb-3">
              {[
                { id: 'awaiting', label: 'Awaiting' },
                { id: 'graded', label: 'Marked' },
                { id: 'all', label: 'All' },
              ].map((tab) => (
                <button
                  className={`flex-1 rounded-full px-3 py-2 font-headline text-xs font-bold transition-colors ${
                    filter === tab.id
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:bg-surface-container'
                  }`}
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <p className="font-body text-sm text-on-surface-variant py-6 text-center">
                Nothing here.
              </p>
            ) : (
              <div className="space-y-1 max-h-[32rem] overflow-y-auto">
                {visible.map((submission) => (
                  <button
                    className={`w-full rounded-2xl px-4 py-3 text-left transition-colors ${
                      activeId === submission.id
                        ? 'bg-primary-container text-on-primary-container'
                        : 'hover:bg-surface-container'
                    }`}
                    key={submission.id}
                    onClick={() => openSubmission(submission)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-headline text-sm font-bold truncate">{submission.name}</p>
                      {submission.status === 'graded' ? (
                        <span className="font-headline text-xs font-bold shrink-0">
                          {submission.score}
                        </span>
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-butter shrink-0"></span>
                      )}
                    </div>
                    <p className="font-body text-xs opacity-70 mt-0.5">
                      {new Date(submission.submittedAt).toLocaleDateString()}
                      {submission.isLate ? ' · late' : ''}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
            {!active ? (
              <div className="py-16 text-center">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant/40">
                  rate_review
                </span>
                <p className="font-headline text-base font-extrabold text-on-background mt-4">
                  Pick a submission to mark
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-headline text-xl font-extrabold text-on-background">
                      {active.name}
                    </h2>
                    <p className="font-body text-xs text-on-surface-variant mt-1">
                      {active.email} · submitted{' '}
                      {new Date(active.submittedAt).toLocaleString()}
                      {active.attemptNumber > 1 ? ` · attempt ${active.attemptNumber}` : ''}
                    </p>
                  </div>
                  {active.isLate ? (
                    <span className="rounded-full bg-blush px-3 py-1 font-headline text-xs font-bold text-on-blush">
                      Late
                    </span>
                  ) : null}
                </div>

                <div className="rounded-2xl bg-surface-container p-5 space-y-3">
                  <h3 className="font-headline text-sm font-bold text-on-surface-variant">
                    Their work
                  </h3>

                  {active.bodyText ? (
                    <p className="font-body text-sm text-on-surface whitespace-pre-line leading-relaxed">
                      {active.bodyText}
                    </p>
                  ) : null}

                  {active.linkUrl ? (
                    <a
                      className="inline-flex items-center gap-2 font-body text-sm text-primary hover:underline"
                      href={active.linkUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="material-symbols-outlined text-base">link</span>
                      {active.linkUrl}
                    </a>
                  ) : null}

                  {active.fileId ? (
                    <a
                      className="inline-flex items-center gap-2 rounded-full bg-surface-container-lowest px-4 py-2 font-headline text-sm font-bold text-on-surface hover:opacity-90"
                      href={fileUrl(active.fileId, { download: true })}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="material-symbols-outlined text-base">download</span>
                      {active.fileName || 'Download submission'}
                    </a>
                  ) : null}

                  {!active.bodyText && !active.linkUrl && !active.fileId ? (
                    <p className="font-body text-sm text-on-surface-variant">Nothing attached.</p>
                  ) : null}
                </div>

                {data.rubric.length ? (
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-headline text-sm font-bold text-on-surface-variant">
                        Rubric
                      </h3>
                      <span className="font-headline text-base font-extrabold text-on-background">
                        {rubricTotal}/{data.assignment.maxScore}
                      </span>
                    </div>

                    {data.rubric.map((criterion) => (
                      <div className="rounded-2xl bg-surface-container p-4" key={criterion.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-headline text-sm font-bold text-on-surface">
                              {criterion.label}
                            </p>
                            {criterion.description ? (
                              <p className="font-body text-xs text-on-surface-variant mt-1">
                                {criterion.description}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              aria-label={`Points for ${criterion.label}`}
                              className="w-16 rounded-xl bg-surface-container-lowest border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2 px-2.5 text-center outline-none"
                              max={criterion.maxPoints}
                              min="0"
                              onChange={(e) =>
                                setScores((current) => ({
                                  ...current,
                                  [criterion.id]: e.target.value,
                                }))
                              }
                              type="number"
                              value={scores[criterion.id] ?? ''}
                            />
                            <span className="font-body text-sm text-on-surface-variant">
                              /{criterion.maxPoints}
                            </span>
                          </div>
                        </div>
                        <input
                          className={`${fieldClass} mt-3`}
                          onChange={(e) =>
                            setComments((current) => ({
                              ...current,
                              [criterion.id]: e.target.value,
                            }))
                          }
                          placeholder="Note for this criterion (optional)"
                          value={comments[criterion.id] || ''}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <label className="block">
                    <span className="font-headline text-xs font-bold text-on-surface-variant">
                      Score out of {data.assignment.maxScore}
                    </span>
                    <input
                      className={`${fieldClass} mt-1.5`}
                      max={data.assignment.maxScore}
                      min="0"
                      onChange={(e) =>
                        setScores((current) => ({ ...current, total: e.target.value }))
                      }
                      type="number"
                      value={scores.total ?? ''}
                    />
                  </label>
                )}

                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    Overall feedback
                  </span>
                  <textarea
                    className={`${fieldClass} mt-1.5`}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="What went well, and what to work on next."
                    rows={4}
                    value={feedback}
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-full bg-primary px-7 py-3 font-headline text-sm font-bold text-on-primary hover:opacity-90 transition-opacity disabled:opacity-60"
                    disabled={busy}
                    onClick={submitGrade}
                    type="button"
                  >
                    {busy ? 'Saving…' : 'Release grade'}
                  </button>
                  <p className="font-body text-xs text-on-surface-variant">
                    The trainee is emailed when you release a grade.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

export default GradingQueuePage
