import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { fetchAdminDashboard, fetchParticipation } from '../../services/training'

function StatCard({ accent, label, value, sublabel, icon }) {
  return (
    <div className={`rounded-3xl px-5 py-5 ${accent}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-headline text-3xl font-extrabold leading-none">{value}</p>
        {icon ? <span className="material-symbols-outlined opacity-70">{icon}</span> : null}
      </div>
      <p className="font-headline text-sm font-bold mt-3">{label}</p>
      {sublabel ? <p className="font-body text-xs opacity-75 mt-0.5">{sublabel}</p> : null}
    </div>
  )
}

// A tiny inline bar chart avoids pulling in a charting dependency.
function Sparkbars({ data, label }) {
  const max = Math.max(1, ...data.map((point) => point.value))

  if (!data.length) {
    return (
      <p className="font-body text-sm text-on-surface-variant py-6 text-center">
        No activity recorded in this period.
      </p>
    )
  }

  return (
    <div>
      <div className="flex items-end gap-1 h-32" role="img" aria-label={label}>
        {data.map((point) => (
          <div className="flex-1 flex flex-col justify-end h-full" key={point.key} title={`${point.key}: ${point.value}`}>
            <div
              className="w-full rounded-t-md bg-primary transition-[height] duration-500"
              style={{ height: `${Math.max((point.value / max) * 100, 3)}%` }}
            ></div>
          </div>
        ))}
      </div>
      <div className="flex justify-between font-body text-[11px] text-on-surface-variant mt-2">
        <span>{data[0]?.key}</span>
        <span>{data[data.length - 1]?.key}</span>
      </div>
    </div>
  )
}

function AdminInsightsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [participation, setParticipation] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([fetchAdminDashboard(), fetchParticipation().catch(() => [])])
      .then(([dashboard, people]) => {
        setData(dashboard)
        setParticipation(people)
      })
      .catch((loadError) => setError(loadError?.message || 'Could not load the dashboard.'))
      .finally(() => setIsLoading(false))
  }, [])

  const chartData = useMemo(
    () =>
      (data?.participation || []).map((point) => ({
        key: new Date(point.day).toLocaleDateString([], { day: 'numeric', month: 'short' }),
        value: point.attempts,
      })),
    [data],
  )

  if (isLoading) {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center pt-24">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      </main>
    )
  }

  const passRate = data?.assessments?.attempts
    ? Math.round((data.assessments.passed / data.assessments.attempts) * 100)
    : 0

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24">
      <div className="mx-auto max-w-6xl space-y-6">
        <button
          className="inline-flex items-center gap-1 font-headline text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={() => navigate('/admin')}
          type="button"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to admin
        </button>

        <PageHeader
          accent="sky"
          description="Courses, enrolments, certifications, assessments and participation at a glance."
          eyebrow="Insights"
          icon="monitoring"
          title="Platform dashboard"
        />

        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            accent="bg-mint text-on-mint"
            icon="group"
            label="People"
            sublabel={`${data.users.trainees} trainees · ${data.users.trainers} trainers`}
            value={data.users.total}
          />
          <StatCard
            accent="bg-sky text-on-sky"
            icon="school"
            label="Courses"
            sublabel={`${data.enrolments.total} enrolments`}
            value={data.courses.total}
          />
          <StatCard
            accent="bg-lavender text-on-lavender"
            icon="quiz"
            label="Assessments"
            sublabel={`${data.assessments.attempts} attempts · ${passRate}% pass`}
            value={data.assessments.total}
          />
          <StatCard
            accent="bg-butter text-on-butter"
            icon="workspace_premium"
            label="Certificates"
            sublabel={`${data.library.published} library items`}
            value={data.certifications.total}
          />
        </section>

        {data.users.pending > 0 ? (
          <button
            className="w-full rounded-3xl bg-blush p-5 text-left hover:opacity-90 transition-opacity"
            onClick={() => navigate('/admin/users')}
            type="button"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-headline text-base font-extrabold text-on-blush">
                  {data.users.pending} account
                  {data.users.pending === 1 ? '' : 's'} awaiting approval
                </p>
                <p className="font-body text-sm text-on-blush/80 mt-1">
                  Review and approve them so they can sign in.
                </p>
              </div>
              <span className="material-symbols-outlined text-on-blush">arrow_forward</span>
            </div>
          </button>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
            <h2 className="font-headline text-lg font-extrabold text-on-background mb-1">
              Assessment activity
            </h2>
            <p className="font-body text-xs text-on-surface-variant mb-4">Last 30 days</p>
            <Sparkbars data={chartData} label="Assessment attempts over the last 30 days" />
          </section>

          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
            <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">
              Assessment health
            </h2>
            <div className="space-y-4">
              {[
                { label: 'Average score', value: data.assessments.averageScore, suffix: '%' },
                { label: 'Pass rate', value: passRate, suffix: '%' },
                {
                  label: 'Published share',
                  value: data.assessments.total
                    ? Math.round((data.assessments.published / data.assessments.total) * 100)
                    : 0,
                  suffix: '%',
                },
                {
                  label: 'Course rating',
                  value: data.feedback.average ? Math.round((data.feedback.average / 5) * 100) : 0,
                  suffix: '%',
                  note: data.feedback.average
                    ? `${data.feedback.average}/5 from ${data.feedback.total} reviews`
                    : 'No feedback yet',
                },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-baseline justify-between font-body text-sm mb-1.5">
                    <span className="text-on-surface">{row.label}</span>
                    <span className="font-headline font-bold text-on-background">
                      {row.value}
                      {row.suffix}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-container-high overflow-hidden">
                    <div
                      className="h-full rounded-full bg-secondary transition-[width] duration-700"
                      style={{ width: `${Math.max(row.value, 2)}%` }}
                    ></div>
                  </div>
                  {row.note ? (
                    <p className="font-body text-xs text-on-surface-variant mt-1">{row.note}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
            <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">
              Most enrolled courses
            </h2>
            {data.topCourses.length === 0 ? (
              <p className="font-body text-sm text-on-surface-variant py-4">No courses yet.</p>
            ) : (
              <div className="space-y-2">
                {data.topCourses.map((course) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container px-4 py-3"
                    key={course.id}
                  >
                    <div className="min-w-0">
                      <p className="font-headline text-sm font-bold text-on-surface truncate">
                        {course.title}
                      </p>
                      <p className="font-body text-xs text-on-surface-variant">{course.category}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-headline text-sm font-extrabold text-on-background">
                        {course.enrolments}
                      </p>
                      {course.rating ? (
                        <p className="font-body text-xs text-on-surface-variant">★ {course.rating}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
            <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">
              Assessments by subject
            </h2>
            {data.subjects.length === 0 ? (
              <p className="font-body text-sm text-on-surface-variant py-4">
                No assessments created yet.
              </p>
            ) : (
              <div className="space-y-2">
                {data.subjects.map((subject) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container px-4 py-3"
                    key={subject.subject}
                  >
                    <p className="font-headline text-sm font-bold text-on-surface truncate">
                      {subject.subject}
                    </p>
                    <p className="font-body text-xs text-on-surface-variant shrink-0">
                      {subject.assessments} sets · {subject.attempts} attempts
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">
            Most engaged trainees
          </h2>
          {participation.length === 0 ? (
            <p className="font-body text-sm text-on-surface-variant py-4">No activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem]">
                <thead>
                  <tr className="text-left">
                    {['Trainee', 'Enrolments', 'Attempts', 'Avg score', 'Certificates'].map((head) => (
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
                  {participation.slice(0, 10).map((person) => (
                    <tr className="border-t border-outline-variant" key={person.id}>
                      <td className="py-3 px-3">
                        <p className="font-headline text-sm font-bold text-on-surface">
                          {person.name}
                        </p>
                        <p className="font-body text-xs text-on-surface-variant">{person.email}</p>
                      </td>
                      <td className="py-3 px-3 font-body text-sm text-on-surface">
                        {person.enrolments}
                      </td>
                      <td className="py-3 px-3 font-body text-sm text-on-surface">
                        {person.attempts}
                      </td>
                      <td className="py-3 px-3 font-body text-sm text-on-surface">
                        {person.averageScore === null ? '—' : `${person.averageScore}%`}
                      </td>
                      <td className="py-3 px-3 font-body text-sm text-on-surface">
                        {person.certificates}
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

export default AdminInsightsPage
