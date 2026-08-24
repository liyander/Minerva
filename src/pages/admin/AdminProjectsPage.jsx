import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createLabProject,
  deleteLabProject,
  fetchAdminLabProjects,
  fetchLabProjectCompletions,
  fetchLabSubmission,
  updateLabProject,
} from '../../services/labResearch'

const initialFormState = {
  title: '',
  stack: '',
  contributors: '',
  summary: '',
  explanation: '',
  topics: '',
  projectType: 'research',
  questionCount: 5,
  codingEnabled: false,
  isActive: true,
}

const inputClass =
  'w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 focus:ring-0 font-body text-sm py-3 px-4 outline-none'

const labelClass =
  'block font-headline text-xs font-bold text-on-surface-variant mb-2'

function AdminProjectsPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState(initialFormState)
  const [completions, setCompletions] = useState(null)
  const [completionsLoading, setCompletionsLoading] = useState(false)
  const [submissionView, setSubmissionView] = useState(null)
  const [submissionLoading, setSubmissionLoading] = useState(false)

  const loadProjects = async () => {
    try {
      setLoading(true)
      const data = await fetchAdminLabProjects()
      setProjects(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load research projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target
    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const resetForm = () => {
    setFormData(initialFormState)
    setEditingId(null)
    setShowForm(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!formData.title.trim() || !formData.explanation.trim()) {
      setError('Title and in-depth explanation are required')
      return
    }

    try {
      setSaving(true)
      const payload = {
        ...formData,
        questionCount: Number(formData.questionCount) || 5,
      }
      if (editingId) {
        await updateLabProject(editingId, payload)
        setSuccess('Research project updated successfully')
      } else {
        await createLabProject(payload)
        setSuccess('Research project created successfully')
      }
      resetForm()
      await loadProjects()
    } catch (err) {
      setError(err.message || 'Failed to save research project')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (project) => {
    setFormData({
      title: project.title || '',
      stack: project.stack || '',
      contributors: project.contributors || '',
      summary: project.summary || '',
      explanation: project.explanation || '',
      topics: project.topics || '',
      projectType: project.projectType || 'research',
      questionCount: project.questionCount || 5,
      codingEnabled: Boolean(project.codingEnabled),
      isActive: Boolean(project.isActive),
    })
    setEditingId(project.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (projectId) => {
    if (!window.confirm('Delete this research project? Player progress for it will also be removed.')) {
      return
    }
    try {
      await deleteLabProject(projectId)
      setSuccess('Research project deleted successfully')
      if (completions?.project?.id === projectId) {
        setCompletions(null)
      }
      await loadProjects()
    } catch (err) {
      setError(err.message || 'Failed to delete research project')
    }
  }

  const handleToggle = async (project, field) => {
    try {
      await updateLabProject(project.id, {
        title: project.title,
        stack: project.stack,
        contributors: project.contributors,
        summary: project.summary,
        explanation: project.explanation,
        topics: project.topics,
        projectType: project.projectType,
        questionCount: project.questionCount,
        codingEnabled: field === 'codingEnabled' ? !project.codingEnabled : project.codingEnabled,
        isActive: field === 'isActive' ? !project.isActive : project.isActive,
      })
      await loadProjects()
    } catch (err) {
      setError(err.message || 'Failed to update research project')
    }
  }

  const handleViewCompletions = async (projectId) => {
    try {
      setCompletionsLoading(true)
      setError('')
      setSubmissionView(null)
      const data = await fetchLabProjectCompletions(projectId)
      setCompletions(data)
    } catch (err) {
      setError(err.message || 'Failed to load completions')
    } finally {
      setCompletionsLoading(false)
    }
  }

  const handleViewSubmission = async (submissionId) => {
    try {
      setSubmissionLoading(true)
      setError('')
      const data = await fetchLabSubmission(submissionId)
      setSubmissionView(data)
    } catch (err) {
      setError(err.message || 'Failed to load the submission')
    } finally {
      setSubmissionLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-6xl mx-auto">
        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10 mb-8">
          <button
            className="rounded-lg inline-flex items-center gap-2 mb-6 px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-primary transition-colors"
            onClick={() => navigate('/admin')}
            type="button"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to Admin Panel
          </button>
          <p className="font-headline text-xs text-secondary font-bold">
            Knowledge Transfer
          </p>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight mt-3">
            Lab Research Manager
          </h1>
          <p className="text-sm text-on-surface-variant mt-4 max-w-2xl">
            Document completed projects with the stack used, contributors, in-depth implementation notes, and topics to learn.
            Players study the write-up, pass an AI knowledge check to 100, and can optionally solve an AI-generated coding scenario.
          </p>
        </header>

        {error ? (
          <div className="rounded-2xl mb-6 bg-error/10 shadow-soft p-4">
            <p className="text-error font-headline text-xs font-bold">{error}</p>
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl mb-6 bg-secondary/10 shadow-soft p-4">
            <p className="text-secondary font-headline text-xs font-bold">{success}</p>
          </div>
        ) : null}

        <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 mb-8">
          <button
            className="rounded-full bg-primary text-on-primary px-6 py-2.5 font-headline text-sm font-bold hover:opacity-90 transition-colors"
            onClick={() => {
              if (showForm) {
                resetForm()
              } else {
                setShowForm(true)
              }
            }}
            type="button"
          >
            {showForm ? 'Cancel' : '+ Add Research Project'}
          </button>

          {showForm ? (
            <form className="space-y-6 mt-8" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Project Title</label>
                  <input
                    className={inputClass}
                    name="title"
                    onChange={handleInputChange}
                    placeholder="e.g., Network Intrusion Detection Dashboard"
                    type="text"
                    value={formData.title}
                  />
                </div>

                <div>
                  <label className={labelClass}>Stack Used</label>
                  <input
                    className={inputClass}
                    name="stack"
                    onChange={handleInputChange}
                    placeholder="e.g., React, Node.js, MySQL, Docker"
                    type="text"
                    value={formData.stack}
                  />
                </div>

                <div>
                  <label className={labelClass}>Persons Contributed</label>
                  <input
                    className={inputClass}
                    name="contributors"
                    onChange={handleInputChange}
                    placeholder="e.g., Arun (backend), Priya (frontend), Dev (infra)"
                    type="text"
                    value={formData.contributors}
                  />
                </div>

                <div>
                  <label className={labelClass}>Project Type</label>
                  <select
                    className={inputClass}
                    name="projectType"
                    onChange={handleInputChange}
                    value={formData.projectType}
                  >
                    <option value="research">Research / Documentation Only</option>
                    <option value="web">Web-Based Project</option>
                    <option value="program">Program-Based Project</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>AI Quiz Question Count (3–15)</label>
                  <input
                    className={inputClass}
                    max="15"
                    min="3"
                    name="questionCount"
                    onChange={handleInputChange}
                    type="number"
                    value={formData.questionCount}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Short Summary (shown on project cards)</label>
                <textarea
                  className={`${inputClass} min-h-[80px]`}
                  name="summary"
                  onChange={handleInputChange}
                  placeholder="One or two sentences describing the project"
                  value={formData.summary}
                />
              </div>

              <div>
                <label className={labelClass}>In-Depth Explanation — how the project was implemented</label>
                <textarea
                  className={`${inputClass} min-h-[220px]`}
                  name="explanation"
                  onChange={handleInputChange}
                  placeholder="Explain the architecture, implementation decisions, modules, data flow, challenges faced, and how they were solved..."
                  value={formData.explanation}
                />
              </div>

              <div>
                <label className={labelClass}>Topics to Learn — to build a similar project</label>
                <textarea
                  className={`${inputClass} min-h-[120px]`}
                  name="topics"
                  onChange={handleInputChange}
                  placeholder={'One topic per line, e.g.\nREST API design\nJWT authentication\nWebSocket streaming'}
                  value={formData.topics}
                />
              </div>

              <div className="flex flex-col gap-4 pt-2 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="rounded-xl inline-flex items-center gap-3 text-sm text-on-surface-variant bg-surface-container-high px-4 py-3 w-fit">
                    <input
                      checked={formData.isActive}
                      className="h-4 w-4 accent-[#b6171e]"
                      name="isActive"
                      onChange={handleInputChange}
                      type="checkbox"
                    />
                    Visible to Players
                  </label>
                  <label
                    className={`rounded-xl inline-flex items-center gap-3 text-sm text-on-surface-variant bg-surface-container-high px-4 py-3 w-fit ${formData.projectType === 'research' ? 'opacity-50' : ''}`}
                    title={formData.projectType === 'research' ? 'Code lab needs a web-based or program-based project type' : ''}
                  >
                    <input
                      checked={formData.codingEnabled}
                      className="h-4 w-4 accent-[#b6171e]"
                      disabled={formData.projectType === 'research'}
                      name="codingEnabled"
                      onChange={handleInputChange}
                      type="checkbox"
                    />
                    Enable AI Code Lab
                  </label>
                </div>

                <button
                  className="rounded-full w-full md:w-auto min-w-[220px] bg-primary text-on-primary px-6 py-3 font-headline text-sm font-bold hover:opacity-90 transition-colors disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? 'Saving...' : editingId ? 'Update Project' : 'Create Project'}
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <div>
          <h2 className="font-headline text-2xl font-bold tracking-tight mb-6 text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">biotech</span>
            Research Projects ({projects.length})
          </h2>

          {loading ? (
            <div className="rounded-2xl bg-surface-container-lowest p-8 text-center">
              <p className="text-on-surface-variant">Loading research projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-2xl bg-surface-container-lowest p-10 text-center border-l-4 border-outline-variant/40">
              <p className="font-headline text-lg font-bold">No research projects yet</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {projects.map((project) => (
                <div className="rounded-2xl bg-surface-container-lowest shadow-soft/50 p-6" key={project.id}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2 min-w-0">
                      <h3 className="font-headline text-lg font-bold">{project.title}</h3>
                      {project.stack ? (
                        <p className="text-xs text-on-surface-variant">Stack: {project.stack}</p>
                      ) : null}
                      {project.contributors ? (
                        <p className="text-xs text-on-surface-variant">Contributors: {project.contributors}</p>
                      ) : null}
                      <p className="text-xs text-on-surface-variant">
                        Quiz completed by {project.quizCompletions} player{project.quizCompletions === 1 ? '' : 's'}
                        {project.codingEnabled
                          ? ` · Code lab accepted for ${project.codeCompletions} player${project.codeCompletions === 1 ? '' : 's'}`
                          : ''}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className={`px-2 py-1 text-xs font-headline font-bold ${project.isActive ? 'bg-secondary/15 text-secondary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                          {project.isActive ? 'Visible' : 'Hidden'}
                        </span>
                        <span className="rounded-full px-2 py-1 text-xs font-headline font-bold bg-surface-container-high text-on-surface-variant">
                          {project.projectType === 'web' ? 'Web-Based' : project.projectType === 'program' ? 'Program-Based' : 'Research'}
                        </span>
                        <span className={`px-2 py-1 text-xs font-headline font-bold ${project.codingEnabled ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                          Code Lab {project.codingEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <span className="rounded-full px-2 py-1 text-xs font-headline font-bold bg-surface-container-high text-on-surface-variant">
                          {project.questionCount} quiz questions
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-secondary transition-colors"
                        onClick={() => handleViewCompletions(project.id)}
                        type="button"
                      >
                        Completions
                      </button>
                      <button
                        className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-secondary transition-colors"
                        onClick={() => handleToggle(project, 'isActive')}
                        type="button"
                      >
                        {project.isActive ? 'Hide' : 'Show'}
                      </button>
                      {project.projectType !== 'research' ? (
                        <button
                          className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-secondary transition-colors"
                          onClick={() => handleToggle(project, 'codingEnabled')}
                          type="button"
                        >
                          {project.codingEnabled ? 'Disable Code Lab' : 'Enable Code Lab'}
                        </button>
                      ) : null}
                      <button
                        className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-primary transition-colors"
                        onClick={() => handleEdit(project)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-error transition-colors"
                        onClick={() => handleDelete(project.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {completionsLoading ? (
          <div className="rounded-2xl mt-8 bg-surface-container-lowest p-8 text-center">
            <p className="text-on-surface-variant">Loading completions...</p>
          </div>
        ) : completions ? (
          <div className="rounded-2xl mt-8 bg-surface-container-lowest shadow-soft p-8">
            <div className="flex items-start justify-between gap-4 mb-6">
              <h2 className="font-headline text-xl font-bold tracking-tight text-primary">
                Player Progress — {completions.project.title}
              </h2>
              <button
                className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-error transition-colors"
                onClick={() => setCompletions(null)}
                type="button"
              >
                Close
              </button>
            </div>
            {completions.players.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No player has started this project yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="font-headline text-xs font-bold text-on-surface-variant border-b border-outline-variant">
                      <th className="py-3 pr-4">Player</th>
                      <th className="py-3 pr-4">Quiz Score</th>
                      <th className="py-3 pr-4">Knowledge Check</th>
                      <th className="py-3 pr-4">Code Lab</th>
                      <th className="py-3 pr-4">Code Attempts</th>
                      <th className="py-3">Submission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completions.players.map((player) => (
                      <tr className="border-b border-outline-variant/40" key={player.userId}>
                        <td className="py-3 pr-4">
                          <Link
                            className="block text-left group"
                            title="Open this player's answers and submissions"
                            to={`/admin/projects/${completions.project.id}/students/${player.userId}`}
                          >
                            <p className="font-headline text-xs font-bold text-primary group-hover:underline">
                              {player.username}
                            </p>
                            <p className="text-xs text-on-surface-variant">{player.email}</p>
                          </Link>
                        </td>
                        <td className="py-3 pr-4 font-headline font-bold">{player.quizScore}/100</td>
                        <td className="py-3 pr-4">
                          {player.quizCompleted ? (
                            <span className="rounded-lg px-2 py-1 text-xs font-headline font-bold bg-secondary/15 text-secondary">
                              Completed {player.quizCompletedAt ? new Date(player.quizCompletedAt).toLocaleString() : ''}
                            </span>
                          ) : (
                            <span className="rounded-full px-2 py-1 text-xs font-headline font-bold bg-surface-container-high text-on-surface-variant">
                              In Progress
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {completions.project.codingEnabled || player.codeAccepted ? (
                            player.codeAccepted ? (
                              <span className="rounded-lg px-2 py-1 text-xs font-headline font-bold bg-secondary/15 text-secondary">
                                Accepted {player.codeAcceptedAt ? new Date(player.codeAcceptedAt).toLocaleString() : ''}
                              </span>
                            ) : (
                              <span className="rounded-full px-2 py-1 text-xs font-headline font-bold bg-surface-container-high text-on-surface-variant">
                                Not Accepted
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-on-surface-variant">Disabled</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">{player.codeAttempts}</td>
                        <td className="py-3">
                          {player.latestSubmission ? (
                            <button
                              className="rounded-full px-3 py-1.5 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-primary transition-colors disabled:opacity-60"
                              disabled={submissionLoading}
                              onClick={() => handleViewSubmission(player.latestSubmission.id)}
                              type="button"
                            >
                              View{player.latestSubmission.hasScreenshot ? ' + Screenshot' : ''}
                            </button>
                          ) : (
                            <span className="text-xs text-on-surface-variant">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {submissionLoading ? (
              <p className="mt-6 text-sm text-on-surface-variant">Loading submission...</p>
            ) : submissionView ? (
              <div className="mt-8 border-t border-outline-variant pt-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="font-headline text-lg font-bold tracking-tight">
                      Submission — {submissionView.username}
                    </h3>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {submissionView.kind === 'ui' ? 'UI Feature Challenge' : `Function Challenge (${submissionView.language})`}
                      {' · '}{new Date(submissionView.createdAt).toLocaleString()}
                      {' · '}
                      <span className={submissionView.passed ? 'text-secondary' : 'text-error'}>
                        {submissionView.passed ? 'Accepted' : 'Not Accepted'}
                      </span>
                    </p>
                  </div>
                  <button
                    className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-error transition-colors"
                    onClick={() => setSubmissionView(null)}
                    type="button"
                  >
                    Close
                  </button>
                </div>

                {submissionView.screenshot ? (
                  <div className="mb-6">
                    <p className="font-headline text-xs font-bold text-on-surface-variant mb-2">
                      Rendered Page Screenshot
                    </p>
                    <img
                      alt={`Rendered page submitted by ${submissionView.username}`}
                      className="max-w-full border border-outline-variant bg-white"
                      src={submissionView.screenshot}
                    />
                  </div>
                ) : null}

                {submissionView.feedback ? (
                  <p className="text-sm mb-4">{submissionView.feedback}</p>
                ) : null}

                {Array.isArray(submissionView.results) && submissionView.results.length ? (
                  <div className="space-y-2 mb-6">
                    {submissionView.results.map((result) => (
                      <div
                        className={`p-3 flex items-start gap-2 ${result.passed ? 'bg-secondary/10' : 'bg-error/10'}`}
                        key={result.index}
                      >
                        <span className={`material-symbols-outlined text-base ${result.passed ? 'text-secondary' : 'text-error'}`}>
                          {result.passed ? 'check_circle' : 'cancel'}
                        </span>
                        <div>
                          <p className="font-headline text-xs font-bold">
                            Test {result.index}: {result.passed ? 'Passed' : 'Failed'}
                          </p>
                          {result.description ? (
                            <p className="text-xs text-on-surface-variant">{result.description}</p>
                          ) : null}
                          {!result.passed && result.detail ? (
                            <p className="text-xs">{result.detail}</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <details>
                  <summary className="cursor-pointer font-headline text-xs font-bold text-on-surface-variant">
                    Submitted Code
                  </summary>
                  <pre className="mt-3 max-h-96 overflow-auto bg-[#0d1117] text-[#e6edf3] font-mono text-xs leading-6 p-4">
                    {submissionView.code}
                  </pre>
                </details>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default AdminProjectsPage
