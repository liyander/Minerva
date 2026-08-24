import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import FileDropField from '../../components/FileDropField'
import { fetchAssessmentSubjects } from '../../services/training'
import {
  createAssignment,
  createRubricTemplate,
  fetchAssignment,
  fetchRubricTemplates,
  saveRubric,
  updateAssignment,
} from '../../services/platform'

const KINDS = [
  { value: 'file', label: 'File upload', icon: 'upload_file' },
  { value: 'text', label: 'Written answer', icon: 'edit_note' },
  { value: 'code', label: 'Source code', icon: 'code' },
  { value: 'link', label: 'Link', icon: 'link' },
  { value: 'any', label: 'Any of these', icon: 'all_inclusive' },
]

const emptyCriterion = () => ({ label: '', description: '', maxPoints: 10 })

function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function AssignmentEditorPage() {
  const { assignmentId } = useParams()
  const navigate = useNavigate()
  const isNew = !assignmentId || assignmentId === 'new'

  const [form, setForm] = useState({
    title: '',
    brief: '',
    subject: '',
    submissionKind: 'file',
    passScore: 50,
    allowResubmission: true,
    opensAt: '',
    deadline: '',
    lateSubmission: false,
    isPublished: false,
  })
  const [criteria, setCriteria] = useState([emptyCriterion()])
  const [attachment, setAttachment] = useState(null)
  const [rubricTemplates, setRubricTemplates] = useState([])
  const [templateName, setTemplateName] = useState('')
  const [subjects, setSubjects] = useState([])
  const [isLoading, setIsLoading] = useState(!isNew)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [subjectRows, templateRows] = await Promise.all([
        fetchAssessmentSubjects(),
        fetchRubricTemplates(),
      ])
      setSubjects(subjectRows)
      setRubricTemplates(templateRows)
      if (isNew) return

      const data = await fetchAssignment(assignmentId)
      setForm({
        title: data.title || '',
        brief: data.brief || '',
        subject: data.subject || '',
        submissionKind: data.submissionKind || 'file',
        passScore: data.passScore ?? 50,
        allowResubmission: Boolean(data.allowResubmission),
        opensAt: toLocalInput(data.opensAt),
        deadline: toLocalInput(data.deadline),
        lateSubmission: Boolean(data.lateSubmission),
        isPublished: Boolean(data.isPublished),
      })
      setCriteria(
        data.rubric?.length
          ? data.rubric.map((row) => ({
              label: row.label,
              description: row.description || '',
              maxPoints: row.maxPoints,
            }))
          : [emptyCriterion()],
      )
      if (data.attachmentFileId) {
        setAttachment({ id: data.attachmentFileId, fileName: 'Current brief' })
      }
    } catch (loadError) {
      setError(loadError?.message || 'Could not load the assignment.')
    } finally {
      setIsLoading(false)
    }
  }, [assignmentId, isNew])

  useEffect(() => {
    void load()
  }, [load])

  // The rubric total is the score out of, so keep it visible while editing.
  const rubricTotal = criteria.reduce((sum, row) => sum + Number(row.maxPoints || 0), 0)

  const handleSave = async (publish) => {
    if (!form.title.trim()) {
      setError('Give the assignment a title.')
      return
    }
    if (!form.subject.trim()) {
      setError('Choose a subject.')
      return
    }

    const filled = criteria.filter((row) => row.label.trim())
    for (const row of filled) {
      if (!Number(row.maxPoints) || Number(row.maxPoints) <= 0) {
        setError(`"${row.label}" needs points above zero.`)
        return
      }
    }
    if (Number(form.passScore) > (rubricTotal || 100)) {
      setError('The pass mark cannot be above the total available.')
      return
    }

    setBusy(true)
    setError('')

    const payload = {
      ...form,
      isPublished: publish ?? form.isPublished,
      opensAt: form.opensAt || null,
      deadline: form.deadline || null,
      maxScore: rubricTotal || 100,
      attachmentFileId: attachment?.id || null,
    }

    try {
      const id = isNew ? (await createAssignment(payload)).id : assignmentId
      if (!isNew) await updateAssignment(id, payload)
      if (filled.length) await saveRubric(id, filled)

      setNotice('Saved.')
      if (isNew) navigate(`/trainer/assignments/${id}`, { replace: true })
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the assignment.')
    } finally {
      setBusy(false)
    }
  }

  const saveTemplate = async () => {
    const filled = criteria.filter((row) => row.label.trim())
    if (!templateName.trim() || !filled.length) {
      setError('Give the rubric template a name and add at least one criterion.')
      return
    }
    try {
      await createRubricTemplate({ title: templateName.trim(), subject: form.subject || null, criteria: filled })
      setRubricTemplates(await fetchRubricTemplates())
      setTemplateName('')
      setNotice('Rubric template saved for reuse.')
    } catch (templateError) {
      setError(templateError?.message || 'Could not save the rubric template.')
    }
  }

  const fieldClass =
    'mt-1.5 w-full rounded-xl bg-surface-container border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none'
  const pill = 'rounded-full px-5 py-2.5 font-headline text-sm font-bold transition-opacity hover:opacity-90'

  if (isLoading) {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center pt-24">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24">
      <div className="mx-auto max-w-4xl space-y-6">
        <button
          className="inline-flex items-center gap-1 font-headline text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={() => navigate('/trainer')}
          type="button"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to workspace
        </button>

        <PageHeader
          accent="butter"
          description="Set the brief, how work is submitted, and the rubric you will mark against."
          eyebrow="Assignment"
          icon="assignment"
          title={isNew ? 'New assignment' : form.title || 'Edit assignment'}
        />

        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-2xl bg-mint p-4">
            <p className="font-body text-sm text-on-mint">{notice}</p>
          </div>
        ) : null}

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-4">
          <h2 className="font-headline text-lg font-extrabold text-on-background">The brief</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Title</span>
              <input
                className={fieldClass}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Build a small reporting dashboard"
                value={form.title}
              />
            </label>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Subject</span>
              <input
                className={fieldClass}
                list="assignment-subjects"
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                value={form.subject}
              />
              <datalist id="assignment-subjects">
                {subjects.map((subject) => (
                  <option key={subject} value={subject} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="block">
            <span className="font-headline text-xs font-bold text-on-surface-variant">
              Instructions
            </span>
            <textarea
              className={fieldClass}
              onChange={(e) => setForm((f) => ({ ...f, brief: e.target.value }))}
              placeholder="What should the trainee produce, and what does good look like?"
              rows={6}
              value={form.brief}
            />
          </label>

          <FileDropField
            label="Supporting file (optional)"
            onUploaded={setAttachment}
            purpose="assignment-brief"
            value={attachment}
          />
        </section>

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-4">
          <h2 className="font-headline text-lg font-extrabold text-on-background">
            Submission and timing
          </h2>

          <div>
            <span className="font-headline text-xs font-bold text-on-surface-variant">
              How should work be submitted?
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {KINDS.map((kind) => (
                <button
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-headline text-xs font-bold transition-colors ${
                    form.submissionKind === kind.value
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                  key={kind.value}
                  onClick={() => setForm((f) => ({ ...f, submissionKind: kind.value }))}
                  type="button"
                >
                  <span className="material-symbols-outlined text-sm">{kind.icon}</span>
                  {kind.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Opens</span>
              <input
                className={fieldClass}
                onChange={(e) => setForm((f) => ({ ...f, opensAt: e.target.value }))}
                type="datetime-local"
                value={form.opensAt}
              />
            </label>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Deadline</span>
              <input
                className={fieldClass}
                onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                type="datetime-local"
                value={form.deadline}
              />
            </label>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">
                Pass mark
              </span>
              <input
                className={fieldClass}
                min="0"
                onChange={(e) => setForm((f) => ({ ...f, passScore: Number(e.target.value) }))}
                type="number"
                value={form.passScore}
              />
              <span className="font-body text-xs text-on-surface-variant mt-1 block">
                out of {rubricTotal || 100}
              </span>
            </label>
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-3">
              <input
                checked={form.lateSubmission}
                className="h-4 w-4 rounded"
                onChange={(e) => setForm((f) => ({ ...f, lateSubmission: e.target.checked }))}
                type="checkbox"
              />
              <span className="font-body text-sm text-on-surface">Accept late submissions</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                checked={form.allowResubmission}
                className="h-4 w-4 rounded"
                onChange={(e) => setForm((f) => ({ ...f, allowResubmission: e.target.checked }))}
                type="checkbox"
              />
              <span className="font-body text-sm text-on-surface">
                Allow resubmission after marking
              </span>
            </label>
          </div>
        </section>

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-headline text-lg font-extrabold text-on-background">Rubric</h2>
              <p className="font-body text-xs text-on-surface-variant mt-1">
                Total {rubricTotal || 100} points. Marking against criteria keeps grading consistent.
              </p>
            </div>
            <button
              className={`${pill} bg-surface-container-high text-on-surface`}
              onClick={() => setCriteria((current) => [...current, emptyCriterion()])}
              type="button"
            >
              Add criterion
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-2xl bg-surface-container p-4 lg:grid-cols-[1fr_auto_1fr_auto] lg:items-end">
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Reuse a rubric template</span>
              <select className={fieldClass} defaultValue="" onChange={(event) => {
                const template = rubricTemplates.find((item) => Number(item.id) === Number(event.target.value))
                if (template) setCriteria(template.criteria.map((criterion) => ({ ...criterion })))
              }}>
                <option value="">Choose template</option>
                {rubricTemplates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
              </select>
            </label>
            <span className="hidden pb-3 font-body text-xs text-on-surface-variant lg:block">or</span>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Save current rubric for reuse</span>
              <input className={fieldClass} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name" value={templateName} />
            </label>
            <button className={`${pill} bg-secondary-container text-on-secondary-container`} onClick={saveTemplate} type="button">Save template</button>
          </div>

          {criteria.map((criterion, index) => (
            <div className="rounded-2xl bg-surface-container p-4" key={index}>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_6rem_2rem] gap-3 items-start">
                <div className="space-y-3">
                  <input
                    className="w-full rounded-xl bg-surface-container-lowest border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none"
                    onChange={(e) =>
                      setCriteria((current) =>
                        current.map((row, position) =>
                          position === index ? { ...row, label: e.target.value } : row,
                        ),
                      )
                    }
                    placeholder={`Criterion ${index + 1} — e.g. Correctness`}
                    value={criterion.label}
                  />
                  <input
                    className="w-full rounded-xl bg-surface-container-lowest border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none"
                    onChange={(e) =>
                      setCriteria((current) =>
                        current.map((row, position) =>
                          position === index ? { ...row, description: e.target.value } : row,
                        ),
                      )
                    }
                    placeholder="What earns full marks here? (optional)"
                    value={criterion.description}
                  />
                </div>
                <input
                  className="w-full rounded-xl bg-surface-container-lowest border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none"
                  min="1"
                  onChange={(e) =>
                    setCriteria((current) =>
                      current.map((row, position) =>
                        position === index ? { ...row, maxPoints: Number(e.target.value) } : row,
                      ),
                    )
                  }
                  type="number"
                  value={criterion.maxPoints}
                />
                {criteria.length > 1 ? (
                  <button
                    aria-label="Remove criterion"
                    className="text-on-surface-variant hover:text-error transition-colors pt-2.5"
                    onClick={() =>
                      setCriteria((current) => current.filter((_, position) => position !== index))
                    }
                    type="button"
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </section>

        <div className="flex flex-wrap gap-3 pb-8">
          <button
            className={`${pill} bg-surface-container-high text-on-surface disabled:opacity-60`}
            disabled={busy}
            onClick={() => handleSave(false)}
            type="button"
          >
            {busy ? 'Saving…' : 'Save as draft'}
          </button>
          <button
            className={`${pill} bg-primary text-on-primary disabled:opacity-60`}
            disabled={busy}
            onClick={() => handleSave(true)}
            type="button"
          >
            {busy ? 'Saving…' : 'Save & publish'}
          </button>
          {!isNew ? (
            <button
              className={`${pill} bg-sky text-on-sky`}
              onClick={() => navigate(`/trainer/assignments/${assignmentId}/grading`)}
              type="button"
            >
              Open grading queue
            </button>
          ) : null}
        </div>
      </div>
    </main>
  )
}

export default AssignmentEditorPage
