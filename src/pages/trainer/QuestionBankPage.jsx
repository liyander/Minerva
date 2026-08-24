import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { fetchAssessmentSubjects } from '../../services/training'
import {
  createQuestionBank,
  deleteQuestionBank,
  fetchQuestionBank,
  fetchQuestionBanks,
  saveBankItems,
  updateQuestionBank,
} from '../../services/platform'

const DIFFICULTIES = ['easy', 'medium', 'hard']

const emptyItem = () => ({
  prompt: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  explanation: '',
  marks: 1,
  difficulty: 'medium',
  tags: '',
})

function QuestionBankPage() {
  const navigate = useNavigate()
  const [banks, setBanks] = useState([])
  const [subjects, setSubjects] = useState([])
  const [activeBank, setActiveBank] = useState(null)
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [newBank, setNewBank] = useState({ title: '', subject: '', isShared: true })
  const [showCreate, setShowCreate] = useState(false)

  const loadBanks = useCallback(async () => {
    setError('')
    try {
      const [bankRows, subjectRows] = await Promise.all([
        fetchQuestionBanks(),
        fetchAssessmentSubjects(),
      ])
      setBanks(bankRows)
      setSubjects(subjectRows)
    } catch (loadError) {
      setError(loadError?.message || 'Could not load question banks.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBanks()
  }, [loadBanks])

  const openBank = async (bank) => {
    setError('')
    try {
      const detail = await fetchQuestionBank(bank.id)
      setActiveBank(detail)
      setItems(detail.items.length ? detail.items : [emptyItem()])
    } catch (openError) {
      setError(openError?.message || 'Could not open that bank.')
    }
  }

  const create = async (event) => {
    event.preventDefault()
    if (!newBank.title.trim() || !newBank.subject.trim()) {
      setError('A bank needs a title and a subject.')
      return
    }

    setBusy(true)
    try {
      const { id } = await createQuestionBank(newBank)
      setNewBank({ title: '', subject: '', isShared: true })
      setShowCreate(false)
      await loadBanks()
      await openBank({ id })
    } catch (createError) {
      setError(createError?.message || 'Could not create the bank.')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    const filled = items.filter((item) => item.prompt.trim())

    for (const [index, item] of filled.entries()) {
      const options = item.options.filter((option) => option.trim())
      if (options.length < 2) {
        setError(`Question ${index + 1} needs at least two options.`)
        return
      }
      if (!item.options[item.correctIndex]?.trim()) {
        setError(`Question ${index + 1} needs its correct answer filled in.`)
        return
      }
    }

    setBusy(true)
    setError('')

    try {
      await saveBankItems(
        activeBank.id,
        filled.map((item) => ({ ...item, options: item.options.filter((o) => o.trim()) })),
      )
      setNotice(`Saved ${filled.length} question(s).`)
      await loadBanks()
    } catch (saveError) {
      setError(saveError?.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const update = (index, patch) => {
    setItems((current) =>
      current.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    )
  }

  const fieldClass =
    'w-full rounded-xl bg-surface-container-lowest border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none'
  const pill = 'rounded-full px-5 py-2.5 font-headline text-sm font-bold transition-opacity hover:opacity-90'

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24">
      <div className="mx-auto max-w-5xl space-y-6">
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
          description="Build a pool of questions per subject, then have an assessment draw a random subset for each attempt so no two papers match."
          eyebrow="Question banks"
          icon="inventory_2"
          title="Question banks"
        />

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

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-headline text-lg font-extrabold text-on-background">
              Your banks ({banks.length})
            </h2>
            <button
              className={`${pill} bg-primary text-on-primary`}
              onClick={() => setShowCreate((value) => !value)}
              type="button"
            >
              {showCreate ? 'Cancel' : 'New bank'}
            </button>
          </div>

          {showCreate ? (
            <form className="rounded-2xl bg-surface-container p-5 mb-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end" onSubmit={create}>
              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">Title</span>
                <input
                  className={`${fieldClass} mt-1.5`}
                  onChange={(e) => setNewBank((b) => ({ ...b, title: e.target.value }))}
                  placeholder="SQL fundamentals pool"
                  value={newBank.title}
                />
              </label>
              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">
                  Subject
                </span>
                <input
                  className={`${fieldClass} mt-1.5`}
                  list="bank-subjects"
                  onChange={(e) => setNewBank((b) => ({ ...b, subject: e.target.value }))}
                  value={newBank.subject}
                />
                <datalist id="bank-subjects">
                  {subjects.map((subject) => (
                    <option key={subject} value={subject} />
                  ))}
                </datalist>
              </label>
              <button className={`${pill} bg-primary text-on-primary`} disabled={busy} type="submit">
                Create
              </button>
            </form>
          ) : null}

          {isLoading ? (
            <div className="py-8 text-center">
              <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            </div>
          ) : banks.length === 0 ? (
            <p className="font-body text-sm text-on-surface-variant py-6 text-center">
              No banks yet. Create one and add questions to it.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {banks.map((bank) => (
                <article
                  className={`rounded-2xl p-4 transition-colors ${
                    activeBank?.id === bank.id
                      ? 'bg-primary-container text-on-primary-container'
                      : 'bg-surface-container'
                  }`}
                  key={bank.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button className="min-w-0 text-left" onClick={() => openBank(bank)} type="button">
                      <h3 className="font-headline text-sm font-extrabold truncate">{bank.title}</h3>
                      <p className="font-body text-xs opacity-70 mt-1">
                        {bank.subject} · {bank.itemCount} questions · used by {bank.usedBy}
                      </p>
                      {!bank.isShared ? (
                        <span className="mt-2 inline-block rounded-full bg-surface-container-high px-2 py-0.5 font-headline text-[11px] font-bold">
                          Private
                        </span>
                      ) : null}
                    </button>
                    {bank.canManage ? (
                      <button
                        aria-label={`Delete ${bank.title}`}
                        className="shrink-0 opacity-60 hover:opacity-100 hover:text-error transition-all"
                        onClick={async () => {
                          if (!window.confirm(`Delete "${bank.title}" and all its questions?`)) return
                          await deleteQuestionBank(bank.id)
                          if (activeBank?.id === bank.id) setActiveBank(null)
                          await loadBanks()
                        }}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {activeBank ? (
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-headline text-lg font-extrabold text-on-background">
                  {activeBank.title}
                </h2>
                <p className="font-body text-xs text-on-surface-variant mt-1">
                  {activeBank.subject} · {items.filter((i) => i.prompt.trim()).length} questions
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 pr-2">
                  <input
                    checked={activeBank.isShared}
                    className="h-4 w-4 rounded"
                    onChange={async (e) => {
                      await updateQuestionBank(activeBank.id, { isShared: e.target.checked })
                      setActiveBank((current) => ({ ...current, isShared: e.target.checked }))
                      await loadBanks()
                    }}
                    type="checkbox"
                  />
                  <span className="font-body text-sm text-on-surface">Share with other trainers</span>
                </label>
                <button
                  className={`${pill} bg-surface-container-high text-on-surface`}
                  onClick={() => setItems((current) => [...current, emptyItem()])}
                  type="button"
                >
                  Add question
                </button>
                <button
                  className={`${pill} bg-primary text-on-primary disabled:opacity-60`}
                  disabled={busy}
                  onClick={save}
                  type="button"
                >
                  {busy ? 'Saving…' : 'Save bank'}
                </button>
              </div>
            </div>

            {items.map((item, index) => (
              <article className="rounded-2xl bg-surface-container p-5 space-y-4" key={index}>
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-surface-container-lowest px-3 py-1 font-headline text-xs font-bold text-on-surface-variant shrink-0">
                    Q{index + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Difficulty"
                      className="rounded-full bg-surface-container-lowest border border-transparent focus:border-primary focus:ring-0 font-headline text-xs font-bold py-1.5 pl-3 pr-7 outline-none"
                      onChange={(e) => update(index, { difficulty: e.target.value })}
                      value={item.difficulty}
                    >
                      {DIFFICULTIES.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                    {items.length > 1 ? (
                      <button
                        aria-label="Remove question"
                        className="text-on-surface-variant hover:text-error transition-colors"
                        onClick={() =>
                          setItems((current) => current.filter((_, position) => position !== index))
                        }
                        type="button"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                <textarea
                  className={fieldClass}
                  onChange={(e) => update(index, { prompt: e.target.value })}
                  placeholder="Question text"
                  rows={2}
                  value={item.prompt}
                />

                <div className="space-y-2">
                  {item.options.map((option, optionIndex) => (
                    <div className="flex items-center gap-3" key={optionIndex}>
                      <input
                        aria-label={`Mark option ${optionIndex + 1} correct`}
                        checked={item.correctIndex === optionIndex}
                        className="h-4 w-4 shrink-0"
                        name={`bank-correct-${index}`}
                        onChange={() => update(index, { correctIndex: optionIndex })}
                        type="radio"
                      />
                      <input
                        className={fieldClass}
                        onChange={(e) =>
                          update(index, {
                            options: item.options.map((value, spot) =>
                              spot === optionIndex ? e.target.value : value,
                            ),
                          })
                        }
                        placeholder={`Option ${optionIndex + 1}`}
                        value={option}
                      />
                      {item.options.length > 2 ? (
                        <button
                          aria-label="Remove option"
                          className="text-on-surface-variant hover:text-error transition-colors shrink-0"
                          onClick={() =>
                            update(index, {
                              options: item.options.filter((_, spot) => spot !== optionIndex),
                              correctIndex:
                                item.correctIndex >= optionIndex && item.correctIndex > 0
                                  ? item.correctIndex - 1
                                  : item.correctIndex,
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
                    onClick={() => update(index, { options: [...item.options, ''] })}
                    type="button"
                  >
                    + Add option
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_6rem_8rem] gap-3">
                  <input
                    className={fieldClass}
                    onChange={(e) => update(index, { explanation: e.target.value })}
                    placeholder="Explanation shown after marking (optional)"
                    value={item.explanation}
                  />
                  <input
                    aria-label="Marks"
                    className={fieldClass}
                    min="1"
                    onChange={(e) => update(index, { marks: Number(e.target.value) })}
                    type="number"
                    value={item.marks}
                  />
                  <input
                    className={fieldClass}
                    onChange={(e) => update(index, { tags: e.target.value })}
                    placeholder="tags"
                    value={item.tags || ''}
                  />
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  )
}

export default QuestionBankPage
