import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { fetchAssessmentResults } from '../../services/training'

function AssessmentResultsPage() {
  const { assessmentId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

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
                    {['Trainee', 'Score', 'Result', 'Submitted'].map((head) => (
                      <th
                        className="font-headline text-xs font-bold text-on-surface-variant pb-3 px-3"
                        key={head}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default AssessmentResultsPage
