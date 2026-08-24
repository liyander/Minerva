import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import FileDropField from '../components/FileDropField'
import { fetchAssignment, fileUrl, submitAssignment } from '../services/platform'

function AssignmentDetailPage() {
  const { assignmentId } = useParams()
  const navigate = useNavigate()

  const [assignment, setAssignment] = useState(null)
  const [bodyText, setBodyText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [file, setFile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await fetchAssignment(assignmentId)
      setAssignment(data)
      setBodyText(data.mySubmission?.bodyText || '')
      setLinkUrl(data.mySubmission?.linkUrl || '')
      if (data.mySubmission?.fileId) {
        setFile({ id: data.mySubmission.fileId, fileName: 'Current submission' })
      }
    } catch (loadError) {
      setError(loadError?.message || 'Could not load this assignment.')
    } finally {
      setIsLoading(false)
    }
  }, [assignmentId])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      const response = await submitAssignment(assignmentId, {
        bodyText: bodyText || undefined,
        linkUrl: linkUrl || undefined,
        fileId: file?.id || undefined,
      })
      setNotice(
        response.isLate
          ? 'Submitted — flagged as late because the deadline had passed.'
          : 'Submitted. Your trainer will mark it shortly.',
      )
      await load()
    } catch (submitError) {
      setError(submitError?.message || 'Could not submit.')
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center pt-24">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      </main>
    )
  }

  if (!assignment) {
    return (
      <main className="min-h-screen bg-surface px-5 pt-28">
        <div className="mx-auto max-w-2xl rounded-3xl bg-blush p-8 text-center">
          <p className="font-headline text-lg font-extrabold text-on-blush">
            {error || 'Assignment not found'}
          </p>
          <button
            className="mt-5 rounded-full bg-surface-container-lowest px-6 py-3 font-headline text-sm font-bold text-on-blush"
            onClick={() => navigate('/assignments')}
            type="button"
          >
            Back to assignments
          </button>
        </div>
      </main>
    )
  }

  const submission = assignment.mySubmission
  const graded = submission?.status === 'graded'
  const locked = graded && !assignment.allowResubmission
  const closed = assignment.pastDeadline && !assignment.lateSubmission
  const wantsFile = ['file', 'any'].includes(assignment.submissionKind)
  const wantsText = ['text', 'code', 'any'].includes(assignment.submissionKind)
  const wantsCode = assignment.submissionKind === 'code'
  const wantsLink = ['link', 'any'].includes(assignment.submissionKind)

  const rubricScoreFor = (criterionId) =>
    submission?.rubricScores?.find((row) => Number(row.criterion_id ?? row.criterionId) === Number(criterionId))

  const fieldClass =
    'mt-1.5 w-full rounded-xl bg-surface-container border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none'

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24 pb-24 md:pb-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <button
          className="inline-flex items-center gap-1 font-headline text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={() => navigate('/assignments')}
          type="button"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          All assignments
        </button>

        {graded ? (
          <section
            className={`rounded-3xl p-8 text-center ${
              submission.passed ? 'bg-mint text-on-mint' : 'bg-butter text-on-butter'
            }`}
          >
            <span className="material-symbols-outlined text-5xl">
              {submission.passed ? 'verified' : 'rate_review'}
            </span>
            <h1 className="font-headline text-3xl font-extrabold mt-3">
              {submission.score}
              <span className="text-xl opacity-70">/{assignment.maxScore}</span>
            </h1>
            <p className="font-body text-sm opacity-80 mt-2">
              {submission.passed ? 'You passed' : `Pass mark is ${assignment.passScore}`}
              {submission.gradedAt
                ? ` · marked ${new Date(submission.gradedAt).toLocaleDateString()}`
                : ''}
            </p>
          </section>
        ) : null}

        <header className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <p className="font-headline text-xs font-bold text-on-surface-variant">
            {assignment.subject}
          </p>
          <h1 className="font-headline text-2xl font-extrabold text-on-background mt-1">
            {assignment.title}
          </h1>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-surface-container px-3 py-1 font-headline text-xs font-bold text-on-surface-variant">
              Out of {assignment.maxScore}
            </span>
            <span className="rounded-full bg-surface-container px-3 py-1 font-headline text-xs font-bold text-on-surface-variant">
              Pass {assignment.passScore}
            </span>
            {assignment.deadline ? (
              <span
                className={`rounded-full px-3 py-1 font-headline text-xs font-bold ${
                  assignment.pastDeadline ? 'bg-blush text-on-blush' : 'bg-mint text-on-mint'
                }`}
              >
                {assignment.pastDeadline ? 'Deadline passed' : 'Due'}{' '}
                {new Date(assignment.deadline).toLocaleString()}
              </span>
            ) : null}
          </div>

          {assignment.brief ? (
            <p className="font-body text-sm text-on-surface leading-relaxed mt-4 whitespace-pre-line">
              {assignment.brief}
            </p>
          ) : null}

          {assignment.attachmentFileId ? (
            <a
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface-container-high px-4 py-2 font-headline text-sm font-bold text-on-surface hover:opacity-90"
              href={fileUrl(assignment.attachmentFileId, { download: true })}
              rel="noreferrer"
              target="_blank"
            >
              <span className="material-symbols-outlined text-base">download</span>
              Download the brief
            </a>
          ) : null}
        </header>

        {assignment.rubric.length ? (
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
            <h2 className="font-headline text-lg font-extrabold text-on-background mb-1">
              How this is marked
            </h2>
            <p className="font-body text-xs text-on-surface-variant mb-4">
              {graded ? 'Your score against each criterion.' : 'The rubric your trainer will use.'}
            </p>

            <div className="space-y-2">
              {assignment.rubric.map((criterion) => {
                const score = rubricScoreFor(criterion.id)
                return (
                  <div className="rounded-2xl bg-surface-container p-4" key={criterion.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-headline text-sm font-bold text-on-surface">
                          {criterion.label}
                        </p>
                        {criterion.description ? (
                          <p className="font-body text-xs text-on-surface-variant mt-1">
                            {criterion.description}
                          </p>
                        ) : null}
                        {score?.comment ? (
                          <p className="font-body text-sm text-on-surface-variant mt-2">
                            {score.comment}
                          </p>
                        ) : null}
                      </div>
                      <span className="font-headline text-sm font-extrabold text-on-background shrink-0">
                        {score ? `${score.points}/` : ''}
                        {criterion.maxPoints}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        {submission?.feedback ? (
          <section className="rounded-3xl bg-sky p-6">
            <h2 className="font-headline text-base font-extrabold text-on-sky">
              Feedback from your trainer
            </h2>
            <p className="font-body text-sm text-on-sky/90 mt-2 whitespace-pre-line">
              {submission.feedback}
            </p>
          </section>
        ) : null}

        {submission?.history?.length ? (
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
            <h2 className="font-headline text-lg font-extrabold text-on-background">Submission history</h2>
            <p className="mt-1 font-body text-xs text-on-surface-variant">Earlier attempts remain available after resubmission, including their marks and feedback.</p>
            <div className="mt-4 space-y-3">
              {submission.history.map((attempt) => (
                <details className="rounded-2xl bg-surface-container p-4" key={attempt.id}>
                  <summary className="cursor-pointer list-none font-headline text-sm font-bold text-on-surface">
                    Attempt {attempt.attemptNumber} · {attempt.status === 'graded' ? `${attempt.score}/${assignment.maxScore}` : 'Submitted'} · {new Date(attempt.submittedAt).toLocaleString()}
                  </summary>
                  {attempt.feedback ? <p className="mt-3 font-body text-sm text-on-surface-variant"><strong>Feedback:</strong> {attempt.feedback}</p> : null}
                  {attempt.bodyText ? <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-container-high p-3 font-mono text-xs text-on-surface">{attempt.bodyText}</pre> : null}
                  {attempt.linkUrl ? <a className="mt-3 block text-sm font-bold text-primary underline" href={attempt.linkUrl} rel="noreferrer" target="_blank">Open submitted link</a> : null}
                  {attempt.fileId ? <a className="mt-3 block text-sm font-bold text-primary underline" href={fileUrl(attempt.fileId, { download: true })} rel="noreferrer" target="_blank">Download submitted file</a> : null}
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {notice ? (
          <div className="rounded-2xl bg-mint p-4">
            <p className="font-body text-sm text-on-mint">{notice}</p>
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">
            {submission ? 'Your submission' : 'Submit your work'}
          </h2>

          {locked ? (
            <p className="font-body text-sm text-on-surface-variant">
              This has been marked and resubmission is not allowed.
            </p>
          ) : closed ? (
            <p className="font-body text-sm text-error">
              The deadline has passed and late submissions are not accepted.
            </p>
          ) : (
            <form className="space-y-5" onSubmit={submit}>
              {wantsFile ? (
                <FileDropField
                  label="Attach your work"
                  onUploaded={setFile}
                  purpose="submission"
                  value={file}
                />
              ) : null}

              {wantsText ? (
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    {wantsCode ? 'Source code' : 'Your answer'}
                  </span>
                  <textarea
                    className={`${fieldClass} ${wantsCode ? 'font-mono' : ''}`}
                    onChange={(e) => setBodyText(e.target.value)}
                    placeholder={wantsCode ? 'Paste or write your source code here.' : 'Write your response here.'}
                    rows={8}
                    value={bodyText}
                  />
                </label>
              ) : null}

              {wantsLink ? (
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    Link to your work
                  </span>
                  <input
                    className={fieldClass}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://github.com/…"
                    value={linkUrl}
                  />
                </label>
              ) : null}

              <button
                className="rounded-full bg-primary px-7 py-3 font-headline text-sm font-bold text-on-primary hover:opacity-90 transition-opacity disabled:opacity-60"
                disabled={busy}
                type="submit"
              >
                {busy ? 'Submitting…' : submission ? 'Resubmit' : 'Submit'}
              </button>

              {submission ? (
                <p className="font-body text-xs text-on-surface-variant">
                  Submitted {new Date(submission.submittedAt).toLocaleString()}
                  {submission.isLate ? ' · marked late' : ''}. Resubmitting clears the current mark.
                </p>
              ) : null}
            </form>
          )}
        </section>
      </div>
    </main>
  )
}

export default AssignmentDetailPage
