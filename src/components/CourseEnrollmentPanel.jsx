import { useCallback, useEffect, useState } from 'react'
import {
  enroll,
  fetchCourseFeedback,
  fetchMyEnrollments,
  submitFeedback,
  unenroll,
} from '../services/training'

function Stars({ value, onChange, label }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          aria-label={`${star} out of 5`}
          className={`transition-transform hover:scale-110 ${
            star <= value ? 'text-primary' : 'text-on-surface-variant/40'
          }`}
          key={star}
          onClick={() => onChange(star)}
          type="button"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: star <= value ? "'FILL' 1" : "'FILL' 0" }}
          >
            star
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * Enrolment status plus course feedback for a single course. Kept self-contained
 * so it can be dropped into the course page without threading extra state.
 */
function CourseEnrollmentPanel({ roomId, courseTitle }) {
  const [enrollment, setEnrollment] = useState(null)
  const [feedback, setFeedback] = useState({ average: null, count: 0, feedback: [] })
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)

  const load = useCallback(async () => {
    if (!roomId) return
    try {
      const [enrollments, feedbackData] = await Promise.all([
        fetchMyEnrollments().catch(() => []),
        fetchCourseFeedback(roomId).catch(() => ({ average: null, count: 0, feedback: [] })),
      ])
      setEnrollment(enrollments.find((item) => item.roomId === roomId) || null)
      setFeedback(feedbackData)
    } catch {
      // A failure here should not block the course content itself.
    }
  }, [roomId])

  useEffect(() => {
    void load()
  }, [load])

  const toggleEnrollment = async () => {
    setBusy(true)
    setError('')
    try {
      if (enrollment) {
        await unenroll(enrollment.id)
        setNotice('You have left this course.')
      } else {
        await enroll({ roomId })
        setNotice('You are enrolled.')
      }
      await load()
    } catch (actionError) {
      setError(actionError?.message || 'Could not update your enrolment.')
    } finally {
      setBusy(false)
    }
  }

  const sendFeedback = async (event) => {
    event.preventDefault()
    if (!rating) {
      setError('Choose a star rating first.')
      return
    }

    setBusy(true)
    setError('')
    try {
      await submitFeedback({ roomId, rating, comment })
      setShowFeedbackForm(false)
      setComment('')
      setNotice('Thanks for the feedback.')
      await load()
    } catch (feedbackError) {
      setError(feedbackError?.message || 'Could not save your feedback.')
    } finally {
      setBusy(false)
    }
  }

  if (!roomId) return null

  return (
    <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-headline text-lg font-extrabold text-on-background">
            {enrollment ? 'You are enrolled' : 'Enrol in this course'}
          </h2>
          <p className="font-body text-sm text-on-surface-variant mt-1">
            {enrollment
              ? `Enrolled ${new Date(enrollment.enrolledAt).toLocaleDateString()}`
              : 'Track this course from your dashboard and appear in participation reports.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {feedback.average ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-butter px-4 py-2 font-headline text-sm font-bold text-on-butter">
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
                star
              </span>
              {feedback.average} · {feedback.count}
            </span>
          ) : null}

          <button
            className={`rounded-full px-6 py-3 font-headline text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-60 ${
              enrollment
                ? 'bg-surface-container-high text-on-surface'
                : 'bg-primary text-on-primary'
            }`}
            disabled={busy}
            onClick={toggleEnrollment}
            type="button"
          >
            {busy ? 'Saving…' : enrollment ? 'Leave course' : 'Enrol now'}
          </button>

          <button
            className="rounded-full bg-surface-container-high px-5 py-3 font-headline text-sm font-bold text-on-surface hover:opacity-90 transition-opacity"
            onClick={() => setShowFeedbackForm((value) => !value)}
            type="button"
          >
            {showFeedbackForm ? 'Cancel' : 'Give feedback'}
          </button>
        </div>
      </div>

      {notice ? (
        <div className="rounded-2xl bg-mint px-4 py-3">
          <p className="font-body text-sm text-on-mint">{notice}</p>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl bg-blush px-4 py-3">
          <p className="font-body text-sm text-on-blush">{error}</p>
        </div>
      ) : null}

      {showFeedbackForm ? (
        <form className="rounded-2xl bg-surface-container p-5 space-y-4" onSubmit={sendFeedback}>
          <div>
            <span className="font-headline text-xs font-bold text-on-surface-variant block mb-2">
              How would you rate {courseTitle || 'this course'}?
            </span>
            <Stars label="Overall rating" onChange={setRating} value={rating} />
          </div>

          <label className="block">
            <span className="font-headline text-xs font-bold text-on-surface-variant">
              Comments (optional)
            </span>
            <textarea
              className="mt-1.5 w-full rounded-xl bg-surface-container-lowest border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none"
              onChange={(e) => setComment(e.target.value)}
              placeholder="What worked well? What could be clearer?"
              rows={3}
              value={comment}
            />
          </label>

          <button
            className="rounded-full bg-primary px-6 py-2.5 font-headline text-sm font-bold text-on-primary hover:opacity-90 transition-opacity disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? 'Sending…' : 'Submit feedback'}
          </button>
        </form>
      ) : null}

      {feedback.feedback.length ? (
        <div className="space-y-2">
          <h3 className="font-headline text-sm font-bold text-on-surface-variant">
            What others said
          </h3>
          {feedback.feedback.slice(0, 3).map((entry) => (
            <article className="rounded-2xl bg-surface-container p-4" key={entry.id}>
              <div className="flex items-center gap-2">
                <span className="font-headline text-sm font-bold text-on-surface">
                  {entry.author}
                </span>
                <span className="font-body text-xs text-primary">
                  {'★'.repeat(entry.rating)}
                </span>
              </div>
              {entry.comment ? (
                <p className="font-body text-sm text-on-surface-variant mt-1">{entry.comment}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export default CourseEnrollmentPanel
