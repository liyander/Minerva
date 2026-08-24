import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import {
  createAssessment,
  fetchAssessment,
  fetchAssessmentSubjects,
  saveAssessmentQuestions,
  updateAssessment,
} from '../../services/training'

const emptyQuestion = () => ({
  prompt: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  explanation: '',
  marks: 1,
})

// <input type="datetime-local"> needs `YYYY-MM-DDTHH:mm` in local time.
function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function AssessmentEditorPage() {
  const { assessmentId } = useParams()
  const navigate = useNavigate()
  const isNew = !assessmentId || assessmentId === 'new'

  const [form, setForm] = useState({
    title: '',
    description: '',
    subject: '',
    passPercentage: 60,
    durationMinutes: 0,
    maxAttempts: 0,
    opensAt: '',
    deadline: '',
    isPublished: false,
  })
  const [questions, setQuestions] = useState([emptyQuestion()])
  const [subjects, setSubjects] = useState([])
  const [isLoading, setIsLoading] = useState(!isNew)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const subjectRows = await fetchAssessmentSubjects()
      setSubjects(subjectRows)

      if (isNew) return

      const assessment = await fetchAssessment(assessmentId)
      setForm({
        title: assessment.title || '',
        description: assessment.description || '',
        subject: assessment.subject || '',
        passPercentage: assessment.passPercentage ?? 60,
        durationMinutes: assessment.durationMinutes ?? 0,
        maxAttempts: assessment.maxAttempts ?? 0,
        opensAt: toLocalInput(assessment.opensAt),
        deadline: toLocalInput(assessment.deadline),
        isPublished: Boolean(assessment.isPublished),
      })
      setQuestions(
        assessment.questions?.length
          ? assessment.questions.map((question) => ({
              prompt: question.prompt,
              options: question.options.length ? question.options : ['', ''],
              correctIndex: question.correctIndex ?? 0,
              explanation: question.explanation || '',
              marks: question.marks ?? 1,
            }))
          : [emptyQuestion()],
      )
    } catch (loadError) {
      setError(loadError?.message || 'Could not load the questionnaire.')
    } finally {
      setIsLoading(false)
    }
  }, [assessmentId, isNew])

  useEffect(() => {
    void load()
  }, [load])

  const updateQuestion = (index, patch) => {
    setQuestions((current) =>
      current.map((question, position) => (position === index ? { ...question, ...patch } : question)),
    )
  }

  const updateOption = (questionIndex, optionIndex, value) => {
    setQuestions((current) =>
      current.map((question, position) =>
        position === questionIndex
          ? {
              ...question,
              options: question.options.map((option, spot) =>
                spot === optionIndex ? value : option,
              ),
            }
          : question,
      ),
    )
  }

  const validate = () => {
    if (!form.title.trim()) return 'Give the questionnaire a title.'
    if (!form.subject.trim()) return 'Choose a subject.'

    for (const [index, question] of questions.entries()) {
      if (!question.prompt.trim()) return `Question ${index + 1} needs a prompt.`
      const filled = question.options.filter((option) => option.trim())
      if (filled.length < 2) return `Question ${index + 1} needs at least two options.`
      if (!question.options[question.correctIndex]?.trim()) {
        return `Question ${index + 1} needs its correct answer filled in.`
      }
    }

    return ''
  }

  const handleSave = async (publish) => {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }

    setIsSaving(true)
    setError('')

    const payload = {
      ...form,
      isPublished: publish ?? form.isPublished,
      opensAt: form.opensAt || null,
      deadline: form.deadline || null,
    }

    try {
      const id = isNew ? (await createAssessment(payload)).id : assessmentId
      if (!isNew) await updateAssessment(id, payload)

      // Options are trimmed so blank slots do not become real answers.
      await saveAssessmentQuestions(
        id,
        questions.map((question) => ({
          ...question,
          options: question.options.filter((option) => option.trim()),
        })),
      )

      setNotice('Saved.')
      if (isNew) {
        navigate(`/trainer/assessments/${id}`, { replace: true })
      }
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the questionnaire.')
    } finally {
      setIsSaving(false)
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
          accent="lavender"
          description="Set the subject, the deadline and the questions. Trainees only see published questionnaires."
          eyebrow="Questionnaire"
          icon="quiz"
          title={isNew ? 'New questionnaire' : form.title || 'Edit questionnaire'}
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
          <h2 className="font-headline text-lg font-extrabold text-on-background">Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Title</span>
              <input
                className={fieldClass}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Module 2 knowledge check"
                value={form.title}
              />
            </label>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Subject</span>
              <input
                className={fieldClass}
                list="assessment-subjects"
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Data"
                value={form.subject}
              />
              <datalist id="assessment-subjects">
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
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              value={form.description}
            />
          </label>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">
                Pass mark %
              </span>
              <input
                className={fieldClass}
                max="100"
                min="0"
                onChange={(e) => setForm((f) => ({ ...f, passPercentage: Number(e.target.value) }))}
                type="number"
                value={form.passPercentage}
              />
            </label>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">
                Duration (min)
              </span>
              <input
                className={fieldClass}
                min="0"
                onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}
                type="number"
                value={form.durationMinutes}
              />
            </label>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">
                Max attempts
              </span>
              <input
                className={fieldClass}
                min="0"
                onChange={(e) => setForm((f) => ({ ...f, maxAttempts: Number(e.target.value) }))}
                placeholder="0 = unlimited"
                type="number"
                value={form.maxAttempts}
              />
            </label>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Opens</span>
              <input
                className={fieldClass}
                onChange={(e) => setForm((f) => ({ ...f, opensAt: e.target.value }))}
                type="datetime-local"
                value={form.opensAt}
              />
            </label>
          </div>

          <label className="block max-w-xs">
            <span className="font-headline text-xs font-bold text-on-surface-variant">Deadline</span>
            <input
              className={fieldClass}
              onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
              type="datetime-local"
              value={form.deadline}
            />
          </label>
        </section>

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-headline text-lg font-extrabold text-on-background">
              Questions ({questions.length})
            </h2>
            <button
              className={`${pill} bg-surface-container-high text-on-surface`}
              onClick={() => setQuestions((current) => [...current, emptyQuestion()])}
              type="button"
            >
              Add question
            </button>
          </div>

          {questions.map((question, index) => (
            <article className="rounded-2xl bg-surface-container p-5 space-y-4" key={index}>
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-primary-container text-on-primary-container px-3 py-1 font-headline text-xs font-bold shrink-0">
                  Q{index + 1}
                </span>
                {questions.length > 1 ? (
                  <button
                    aria-label="Remove question"
                    className="text-on-surface-variant hover:text-error transition-colors"
                    onClick={() =>
                      setQuestions((current) => current.filter((_, position) => position !== index))
                    }
                    type="button"
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>
                ) : null}
              </div>

              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">
                  Question
                </span>
                <textarea
                  className={fieldClass}
                  onChange={(e) => updateQuestion(index, { prompt: e.target.value })}
                  rows={2}
                  value={question.prompt}
                />
              </label>

              <div className="space-y-2">
                <span className="font-headline text-xs font-bold text-on-surface-variant">
                  Options — select the correct one
                </span>
                {question.options.map((option, optionIndex) => (
                  <div className="flex items-center gap-3" key={optionIndex}>
                    <input
                      aria-label={`Mark option ${optionIndex + 1} correct`}
                      checked={question.correctIndex === optionIndex}
                      className="h-4 w-4 shrink-0 accent-current text-primary"
                      name={`correct-${index}`}
                      onChange={() => updateQuestion(index, { correctIndex: optionIndex })}
                      type="radio"
                    />
                    <input
                      className="flex-1 rounded-xl bg-surface-container-lowest border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none"
                      onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                      placeholder={`Option ${optionIndex + 1}`}
                      value={option}
                    />
                    {question.options.length > 2 ? (
                      <button
                        aria-label="Remove option"
                        className="text-on-surface-variant hover:text-error transition-colors shrink-0"
                        onClick={() =>
                          updateQuestion(index, {
                            options: question.options.filter((_, spot) => spot !== optionIndex),
                            correctIndex:
                              question.correctIndex >= optionIndex && question.correctIndex > 0
                                ? question.correctIndex - 1
                                : question.correctIndex,
                          })
                        }
                        type="button"
                      >
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  className="font-headline text-xs font-bold text-primary hover:opacity-80"
                  onClick={() =>
                    updateQuestion(index, { options: [...question.options, ''] })
                  }
                  type="button"
                >
                  + Add option
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <label className="block sm:col-span-3">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    Explanation (shown after submission)
                  </span>
                  <input
                    className={fieldClass}
                    onChange={(e) => updateQuestion(index, { explanation: e.target.value })}
                    value={question.explanation}
                  />
                </label>
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    Marks
                  </span>
                  <input
                    className={fieldClass}
                    min="1"
                    onChange={(e) => updateQuestion(index, { marks: Number(e.target.value) })}
                    type="number"
                    value={question.marks}
                  />
                </label>
              </div>
            </article>
          ))}
        </section>

        <div className="flex flex-wrap gap-3 pb-8">
          <button
            className={`${pill} bg-surface-container-high text-on-surface disabled:opacity-60`}
            disabled={isSaving}
            onClick={() => handleSave(false)}
            type="button"
          >
            {isSaving ? 'Saving…' : 'Save as draft'}
          </button>
          <button
            className={`${pill} bg-primary text-on-primary disabled:opacity-60`}
            disabled={isSaving}
            onClick={() => handleSave(true)}
            type="button"
          >
            {isSaving ? 'Saving…' : 'Save & publish'}
          </button>
        </div>
      </div>
    </main>
  )
}

export default AssessmentEditorPage
