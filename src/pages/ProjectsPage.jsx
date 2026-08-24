import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { fetchLabProjects } from '../services/labResearch'

function ProjectsPage() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await fetchLabProjects()
        if (!cancelled) {
          setProjects(Array.isArray(data) ? data : [])
          setError('')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load research projects')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex-1 px-6 md:px-10 pt-24 pb-24 md:pb-10">
      <PageHeader
        accent="blush"
        description="Study real projects end to end: the stack, the people who built them and how they were put together. Pass the knowledge check to complete one."
        eyebrow="Case studies"
        icon="science"
        title="Projects"
      />

      <div className="h-8"></div>

      {error ? (
        <div className="rounded-2xl mb-6 bg-error/10 shadow-soft p-4">
          <p className="text-error font-headline text-xs font-bold">{error}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl bg-surface-container-lowest p-8 text-center">
          <p className="text-on-surface-variant">Loading research projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl bg-surface-container-lowest p-10 text-center border-l-4 border-outline-variant/40">
          <p className="font-headline text-lg font-bold">No research projects published yet</p>
          <p className="text-sm text-on-surface-variant mt-2">Check back soon — the lab is always building.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {projects.map((project) => {
            const fullyDone = project.progress.quizCompleted && (!project.codingEnabled || project.progress.codeAccepted)
            return (
              <Link
                className="rounded-2xl block bg-surface-container-lowest shadow-soft/60 p-6 hover:bg-surface-container-high transition-all"
                key={project.id}
                to={`/projects/${project.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-headline text-lg font-bold truncate">{project.title}</h2>
                    {project.stack ? (
                      <p className="text-xs text-on-surface-variant mt-1 truncate">Stack: {project.stack}</p>
                    ) : null}
                    {project.contributors ? (
                      <p className="text-xs text-on-surface-variant mt-1 truncate">By: {project.contributors}</p>
                    ) : null}
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant shrink-0">chevron_right</span>
                </div>
                {project.summary ? (
                  <p className="text-sm text-on-surface-variant mt-3 line-clamp-2">{project.summary}</p>
                ) : null}
                <div className="flex flex-wrap gap-2 mt-4">
                  <span className="rounded-full px-2 py-1 text-xs font-headline font-bold bg-surface-container-high text-on-surface-variant">
                    {project.projectType === 'web' ? 'Web-Based' : project.projectType === 'program' ? 'Program-Based' : 'Research'}
                  </span>
                  <span className={`px-2 py-1 text-xs font-headline font-bold ${project.progress.quizCompleted ? 'bg-secondary/15 text-secondary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    {project.progress.quizCompleted ? 'Knowledge Check 100/100' : `Knowledge Check ${project.progress.quizScore}/100`}
                  </span>
                  {project.codingEnabled ? (
                    <span className={`px-2 py-1 text-xs font-headline font-bold ${project.progress.codeAccepted ? 'bg-secondary/15 text-secondary' : 'bg-primary/15 text-primary'}`}>
                      {project.progress.codeAccepted ? 'Code Lab Accepted' : 'Code Lab Available'}
                    </span>
                  ) : null}
                  {fullyDone ? (
                    <span className="rounded-full px-2 py-1 text-xs font-headline font-bold bg-secondary text-on-secondary">
                      Completed
                    </span>
                  ) : null}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ProjectsPage
