import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../services/api'

function studentLabel(item) {
  return item.registrationNumber || item.username || item.email || `User ${item.userId}`
}

function jobIdentity(item) {
  const primary = [item.job?.company, item.job?.title, item.job?.location]
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

function uniqueValues(values, limit = 10) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit)
}

function AdminJobRecommendationsPage() {
  const navigate = useNavigate()
  const [recommendations, setRecommendations] = useState([])
  const [applications, setApplications] = useState([])
  const [scrapedJobStatus, setScrapedJobStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSyncingScrapedJobs, setIsSyncingScrapedJobs] = useState(false)
  const [isAddingJob, setIsAddingJob] = useState(false)
  const [updatingApplicationId, setUpdatingApplicationId] = useState(null)
  const [expandedJobKey, setExpandedJobKey] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [jobMarkdown, setJobMarkdown] = useState('')

  const loadRecommendations = async () => {
    setIsLoading(true)
    setError('')
    try {
      const [response, applicationResponse, scrapedStatusResponse] = await Promise.all([
        apiFetch('/jobs/admin/recommendations'),
        apiFetch('/jobs/admin/applications'),
        apiFetch('/jobs/admin/scraped-jobs/status').catch(() => null),
      ])
      setRecommendations(Array.isArray(response) ? response : [])
      setApplications(Array.isArray(applicationResponse) ? applicationResponse : [])
      setScrapedJobStatus(scrapedStatusResponse)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load job recommendations.')
      setRecommendations([])
      setApplications([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadRecommendations()
  }, [])

  const filteredRecommendations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return recommendations
    return recommendations.filter((item) =>
      [
        item.username,
        item.registrationNumber,
        item.email,
        item.job?.title,
        item.job?.company,
        item.job?.category,
        ...(item.matchedSkills || []),
        ...(item.missingSkills || []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [recommendations, searchQuery])

  const groupedRecommendations = useMemo(() => {
    const groups = new Map()
    for (const item of filteredRecommendations) {
      const key = jobIdentity(item)
      const group = groups.get(key) || {
        key,
        jobId: item.jobId,
        job: item.job,
        profiles: [],
      }
      group.profiles.push(item)
      groups.set(key, group)
    }

    return Array.from(groups.values())
      .map((group) => {
        const profiles = [...group.profiles].sort((a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0))
        const topProfiles = profiles.slice(0, 5)
        const bestScore = Number(topProfiles[0]?.matchScore || 0)
        const averageScore = topProfiles.length
          ? Math.round(topProfiles.reduce((sum, item) => sum + Number(item.matchScore || 0), 0) / topProfiles.length)
          : 0
        return {
          ...group,
          profiles,
          topProfiles,
          bestScore,
          averageScore,
          matchedSkills: uniqueValues(topProfiles.flatMap((item) => item.matchedSkills || [])),
          missingSkills: uniqueValues(topProfiles.flatMap((item) => item.missingSkills || [])),
          analysis: topProfiles[0]?.aiAnalysis || 'No AI analysis available for this job yet.',
        }
      })
      .sort((a, b) => b.bestScore - a.bestScore)
  }, [filteredRecommendations])

  const summary = useMemo(() => {
    const students = new Set(recommendations.map((item) => item.userId)).size
    const jobs = new Set(recommendations.map((item) => jobIdentity(item))).size
    const high = recommendations.filter((item) => item.probabilityLabel === 'High').length
    return { students, jobs, high, applications: applications.length }
  }, [applications.length, recommendations])

  const refreshAll = async () => {
    setIsRefreshing(true)
    setMessage('')
    setError('')
    try {
      const response = await apiFetch('/jobs/admin/recommendations/refresh', { method: 'POST' })
      const [applicationResponse, scrapedStatusResponse] = await Promise.all([
        apiFetch('/jobs/admin/applications'),
        apiFetch('/jobs/admin/scraped-jobs/status').catch(() => null),
      ])
      setRecommendations(Array.isArray(response) ? response : [])
      setApplications(Array.isArray(applicationResponse) ? applicationResponse : [])
      setScrapedJobStatus(scrapedStatusResponse)
      setMessage('All operator job recommendations were refreshed.')
    } catch (refreshError) {
      setError(refreshError?.message || 'Unable to refresh recommendations.')
    } finally {
      setIsRefreshing(false)
    }
  }

  const syncScrapedJobs = async () => {
    setIsSyncingScrapedJobs(true)
    setMessage('')
    setError('')
    try {
      const syncStatus = await apiFetch('/jobs/admin/scraped-jobs/sync', { method: 'POST' })
      setScrapedJobStatus(syncStatus)
      const response = await apiFetch('/jobs/admin/recommendations/refresh', { method: 'POST' })
      setRecommendations(Array.isArray(response) ? response : [])
      setMessage(syncStatus?.message || 'Scraped jobs synced.')
    } catch (syncError) {
      setError(syncError?.message || 'Unable to sync scraped jobs.')
    } finally {
      setIsSyncingScrapedJobs(false)
    }
  }

  const addMarkdownJob = async () => {
    if (!jobMarkdown.trim()) {
      setError('Paste a markdown job listing before adding.')
      return
    }

    setIsAddingJob(true)
    setMessage('')
    setError('')
    try {
      const response = await apiFetch('/jobs/admin/listings', {
        method: 'POST',
        body: JSON.stringify({ markdown: jobMarkdown }),
      })
      setRecommendations(Array.isArray(response?.recommendations) ? response.recommendations : [])
      setJobMarkdown('')
      setMessage(response?.message || 'Job listing saved and recommendations refreshed.')
    } catch (addError) {
      setError(addError?.message || 'Unable to add job listing.')
    } finally {
      setIsAddingJob(false)
    }
  }

  const updateApplicationStatus = async (application, status) => {
    setUpdatingApplicationId(application.id)
    setError('')
    setMessage('')
    try {
      await apiFetch(`/jobs/admin/applications/${application.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes: application.notes || '' }),
      })
      setApplications((current) =>
        current.map((item) =>
          item.id === application.id ? { ...item, status, updatedAt: new Date().toISOString() } : item,
        ),
      )
      setMessage('Application status updated.')
    } catch (updateError) {
      setError(updateError?.message || 'Unable to update application status.')
    } finally {
      setUpdatingApplicationId(null)
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 py-10 md:px-10">
      <section className="mx-auto max-w-7xl space-y-8">
        <button
          className="rounded-lg bg-surface-container-high px-4 py-2 font-headline text-xs font-bold text-on-surface"
          onClick={() => navigate('/admin')}
          type="button"
        >
          Back
        </button>

        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10">
          <p className="font-headline text-xs font-bold text-secondary">
            Placement Intelligence
          </p>
          <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-headline text-4xl font-extrabold tracking-tight md:text-5xl">
                Job Recommendations
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-on-surface-variant">
                Review each JD once, see the top matching students, and expand any row to inspect more profiles.
              </p>
            </div>
            <button
              className="rounded-full bg-secondary px-5 py-3 font-headline text-sm font-bold text-on-secondary disabled:opacity-60"
              disabled={isRefreshing}
              onClick={refreshAll}
              type="button"
            >
              {isRefreshing ? 'Analyzing...' : 'Refresh All Matches'}
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-5">
          {[
            ['Recommended Students', summary.students, 'border-secondary', 'text-secondary'],
            ['Matched JDs', summary.jobs, 'border-primary', 'text-primary'],
            ['High Probability', summary.high, 'border-secondary', 'text-secondary'],
            ['Applications', summary.applications, 'border-primary', 'text-primary'],
          ].map(([label, value, borderClass, textClass]) => (
            <div className={`rounded-2xl bg-surface-container-lowest p-5 border-l-4 ${borderClass}`} key={label}>
              <p className="font-headline text-xs font-bold text-on-surface-variant">
                {label}
              </p>
              <p className={`mt-2 font-headline text-4xl font-extrabold ${textClass}`}>{value}</p>
            </div>
          ))}
          <label className="rounded-2xl bg-surface-container-lowest p-5 border-l-4 border-outline-variant">
            <span className="font-headline text-xs font-bold text-on-surface-variant">
              Search Student / JD / Skill
            </span>
            <input
              className="rounded-xl mt-3 w-full bg-surface-container-highest  px-4 py-3 outline-none"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Registration, name, company, skill..."
              type="text"
              value={searchQuery}
            />
          </label>
        </section>

        {message ? <p className="rounded-xl shadow-soft bg-secondary/10 px-4 py-3 text-sm text-secondary">{message}</p> : null}
        {error ? <p className="rounded-xl shadow-soft bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}

        <section className="rounded-2xl bg-surface-container-lowest shadow-soft p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-headline text-xs font-bold text-primary">
                External Job Feed
              </p>
              <h2 className="mt-2 font-headline text-xl font-extrabold tracking-tight">
                {scrapedJobStatus?.database || 'job_db'}.{scrapedJobStatus?.table || 'scraped_jobs'}
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">
                {scrapedJobStatus?.message || 'Waiting for scraped job sync status.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:min-w-72">
              <div className="rounded-2xl bg-surface-container-high p-4">
                <p className="font-headline text-xs font-bold text-on-surface-variant">
                  Feed Status
                </p>
                <p className="mt-1 font-headline text-lg font-extrabold text-primary">
                  {scrapedJobStatus?.status || 'unknown'}
                </p>
              </div>
              <div className="rounded-2xl bg-surface-container-high p-4">
                <p className="font-headline text-xs font-bold text-on-surface-variant">
                  Imported
                </p>
                <p className="mt-1 font-headline text-lg font-extrabold text-secondary">
                  {scrapedJobStatus?.importedListings ?? scrapedJobStatus?.imported ?? 0}
                </p>
              </div>
            </div>
            <button
              className="rounded-full bg-primary px-5 py-3 font-headline text-sm font-bold text-on-primary disabled:opacity-60"
              disabled={isSyncingScrapedJobs}
              onClick={syncScrapedJobs}
              type="button"
            >
              {isSyncingScrapedJobs ? 'Syncing...' : 'Sync job_db'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl bg-surface-container-lowest shadow-soft p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="font-headline text-xs font-bold text-primary">
                Markdown Job Intake
              </p>
              <h2 className="mt-2 font-headline text-xl font-extrabold tracking-tight">Add New Job Listing</h2>
              <p className="mt-2 text-sm text-on-surface-variant">
                Paste a markdown job block. Saving it re-analyzes active students.
              </p>
            </div>
            <button
              className="rounded-full bg-primary px-5 py-3 font-headline text-sm font-bold text-on-primary disabled:opacity-60"
              disabled={isAddingJob}
              onClick={addMarkdownJob}
              type="button"
            >
              {isAddingJob ? 'Adding...' : 'Add & Analyze'}
            </button>
          </div>
          <textarea
            className="rounded-xl mt-5 min-h-40 w-full resize-y bg-surface-container-highest  px-4 py-3 font-headline text-sm outline-none"
            onChange={(event) => setJobMarkdown(event.target.value)}
            placeholder={'### SOC Analyst - Tier 1\n**Company:** Example\n**Location:** Remote\n**Salary:** ...\n**Type:** Entry Level | Online Learning | Remote\n...'}
            value={jobMarkdown}
          />
        </section>

        <section className="rounded-2xl bg-surface-container-lowest p-6">
          <div className="mb-8 border-b border-outline-variant/40 pb-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="font-headline text-xs font-bold text-primary">
                  Application Tracker
                </p>
                <h2 className="mt-2 font-headline text-xl font-extrabold tracking-tight">
                  Student Apply Activity
                </h2>
              </div>
              <p className="text-sm text-on-surface-variant">Tracks player clicks from the job updates page.</p>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-outline-variant">
                    <th className="py-3 pr-4 font-headline text-xs text-on-surface-variant">Student</th>
                    <th className="py-3 pr-4 font-headline text-xs text-on-surface-variant">Job</th>
                    <th className="py-3 pr-4 font-headline text-xs text-on-surface-variant">Match</th>
                    <th className="py-3 pr-4 font-headline text-xs text-on-surface-variant">Applied</th>
                    <th className="py-3 font-headline text-xs text-on-surface-variant">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((application) => (
                    <tr className="border-b border-outline-variant/30 align-top" key={application.id}>
                      <td className="py-4 pr-4">
                        <p className="font-headline text-sm font-extrabold">{studentLabel(application)}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">{application.email || application.username}</p>
                      </td>
                      <td className="py-4 pr-4">
                        <p className="font-headline text-sm font-extrabold">{application.job?.title}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {application.job?.company} - {application.job?.location}
                        </p>
                      </td>
                      <td className="py-4 pr-4">
                        <p className="font-headline text-xl font-extrabold text-secondary">{application.matchScore}%</p>
                        <p className="font-headline text-xs text-on-surface-variant">
                          {application.probabilityLabel}
                        </p>
                      </td>
                      <td className="py-4 pr-4 text-sm text-on-surface-variant">
                        {application.appliedAt ? new Date(application.appliedAt).toLocaleString() : 'Tracked'}
                      </td>
                      <td className="py-4">
                        <select
                          className="rounded-lg bg-surface-container-highest border border-outline-variant px-3 py-2 font-headline text-xs font-bold outline-none"
                          disabled={updatingApplicationId === application.id}
                          onChange={(event) => updateApplicationStatus(application, event.target.value)}
                          value={application.status}
                        >
                          {['applied', 'shortlisted', 'interview', 'selected', 'rejected'].map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!applications.length ? (
              <div className="rounded-2xl mt-5 bg-surface-container-high p-5 text-sm text-on-surface-variant">
                No tracked applications yet.
              </div>
            ) : null}
          </div>

          <div className="space-y-6">
            {groupedRecommendations.map((group) => {
              const expanded = expandedJobKey === group.key
              const visibleProfiles = expanded ? group.profiles : group.topProfiles
              const hiddenProfileCount = Math.max(0, group.profiles.length - group.topProfiles.length)

              return (
                <article className="border border-outline-variant/60 bg-surface-container-high" key={group.key}>
                  <div className="rounded-2xl grid grid-cols-1 gap-4 border-b border-outline-variant/50 bg-surface-container-lowest p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(220px,0.7fr)_auto] lg:items-start">
                    <div>
                      <p className="font-headline text-xs font-bold text-primary">JD</p>
                      <h3 className="mt-2 break-words font-headline text-xl font-extrabold leading-tight text-on-background">
                        {group.job?.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                        {group.job?.category} - {group.job?.jobType} - {group.job?.salary}
                      </p>
                    </div>
                    <div>
                      <p className="font-headline text-xs font-bold text-primary">Company</p>
                      <p className="mt-2 font-headline text-lg font-extrabold text-on-background">
                        {group.job?.company}
                      </p>
                      <p className="mt-1 text-sm text-on-surface-variant">{group.job?.location}</p>
                      <p className="text-sm text-on-surface-variant">{group.job?.workMode}</p>
                    </div>
                    <button
                      className="rounded-xl bg-surface-container-high px-4 py-3 font-headline text-xs font-bold text-on-surface hover:bg-surface-container-highest"
                      onClick={() => setExpandedJobKey(expanded ? null : group.key)}
                      type="button"
                    >
                      {expanded ? 'Show Top 5' : `More Profiles (${hiddenProfileCount})`}
                    </button>
                  </div>

                  <div className="divide-y divide-outline-variant/30">
                    <div className="hidden grid-cols-[1fr_120px_1.2fr_1.2fr_1.6fr] gap-4 px-5 py-3 lg:grid">
                      <p className="font-headline text-xs font-bold text-on-surface-variant">Register Number</p>
                      <p className="font-headline text-xs font-bold text-on-surface-variant">Matching %</p>
                      <p className="font-headline text-xs font-bold text-on-surface-variant">Skill Matched</p>
                      <p className="font-headline text-xs font-bold text-on-surface-variant">Skill Gap</p>
                      <p className="font-headline text-xs font-bold text-on-surface-variant">AI Analysis</p>
                    </div>

                    {visibleProfiles.map((profile) => (
                      <div className="grid grid-cols-1 gap-4 px-5 py-5 lg:grid-cols-[1fr_120px_1.2fr_1.2fr_1.6fr]" key={profile.id}>
                        <div>
                          <p className="font-headline text-xs font-bold text-on-surface-variant lg:hidden">
                            Register Number
                          </p>
                          <p className="break-words font-headline text-sm font-extrabold text-on-background">
                            {studentLabel(profile)}
                          </p>
                          <p className="mt-1 break-words text-xs text-on-surface-variant">{profile.email || profile.username}</p>
                        </div>
                        <div>
                          <p className="font-headline text-xs font-bold text-on-surface-variant lg:hidden">
                            Matching %
                          </p>
                          <p className="font-headline text-2xl font-extrabold text-secondary">{profile.matchScore}%</p>
                          <p className="font-headline text-xs text-on-surface-variant">
                            {profile.probabilityLabel}
                          </p>
                        </div>
                        <div>
                          <p className="font-headline text-xs font-bold text-on-surface-variant lg:hidden">
                            Skill Matched
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(profile.matchedSkills || []).slice(0, 8).map((skill) => (
                              <span className="rounded-lg bg-secondary/10 px-2 py-1 text-[11px] text-secondary" key={skill}>
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="font-headline text-xs font-bold text-on-surface-variant lg:hidden">
                            Skill Gap
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(profile.missingSkills || []).slice(0, 8).map((skill) => (
                              <span className="rounded-lg bg-primary/10 px-2 py-1 text-[11px] text-primary" key={skill}>
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="font-headline text-xs font-bold text-on-surface-variant lg:hidden">
                            AI Analysis
                          </p>
                          <p className="text-sm leading-relaxed text-on-surface-variant">{profile.aiAnalysis}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>

          {!groupedRecommendations.length && !isLoading ? (
            <div className="rounded-2xl mt-6 bg-surface-container-high p-6 text-sm text-on-surface-variant">
              No recommendations found. Refresh matches after students add career evidence or complete rooms.
            </div>
          ) : null}
          {isLoading ? (
            <div className="rounded-2xl mt-6 bg-surface-container-high p-6 text-sm text-on-surface-variant">
              Loading recommendation matrix...
            </div>
          ) : null}
        </section>
      </section>
    </main>
  )
}

export default AdminJobRecommendationsPage
