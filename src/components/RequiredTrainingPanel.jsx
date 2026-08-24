import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchMyRequirements } from '../services/platform'

const TONE = {
  overdue: { card: 'bg-blush text-on-blush', label: 'Overdue' },
  pending: { card: 'bg-butter text-on-butter', label: 'Due' },
  complete: { card: 'bg-mint text-on-mint', label: 'Complete' },
}

/** Mandatory training assigned to the signed-in trainee. Hidden when there is none. */
function RequiredTrainingPanel() {
  const navigate = useNavigate()
  const [requirements, setRequirements] = useState([])

  useEffect(() => {
    fetchMyRequirements()
      .then(setRequirements)
      .catch(() => setRequirements([]))
  }, [])

  const outstanding = requirements.filter((row) => row.status !== 'complete')
  if (!requirements.length) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="font-headline text-lg font-extrabold text-on-background">Required training</h2>
        {outstanding.length ? (
          <span className="rounded-full bg-blush px-2.5 py-0.5 font-headline text-xs font-bold text-on-blush">
            {outstanding.length} outstanding
          </span>
        ) : (
          <span className="rounded-full bg-mint px-2.5 py-0.5 font-headline text-xs font-bold text-on-mint">
            All done
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[...requirements]
          .sort((a, b) => {
            const rank = { overdue: 0, pending: 1, complete: 2 }
            return rank[a.status] - rank[b.status]
          })
          .slice(0, 4)
          .map((requirement) => {
            const tone = TONE[requirement.status] || TONE.pending

            return (
              <article className={`rounded-3xl p-5 ${tone.card}`} key={requirement.id}>
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-lowest/60 px-2.5 py-0.5 font-headline text-xs font-bold">
                    <span className="material-symbols-outlined text-sm">
                      {requirement.status === 'complete' ? 'task_alt' : 'schedule'}
                    </span>
                    {tone.label}
                  </span>
                  {requirement.dueOn ? (
                    <span className="font-body text-xs opacity-80 shrink-0">
                      {new Date(requirement.dueOn).toLocaleDateString([], {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  ) : null}
                </div>

                <h3 className="font-headline text-base font-extrabold mt-2">{requirement.title}</h3>
                {requirement.target ? (
                  <p className="font-body text-xs opacity-80 mt-1">{requirement.target}</p>
                ) : null}

                {requirement.status !== 'complete' && requirement.link ? (
                  <button
                    className="mt-3 inline-flex items-center gap-1 font-headline text-xs font-bold hover:underline"
                    onClick={() => navigate(requirement.link)}
                    type="button"
                  >
                    Start now
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                ) : null}
              </article>
            )
          })}
      </div>
    </section>
  )
}

export default RequiredTrainingPanel
