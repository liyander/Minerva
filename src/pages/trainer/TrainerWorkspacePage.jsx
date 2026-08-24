import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { getAuthSession } from '../../auth'
import {
  createLibraryItem,
  deleteAssessment,
  deleteCompetency,
  deleteLibraryItem,
  fetchAssessments,
  fetchAssessmentSubjects,
  fetchLibrary,
  fetchMyCompetencies,
  fetchParticipation,
  saveCompetency,
  updateAssessment,
} from '../../services/training'

const TABS = [
  { id: 'assessments', label: 'Questionnaires', icon: 'quiz' },
  { id: 'library', label: 'Library', icon: 'video_library' },
  { id: 'competencies', label: 'Competencies', icon: 'workspace_premium' },
  { id: 'trainees', label: 'Trainees', icon: 'groups' },
]

const LIBRARY_TYPES = [
  { value: 'lecture', label: 'Recorded lecture', icon: 'smart_display' },
  { value: 'presentation', label: 'Presentation', icon: 'slideshow' },
  { value: 'material', label: 'Study material', icon: 'description' },
  { value: 'link', label: 'External link', icon: 'link' },
]

const PROFICIENCIES = ['Beginner', 'Intermediate', 'Advanced', 'Expert']

// Browsers cannot stream a File straight into JSON, so small uploads are held
// as data URLs. Anything larger belongs behind an external link.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

function deadlineTone(deadline) {
  if (!deadline) return { label: 'No deadline', class: 'bg-surface-container-high text-on-surface-variant' }
  const remaining = new Date(deadline).getTime() - Date.now()
  if (remaining < 0) return { label: `Closed ${formatDate(deadline)}`, class: 'bg-blush text-on-blush' }
  const days = Math.ceil(remaining / 86400000)
  if (days <= 3) return { label: `Due in ${days}d`, class: 'bg-butter text-on-butter' }
  return { label: `Due ${formatDate(deadline)}`, class: 'bg-mint text-on-mint' }
}

