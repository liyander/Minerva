import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../services/api'

const KAHOOT_COLORS = [
  { bg: 'bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400', badge: 'bg-rose-500 text-white', icon: 'change_history', label: 'Option 1 (Red ▲)' },
  { bg: 'bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-400', badge: 'bg-blue-500 text-white', icon: 'diamond', label: 'Option 2 (Blue ◆)' },
  { bg: 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400', badge: 'bg-amber-500 text-white', icon: 'circle', label: 'Option 3 (Yellow ●)' },
  { bg: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-500 text-white', icon: 'square', label: 'Option 4 (Green ■)' },
]

export default function ContestEditorPage() {
  const { id: contestId } = useParams()
  const isEditing = Boolean(contestId && contestId !== 'new')
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState('Cybersecurity & Development')
  const [courseId, setCourseId] = useState('')
  const [defaultTimeLimit, setDefaultTimeLimit] = useState(20)
  const [leaderboardDuration, setLeaderboardDuration] = useState(6)
  const [questions, setQuestions] = useState([
    {
      prompt: 'What is the primary function of a web application firewall (WAF)?',
      options: [
        'To inspect and filter HTTP/HTTPS traffic for malicious payloads',
        'To speed up client browser rendering engines',
        'To compile client-side React components',
        'To generate database schema backups',
      ],
      correctIndex: 0,
      timeLimitSeconds: 20,
      points: 1000,
      explanation: 'A WAF inspects incoming HTTP/S requests to block common attacks such as SQLi, XSS, and CSRF.',
    },
  ])

  const [courses, setCourses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEditing)

  // AI Modal State
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiTopic, setAiTopic] = useState('')
  const [aiCount, setAiCount] = useState(5)
  const [aiDifficulty, setAiDifficulty] = useState('medium')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState('')

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [roomsData, subjectsData] = await Promise.all([
          apiFetch('/rooms').catch(() => []),
          apiFetch('/assessments/subjects').catch(() => []),
        ])
        setCourses(Array.isArray(roomsData) ? roomsData : [])
        setSubjects(Array.isArray(subjectsData) ? subjectsData : [])
      } catch {
        // ignore
      }
    }
    void fetchMetadata()

    if (isEditing) {
      const fetchContest = async () => {
        try {
          setLoading(true)
          const data = await apiFetch(`/contests/${contestId}`)
          if (data) {
            setTitle(data.title || '')
            setDescription(data.description || '')
            setSubject(data.subject || 'General')
            setCourseId(data.courseId || '')
            setDefaultTimeLimit(data.defaultTimeLimit || 20)
            setLeaderboardDuration(data.leaderboardDurationSeconds || 6)
            if (Array.isArray(data.questions) && data.questions.length > 0) {
              setQuestions(
                data.questions.map((q) => ({
                  prompt: q.prompt || '',
                  options: Array.isArray(q.options) && q.options.length === 4 ? q.options : ['A', 'B', 'C', 'D'],
                  correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
                  timeLimitSeconds: q.timeLimitSeconds || 20,
                  points: q.points || 1000,
                  explanation: q.explanation || '',
                })),
              )
            }
          }
        } catch (err) {
          alert('Failed to load contest: ' + err.message)
          navigate('/trainer/contests')
        } finally {
          setLoading(false)
        }
      }
      void fetchContest()
    }
  }, [contestId, isEditing, navigate])

  const handleAddQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        prompt: '',
        options: ['', '', '', ''],
        correctIndex: 0,
        timeLimitSeconds: defaultTimeLimit,
        points: 1000,
        explanation: '',
      },
    ])
  }

  const handleUpdateQuestion = (index, field, value) => {
    setQuestions((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  const handleUpdateOption = (qIndex, optIndex, value) => {
    setQuestions((prev) => {
      const copy = [...prev]
      const currentOpts = [...copy[qIndex].options]
      currentOpts[optIndex] = value
      copy[qIndex] = { ...copy[qIndex], options: currentOpts }
      return copy
    })
  }

  const handleDeleteQuestion = (index) => {
    if (questions.length <= 1) {
      alert('A contest must contain at least 1 question.')
      return
    }
    setQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDuplicateQuestion = (index) => {
    setQuestions((prev) => {
      const copy = [...prev]
      const duplicated = {
        ...copy[index],
        prompt: `${copy[index].prompt} (Copy)`,
        options: [...copy[index].options],
      }
      copy.splice(index + 1, 0, duplicated)
      return copy
    })
  }

  const handleMoveQuestion = (index, direction) => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === questions.length - 1)
    )
      return
    setQuestions((prev) => {
      const copy = [...prev]
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      const temp = copy[index]
      copy[index] = copy[targetIndex]
      copy[targetIndex] = temp
      return copy
    })
  }

  const handleGenerateAiQuestions = async (mode = 'replace') => {
    if (!aiTopic.trim()) {
      setAiError('Please enter a topic for question generation.')
      return
    }
    try {
      setAiGenerating(true)
      setAiError('')
      const selectedCourse = courses.find((c) => c.id === courseId || c.slug === courseId)
      const res = await apiFetch('/contests/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          topic: aiTopic.trim(),
          courseTitle: selectedCourse?.title || '',
          count: aiCount,
          difficulty: aiDifficulty,
        }),
      })

      if (res?.questions && Array.isArray(res.questions)) {
        if (mode === 'replace') {
          setQuestions(res.questions)
        } else {
          setQuestions((prev) => [...prev, ...res.questions])
        }
        if (!title) {
          setTitle(`${aiTopic.trim()} Live Contest`)
        }
        setShowAiModal(false)
      } else {
        setAiError('Could not generate questions. Please try again.')
      }
    } catch (err) {
      setAiError(err.message || 'AI generation failed.')
    } finally {
      setAiGenerating(false)
    }
  }

  const handleSaveContest = async (launchArena = false) => {
    if (!title.trim()) {
      alert('Please enter a title for the contest.')
      return
    }

    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].prompt.trim()) {
        alert(`Question #${i + 1} has an empty question prompt.`)
        return
      }
      for (let j = 0; j < 4; j++) {
        if (!questions[i].options[j] || !questions[i].options[j].trim()) {
          alert(`Question #${i + 1} is missing Option ${j + 1}.`)
          return
        }
      }
    }

    try {
      setSaving(true)
      let savedId = contestId

      if (isEditing) {
        await apiFetch(`/contests/${contestId}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            subject: subject.trim(),
            courseId: courseId || null,
            defaultTimeLimit: Number(defaultTimeLimit),
            leaderboardDurationSeconds: Number(leaderboardDuration),
          }),
        })

        await apiFetch(`/contests/${contestId}/questions`, {
          method: 'PUT',
          body: JSON.stringify({ questions }),
        })
      } else {
        const res = await apiFetch('/contests', {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            subject: subject.trim(),
            courseId: courseId || null,
            defaultTimeLimit: Number(defaultTimeLimit),
            leaderboardDurationSeconds: Number(leaderboardDuration),
            questions,
          }),
        })
        savedId = res?.id
      }

      if (launchArena && savedId) {
        navigate(`/trainer/contests/${savedId}/host`)
      } else {
        navigate('/trainer/contests')
      }
    } catch (err) {
      alert('Failed to save contest: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
        <p className="mt-2 font-headline text-sm font-semibold">Loading quiz editor...</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen pt-24 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              to="/trainer/contests"
              className="p-1.5 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </Link>
            <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-on-surface">
              {isEditing ? 'Edit Live Contest' : 'Design New Kahoot Quiz'}
            </h1>
          </div>
          <p className="font-body text-xs sm:text-sm text-on-surface-variant mt-1">
            Build fast-paced 4-choice questions with speed-based scoring, live leaderboards, and AI question generation.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowAiModal(true)}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-secondary-container px-4 py-2.5 font-headline text-xs font-bold text-on-secondary-container hover:opacity-90 shadow-soft transition-all"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">auto_awesome</span>
            AI Question Generator
          </button>

          <button
            onClick={() => handleSaveContest(false)}
            disabled={saving}
            type="button"
            className="rounded-xl border border-outline-variant px-4 py-2.5 font-headline text-xs font-bold text-on-surface hover:bg-surface-container transition-all"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>

          <button
            onClick={() => handleSaveContest(true)}
            disabled={saving}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 font-headline text-xs font-bold text-on-primary shadow-soft hover:opacity-90 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            Save &amp; Host Live
          </button>
        </div>
      </div>

      {/* Contest Configuration Section */}
      <div className="rounded-2xl bg-surface-container-lowest p-6 border border-outline-variant/60 shadow-soft space-y-4">
        <h2 className="font-headline text-sm font-bold text-on-surface uppercase tracking-wider text-on-surface-variant">
          Contest Settings
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block font-headline text-xs font-bold text-on-surface mb-1">
              Contest / Quiz Title *
            </label>
            <input
              type="text"
              placeholder="e.g. Masterclass Live Quiz: OWASP Top 10"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-surface-container text-on-surface font-body text-sm border border-outline-variant/60 focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block font-headline text-xs font-bold text-on-surface mb-1">
              Subject / Category
            </label>
            <input
              type="text"
              list="subject-options"
              placeholder="e.g. Web Security, React, Python"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-surface-container text-on-surface font-body text-sm border border-outline-variant/60 focus:outline-none focus:border-primary"
            />
            <datalist id="subject-options">
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block font-headline text-xs font-bold text-on-surface mb-1">
              Associated Course (Optional)
            </label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-container text-on-surface font-body text-sm border border-outline-variant/60 focus:outline-none focus:border-primary"
            >
              <option value="">-- No specific course --</option>
              {courses.map((course) => (
                <option key={course.id || course.slug} value={course.id || course.slug}>
                  {course.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-headline text-xs font-bold text-on-surface mb-1">
              Default Timer Per Question
            </label>
            <select
              value={defaultTimeLimit}
              onChange={(e) => setDefaultTimeLimit(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-container text-on-surface font-body text-sm border border-outline-variant/60 focus:outline-none focus:border-primary"
            >
              <option value={10}>10 Seconds (Fast)</option>
              <option value={15}>15 Seconds</option>
              <option value={20}>20 Seconds (Standard)</option>
              <option value={30}>30 Seconds</option>
              <option value={60}>60 Seconds (Deep)</option>
            </select>
          </div>

          <div>
            <label className="block font-headline text-xs font-bold text-on-surface mb-1">
              Leaderboard Display Duration
            </label>
            <select
              value={leaderboardDuration}
              onChange={(e) => setLeaderboardDuration(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-container text-on-surface font-body text-sm border border-outline-variant/60 focus:outline-none focus:border-primary"
            >
              <option value={4}>4 Seconds</option>
              <option value={6}>6 Seconds (Recommended)</option>
              <option value={8}>8 Seconds</option>
              <option value={10}>10 Seconds</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block font-headline text-xs font-bold text-on-surface mb-1">
            Contest Description / Instructions
          </label>
          <textarea
            rows={2}
            placeholder="Brief briefing for trainees entering this live challenge..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-2 rounded-xl bg-surface-container text-on-surface font-body text-xs border border-outline-variant/60 focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Questions Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">view_list</span>
          <h2 className="font-headline text-lg font-extrabold text-on-surface">
            Questions ({questions.length})
          </h2>
        </div>

        <button
          onClick={handleAddQuestion}
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl bg-surface-container px-3.5 py-2 font-headline text-xs font-bold text-on-surface hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add Question
        </button>
      </div>

      {/* Questions List */}
      <div className="space-y-6">
        {questions.map((q, qIndex) => (
          <div
            key={qIndex}
            className="rounded-2xl bg-surface-container-lowest p-5 sm:p-6 border border-outline-variant/60 shadow-soft space-y-4 relative group"
          >
            <div className="flex items-center justify-between gap-2 border-b border-outline-variant/40 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center font-headline font-bold text-xs">
                  {qIndex + 1}
                </span>
                <span className="font-headline text-xs font-bold text-on-surface">
                  Question #{qIndex + 1}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {/* Timer override */}
                <select
                  value={q.timeLimitSeconds}
                  onChange={(e) => handleUpdateQuestion(qIndex, 'timeLimitSeconds', Number(e.target.value))}
                  className="rounded-lg bg-surface-container px-2 py-1 text-[11px] font-headline font-bold text-on-surface border border-outline-variant/60"
                  title="Time limit for this question"
                >
                  <option value={10}>10s</option>
                  <option value={15}>15s</option>
                  <option value={20}>20s</option>
                  <option value={30}>30s</option>
                  <option value={60}>60s</option>
                </select>

                <button
                  onClick={() => handleMoveQuestion(qIndex, 'up')}
                  disabled={qIndex === 0}
                  type="button"
                  className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
                  title="Move Up"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                </button>

                <button
                  onClick={() => handleMoveQuestion(qIndex, 'down')}
                  disabled={qIndex === questions.length - 1}
                  type="button"
                  className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
                  title="Move Down"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                </button>

                <button
                  onClick={() => handleDuplicateQuestion(qIndex)}
                  type="button"
                  className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container"
                  title="Duplicate Question"
                >
                  <span className="material-symbols-outlined text-[18px]">content_copy</span>
                </button>

                <button
                  onClick={() => handleDeleteQuestion(qIndex)}
                  type="button"
                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                  title="Delete Question"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>

            {/* Question Prompt */}
            <div>
              <label className="block font-headline text-xs font-bold text-on-surface mb-1">
                Question Statement *
              </label>
              <textarea
                rows={2}
                placeholder="Type your question here (e.g. Which command enables port forwarding in SSH?)"
                value={q.prompt}
                onChange={(e) => handleUpdateQuestion(qIndex, 'prompt', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-surface-container text-on-surface font-body text-sm font-semibold border border-outline-variant/60 focus:outline-none focus:border-primary"
              />
            </div>

            {/* 4 Kahoot-style Colored Option Cards */}
            <div>
              <p className="font-headline text-xs font-bold text-on-surface mb-2 flex items-center justify-between">
                <span>Answer Options (Select the radio button for the Correct Answer) *</span>
                <span className="text-[11px] font-normal text-on-surface-variant">
                  Correct Answer: <strong className="text-emerald-500 font-bold">Option {q.correctIndex + 1}</strong>
                </span>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {q.options.map((opt, optIndex) => {
                  const isCorrect = q.correctIndex === optIndex
                  const colorConfig = KAHOOT_COLORS[optIndex]

                  return (
                    <div
                      key={optIndex}
                      className={`p-3 rounded-xl border-2 transition-all flex items-start gap-2.5 ${
                        isCorrect
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : colorConfig.bg
                      }`}
                    >
                      <input
                        type="radio"
                        name={`correct-${qIndex}`}
                        checked={isCorrect}
                        onChange={() => handleUpdateQuestion(qIndex, 'correctIndex', optIndex)}
                        className="mt-1.5 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        title="Mark as correct answer"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span
                            className={`w-5 h-5 rounded flex items-center justify-center font-headline text-[10px] font-extrabold ${colorConfig.badge}`}
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {colorConfig.icon}
                            </span>
                          </span>
                          <span className="font-headline text-[11px] font-bold truncate">
                            {colorConfig.label}
                          </span>
                        </div>

                        <input
                          type="text"
                          placeholder={`Enter answer option ${optIndex + 1}...`}
                          value={opt}
                          onChange={(e) => handleUpdateOption(qIndex, optIndex, e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-surface text-on-surface font-body text-xs border border-outline-variant/60 focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Explanation Field */}
            <div>
              <label className="block font-headline text-[11px] font-bold text-on-surface-variant mb-1">
                Answer Explanation (Revealed to trainees after the round ends)
              </label>
              <input
                type="text"
                placeholder="Explain why the answer is correct..."
                value={q.explanation || ''}
                onChange={(e) => handleUpdateQuestion(qIndex, 'explanation', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-container text-on-surface font-body text-xs border border-outline-variant/60 focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Add & Save Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-outline-variant/60">
        <button
          onClick={handleAddQuestion}
          type="button"
          className="inline-flex items-center gap-2 rounded-xl bg-surface-container px-5 py-3 font-headline text-xs font-bold text-on-surface hover:bg-surface-container-high transition-colors w-full sm:w-auto justify-center"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add Another Question
        </button>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => handleSaveContest(false)}
            disabled={saving}
            type="button"
            className="flex-1 sm:flex-none rounded-xl border border-outline-variant px-5 py-3 font-headline text-xs font-bold text-on-surface hover:bg-surface-container transition-all"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>

          <button
            onClick={() => handleSaveContest(true)}
            disabled={saving}
            type="button"
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-headline text-xs font-bold text-on-primary shadow-soft hover:opacity-90 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            Save &amp; Launch Arena
          </button>
        </div>
      </div>

      {/* AI Question Generation Modal */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-surface-container-lowest border border-outline-variant p-6 shadow-lift space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">auto_awesome</span>
                </span>
                <h3 className="font-headline text-lg font-extrabold text-on-surface">
                  Generate Quiz with AI
                </h3>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                type="button"
                className="text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="font-body text-xs text-on-surface-variant">
              Enter any technical topic, cybersecurity concept, or programming language. Minerva AI will generate high-yield, Kahoot-style MCQ questions with 4 distinct choices and explanations.
            </p>

            <div>
              <label className="block font-headline text-xs font-bold text-on-surface mb-1">
                Topic or Skill Focus *
              </label>
              <input
                type="text"
                placeholder="e.g. JWT Vulnerabilities, React Hooks, Linux Privilege Escalation"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-surface-container text-on-surface font-body text-xs border border-outline-variant/60 focus:outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-headline text-xs font-bold text-on-surface mb-1">
                  Number of Questions
                </label>
                <select
                  value={aiCount}
                  onChange={(e) => setAiCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container text-on-surface font-body text-xs border border-outline-variant/60"
                >
                  <option value={3}>3 Questions</option>
                  <option value={5}>5 Questions (Fast)</option>
                  <option value={8}>8 Questions</option>
                  <option value={10}>10 Questions</option>
                </select>
              </div>

              <div>
                <label className="block font-headline text-xs font-bold text-on-surface mb-1">
                  Difficulty
                </label>
                <select
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container text-on-surface font-body text-xs border border-outline-variant/60"
                >
                  <option value="easy">Easy (Fundamentals)</option>
                  <option value="medium">Medium (Standard)</option>
                  <option value="hard">Hard (Advanced)</option>
                </select>
              </div>
            </div>

            {aiError && (
              <p className="font-body text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-xl">
                {aiError}
              </p>
            )}

            <div className="pt-3 border-t border-outline-variant/40 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowAiModal(false)}
                type="button"
                className="px-4 py-2 rounded-xl font-headline text-xs font-bold text-on-surface-variant hover:bg-surface-container"
              >
                Cancel
              </button>

              <button
                onClick={() => handleGenerateAiQuestions('append')}
                disabled={aiGenerating}
                type="button"
                className="px-4 py-2 rounded-xl bg-surface-container font-headline text-xs font-bold text-on-surface hover:bg-surface-container-high transition-all"
              >
                Append to Existing
              </button>

              <button
                onClick={() => handleGenerateAiQuestions('replace')}
                disabled={aiGenerating}
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 font-headline text-xs font-bold text-on-primary shadow-soft hover:opacity-90 transition-all"
              >
                {aiGenerating ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">
                      progress_activity
                    </span>
                    Generating...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">auto_awesome</span>
                    Generate &amp; Replace
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
