import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { fetchAssignments } from '../services/platform'

function deadlineTone(assignment) {
  if (!assignment.deadline) {
    return { label: 'No deadline', class: 'bg-surface-container-high text-on-surface-variant' }
  }

  const remaining = new Date(assignment.deadline).getTime() - Date.now()
  if (remaining < 0) {
    return {
      label: assignment.lateSubmission ? 'Late accepted' : 'Closed',
      class: assignment.lateSubmission ? 'bg-butter text-on-butter' : 'bg-blush text-on-blush',
    }
  }

  const days = Math.ceil(remaining / 86400000)
  if (days <= 1) return { label: 'Due today', class: 'bg-blush text-on-blush' }
  if (days <= 3) return { label: `${days} days left`, class: 'bg-butter text-on-butter' }
  return {
    label: `Due ${new Date(assignment.deadline).toLocaleDateString([], { day: 'numeric', month: 'short' })}`,
    class: 'bg-mint text-on-mint',
  }
}

function statusChip(submission) {
  if (!submission) {
    return { label: 'Not started', class: 'bg-surface-container-high text-on-surface-variant' }
  }
  if (submission.status === 'graded') {
    return {
      label: submission.passed ? `Passed · ${submission.score}` : `Marked · ${submission.score}`,
      class: submission.passed ? 'bg-mint text-on-mint' : 'bg-blush text-on-blush',
    }
  }
  return { label: 'Awaiting marking', class: 'bg-sky text-on-sky' }
}

function AssignmentsPage() {
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState([])
  const [subject, setSubject] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setAssignments(await fetchAssignments())
    } catch (loadError) {
      setError(loadError?.message || 'Could not load assignments.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const subjects = useMemo(
    () => [...new Set(assignments.map((item) => item.subject).filter(Boolean))].sort(),
    [assignments],
  )

  const visible = useMemo(
    () => (subject ? assignments.filter((item) => item.subject === subject) : assignments),
    [assignments, subject],
  )

  const stats = useMemo(() => {
    const submitted = assignments.filter((item) => item.mySubmission)
    const graded = submitted.filter((item) => item.mySubmission.status === 'graded')
    return {
      open: assignments.filter((item) => !item.mySubmission && !item.pastDeadline).length,
      submitted: submitted.length,
      passed: graded.filter((item) => item.mySubmission.passed).length,
    }
  }, [assignments])

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24 pb-24 md:pb-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          accent="butter"
          description="Practical work marked by your trainer against a rubric. Submit a file, some writing, or a link."
          eyebrow="Assignments"
          icon="assignment"
          title="Your assignments"
        />

        <section className="grid grid-cols-3 gap-4">
          {[
            { label: 'Open', value: stats.open, accent: 'bg-sky text-on-sky' },
            { label: 'Submitted', value: stats.submitted, accent: 'bg-lavender text-on-lavender' },
            { label: 'Passed', value: stats.passed, accent: 'bg-mint text-on-mint' },
          ].map((tile) => (
            <div className={`rounded-2xl px-5 py-4 ${tile.accent}`} key={tile.label}>
              <p className="font-headline text-3xl font-extrabold leading-none">{tile.value}</p>
              <p className="font-body text-xs opacity-80 mt-2">{tile.label}</p>
            </div>
          ))}
        </section>

        {subjects.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-full px-4 py-2 font-headline text-sm font-bold transition-colors ${
                subject === ''
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant'
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
                    : 'bg-surface-container-lowest text-on-surface-variant'
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

        {!isLoading && visible.length === 0 ? (
          <div className="rounded-3xl bg-surface-container-lowest p-12 text-center shadow-soft">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/40">
              assignment
            </span>
            <p className="font-headline text-base font-extrabold text-on-background mt-4">
              No assignments yet
            </p>
            <p className="font-body text-sm text-on-surface-variant mt-1">
              Your trainers will publish practical work here.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map((assignment) => {
            const tone = deadlineTone(assignment)
            const chip = statusChip(assignment.mySubmission)
            const locked = assignment.notYetOpen || (assignment.pastDeadline && !assignment.lateSubmission)

            return (
              <article
                className="rounded-3xl bg-surface-container-lowest p-5 shadow-soft flex flex-col gap-3"
                key={assignment.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-headline text-base font-extrabold text-on-background">
                    {assignment.title}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-headline text-xs font-bold shrink-0 ${tone.class}`}
                  >
                    {tone.label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-secondary-container text-on-secondary-container px-2.5 py-0.5 font-headline text-xs font-bold">
                    {assignment.subject}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 font-headline text-xs font-bold ${chip.class}`}>
                    {chip.label}
                  </span>
                </div>

                {assignment.brief ? (
                  <p className="font-body text-sm text-on-surface-variant line-clamp-2">
                    {assignment.brief}
                  </p>
                ) : null}

                <p className="font-body text-xs text-on-surface-variant">
                  Out of {assignment.maxScore} · pass mark {assignment.passScore}
                  {assignment.createdByName ? ` · set by ${assignment.createdByName}` : ''}
                </p>

                <div className="flex items-center justify-end mt-auto pt-2">
                  <button
                    className="rounded-full px-5 py-2.5 bg-primary text-on-primary font-headline text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={locked}
                    onClick={() => navigate(`/assignments/${assignment.id}`)}
                    title={
                      assignment.notYetOpen
                        ? 'Not open yet'
                        : locked
                          ? 'The deadline has passed'
                          : undefined
                    }
                    type="button"
                  >
                    {assignment.mySubmission ? 'View' : 'Open'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </main>
  )
}

export default AssignmentsPage
