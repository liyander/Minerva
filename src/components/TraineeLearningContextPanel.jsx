import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchMyLearningContext } from '../services/platform'

function TraineeLearningContextPanel() {
  const navigate = useNavigate()
  const [context, setContext] = useState({ cohorts: [], enrolments: [] })

  useEffect(() => {
    let cancelled = false
    fetchMyLearningContext()
      .then((response) => {
        if (!cancelled) {
          setContext({
            cohorts: Array.isArray(response?.cohorts) ? response.cohorts : [],
            enrolments: Array.isArray(response?.enrolments) ? response.enrolments : [],
          })
        }
      })
      .catch(() => {
        if (!cancelled) setContext({ cohorts: [], enrolments: [] })
      })
    return () => { cancelled = true }
  }, [])

  if (!context.cohorts.length && !context.enrolments.length) return null

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-3xl bg-surface-container-low p-5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">group_work</span>
          <h2 className="font-headline text-lg font-extrabold text-on-background">My cohorts</h2>
        </div>
        {context.cohorts.length ? (
          <div className="mt-3 space-y-2">
            {context.cohorts.map((cohort) => (
              <article className="rounded-2xl bg-surface-container-lowest p-4" key={cohort.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-headline text-sm font-extrabold text-on-surface">{cohort.name}</p>
                    <p className="mt-1 font-body text-xs text-on-surface-variant">
                      {[cohort.code, cohort.department].filter(Boolean).join(' · ') || 'Learning cohort'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 font-headline text-xs font-bold ${cohort.isActive ? 'bg-mint text-on-mint' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    {cohort.isActive ? 'Active' : 'Archived'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="mt-3 font-body text-sm text-on-surface-variant">You are not currently in a cohort.</p>}
      </div>

      <div className="rounded-3xl bg-surface-container-low p-5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">assignment_ind</span>
          <h2 className="font-headline text-lg font-extrabold text-on-background">Assigned learning</h2>
        </div>
        {context.enrolments.length ? (
          <div className="mt-3 space-y-2">
            {context.enrolments.slice(0, 5).map((enrolment) => (
              <button className="flex w-full items-center gap-3 rounded-2xl bg-surface-container-lowest p-4 text-left hover:bg-surface-container-high" key={enrolment.id} onClick={() => navigate(enrolment.link)} type="button">
                <span className="material-symbols-outlined text-primary">{enrolment.kind === 'course' ? 'school' : 'route'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-headline text-sm font-extrabold text-on-surface">{enrolment.title}</span>
                  <span className="mt-1 block font-body text-xs capitalize text-on-surface-variant">{enrolment.kind} · {enrolment.status}</span>
                </span>
                <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
              </button>
            ))}
          </div>
        ) : <p className="mt-3 font-body text-sm text-on-surface-variant">No courses or paths have been assigned yet.</p>}
      </div>
    </section>
  )
}

export default TraineeLearningContextPanel
