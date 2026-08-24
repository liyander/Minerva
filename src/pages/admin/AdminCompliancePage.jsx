import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { fetchAssessments } from '../../services/training'
import {
  createRequirement,
  deleteRequirement,
  fetchCohorts,
  fetchComplianceReport,
  fetchRequirements,
  updateRequirement,
} from '../../services/platform'
import { apiFetch } from '../../services/api'

const STATUS_TONE = {
  complete: 'bg-mint text-on-mint',
  pending: 'bg-butter text-on-butter',
  upcoming: 'bg-sky text-on-sky',
  overdue: 'bg-blush text-on-blush',
}

function AdminCompliancePage() {
  const navigate = useNavigate()
  const [requirements, setRequirements] = useState([])
  const [report, setReport] = useState([])
  const [cohorts, setCohorts] = useState([])
  const [courses, setCourses] = useState([])
  const [paths, setPaths] = useState([])
  const [assessments, setAssessments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [form, setForm] = useState({
    title: '',
    description: '',
    target: '',
    audience: '',
    dueOn: '',
  })

  const load = useCallback(async () => {
    setError('')
    try {
      const [requirementRows, reportRows, cohortRows, courseRows, pathRows, assessmentRows] =
        await Promise.all([
          fetchRequirements(),
          fetchComplianceReport(),
          fetchCohorts().catch(() => []),
          apiFetch('/rooms').catch(() => []),
          apiFetch('/career-paths').catch(() => []),
          fetchAssessments({ mine: 'false' }).catch(() => []),
        ])

      setRequirements(requirementRows)
      setReport(reportRows)
      setCohorts(cohortRows)
      setCourses(Array.isArray(courseRows) ? courseRows : [])
      setPaths(Array.isArray(pathRows) ? pathRows : [])
      setAssessments(Array.isArray(assessmentRows) ? assessmentRows : [])
    } catch (loadError) {
      setError(loadError?.message || 'Could not load compliance data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const overall = useMemo(() => {
    if (!report.length) return { audience: 0, complete: 0, overdue: 0, compliance: 0 }

    const audience = report.reduce((sum, row) => sum + row.summary.audience, 0)
    const complete = report.reduce((sum, row) => sum + row.summary.complete, 0)
    const overdue = report.reduce((sum, row) => sum + row.summary.overdue, 0)

    return {
      audience,
      complete,
      overdue,
      compliance: audience ? Math.round((complete / audience) * 100) : 0,
    }
  }, [report])

  const create = async (event) => {
    event.preventDefault()

    if (!form.title.trim()) {
      setError('Give the requirement a title.')
      return
    }
    if (!form.target) {
      setError('Choose what has to be completed.')
      return
    }
    if (!form.audience) {
      setError('Choose who it applies to.')
      return
    }

    const [targetKind, targetId] = form.target.split(':')
    const [audienceKind, audienceId] = form.audience.split(':')

    setBusy(true)
    setError('')

    try {
      await createRequirement({
        title: form.title,
        description: form.description || undefined,
        roomId: targetKind === 'course' ? targetId : undefined,
        careerPathId: targetKind === 'path' ? targetId : undefined,
        assessmentId: targetKind === 'assessment' ? targetId : undefined,
        cohortId: audienceKind === 'cohort' ? audienceId : undefined,
        department: audienceKind === 'department' ? audienceId : undefined,
        appliesToAll: audienceKind === 'all',
        dueOn: form.dueOn || undefined,
      })

      setForm({ title: '', description: '', target: '', audience: '', dueOn: '' })
      setShowCreate(false)
      setNotice('Requirement created.')
      await load()
    } catch (createError) {
      setError(createError?.message || 'Could not create the requirement.')
    } finally {
      setBusy(false)
    }
  }

  const departments = useMemo(
    () => [...new Set(cohorts.map((cohort) => cohort.department).filter(Boolean))].sort(),
    [cohorts],
  )

  const visibleRequirements = useMemo(() => {
    const query = search.trim().toLowerCase()
    return requirements.filter((requirement) => {
      const reportRow = report.find((row) => Number(row.requirement.id) === Number(requirement.id))
      const matchesSearch = !query || [requirement.title, requirement.target, requirement.cohortName, requirement.department]
        .some((value) => String(value || '').toLowerCase().includes(query))
      const matchesStatus = statusFilter === 'all' || Number(reportRow?.summary?.[statusFilter] || 0) > 0
      return matchesSearch && matchesStatus
    })
  }, [requirements, report, search, statusFilter])

  const fieldClass =
    'w-full rounded-xl bg-surface-container border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none'
  const pill = 'rounded-full px-5 py-2.5 font-headline text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-60'

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
          accent="blush"
          description="Assign mandatory training with due dates, then track who has completed it and who is overdue."
          eyebrow="Compliance"
          icon="fact_check"
          title="Mandatory training"
        />

        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-2xl bg-mint p-4 flex items-center justify-between gap-3">
            <p className="font-body text-sm text-on-mint">{notice}</p>
            <button
              className="font-headline text-xs font-bold text-on-mint"
              onClick={() => setNotice('')}
              type="button"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Requirements', value: requirements.length, accent: 'bg-sky text-on-sky' },
            { label: 'People covered', value: overall.audience, accent: 'bg-lavender text-on-lavender' },
            { label: 'Overdue', value: overall.overdue, accent: 'bg-blush text-on-blush' },
            { label: 'Compliance', value: `${overall.compliance}%`, accent: 'bg-mint text-on-mint' },
          ].map((tile) => (
            <div className={`rounded-2xl px-5 py-4 ${tile.accent}`} key={tile.label}>
              <p className="font-headline text-2xl font-extrabold leading-none">{tile.value}</p>
              <p className="font-body text-xs opacity-80 mt-2">{tile.label}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-headline text-lg font-extrabold text-on-background">Requirements</h2>
            <button
              className={`${pill} bg-primary text-on-primary`}
              onClick={() => setShowCreate((value) => !value)}
              type="button"
            >
              {showCreate ? 'Cancel' : 'New requirement'}
            </button>
          </div>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
            <input className={fieldClass} onChange={(event) => setSearch(event.target.value)} placeholder="Search requirement, cohort or department" value={search} />
            <select className={fieldClass} onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="all">All statuses</option>
              <option value="complete">Has completed</option>
              <option value="upcoming">Has upcoming</option>
              <option value="pending">Has pending</option>
              <option value="overdue">Has overdue</option>
            </select>
          </div>

          {showCreate ? (
            <form className="rounded-2xl bg-surface-container p-5 mb-5 space-y-4" onSubmit={create}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">Title</span>
                  <input
                    className={`${fieldClass} mt-1.5`}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Annual data handling refresher"
                    value={form.title}
                  />
                </label>
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    Due date
                  </span>
                  <input
                    className={`${fieldClass} mt-1.5`}
                    onChange={(e) => setForm((f) => ({ ...f, dueOn: e.target.value }))}
                    type="date"
                    value={form.dueOn}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    What must be completed
                  </span>
                  <select
                    className={`${fieldClass} mt-1.5`}
                    onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                    value={form.target}
                  >
                    <option value="">Choose…</option>
                    {paths.length ? (
                      <optgroup label="Learning paths">
                        {paths.map((path) => (
                          <option key={path.id} value={`path:${path.id}`}>
                            {path.title}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {courses.length ? (
                      <optgroup label="Courses">
                        {courses.map((course) => (
                          <option key={course.id} value={`course:${course.id}`}>
                            {course.title}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {assessments.length ? (
                      <optgroup label="Assessments">
                        {assessments.map((assessment) => (
                          <option key={assessment.id} value={`assessment:${assessment.id}`}>
                            {assessment.title}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </label>

                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    Who it applies to
                  </span>
                  <select
                    className={`${fieldClass} mt-1.5`}
                    onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
                    value={form.audience}
                  >
                    <option value="">Choose…</option>
                    <option value="all:all">Every trainee</option>
                    {cohorts.length ? (
                      <optgroup label="Cohorts">
                        {cohorts.map((cohort) => (
                          <option key={cohort.id} value={`cohort:${cohort.id}`}>
                            {cohort.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {departments.length ? (
                      <optgroup label="Departments">
                        {departments.map((department) => (
                          <option key={department} value={`department:${department}`}>
                            {department}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">
                  Why it matters (optional)
                </span>
                <textarea
                  className={`${fieldClass} mt-1.5`}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  value={form.description}
                />
              </label>

              <button className={`${pill} bg-primary text-on-primary`} disabled={busy} type="submit">
                {busy ? 'Creating…' : 'Create requirement'}
              </button>
            </form>
          ) : null}

          {isLoading ? (
            <div className="py-8 text-center">
              <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            </div>
          ) : requirements.length === 0 ? (
            <p className="font-body text-sm text-on-surface-variant py-6 text-center">
              No mandatory training defined yet.
            </p>
          ) : (
            <div className="space-y-2">
              {visibleRequirements.map((requirement) => {
                const reportRow = report.find(
                  (row) => Number(row.requirement.id) === Number(requirement.id),
                )
                const summary = reportRow?.summary

                return (
                  <article className="rounded-2xl bg-surface-container p-4" key={requirement.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-headline text-sm font-extrabold text-on-background">
                            {requirement.title}
                          </h3>
                          <span className="rounded-full bg-secondary-container text-on-secondary-container px-2.5 py-0.5 font-headline text-xs font-bold">
                            {requirement.targetKind}
                          </span>
                          {!requirement.isActive ? (
                            <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 font-headline text-xs font-bold text-on-surface-variant">
                              Paused
                            </span>
                          ) : null}
                        </div>
                        <p className="font-body text-xs text-on-surface-variant mt-1">
                          {requirement.target} ·{' '}
                          {requirement.appliesToAll
                            ? 'everyone'
                            : requirement.cohortName || requirement.department || 'unscoped'}
                          {requirement.dueOn
                            ? ` · due ${new Date(requirement.dueOn).toLocaleDateString()}`
                            : ' · no due date'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {summary ? (
                          <span
                            className={`rounded-full px-3 py-1 font-headline text-xs font-bold ${
                              summary.compliance >= 80
                                ? 'bg-mint text-on-mint'
                                : summary.overdue
                                  ? 'bg-blush text-on-blush'
                                  : 'bg-butter text-on-butter'
                            }`}
                          >
                            {summary.compliance}% · {summary.complete}/{summary.audience}
                          </span>
                        ) : null}
                        <button
                          className="rounded-full bg-surface-container-high px-3 py-1.5 font-headline text-xs font-bold text-on-surface"
                          onClick={() =>
                            setExpanded(expanded === requirement.id ? null : requirement.id)
                          }
                          type="button"
                        >
                          {expanded === requirement.id ? 'Hide' : 'Who'}
                        </button>
                        <button
                          className="rounded-full bg-surface-container-high px-3 py-1.5 font-headline text-xs font-bold text-on-surface"
                          onClick={async () => {
                            await updateRequirement(requirement.id, {
                              isActive: !requirement.isActive,
                            })
                            await load()
                          }}
                          type="button"
                        >
                          {requirement.isActive ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          aria-label={`Delete ${requirement.title}`}
                          className="text-on-surface-variant hover:text-error transition-colors"
                          onClick={async () => {
                            if (!window.confirm(`Delete "${requirement.title}"?`)) return
                            await deleteRequirement(requirement.id)
                            await load()
                          }}
                          type="button"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    </div>

                    {expanded === requirement.id && reportRow ? (
                      <div className="mt-4 border-t border-outline-variant pt-4">
                        <div className="flex flex-wrap gap-3 mb-3">
                          {['complete', 'upcoming', 'pending', 'overdue'].map((status) => (
                            <span
                              className={`rounded-full px-3 py-1 font-headline text-xs font-bold ${STATUS_TONE[status]}`}
                              key={status}
                            >
                              {reportRow.summary[status]} {status}
                            </span>
                          ))}
                        </div>

                        <div className="max-h-72 overflow-y-auto space-y-1">
                          {reportRow.people.map((person) => (
                            <div
                              className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-lowest px-4 py-2"
                              key={person.id}
                            >
                              <div className="min-w-0">
                                <p className="font-headline text-sm font-bold text-on-surface truncate">
                                  {person.name}
                                </p>
                                <p className="font-body text-xs text-on-surface-variant truncate">
                                  {person.email}
                                  {person.department ? ` · ${person.department}` : ''}
                                </p>
                              </div>
                              <span
                                className={`rounded-full px-2.5 py-0.5 font-headline text-xs font-bold shrink-0 ${STATUS_TONE[person.status]}`}
                              >
                                {person.status}
                              </span>
                            </div>
                          ))}
                          {reportRow.people.length === 0 ? (
                            <p className="font-body text-sm text-on-surface-variant py-3 text-center">
                              Nobody matches this requirement&rsquo;s audience yet.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default AdminCompliancePage
