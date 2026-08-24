import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../services/api'

function probabilityClass(label) {
  if (label === 'High') return 'text-secondary border-secondary bg-secondary/10'
  if (label === 'Medium') return 'text-primary border-primary bg-primary/10'
  return 'text-on-surface-variant border-outline-variant bg-surface-container-high'
}

function formatDate(value) {
  if (!value) return 'Not analyzed yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently analyzed'
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function jobIdentity(item) {
  const primary = [
    item.job?.company,
    item.job?.title,
    item.job?.location,
  ]
    .map((value) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('|')
  return primary || String(item.jobId || item.id)
}

function OpportunitiesPage() {
  const [recommendations, setRecommendations] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [expandedJobId, setExpandedJobId] = useState(null)
  const [applyingRecommendationId, setApplyingRecommendationId] = useState(null)

  const uniqueRecommendations = useMemo(() => {
    const byJob = new Map()
    for (const item of recommendations) {
      const key = jobIdentity(item)
      const current = byJob.get(key)
      if (!current || Number(item.matchScore || 0) > Number(current.matchScore || 0)) {
        byJob.set(key, item)
      }
    }
    return Array.from(byJob.values()).sort((a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0))
  }, [recommendations])

  const highMatches = useMemo(
    () => uniqueRecommendations.filter((item) => item.probabilityLabel === 'High').length,
    [uniqueRecommendations],
  )
  const averageScore = useMemo(() => {
    if (!uniqueRecommendations.length) return 0
    return Math.round(
      uniqueRecommendations.reduce((sum, item) => sum + Number(item.matchScore || 0), 0) /
        uniqueRecommendations.length,
    )
  }, [uniqueRecommendations])

  const loadRecommendations = async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await apiFetch('/jobs/recommendations/me')
      setRecommendations(Array.isArray(response) ? response : [])
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load job recommendations.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadRecommendations()
  }, [])

  const refreshRecommendations = async () => {
    setIsRefreshing(true)
    setMessage('')
    setError('')
    try {
      const refreshed = await apiFetch('/jobs/recommendations/refresh', { method: 'POST' })
      setRecommendations(Array.isArray(refreshed) ? refreshed : [])
      setMessage('Recommendations refreshed from saved settings and completed skills.')
    } catch (refreshError) {
      setError(refreshError?.message || 'Unable to refresh recommendations.')
    } finally {
      setIsRefreshing(false)
    }
  }

  const applyForJob = async (item) => {
    if (!item?.job?.applyUrl) {
      return
    }

    setApplyingRecommendationId(item.id)
    setError('')
    setMessage('')

    try {
      const response = await apiFetch('/jobs/applications', {
        method: 'POST',
        body: JSON.stringify({
          recommendationId: item.id,
          jobId: item.jobId,
        }),
      })

      setRecommendations((current) =>
        current.map((recommendation) =>
          recommendation.id === item.id
            ? {
                ...recommendation,
                application: {
                  ...(recommendation.application || {}),
                  status: response?.status || 'applied',
                  updatedAt: new Date().toISOString(),
                },
              }
            : recommendation,
        ),
      )
      setMessage('Application tracked for admin review.')
      window.open(response?.applyUrl || item.job.applyUrl, '_blank', 'noopener,noreferrer')
    } catch (applyError) {
      setError(applyError?.message || 'Unable to track application.')
    } finally {
      setApplyingRecommendationId(null)
    }
  }

  return (
    <main className="min-h-screen bg-surface pt-24 px-6 lg:px-10 pb-12">
      <section className="max-w-7xl mx-auto space-y-8">
        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10">
          <p className="font-headline text-xs text-secondary font-bold">
            Matched to your profile
          </p>
          <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight">
                Job Updates
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-on-surface-variant">
                Jobs are matched against your saved settings, completed skills, projects, achievements, certificates, internships, tools, and evidence. Update your evidence in Settings, then refresh this feed.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:min-w-80">
              <div className="rounded-2xl bg-surface-container-high p-4">
                <p className="font-headline text-xs text-on-surface-variant font-bold">
                  High Matches
                </p>
                <p className="mt-1 font-headline text-3xl font-extrabold text-secondary">{highMatches}</p>
              </div>
              <div className="rounded-2xl bg-surface-container-high p-4">
                <p className="font-headline text-xs text-on-surface-variant font-bold">
                  Avg Fit
                </p>
                <p className="mt-1 font-headline text-3xl font-extrabold text-primary">{averageScore}%</p>
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-primary px-5 py-3 font-headline text-sm font-bold text-on-primary"
              to="/settings"
            >
              Update Student Settings
            </Link>
            <button
              className="rounded-xl bg-surface-container-high px-5 py-3 font-headline text-xs font-bold text-on-surface disabled:opacity-60"
              disabled={isRefreshing}
              onClick={refreshRecommendations}
              type="button"
            >
              {isRefreshing ? 'Analyzing...' : 'Refresh Matches'}
            </button>
          </div>
        </header>

        {message ? (
          <p className="rounded-xl shadow-soft bg-secondary/10 px-4 py-3 text-sm text-secondary">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl shadow-soft bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </p>
        ) : null}

        <section className="space-y-5">
          {isLoading ? (
            <div className="rounded-2xl bg-surface-container-lowest p-8 text-sm text-on-surface-variant">
              Analyzing jobs against your current evidence...
            </div>
          ) : uniqueRecommendations.length ? (
            uniqueRecommendations.map((item) => {
              const expanded = expandedJobId === item.id
              return (
                <article
                  className="rounded-2xl bg-surface-container-lowest border border-outline-variant/40 shadow-soft p-5 md:p-6"
                  key={item.id}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-1 font-headline text-xs font-bold ${probabilityClass(item.probabilityLabel)}`}>
                          {item.probabilityLabel} Fit
                        </span>
                        <span className="rounded-full bg-surface-container-high px-2 py-1 font-headline text-xs font-bold text-on-surface-variant">
                          {item.job?.category}
                        </span>
                        <span className="text-xs text-on-surface-variant">
                          {formatDate(item.updatedAt)}
                        </span>
                        {item.application ? (
                          <span className="rounded-lg border border-secondary bg-secondary/10 px-2 py-1 font-headline text-sm font-bold text-secondary">
                            {item.application.status}
                          </span>
                        ) : null}
                      </div>
                      <h2 className="mt-3 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                        {item.job?.title}
                      </h2>
                      <p className="mt-1 text-sm text-on-surface-variant">
                        {item.job?.company} · {item.job?.location} · {item.job?.salary}
                      </p>
                    </div>
                    <div className="shrink-0 text-left lg:text-right">
                      <p className="font-headline text-4xl font-extrabold text-secondary">{item.matchScore}%</p>
                      <p className="font-headline text-xs text-on-surface-variant">
                        Match Probability
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-on-surface">
                    {item.aiAnalysis}
                  </p>

                  <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-surface-container-high p-4">
                      <p className="font-headline text-xs text-secondary font-bold">
                        Skills You Match
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(item.matchedSkills || []).length ? (
                          item.matchedSkills.map((skill) => (
                            <span className="rounded-lg bg-secondary/10 px-2 py-1 text-xs text-secondary" key={skill}>
                              {skill}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-on-surface-variant">No direct skill match yet.</span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-surface-container-high p-4">
                      <p className="font-headline text-xs text-primary font-bold">
                        Skills To Improve
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(item.missingSkills || []).slice(0, 8).map((skill) => (
                          <span className="rounded-lg bg-primary/10 px-2 py-1 text-xs text-primary" key={skill}>
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-outline-variant/40 pt-5">
                      <div>
                        <p className="font-headline text-xs text-on-surface-variant font-bold">
                          Requirements
                        </p>
                        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
                          {(item.job?.requirements || []).map((requirement) => (
                            <li key={requirement}>{requirement}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-headline text-xs text-on-surface-variant font-bold">
                          Responsibilities
                        </p>
                        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
                          {(item.job?.responsibilities || []).map((responsibility) => (
                            <li key={responsibility}>{responsibility}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-2xl lg:col-span-2 bg-surface-container-high p-4">
                        <p className="font-headline text-xs text-on-surface-variant font-bold">
                          Role Detail
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                          {item.job?.aboutRole}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <button
                      className="rounded-lg bg-surface-container-high px-4 py-2 font-headline text-xs font-bold text-on-surface hover:bg-surface-container-highest"
                      onClick={() => setExpandedJobId(expanded ? null : item.id)}
                      type="button"
                    >
                      {expanded ? 'Hide Details' : 'View Full Job'}
                    </button>
                    {item.job?.applyUrl ? (
                      <button
                        className="rounded-full bg-secondary px-4 py-2 font-headline text-sm font-bold text-on-secondary disabled:opacity-60"
                        disabled={applyingRecommendationId === item.id}
                        onClick={() => applyForJob(item)}
                        type="button"
                      >
                        {applyingRecommendationId === item.id
                          ? 'Tracking...'
                          : item.application
                            ? 'Open Again'
                            : 'Apply & Track'}
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })
          ) : (
            <div className="rounded-2xl bg-surface-container-lowest p-8 text-sm text-on-surface-variant">
              No high-probability jobs yet. Update your student settings with skills, stack, internships, projects, and certifications, then refresh matches.
            </div>
          )}
        </section>
      </section>
    </main>
  )
}

export default OpportunitiesPage
