import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchAssessment, submitAssessment } from '../services/training'

function AssessmentAttemptPage() {
  const { assessmentId } = useParams()
  const navigate = useNavigate()
  const [assessment, setAssessment] = useState(null)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(null)
  const submitRef = useRef(null)

  useEffect(() => {
    fetchAssessment(assessmentId)
      .then((data) => {
        setAssessment(data)
        if (data.durationMinutes > 0) setSecondsLeft(data.durationMinutes * 60)
      })
      .catch((loadError) => setError(loadError?.message || 'Could not load this assessment.'))
      .finally(() => setIsLoading(false))
  }, [assessmentId])

  const handleSubmit = useCallback(async () => {
    if (isSubmitting || result) return

    setIsSubmitting(true)
    setError('')
    try {
      setResult(await submitAssessment(assessmentId, answers))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (submitError) {
      setError(submitError?.message || 'Could not submit your answers.')
    } finally {
      setIsSubmitting(false)
    }
  }, [answers, assessmentId, isSubmitting, result])

  submitRef.current = handleSubmit

  // Timed assessments submit themselves when the clock runs out.
  useEffect(() => {
    if (secondsLeft === null || result) return undefined

    if (secondsLeft <= 0) {
      void submitRef.current?.()
      return undefined
    }

    const timer = window.setTimeout(() => setSecondsLeft((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft, result])

  const answeredCount = Object.keys(answers).length
  const total = assessment?.questions?.length || 0
  const progress = total ? Math.round((answeredCount / total) * 100) : 0

  const clock = useMemo(() => {
    if (secondsLeft === null) return null
    const minutes = Math.floor(secondsLeft / 60)
    const seconds = secondsLeft % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }, [secondsLeft])

  if (isLoading) {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center pt-24">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      </main>
    )
  }

  if (!assessment) {
    return (
      <main className="min-h-screen bg-surface px-5 pt-28">
        <div className="mx-auto max-w-2xl rounded-3xl bg-blush p-8 text-center">
          <p className="font-headline text-lg font-extrabold text-on-blush">
            {error || 'Assessment not found'}
          </p>
          <button
            className="mt-5 rounded-full bg-surface-container-lowest px-6 py-3 font-headline text-sm font-bold text-on-blush"
            onClick={() => navigate('/assessments')}
            type="button"
          >
            Back to assessments
          </button>
        </div>
      </main>
    )
  }

  const byQuestionId = new Map((result?.breakdown || []).map((row) => [row.questionId, row]))

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24 pb-24 md:pb-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <button
          className="inline-flex items-center gap-1 font-headline text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={() => navigate('/assessments')}
          type="button"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          All assessments
        </button>

        {result ? (
          <section
            className={`rounded-3xl p-8 text-center ${
              result.passed ? 'bg-mint text-on-mint' : 'bg-butter text-on-butter'
            }`}
          >
            <span className="material-symbols-outlined text-5xl">
              {result.passed ? 'verified' : 'refresh'}
            </span>
            <h1 className="font-headline text-3xl font-extrabold mt-3">{result.percentage}%</h1>
            <p className="font-body text-sm opacity-80 mt-2">
              {result.score} of {result.maxScore} marks ·{' '}
              {result.passed ? 'You passed' : `Pass mark is ${assessment.passPercentage}%`}
            </p>
            <button
              className="mt-6 rounded-full bg-surface-container-lowest px-6 py-3 font-headline text-sm font-bold hover:opacity-90 transition-opacity"
              onClick={() => navigate('/assessments')}
              type="button"
            >
              Done
            </button>
          </section>
        ) : (
          <header className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-headline text-xs font-bold text-on-surface-variant">
                  {assessment.subject}
                </p>
                <h1 className="font-headline text-2xl font-extrabold text-on-background mt-1">
                  {assessment.title}
                </h1>
              </div>
              {clock ? (
                <span
                  className={`rounded-full px-4 py-2 font-headline text-sm font-bold shrink-0 ${
                    secondsLeft < 60 ? 'bg-blush text-on-blush' : 'bg-sky text-on-sky'
                  }`}
                >
                  {clock}
                </span>
              ) : null}
            </div>

            {assessment.description ? (
              <p className="font-body text-sm text-on-surface-variant mt-3">
                {assessment.description}
              </p>
            ) : null}

            <div className="mt-5">
              <div className="flex items-center justify-between font-body text-xs text-on-surface-variant mb-2">
                <span>
                  {answeredCount} of {total} answered
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          </header>
        )}

        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}

        <div className="space-y-4">
          {assessment.questions.map((question, index) => {
            const outcome = byQuestionId.get(question.id)

            return (
              <article className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft" key={question.id}>
                <div className="flex items-start gap-3">
                  <span className="rounded-full bg-primary-container text-on-primary-container px-3 py-1 font-headline text-xs font-bold shrink-0">
                    {index + 1}
                  </span>
                  <p className="font-headline text-base font-bold text-on-background">
                    {question.prompt}
                  </p>
                </div>

                <div className="mt-4 space-y-2">
                  {question.options.map((option, optionIndex) => {
                    const selected = answers[question.id] === optionIndex
                    let tone = selected
                      ? 'border-primary bg-primary-container text-on-primary-container'
                      : 'border-outline-variant bg-surface-container text-on-surface hover:border-outline'

                    if (outcome) {
                      if (optionIndex === outcome.correctIndex) {
                        tone = 'border-transparent bg-mint text-on-mint'
                      } else if (optionIndex === outcome.chosenIndex) {
                        tone = 'border-transparent bg-blush text-on-blush'
                      } else {
                        tone = 'border-outline-variant bg-surface-container text-on-surface-variant'
                      }
                    }

                    return (
                      <button
                        className={`w-full rounded-2xl border px-4 py-3 text-left font-body text-sm transition-colors ${tone}`}
                        disabled={Boolean(result)}
                        key={optionIndex}
                        onClick={() =>
                          setAnswers((current) => ({ ...current, [question.id]: optionIndex }))
                        }
                        type="button"
                      >
                        <span className="font-headline text-xs font-bold mr-2">
                          {String.fromCharCode(65 + optionIndex)}
                        </span>
                        {option}
                      </button>
                    )
                  })}
                </div>

                {outcome?.explanation ? (
                  <p className="font-body text-sm text-on-surface-variant mt-3 rounded-2xl bg-surface-container p-3">
                    {outcome.explanation}
                  </p>
                ) : null}
              </article>
            )
          })}
        </div>

        {!result ? (
          <div className="sticky bottom-4 rounded-3xl bg-surface-container-lowest p-4 shadow-card flex flex-wrap items-center justify-between gap-3">
            <p className="font-body text-sm text-on-surface-variant">
              {answeredCount < total
                ? `${total - answeredCount} question${total - answeredCount === 1 ? '' : 's'} left`
                : 'All questions answered'}
            </p>
            <button
              className="rounded-full px-7 py-3 bg-primary text-on-primary font-headline text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
              disabled={isSubmitting || answeredCount === 0}
              onClick={handleSubmit}
              type="button"
            >
              {isSubmitting ? 'Submitting…' : 'Submit answers'}
            </button>
          </div>
        ) : null}
      </div>
    </main>
  )
}

export default AssessmentAttemptPage
