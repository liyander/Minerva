import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import {
  fetchAssessments,
  fetchAssessmentSubjects,
  fetchMyAttempts,
} from '../services/training'

function formatDeadline(deadline) {
  if (!deadline) return null
  const remaining = new Date(deadline).getTime() - Date.now()
  if (remaining < 0) return { label: 'Closed', class: 'bg-blush text-on-blush' }

  const days = Math.ceil(remaining / 86400000)
  if (days <= 1) return { label: 'Due today', class: 'bg-blush text-on-blush' }
  if (days <= 3) return { label: `${days} days left`, class: 'bg-butter text-on-butter' }
  return {
    label: `Due ${new Date(deadline).toLocaleDateString([], { day: 'numeric', month: 'short' })}`,
    class: 'bg-mint text-on-mint',
  }
}

function AssessmentsPage() {
  const navigate = useNavigate()
  const [assessments, setAssessments] = useState([])
  const [attempts, setAttempts] = useState([])
  const [subjects, setSubjects] = useState([])
  const [subject, setSubject] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [rows, subjectRows, attemptRows] = await Promise.all([
        fetchAssessments(),
        fetchAssessmentSubjects(),
        fetchMyAttempts(),
      ])
      setAssessments(rows)
      setSubjects(subjectRows)
      setAttempts(attemptRows)
    } catch (loadError) {
      setError(loadError?.message || 'Could not load assessments.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(
    () => (subject ? assessments.filter((item) => item.subject === subject) : assessments),
    [assessments, subject],
  )

  // Subject-wise grouping is what the requirement asks for, so group rather than
  // present one flat list.
  const grouped = useMemo(() => {
    const map = new Map()
    for (const assessment of visible) {
      const key = assessment.subject || 'General'
      map.set(key, [...(map.get(key) || []), assessment])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [visible])

  const stats = useMemo(() => {
    const passed = attempts.filter((attempt) => attempt.passed).length
    const scores = attempts.map((attempt) => Number(attempt.percentage))
    return {
      taken: attempts.length,
      passed,
      average: scores.length
        ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
        : 0,
    }
  }, [attempts])

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24 pb-24 md:pb-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          accent="lavender"
          description="Subject-wise multiple-choice assessments set by your trainers. Results are marked instantly."
          eyebrow="Assessments"
          icon="quiz"
          title="Test your knowledge"
        />

        <section className="grid grid-cols-3 gap-4">
          {[
            { label: 'Taken', value: stats.taken, accent: 'bg-sky text-on-sky' },
            { label: 'Passed', value: stats.passed, accent: 'bg-mint text-on-mint' },
            { label: 'Average', value: `${stats.average}%`, accent: 'bg-butter text-on-butter' },
          ].map((tile) => (
            <div className={`rounded-2xl px-5 py-4 ${tile.accent}`} key={tile.label}>
              <p className="font-headline text-3xl font-extrabold leading-none">{tile.value}</p>
              <p className="font-body text-xs opacity-80 mt-2">{tile.label}</p>
            </div>
          ))}
        </section>

        {subjects.length ? (
          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-full px-4 py-2 font-headline text-sm font-bold transition-colors ${
                subject === ''
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setSubject('')}
              type="button"
            >
              All subjects
            </button>
            {subjects.map((item) => (
              <button
                className={`rounded-full px-4 py-2 font-headline text-sm font-bold transition-colors ${
                  subject === item
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
                }`}
                key={item}
                onClick={() => setSubject(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-3xl bg-surface-container-lowest p-12 text-center shadow-soft">
            <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
        ) : null}

        {!isLoading && grouped.length === 0 ? (
          <div className="rounded-3xl bg-surface-container-lowest p-12 text-center shadow-soft">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/40">quiz</span>
            <p className="font-headline text-base font-extrabold text-on-background mt-4">
              No assessments published yet
            </p>
            <p className="font-body text-sm text-on-surface-variant mt-1">
              Your trainers will publish questionnaires here.
            </p>
          </div>
        ) : null}

        {grouped.map(([groupSubject, items]) => (
          <section className="space-y-3" key={groupSubject}>
            <div className="flex items-center gap-3">
              <h2 className="font-headline text-lg font-extrabold text-on-background">
                {groupSubject}
              </h2>
              <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 font-headline text-xs font-bold text-on-surface-variant">
                {items.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((assessment) => {
                const deadline = formatDeadline(assessment.deadline)
                const exhausted =
                  assessment.maxAttempts > 0 && assessment.myAttempts >= assessment.maxAttempts
                const blocked = assessment.closed || assessment.notYetOpen || exhausted

                return (
                  <article
                    className="rounded-3xl bg-surface-container-lowest p-5 shadow-soft flex flex-col gap-3"
                    key={assessment.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-headline text-base font-extrabold text-on-background">
                        {assessment.title}
                      </h3>
                      {deadline ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-headline text-xs font-bold shrink-0 ${deadline.class}`}
                        >
                          {deadline.label}
                        </span>
                      ) : null}
                    </div>

                    {assessment.description ? (
                      <p className="font-body text-sm text-on-surface-variant line-clamp-2">
                        {assessment.description}
                      </p>
                    ) : null}

                    <p className="font-body text-xs text-on-surface-variant">
                      {assessment.questionCount} questions · pass mark {assessment.passPercentage}%
                      {assessment.maxAttempts > 0
                        ? ` · ${assessment.myAttempts}/${assessment.maxAttempts} attempts used`
                        : ''}
                      {assessment.createdByName ? ` · by ${assessment.createdByName}` : ''}
                    </p>

                    <div className="flex items-center justify-between gap-3 mt-auto pt-2">
                      {assessment.myBestPercentage !== null ? (
                        <span
                          className={`rounded-full px-3 py-1 font-headline text-xs font-bold ${
                            assessment.myPassed ? 'bg-mint text-on-mint' : 'bg-butter text-on-butter'
                          }`}
                        >
                          Best {assessment.myBestPercentage}%
                        </span>
                      ) : (
                        <span className="font-body text-xs text-on-surface-variant">Not attempted</span>
                      )}

                      <button
                        className="rounded-full px-5 py-2.5 bg-primary text-on-primary font-headline text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={blocked || assessment.questionCount === 0}
                        onClick={() => navigate(`/assessments/${assessment.id}`)}
                        title={
                          assessment.closed
                            ? 'The deadline has passed'
                            : assessment.notYetOpen
                              ? 'Not open yet'
                              : exhausted
                                ? 'No attempts remaining'
                                : undefined
                        }
                        type="button"
                      >
                        {assessment.myAttempts > 0 ? 'Retake' : 'Start'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}

export default AssessmentsPage
