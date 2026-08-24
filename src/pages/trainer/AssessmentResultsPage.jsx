import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { fetchAssessmentResults, gradeAssessmentQuestion, updateAssessment } from '../../services/training'

function AssessmentResultsPage() {
  const { assessmentId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [reviewAttempt, setReviewAttempt] = useState(null)
  const [gradeDrafts, setGradeDrafts] = useState({})

  useEffect(() => {
    fetchAssessmentResults(assessmentId)
      .then(setData)
      .catch((loadError) => setError(loadError?.message || 'Could not load results.'))
      .finally(() => setIsLoading(false))
  }, [assessmentId])

  if (isLoading) {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center pt-24">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      </main>
    )
  }

  const summary = data?.summary
  const passRate = summary?.attempts ? Math.round((summary.passed / summary.attempts) * 100) : 0

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24">
      <div className="mx-auto max-w-5xl space-y-6">
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
          description={data?.assessment?.subject ? `Subject: ${data.assessment.subject}` : undefined}
          eyebrow="Results"
          icon="analytics"
          title={data?.assessment?.title || 'Assessment results'}
        />

        {data?.assessment?.resultsMode === 'manual' ? <button className="rounded-full bg-primary px-5 py-2.5 font-headline text-sm font-bold text-on-primary" onClick={async () => { await updateAssessment(assessmentId, { resultsMode: 'immediate' }); setData((current) => ({ ...current, assessment: { ...current.assessment, resultsMode: 'immediate' } })) }} type="button">Release results now</button> : null}

        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}

        {summary ? (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Attempts', value: summary.attempts, accent: 'bg-sky text-on-sky' },
              { label: 'Trainees', value: summary.uniqueTrainees, accent: 'bg-lavender text-on-lavender' },
              { label: 'Average score', value: `${summary.averagePercentage}%`, accent: 'bg-butter text-on-butter' },
              { label: 'Pass rate', value: `${passRate}%`, accent: 'bg-mint text-on-mint' },
              { label: 'Pending review', value: summary.pendingReview || 0, accent: 'bg-lavender text-on-lavender' },
              { label: 'Security events', value: summary.securityEvents || 0, accent: 'bg-blush text-on-blush' },
            ].map((tile) => (
              <div className={`rounded-2xl px-5 py-4 ${tile.accent}`} key={tile.label}>
                <p className="font-headline text-3xl font-extrabold leading-none">{tile.value}</p>
                <p className="font-body text-xs opacity-80 mt-2">{tile.label}</p>
              </div>
            ))}
          </section>
        ) : null}

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">Submissions</h2>

          {!data?.attempts?.length ? (
            <p className="font-body text-sm text-on-surface-variant py-6 text-center">
              No submissions yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem]">
                <thead>
                  <tr className="text-left">
                    {['Trainee', 'Score', 'Result', 'Submitted', ''].map((head, index) => (
                      <th
                        className="font-headline text-xs font-bold text-on-surface-variant pb-3 px-3"
                        key={`${head}-${index}`}
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.attempts.map((attempt) => (
                    <tr className="border-t border-outline-variant" key={attempt.id}>
                      <td className="py-3 px-3">
                        <p className="font-headline text-sm font-bold text-on-surface">
                          {[attempt.first_name, attempt.last_name].filter(Boolean).join(' ') ||
                            attempt.username}
                        </p>
                        <p className="font-body text-xs text-on-surface-variant">{attempt.email}</p>
                      </td>
                      <td className="py-3 px-3 font-body text-sm text-on-surface">
                        {attempt.score}/{attempt.max_score} ({attempt.percentage}%)
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-headline text-xs font-bold ${
                            attempt.passed ? 'bg-mint text-on-mint' : 'bg-blush text-on-blush'
                          }`}
                        >
                          {attempt.passed ? 'Passed' : 'Not passed'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-body text-xs text-on-surface-variant">
                        {new Date(attempt.submitted_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-3"><button className="rounded-full bg-surface-container-high px-3 py-1.5 font-headline text-xs font-bold text-on-surface" onClick={() => setReviewAttempt(attempt)} type="button">Review paper</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {reviewAttempt ? (
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
            <div className="flex items-center justify-between gap-3"><div><h2 className="font-headline text-lg font-extrabold text-on-background">Attempt review</h2><p className="font-body text-xs text-on-surface-variant">The exact question and option order shown for this attempt.</p></div><button className="rounded-full bg-surface-container-high px-4 py-2 font-headline text-xs font-bold" onClick={() => setReviewAttempt(null)} type="button">Close</button></div>
            <div className="mt-4 space-y-3">
              {(reviewAttempt.paper || []).map((question, index) => {
                const answer = (reviewAttempt.answers || []).find((item) => Number(item.questionId) === Number(question.questionId))
                return <article className="rounded-2xl bg-surface-container p-4" key={`${question.questionId}-${index}`}><p className="font-headline text-sm font-extrabold text-on-surface">{index + 1}. {question.prompt}</p>{(question.options || []).length ? <div className="mt-3 space-y-2">{question.options.map((option, optionIndex) => <div className={`rounded-xl px-3 py-2 font-body text-xs ${optionIndex === answer?.correctIndex ? 'bg-mint text-on-mint' : optionIndex === answer?.answer ? 'bg-blush text-on-blush' : 'bg-surface-container-lowest text-on-surface-variant'}`} key={optionIndex}>{option}{optionIndex === answer?.correctIndex ? ' · correct' : optionIndex === answer?.answer ? ' · selected' : ''}</div>)}</div> : <div className="mt-3 rounded-xl bg-surface-container-lowest p-3 text-sm whitespace-pre-wrap">{typeof answer?.answer === 'object' ? JSON.stringify(answer.answer, null, 2) : answer?.answer || 'No answer'}</div>}{answer?.pendingReview ? <div className="mt-3 flex gap-2"><input className="w-28 rounded-xl bg-surface-container-lowest px-3 py-2 text-sm" max={answer.maxScore} min="0" onChange={(event) => setGradeDrafts((current) => ({ ...current, [question.questionId]: event.target.value }))} placeholder={`0-${answer.maxScore}`} type="number" value={gradeDrafts[question.questionId] || ''} /><button className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-on-primary" onClick={async () => { await gradeAssessmentQuestion(reviewAttempt.id, question.questionId, { score: Number(gradeDrafts[question.questionId] || 0) }); setReviewAttempt(null); setData(await fetchAssessmentResults(assessmentId)) }} type="button">Save grade</button></div> : null}</article>
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  )
}

export default AssessmentResultsPage
