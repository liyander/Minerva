import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../services/api'

function AdminInterviewQuestionsPage() {
  const navigate = useNavigate()
  const [questionsText, setQuestionsText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [results, setResults] = useState([])

  const handleSubmit = async () => {
    const payload = questionsText.trim()
    if (!payload) {
      setErrorMessage('Add at least one interview question.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')
    try {
      const response = await apiFetch('/rooms/admin/interview-questions', {
        method: 'POST',
        body: JSON.stringify({ questionsText: payload }),
      })
      setResults(Array.isArray(response?.inserted) ? response.inserted : [])
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to analyse and insert interview questions.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-6xl mx-auto">
        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10 mb-8">
          <div className="mb-4 flex items-center gap-4">
            <button
              className="text-primary hover:text-on-surface transition-colors"
              onClick={() => navigate('/admin')}
              type="button"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <span className="font-headline text-xs text-primary font-bold">
              Admin Interview Bank
            </span>
          </div>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight">
            Interview Questions
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-on-surface-variant">
            Add custom interview questions. Admin AI analyses each question, maps it to the closest room, and inserts it as an optional bonus question.
          </p>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-8">
          <div className="rounded-2xl bg-surface-container-lowest p-6 md:p-8">
            <label className="block">
              <span className="font-headline text-xs font-bold text-primary">
                Custom Questions
              </span>
              <textarea
                className="rounded-2xl mt-3 min-h-[18rem] w-full bg-surface-container-highest  py-4 px-5 outline-none font-body text-sm"
                onChange={(event) => setQuestionsText(event.target.value)}
                placeholder={'Paste one question per line, or separate questions with blank lines.\n\nExample:\n1. How would you explain SQL injection risk to a developer?\n2. What evidence would you collect during a suspicious Linux process investigation?'}
                value={questionsText}
              ></textarea>
            </label>

            {errorMessage ? (
              <div className="rounded-xl mt-4 shadow-soft bg-error/10 px-4 py-3 text-sm text-error">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                className="rounded-full bg-primary text-on-primary px-6 py-3 font-headline text-sm font-bold disabled:opacity-60"
                disabled={isSubmitting}
                onClick={handleSubmit}
                type="button"
              >
                {isSubmitting ? 'Analysing...' : 'Analyse And Insert'}
              </button>
              <button
                className="rounded-xl border border-outline-variant px-6 py-3 font-headline text-xs font-bold text-on-surface hover:border-primary hover:text-primary"
                onClick={() => {
                  setQuestionsText('')
                  setResults([])
                  setErrorMessage('')
                }}
                type="button"
              >
                Clear
              </button>
            </div>
          </div>

          <aside className="rounded-2xl bg-surface-container-low p-6 ">
            <p className="font-headline text-xs font-bold text-secondary">
              Matching Rules
            </p>
            <h2 className="mt-2 font-headline text-xl font-extrabold tracking-tight">
              Skill-Aware Placement
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
              AI compares each question with skill title, category, description, learning content, mission overview, and deep-dive content.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
              If AI is unavailable, a local keyword matcher still inserts the question into the closest room.
            </p>
          </aside>
        </section>

        {results.length ? (
          <section className="rounded-2xl mt-8 bg-surface-container-lowest p-6 md:p-8">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="font-headline text-xs font-bold text-primary">
                  Insertion Result
                </p>
                <h2 className="font-headline text-2xl font-extrabold tracking-tight">
                  Matched Skills
                </h2>
              </div>
              <span className="font-headline text-xs font-bold text-secondary">
                {results.filter((item) => item.inserted).length} Inserted
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr className="bg-surface-container-high text-left">
                    <th className="px-4 py-3 font-headline text-xs">Question</th>
                    <th className="px-4 py-3 font-headline text-xs">Inserted Course</th>
                    <th className="px-4 py-3 font-headline text-xs">Source</th>
                    <th className="px-4 py-3 font-headline text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((item, index) => (
                    <tr className="border-b border-outline-variant/20" key={`${item.roomId}-${index}`}>
                      <td className="px-4 py-4 align-top text-sm text-on-surface">
                        <p>{item.question}</p>
                        <p className="mt-2 text-xs text-on-surface-variant">{item.reason}</p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="font-headline text-sm font-bold">{item.roomTitle}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">{item.roomId}</p>
                        <p className="mt-1 text-xs text-secondary">{item.category || 'Uncategorized'}</p>
                      </td>
                      <td className="px-4 py-4 align-top text-sm">
                        <p>{item.company || 'General interview practice'}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">{item.interview || 'Custom interview question'}</p>
                        <span className="rounded-full mt-2 inline-block bg-surface-container-high px-2 py-1 font-headline text-xs">
                          {item.matchedBy}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className={`inline-block px-3 py-1 font-headline text-xs font-bold ${
                          item.inserted ? 'bg-secondary/15 text-secondary' : 'bg-primary/10 text-primary'
                        }`}>
                          {item.inserted ? 'Inserted' : 'Duplicate'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  )
}

export default AdminInterviewQuestionsPage
