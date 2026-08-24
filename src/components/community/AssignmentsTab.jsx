import { useCallback, useEffect, useState } from 'react'
import {
  createAssignment,
  fetchAssignment,
  fetchAssignmentAttachment,
  fetchAssignments,
  fetchSubmissionFile,
  gradeSubmission,
  submitAssignment,
} from '../../services/community'

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const SUBMISSION_TYPES = ['text', 'file', 'link', 'github']

function formatDueDate(value) {
  if (!value) return 'No due date'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'No due date'
  }
}

function isOverdue(dueAt) {
  return Boolean(dueAt) && new Date(dueAt).getTime() < Date.now()
}

const STATUS_STYLES = {
  submitted: 'bg-sky text-on-sky',
  late: 'bg-blush text-on-blush',
  reviewed: 'bg-mint text-on-mint',
  resubmit: 'bg-butter text-on-butter',
  completed: 'bg-primary-container text-on-primary-container',
}

function ProtectedFileButton({ label, loadFile }) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState('')

  const download = async () => {
    setIsDownloading(true)
    setError('')
    try {
      const file = await loadFile()
      if (file.externalUrl && !file.dataUrl) {
        window.open(file.externalUrl, '_blank', 'noopener,noreferrer')
        return
      }
      if (!file.dataUrl) throw new Error('This file is unavailable.')
      const link = document.createElement('a')
      link.href = file.dataUrl
      link.download = file.fileName || label || 'attachment'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (downloadError) {
      setError(downloadError?.message || 'Download failed.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1 font-body text-xs text-on-surface hover:bg-surface-container-highest disabled:opacity-50"
        disabled={isDownloading}
        onClick={() => void download()}
        type="button"
      >
        <span className="material-symbols-outlined text-sm">{isDownloading ? 'progress_activity' : 'download'}</span>
        {label}
      </button>
      {error ? <span className="mt-1 font-body text-[10px] text-error">{error}</span> : null}
    </span>
  )
}

function NewAssignmentForm({ classroomId, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [maxMarks, setMaxMarks] = useState(100)
  const [submissionType, setSubmissionType] = useState('text')
  const [attachments, setAttachments] = useState([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const handleFile = (file) => {
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Attachment is larger than 8 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setAttachments((current) => [
        ...current,
        { fileName: file.name, fileType: file.type, fileSize: file.size, fileData: String(reader.result || '') },
      ])
    }
    reader.readAsDataURL(file)
  }

  const submit = async () => {
    if (!title.trim()) return
    setIsSaving(true)
    setError('')
    try {
      const created = await createAssignment({
        classroomId,
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        dueAt: dueAt || null,
        maxMarks: Number(maxMarks) || 100,
        submissionType,
        attachments,
      })
      onCreated(created)
    } catch (submitError) {
      setError(submitError?.message || 'Failed to create assignment')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-low p-5 space-y-3">
      <p className="font-headline text-sm font-extrabold text-on-surface">New assignment</p>
      {error ? <p className="text-sm text-error font-body">{error}</p> : null}
      <input
        autoFocus
        className="w-full rounded-xl bg-surface-container-lowest px-4 py-2.5 text-sm font-body outline-none"
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Assignment title"
        value={title}
      />
      <textarea
        className="w-full rounded-xl bg-surface-container-lowest px-4 py-2.5 text-sm font-body outline-none min-h-[70px] resize-none"
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Short description"
        value={description}
      />
      <textarea
        className="w-full rounded-xl bg-surface-container-lowest px-4 py-2.5 text-sm font-body outline-none min-h-[90px] resize-none"
        onChange={(event) => setInstructions(event.target.value)}
        placeholder="Detailed instructions / rubric"
        value={instructions}
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-headline text-[11px] font-bold text-on-surface-variant">Due date</span>
          <input
            className="rounded-xl bg-surface-container-lowest px-3 py-2 text-sm font-body outline-none"
            onChange={(event) => setDueAt(event.target.value)}
            type="datetime-local"
            value={dueAt}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-headline text-[11px] font-bold text-on-surface-variant">Max marks</span>
          <input
            className="rounded-xl bg-surface-container-lowest px-3 py-2 text-sm font-body outline-none"
            min="1"
            onChange={(event) => setMaxMarks(event.target.value)}
            type="number"
            value={maxMarks}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-headline text-[11px] font-bold text-on-surface-variant">Submission type</span>
          <select
            className="rounded-xl bg-surface-container-lowest px-3 py-2 text-sm font-body outline-none"
            onChange={(event) => setSubmissionType(event.target.value)}
            value={submissionType}
          >
            {SUBMISSION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <span className="font-headline text-[11px] font-bold text-on-surface-variant">Attachments</span>
        <input
          className="mt-1 block w-full text-sm font-body"
          onChange={(event) => handleFile(event.target.files?.[0])}
          type="file"
        />
        {attachments.length ? (
          <ul className="mt-1 space-y-0.5">
            {attachments.map((attachment) => (
              <li className="font-body text-xs text-on-surface-variant" key={attachment.fileName}>
                {attachment.fileName}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        <button
          className="rounded-full px-4 py-2 font-headline text-xs font-bold text-on-surface-variant hover:bg-surface-container-high"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded-full px-5 py-2 bg-primary text-on-primary font-headline text-xs font-bold hover:opacity-90 disabled:opacity-50"
          disabled={!title.trim() || isSaving}
          onClick={submit}
          type="button"
        >
          {isSaving ? 'Creating…' : 'Post assignment'}
        </button>
      </div>
    </div>
  )
}

function SubmissionForm({ assignment, onSubmitted }) {
  const [body, setBody] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [file, setFile] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const handleFile = (selected) => {
    if (!selected) return
    if (selected.size > MAX_UPLOAD_BYTES) {
      setError('File is larger than 8 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setFile({ fileName: selected.name, fileType: selected.type, fileSize: selected.size, fileData: String(reader.result || '') })
    }
    reader.readAsDataURL(selected)
  }

  const submit = async () => {
    setIsSaving(true)
    setError('')
    try {
      const saved = await submitAssignment(assignment.id, {
        body: body.trim(),
        linkUrl: linkUrl.trim(),
        fileName: file?.fileName,
        fileType: file?.fileType,
        fileSize: file?.fileSize,
        fileData: file?.fileData,
      })
      onSubmitted(saved)
    } catch (submitError) {
      setError(submitError?.message || 'Failed to submit')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-low p-4 space-y-2">
      <p className="font-headline text-sm font-extrabold text-on-surface">Your submission</p>
      {error ? <p className="text-sm text-error font-body">{error}</p> : null}
      {assignment.submissionType !== 'file' ? (
        <textarea
          className="w-full rounded-xl bg-surface-container-lowest px-4 py-2.5 text-sm font-body outline-none min-h-[90px] resize-none"
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write your answer…"
          value={body}
        />
      ) : null}
      {['link', 'github'].includes(assignment.submissionType) ? (
        <input
          className="w-full rounded-xl bg-surface-container-lowest px-4 py-2.5 text-sm font-body outline-none"
          onChange={(event) => setLinkUrl(event.target.value)}
          placeholder={assignment.submissionType === 'github' ? 'GitHub repository URL' : 'Link URL'}
          value={linkUrl}
        />
      ) : null}
      {assignment.submissionType === 'file' ? (
        <input className="block w-full text-sm font-body" onChange={(event) => handleFile(event.target.files?.[0])} type="file" />
      ) : null}
      <div className="flex justify-end">
        <button
          className="rounded-full px-5 py-2 bg-primary text-on-primary font-headline text-xs font-bold hover:opacity-90 disabled:opacity-50"
          disabled={isSaving}
          onClick={submit}
          type="button"
        >
          {isSaving ? 'Submitting…' : 'Submit assignment'}
        </button>
      </div>
    </div>
  )
}

function GradeRow({ submission, maxMarks, onGraded }) {
  const [grade, setGrade] = useState(submission.grade ?? '')
  const [feedback, setFeedback] = useState(submission.feedback || '')
  const [isSaving, setIsSaving] = useState(false)

  const save = async (status) => {
    setIsSaving(true)
    try {
      const updated = await gradeSubmission(submission.id, {
        grade: grade === '' ? undefined : Number(grade),
        feedback,
        status,
      })
      onGraded(updated)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-headline text-sm font-bold text-on-surface">{submission.student?.name}</p>
          <p className="font-body text-[11px] text-on-surface-variant">
            Submitted {formatDueDate(submission.submittedAt)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 font-headline text-[10px] font-bold ${STATUS_STYLES[submission.status] || ''}`}>
          {submission.status}
        </span>
      </div>

      {submission.body ? <p className="font-body text-sm text-on-surface whitespace-pre-wrap mt-2">{submission.body}</p> : null}
      {submission.linkUrl ? (
        <a className="font-body text-sm text-primary underline mt-2 block" href={submission.linkUrl} rel="noreferrer" target="_blank">
          {submission.linkUrl}
        </a>
      ) : null}
      {submission.fileName ? (
        <div className="mt-2">
          <ProtectedFileButton label={submission.fileName} loadFile={() => fetchSubmissionFile(submission.id)} />
        </div>
      ) : null}

      <div className="flex items-center gap-2 mt-3">
        <input
          className="w-24 rounded-lg bg-surface-container-lowest px-3 py-1.5 text-sm font-body outline-none"
          max={maxMarks}
          min="0"
          onChange={(event) => setGrade(event.target.value)}
          placeholder={`/ ${maxMarks}`}
          type="number"
          value={grade}
        />
        <input
          className="flex-1 rounded-lg bg-surface-container-lowest px-3 py-1.5 text-sm font-body outline-none"
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="Feedback"
          value={feedback}
        />
        <button
          className="rounded-full px-3 py-1.5 bg-primary text-on-primary font-headline text-[11px] font-bold hover:opacity-90 disabled:opacity-50"
          disabled={isSaving}
          onClick={() => save('reviewed')}
          type="button"
        >
          Save
        </button>
        <button
          className="rounded-full px-3 py-1.5 font-headline text-[11px] font-bold text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
          disabled={isSaving}
          onClick={() => save('resubmit')}
          type="button"
        >
          Request resubmit
        </button>
        <button
          className="rounded-full px-3 py-1.5 font-headline text-[11px] font-bold text-primary hover:bg-primary-container disabled:opacity-50"
          disabled={isSaving}
          onClick={() => save('completed')}
          type="button"
        >
          Complete
        </button>
      </div>
    </div>
  )
}

function AssignmentsTab({ classroomId, canManage }) {
  const [assignments, setAssignments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const list = await fetchAssignments(classroomId)
      setAssignments(list)
    } finally {
      setIsLoading(false)
    }
  }, [classroomId])

  useEffect(() => {
    void load()
    setSelectedId(null)
    setDetail(null)
  }, [load])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    fetchAssignment(selectedId).then((data) => {
      if (!cancelled) setDetail(data)
    })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  if (selectedId && detail) {
    return (
      <div className="flex-1 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 flex flex-col min-h-0">
        <div className="px-5 py-4 border-b border-outline-variant/40">
          <button
            className="font-headline text-xs font-bold text-primary hover:underline"
            onClick={() => setSelectedId(null)}
            type="button"
          >
            ← Back to assignments
          </button>
          <p className="font-headline text-xl font-extrabold text-on-surface mt-2">{detail.title}</p>
          <p className="font-body text-xs text-on-surface-variant mt-1">
            Due {formatDueDate(detail.dueAt)} · {detail.maxMarks} marks · {detail.submissionType} submission
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {detail.description ? <p className="font-body text-sm text-on-surface whitespace-pre-wrap">{detail.description}</p> : null}
          {detail.instructions ? (
            <div className="rounded-xl bg-surface-container-low p-3">
              <p className="font-headline text-[11px] font-bold text-on-surface-variant uppercase">Instructions</p>
              <p className="font-body text-sm text-on-surface whitespace-pre-wrap mt-1">{detail.instructions}</p>
            </div>
          ) : null}
          {detail.attachments?.length ? (
            <div className="flex flex-wrap gap-2">
              {detail.attachments.map((attachment) => (
                <ProtectedFileButton
                  key={attachment.id}
                  label={attachment.fileName}
                  loadFile={() => fetchAssignmentAttachment(detail.id, attachment.id)}
                />
              ))}
            </div>
          ) : null}

          {canManage ? (
            <div>
              <p className="font-headline text-sm font-extrabold text-on-surface mb-2">
                Submissions ({detail.submissions?.length || 0})
              </p>
              <div className="space-y-2">
                {detail.submissions?.length ? (
                  detail.submissions.map((submission) => (
                    <GradeRow
                      key={submission.id}
                      maxMarks={detail.maxMarks}
                      onGraded={(updated) =>
                        setDetail((current) => ({
                          ...current,
                          submissions: current.submissions.map((item) => (item.id === updated.id ? updated : item)),
                        }))
                      }
                      submission={submission}
                    />
                  ))
                ) : (
                  <p className="font-body text-sm text-on-surface-variant">No submissions yet.</p>
                )}
              </div>
            </div>
          ) : (
            <div>
              {detail.mySubmission ? (
                <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-headline text-sm font-bold text-on-surface">Submitted</p>
                    <span className={`rounded-full px-2.5 py-0.5 font-headline text-[10px] font-bold ${STATUS_STYLES[detail.mySubmission.status] || ''}`}>
                      {detail.mySubmission.status}
                    </span>
                  </div>
                  {detail.mySubmission.grade !== null && detail.mySubmission.grade !== undefined ? (
                    <p className="font-body text-sm text-on-surface mt-1">
                      Grade: {detail.mySubmission.grade} / {detail.maxMarks}
                    </p>
                  ) : null}
                  {detail.mySubmission.feedback ? (
                    <p className="font-body text-sm text-on-surface-variant mt-1">Feedback: {detail.mySubmission.feedback}</p>
                  ) : null}
                  {detail.mySubmission.fileName ? (
                    <div className="mt-2">
                      <ProtectedFileButton label={detail.mySubmission.fileName} loadFile={() => fetchSubmissionFile(detail.mySubmission.id)} />
                    </div>
                  ) : null}
                  {detail.mySubmission.status === 'resubmit' ? (
                    <div className="mt-3">
                      <SubmissionForm
                        assignment={detail}
                        onSubmitted={(submission) => setDetail((current) => ({ ...current, mySubmission: submission }))}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <SubmissionForm
                  assignment={detail}
                  onSubmitted={(submission) => setDetail((current) => ({ ...current, mySubmission: submission }))}
                />
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 flex flex-col min-h-0">
      <div className="px-5 py-4 border-b border-outline-variant/40 flex items-center justify-between">
        <p className="font-headline text-sm font-extrabold text-on-surface">Assignments</p>
        {canManage ? (
          <button
            className="rounded-full inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary font-headline text-xs font-bold hover:opacity-90"
            onClick={() => setShowNewForm((value) => !value)}
            type="button"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            New assignment
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {showNewForm ? (
          <NewAssignmentForm
            classroomId={classroomId}
            onClose={() => setShowNewForm(false)}
            onCreated={(assignment) => {
              setAssignments((current) => [assignment, ...current])
              setShowNewForm(false)
            }}
          />
        ) : null}

        {isLoading ? (
          <p className="text-center text-sm text-on-surface-variant font-body py-8">Loading…</p>
        ) : assignments.length ? (
          assignments.map((assignment) => (
            <button
              className="w-full text-left rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 hover:bg-surface-container-high transition-colors"
              key={assignment.id}
              onClick={() => setSelectedId(assignment.id)}
              type="button"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-headline text-sm font-bold text-on-surface">{assignment.title}</p>
                {canManage ? (
                  <span className="font-body text-xs text-on-surface-variant">{assignment.submissionCount || 0} submitted</span>
                ) : assignment.mySubmission ? (
                  <span className={`rounded-full px-2.5 py-0.5 font-headline text-[10px] font-bold ${STATUS_STYLES[assignment.mySubmission.status] || ''}`}>
                    {assignment.mySubmission.status}
                  </span>
                ) : (
                  <span className={`rounded-full px-2.5 py-0.5 font-headline text-[10px] font-bold ${isOverdue(assignment.dueAt) ? 'bg-blush text-on-blush' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    {isOverdue(assignment.dueAt) ? 'Overdue' : 'Not submitted'}
                  </span>
                )}
              </div>
              <p className="font-body text-xs text-on-surface-variant mt-1">
                Due {formatDueDate(assignment.dueAt)} · {assignment.maxMarks} marks
              </p>
            </button>
          ))
        ) : (
          <p className="text-center text-sm text-on-surface-variant font-body py-8">No assignments yet.</p>
        )}
      </div>
    </div>
  )
}

export default AssignmentsTab