function TrainerWorkspacePage() {
  const navigate = useNavigate()
  const session = getAuthSession()
  const [tab, setTab] = useState('assessments')
  const [assessments, setAssessments] = useState([])
  const [library, setLibrary] = useState([])
  const [competencies, setCompetencies] = useState([])
  const [trainees, setTrainees] = useState([])
  const [subjects, setSubjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    subject: '',
    itemType: 'material',
    externalUrl: '',
    fileName: '',
    fileType: '',
    fileSize: 0,
    fileData: '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const [competencyForm, setCompetencyForm] = useState({
    subject: '',
    proficiency: 'Intermediate',
    proficiencyScore: 3,
    yearsExperience: 0,
  })

  const loadAll = useCallback(async () => {
    setError('')
    try {
      const [assessmentRows, libraryRows, competencyRows, subjectRows] = await Promise.all([
        fetchAssessments({ mine: 'true' }),
        fetchLibrary({ mine: 'true' }),
        fetchMyCompetencies(),
        fetchAssessmentSubjects(),
      ])

      setAssessments(assessmentRows)
      setLibrary(libraryRows)
      setCompetencies(competencyRows)
      setSubjects(subjectRows)
    } catch (loadError) {
      setError(loadError?.message || 'Could not load your workspace.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    if (tab !== 'trainees') return
    fetchParticipation()
      .then(setTrainees)
      .catch(() => setTrainees([]))
  }, [tab])

  const stats = useMemo(
    () => ({
      published: assessments.filter((item) => item.isPublished).length,
      drafts: assessments.filter((item) => !item.isPublished).length,
      attempts: assessments.reduce((sum, item) => sum + item.attemptCount, 0),
      resources: library.length,
    }),
    [assessments, library],
  )

  const handleFile = (file) => {
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('That file is larger than 8 MB — host it elsewhere and add it as a link instead.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setUploadForm((current) => ({
        ...current,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileData: String(reader.result || ''),
        title: current.title || file.name.replace(/\.[^.]+$/, ''),
      }))
      setError('')
    }
    reader.readAsDataURL(file)
  }

  const handleUpload = async (event) => {
    event.preventDefault()
    if (!uploadForm.title.trim()) {
      setError('Give the item a title.')
      return
    }
    if (!uploadForm.fileData && !uploadForm.externalUrl.trim()) {
      setError('Attach a file or provide a link.')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      await createLibraryItem(uploadForm)
      setUploadOpen(false)
      setUploadForm({
        title: '',
        description: '',
        subject: '',
        itemType: 'material',
        externalUrl: '',
        fileName: '',
        fileType: '',
        fileSize: 0,
        fileData: '',
      })
      setNotice('Uploaded to your library.')
      await loadAll()
    } catch (uploadError) {
      setError(uploadError?.message || 'Upload failed.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveCompetency = async (event) => {
    event.preventDefault()
    if (!competencyForm.subject.trim()) {
      setError('Choose a subject.')
      return
    }

    try {
      await saveCompetency(competencyForm)
      setCompetencyForm({
        subject: '',
        proficiency: 'Intermediate',
        proficiencyScore: 3,
        yearsExperience: 0,
      })
      setNotice('Competency saved.')
      await loadAll()
    } catch (saveError) {
      setError(saveError?.message || 'Could not save that competency.')
    }
  }

  const togglePublished = async (assessment) => {
    try {
      await updateAssessment(assessment.id, { isPublished: !assessment.isPublished })
      await loadAll()
    } catch (toggleError) {
      setError(toggleError?.message || 'Could not update the questionnaire.')
    }
  }

  const removeAssessment = async (assessment) => {
    if (!window.confirm(`Delete "${assessment.title}"? Attempts will be removed too.`)) return
    try {
      await deleteAssessment(assessment.id)
      await loadAll()
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete that questionnaire.')
    }
  }

  const pill = 'rounded-full px-4 py-2 font-headline text-sm font-bold transition-opacity hover:opacity-90'
  const fieldClass =
    'mt-1.5 w-full rounded-xl bg-surface-container border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none'

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          accent="mint"
          description="Publish study material, set questionnaires with deadlines and follow how your trainees are doing."
          eyebrow="Trainer"
          icon="co_present"
          title={`Welcome, ${session?.firstName || session?.username || 'trainer'}`}
        />

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Published', value: stats.published, accent: 'bg-mint text-on-mint' },
            { label: 'Drafts', value: stats.drafts, accent: 'bg-butter text-on-butter' },
            { label: 'Attempts', value: stats.attempts, accent: 'bg-sky text-on-sky' },
            { label: 'Library items', value: stats.resources, accent: 'bg-lavender text-on-lavender' },
          ].map((tile) => (
            <div className={`rounded-2xl px-5 py-4 ${tile.accent}`} key={tile.label}>
              <p className="font-headline text-3xl font-extrabold leading-none">{tile.value}</p>
              <p className="font-body text-xs opacity-80 mt-2">{tile.label}</p>
            </div>
          ))}
        </section>

        <div className="flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 font-headline text-sm font-bold transition-colors ${
                tab === item.id
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
              }`}
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              <span className="material-symbols-outlined text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

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

        {isLoading ? (
          <div className="rounded-3xl bg-surface-container-lowest p-12 text-center shadow-soft">
            <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
        ) : null}

        {!isLoading && tab === 'assessments' ? (
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-headline text-lg font-extrabold text-on-background">
                Your questionnaires
              </h2>
              <button
                className={`${pill} bg-primary text-on-primary`}
                onClick={() => navigate('/trainer/assessments/new')}
                type="button"
              >
                New questionnaire
              </button>
            </div>

            {assessments.length === 0 ? (
              <p className="font-body text-sm text-on-surface-variant py-6 text-center">
                No questionnaires yet. Create one to start assessing your trainees.
              </p>
            ) : (
              <div className="space-y-3">
                {assessments.map((assessment) => {
                  const tone = deadlineTone(assessment.deadline)
                  return (
                    <article
                      className="rounded-2xl bg-surface-container p-4 flex flex-col lg:flex-row lg:items-center gap-4"
                      key={assessment.id}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-headline text-base font-extrabold text-on-background">
                            {assessment.title}
                          </h3>
                          <span className="rounded-full bg-secondary-container text-on-secondary-container px-2.5 py-0.5 font-headline text-xs font-bold">
                            {assessment.subject}
                          </span>
                          <span className={`rounded-full px-2.5 py-0.5 font-headline text-xs font-bold ${tone.class}`}>
                            {tone.label}
                          </span>
                          {!assessment.isPublished ? (
                            <span className="rounded-full bg-surface-container-high text-on-surface-variant px-2.5 py-0.5 font-headline text-xs font-bold">
                              Draft
                            </span>
                          ) : null}
                        </div>
                        <p className="font-body text-xs text-on-surface-variant mt-1.5">
                          {assessment.questionCount} questions · {assessment.attemptCount} attempts ·
                          pass mark {assessment.passPercentage}%
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <button
                          className={`${pill} bg-surface-container-high text-on-surface`}
                          onClick={() => navigate(`/trainer/assessments/${assessment.id}`)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className={`${pill} bg-surface-container-high text-on-surface`}
                          onClick={() => navigate(`/trainer/assessments/${assessment.id}/results`)}
                          type="button"
                        >
                          Results
                        </button>
                        <button
                          className={`${pill} ${assessment.isPublished ? 'bg-butter text-on-butter' : 'bg-mint text-on-mint'}`}
                          onClick={() => togglePublished(assessment)}
                          type="button"
                        >
                          {assessment.isPublished ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          className={`${pill} bg-blush text-on-blush`}
                          onClick={() => removeAssessment(assessment)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        ) : null}

        {!isLoading && tab === 'library' ? (
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-headline text-lg font-extrabold text-on-background">
                Trainer library
              </h2>
              <button
                className={`${pill} bg-primary text-on-primary`}
                onClick={() => setUploadOpen((value) => !value)}
                type="button"
              >
                {uploadOpen ? 'Cancel' : 'Upload material'}
              </button>
            </div>

            {uploadOpen ? (
              <form className="rounded-2xl bg-surface-container p-5 space-y-4" onSubmit={handleUpload}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="font-headline text-xs font-bold text-on-surface-variant">Title</span>
                    <input
                      className={fieldClass}
                      onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="Week 3 — Joins walkthrough"
                      value={uploadForm.title}
                    />
                  </label>
                  <label className="block">
                    <span className="font-headline text-xs font-bold text-on-surface-variant">Subject</span>
                    <input
                      className={fieldClass}
                      list="trainer-subjects"
                      onChange={(e) => setUploadForm((f) => ({ ...f, subject: e.target.value }))}
                      placeholder="Data"
                      value={uploadForm.subject}
                    />
                    <datalist id="trainer-subjects">
                      {subjects.map((subject) => (
                        <option key={subject} value={subject} />
                      ))}
                    </datalist>
                  </label>
                </div>

                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    Description
                  </span>
                  <textarea
                    className={fieldClass}
                    onChange={(e) => setUploadForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    value={uploadForm.description}
                  />
                </label>

                <div>
                  <span className="font-headline text-xs font-bold text-on-surface-variant">Type</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {LIBRARY_TYPES.map((type) => (
                      <button
                        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 font-headline text-xs font-bold transition-colors ${
                          uploadForm.itemType === type.value
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-container-high text-on-surface-variant'
                        }`}
                        key={type.value}
                        onClick={() => setUploadForm((f) => ({ ...f, itemType: type.value }))}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-sm">{type.icon}</span>
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                {uploadForm.itemType === 'link' ? (
                  <label className="block">
                    <span className="font-headline text-xs font-bold text-on-surface-variant">Link</span>
                    <input
                      className={fieldClass}
                      onChange={(e) => setUploadForm((f) => ({ ...f, externalUrl: e.target.value }))}
                      placeholder="https://…"
                      value={uploadForm.externalUrl}
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="font-headline text-xs font-bold text-on-surface-variant">
                      File (max 8 MB)
                    </span>
                    <input
                      className={`${fieldClass} file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-1.5 file:font-headline file:text-xs file:font-bold file:text-on-primary`}
                      onChange={(e) => handleFile(e.target.files?.[0])}
                      type="file"
                    />
                    {uploadForm.fileName ? (
                      <span className="font-body text-xs text-on-surface-variant mt-1 block">
                        {uploadForm.fileName} · {Math.round(uploadForm.fileSize / 1024)} KB
                      </span>
                    ) : null}
                  </label>
                )}

                <button
                  className={`${pill} bg-primary text-on-primary disabled:opacity-60`}
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving ? 'Uploading…' : 'Add to library'}
                </button>
              </form>
            ) : null}

            {library.length === 0 ? (
              <p className="font-body text-sm text-on-surface-variant py-6 text-center">
                Your library is empty. Upload lectures, slides or notes for your trainees.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {library.map((item) => (
                  <article className="rounded-2xl bg-surface-container p-4" key={item.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-headline text-sm font-extrabold text-on-background truncate">
                          {item.title}
                        </h3>
                        <p className="font-body text-xs text-on-surface-variant mt-1">
                          {item.subject || 'General'} · {item.itemType} · {item.downloadCount} opens
                        </p>
                      </div>
                      <button
                        aria-label="Delete item"
                        className="text-on-surface-variant hover:text-error transition-colors shrink-0"
                        onClick={async () => {
                          if (!window.confirm(`Delete "${item.title}"?`)) return
                          await deleteLibraryItem(item.id)
                          await loadAll()
                        }}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    </div>
                    {item.description ? (
                      <p className="font-body text-xs text-on-surface-variant mt-2 line-clamp-2">
                        {item.description}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {!isLoading && tab === 'competencies' ? (
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-5">
            <div>
              <h2 className="font-headline text-lg font-extrabold text-on-background">
                Subjects you can teach
              </h2>
              <p className="font-body text-sm text-on-surface-variant mt-1">
                Admins use this to match trainers to subjects. Declared levels are combined with your
                published material and trainee results to rank suitability.
              </p>
            </div>

            <form className="rounded-2xl bg-surface-container p-5 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end" onSubmit={handleSaveCompetency}>
              <label className="block sm:col-span-2">
                <span className="font-headline text-xs font-bold text-on-surface-variant">Subject</span>
                <input
                  className={fieldClass}
                  list="trainer-subjects-competency"
                  onChange={(e) => setCompetencyForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="Data"
                  value={competencyForm.subject}
                />
                <datalist id="trainer-subjects-competency">
                  {subjects.map((subject) => (
                    <option key={subject} value={subject} />
                  ))}
                </datalist>
              </label>
              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">Level</span>
                <select
                  className={fieldClass}
                  onChange={(e) =>
                    setCompetencyForm((f) => ({
                      ...f,
                      proficiency: e.target.value,
                      proficiencyScore: PROFICIENCIES.indexOf(e.target.value) + 2,
                    }))
                  }
                  value={competencyForm.proficiency}
                >
                  {PROFICIENCIES.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">Years</span>
                <input
                  className={fieldClass}
                  min="0"
                  onChange={(e) =>
                    setCompetencyForm((f) => ({ ...f, yearsExperience: Number(e.target.value) }))
                  }
                  step="0.5"
                  type="number"
                  value={competencyForm.yearsExperience}
                />
              </label>
              <button className={`${pill} bg-primary text-on-primary sm:col-span-4 sm:w-fit`} type="submit">
                Save competency
              </button>
            </form>

            {competencies.length === 0 ? (
              <p className="font-body text-sm text-on-surface-variant py-4 text-center">
                No subjects declared yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {competencies.map((competency) => (
                  <article
                    className="rounded-2xl bg-surface-container p-4 flex items-center justify-between gap-3"
                    key={competency.id}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-headline text-sm font-extrabold text-on-background truncate">
                          {competency.subject}
                        </h3>
                        {competency.is_verified ? (
                          <span className="rounded-full bg-mint text-on-mint px-2 py-0.5 font-headline text-[11px] font-bold">
                            Verified
                          </span>
                        ) : null}
                      </div>
                      <p className="font-body text-xs text-on-surface-variant mt-1">
                        {competency.proficiency} · {Number(competency.years_experience)} years
                      </p>
                    </div>
                    <button
                      aria-label="Remove competency"
                      className="text-on-surface-variant hover:text-error transition-colors shrink-0"
                      onClick={async () => {
                        await deleteCompetency(competency.id)
                        await loadAll()
                      }}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {!isLoading && tab === 'trainees' ? (
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
            <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">
              Trainee participation
            </h2>

            {trainees.length === 0 ? (
              <p className="font-body text-sm text-on-surface-variant py-6 text-center">
                No trainee activity recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem]">
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
                    {trainees.map((trainee) => (
                      <tr className="border-t border-outline-variant" key={trainee.id}>
                        <td className="py-3 px-3">
                          <p className="font-headline text-sm font-bold text-on-surface">
                            {trainee.name}
                          </p>
                          <p className="font-body text-xs text-on-surface-variant">{trainee.email}</p>
                        </td>
                        <td className="py-3 px-3 font-body text-sm text-on-surface">
                          {trainee.enrolments}
                        </td>
                        <td className="py-3 px-3 font-body text-sm text-on-surface">
                          {trainee.attempts}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-headline text-xs font-bold ${
                              trainee.averageScore === null
                                ? 'bg-surface-container-high text-on-surface-variant'
                                : trainee.averageScore >= 60
                                  ? 'bg-mint text-on-mint'
                                  : 'bg-blush text-on-blush'
                            }`}
                          >
                            {trainee.averageScore === null ? '—' : `${trainee.averageScore}%`}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-body text-sm text-on-surface">
                          {trainee.certificates}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  )
}

export default TrainerWorkspacePage
