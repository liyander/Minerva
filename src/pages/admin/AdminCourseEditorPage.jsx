import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchRoomCategories, getRoomCategories } from '../../data/categoriesData'
import { addCourse, getCourseById, updateCourse } from '../../data/coursesData'
import { apiFetch } from '../../services/api'

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function splitCommaList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function createEmptyQuestion(index) {
  return {
    id: `q-${index + 1}`,
    prompt: '',
    answer: '',
    hint: '',
  }
}

function normalizeRoomType(value) {
  return String(value || 'theoretical').toLowerCase() === 'practical'
    ? 'practical'
    : 'theoretical'
}

function AdminCourseEditorPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { roomId } = useParams()
  const isNewRoom = roomId === 'new' || location.pathname === '/admin/courses/new'

  const room = isNewRoom ? null : getCourseById(roomId)
  const [formData, setFormData] = useState(
    room || {
      title: '',
      slug: '',
      category: '',
      level: '',
      difficulty: '',
      estimateTime: '',
      environment: '',
      description: '',
      xp: '',
      roomType: 'theoretical',
      tags: [],
      requiredKeywords: [],
      content: {
        markdown: '',
        html: '',
        missionOverview: '',
        remediationProtocols: '',
        vulnerabilityBriefing: {
          definition: '',
          impact: '',
        },
        technicalDeepDive: '',
        youtubeVideoUrl: '',
        aiQuestionsEnabled: false,
        attachment: null,
        docker: {
          enabled: false,
          image: '',
          containerPort: '',
          protocol: 'http',
          timeoutMinutes: 120,
          instructions: '',
          terminalTools: '',
          exposeAttachmentToTerminal: false,
          terminalMode: 'service',
          terminalImage: '',
        },
        questionsEnabled: false,
        questions: [],
      },
    }
  )
  const [activeTab, setActiveTab] = useState('basic')
  const [saved, setSaved] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [tagsInput, setTagsInput] = useState((room?.tags || []).join(', '))
  const [requiredKeywordsInput, setRequiredKeywordsInput] = useState(
    (room?.requiredKeywords || []).join(', ')
  )
  const [roomCategories, setRoomCategories] = useState(() => getRoomCategories([formData.category]))
  const [dockerImages, setDockerImages] = useState([])
  const [terminalToolPresets, setTerminalToolPresets] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('incognitrix_terminal_tool_presets') || '[]')
      return Array.isArray(parsed) ? parsed.filter(Boolean) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    let cancelled = false

    const loadCategories = async () => {
      const categories = await fetchRoomCategories([formData.category])
      if (!cancelled) {
        setRoomCategories(categories)
      }
    }

    void loadCategories()

    return () => {
      cancelled = true
    }
  }, [formData.category])

  useEffect(() => {
    let cancelled = false

    const loadDockerImages = async () => {
      try {
        const response = await apiFetch('/rooms/docker-config/status')
        if (!cancelled) {
          setDockerImages(Array.isArray(response?.images) ? response.images : [])
        }
      } catch {
        if (!cancelled) {
          setDockerImages([])
        }
      }
    }

    void loadDockerImages()

    return () => {
      cancelled = true
    }
  }, [])

  if (!isNewRoom && !room) {
    return (
      <main className="min-h-screen bg-surface px-6 md:px-10 py-10 flex items-center justify-center">
        <div className="text-center">
          <p className="text-on-surface-variant mb-4">Course not found.</p>
          <button
            className="rounded-full bg-primary text-on-primary px-4 py-2 font-headline font-bold"
            onClick={() => navigate('/admin/courses')}
            type="button"
          >
            Back to Rooms
          </button>
        </div>
      </main>
    )
  }

  const handleSave = () => {
    if (!formData.title?.trim()) {
      setErrorMessage('Room title is required.')
      return
    }

    const normalized = {
      ...formData,
      roomType: normalizeRoomType(formData.roomType),
      slug: formData.slug || slugify(formData.title || ''),
      tags: splitCommaList(tagsInput),
      requiredKeywords: splitCommaList(requiredKeywordsInput),
      difficulty: formData.difficulty || formData.level,
    }

    if (!normalized.slug) {
      setErrorMessage('Unable to generate a valid slug. Please provide a title or slug.')
      return
    }

    setErrorMessage('')

    const nextTerminalToolPresets = [
      ...terminalToolPresets,
      ...String(normalized.content?.docker?.terminalTools || '')
        .split(/[\s,]+/)
        .map((tool) => tool.trim())
        .filter(Boolean),
    ]
    const uniqueTerminalToolPresets = [...new Set(nextTerminalToolPresets)].sort()
    setTerminalToolPresets(uniqueTerminalToolPresets)
    localStorage.setItem('incognitrix_terminal_tool_presets', JSON.stringify(uniqueTerminalToolPresets))

    if (isNewRoom) {
      addCourse(normalized)
    } else {
      updateCourse(roomId, normalized)
    }

    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      if (isNewRoom) {
        navigate('/admin/courses')
      }
    }, 1200)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleContentChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      content: { ...prev.content, [field]: value },
    }))
  }

  const handleAttachmentUpload = (file) => {
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      handleContentChange('attachment', {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: String(reader.result || ''),
      })
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveAttachment = () => {
    handleContentChange('attachment', null)
  }

  const handleDockerChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      content: {
        ...prev.content,
        docker: {
          ...(prev.content?.docker || {}),
          [field]: value,
        },
      },
    }))
  }

  const rememberTerminalToolPresets = (value) => {
    const nextTools = String(value || '')
      .split(/[\s,]+/)
      .map((tool) => tool.trim())
      .filter(Boolean)
    if (!nextTools.length) {
      return
    }

    const uniqueTerminalToolPresets = [...new Set([...terminalToolPresets, ...nextTools])].sort()
    setTerminalToolPresets(uniqueTerminalToolPresets)
    localStorage.setItem('incognitrix_terminal_tool_presets', JSON.stringify(uniqueTerminalToolPresets))
  }

  const addTerminalToolPreset = (tool) => {
    const selected = String(tool || '').trim()
    if (!selected) {
      return
    }

    const currentTools = String(formData.content?.docker?.terminalTools || '')
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    const nextTools = [...new Set([...currentTools, selected])]
    handleDockerChange('terminalTools', nextTools.join(' '))
    rememberTerminalToolPresets(nextTools.join(' '))
  }

  const handleVulnerabilityBriefingChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      content: {
        ...prev.content,
        vulnerabilityBriefing: {
          ...(prev.content?.vulnerabilityBriefing || {}),
          [field]: value,
        },
      },
    }))
  }

  const updateQuestionAt = (index, field, value) => {
    setFormData((prev) => {
      const currentQuestions = Array.isArray(prev.content?.questions) ? [...prev.content.questions] : []
      currentQuestions[index] = {
        ...(currentQuestions[index] || createEmptyQuestion(index)),
        [field]: value,
      }

      return {
        ...prev,
        content: {
          ...prev.content,
          questions: currentQuestions,
        },
      }
    })
  }

  const handleAddQuestion = () => {
    setFormData((prev) => {
      const currentQuestions = Array.isArray(prev.content?.questions) ? [...prev.content.questions] : []
      currentQuestions.push(createEmptyQuestion(currentQuestions.length))

      return {
        ...prev,
        content: {
          ...prev.content,
          questions: currentQuestions,
        },
      }
    })
  }

  const enableDockerValidationQuestions = () => {
    setFormData((prev) => {
      const currentQuestions = Array.isArray(prev.content?.questions) ? [...prev.content.questions] : []
      if (!currentQuestions.length) {
        currentQuestions.push(createEmptyQuestion(0))
      }

      return {
        ...prev,
        content: {
          ...prev.content,
          questionsEnabled: true,
          questions: currentQuestions,
        },
      }
    })
  }

  const handleRemoveQuestion = (index) => {
    setFormData((prev) => {
      const currentQuestions = Array.isArray(prev.content?.questions)
        ? prev.content.questions.filter((_, i) => i !== index)
        : []

      return {
        ...prev,
        content: {
          ...prev.content,
          questions: currentQuestions,
        },
      }
    })
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-7xl mx-auto">
        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10 mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              className="text-primary hover:text-on-surface transition-colors"
              onClick={() => navigate('/admin/courses')}
              type="button"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <span className="font-headline text-xs text-primary font-bold">
              Room Configuration
            </span>
          </div>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight">
            {isNewRoom ? 'Create Experimental Room' : `Edit: ${formData.title || 'Untitled Room'}`}
          </h1>
          <div className="mt-6 flex gap-3">
            <button
              className={`px-5 py-2.5 font-headline text-xs font-bold transition-all ${
                saved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-primary text-on-primary hover:bg-primary-darker'
              }`}
              onClick={handleSave}
              type="button"
            >
              {saved ? (
                <>
                  <span className="material-symbols-outlined inline mr-1">check</span>
                  Saved
                </>
              ) : (
                isNewRoom ? 'Create Room' : 'Save Changes'
              )}
            </button>
            <button
              className="rounded-lg bg-surface-container-high text-on-surface px-5 py-2.5 font-headline text-xs font-bold"
              onClick={() => navigate('/admin/courses')}
              type="button"
            >
              Cancel
            </button>
          </div>
          {errorMessage ? (
            <p className="mt-4 text-sm text-error font-headline tracking-wide">
              {errorMessage}
            </p>
          ) : null}
        </header>

        {/* Tab Navigation */}
        <div className="flex gap-0 mb-8 border-b border-outline-variant/30">
          {['basic', 'content', 'questions'].map((tab) => (
            <button
              className={`rounded-xl px-6 py-3 font-headline text-xs font-bold transition-all border-b-2 ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab === 'basic' ? 'Basic Info' : tab === 'content' ? 'Content' : 'Question Config'}
            </button>
          ))}
        </div>

        {/* Basic Information Tab */}
        {activeTab === 'basic' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Room Details
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Room Title
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="title"
                    onChange={handleInputChange}
                    type="text"
                    value={formData.title || ''}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Slug
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="slug"
                    onChange={handleInputChange}
                    placeholder="auto-generated-from-title"
                    type="text"
                    value={formData.slug || ''}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Room Type
                  </label>
                  <select
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="roomType"
                    onChange={handleInputChange}
                    value={normalizeRoomType(formData.roomType)}
                  >
                    <option value="theoretical">Theoretical</option>
                    <option value="practical">Practical</option>
                  </select>
                  <p className="text-xs text-on-surface-variant mt-2">
                    Theoretical rooms use AI-generated questions per learner. Practical rooms use manually configured exact-answer checks.
                  </p>
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Category
                  </label>
                  <select
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="category"
                    onChange={handleInputChange}
                    value={formData.category || ''}
                  >
                    <option value="">Select Category</option>
                    {roomCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Difficulty Level
                  </label>
                  <select
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="level"
                    onChange={handleInputChange}
                    value={formData.level || ''}
                  >
                    <option value="">Select Level</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Difficulty Label
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="difficulty"
                    onChange={handleInputChange}
                    placeholder="Beginner / Intermediate / Advanced"
                    type="text"
                    value={formData.difficulty || ''}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Estimated Time
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="estimateTime"
                    onChange={handleInputChange}
                    placeholder="e.g. 45 minutes"
                    type="text"
                    value={formData.estimateTime || ''}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Environment
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="environment"
                    onChange={handleInputChange}
                    placeholder="e.g. Kali Linux, Browser Sandbox"
                    type="text"
                    value={formData.environment || ''}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Experience Points
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="xp"
                    onChange={handleInputChange}
                    type="text"
                    value={formData.xp || ''}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Description
                  </label>
                  <textarea
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="description"
                    onChange={handleInputChange}
                    rows="5"
                    value={formData.description || ''}
                  ></textarea>
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Tags
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="comma separated, e.g. sql, web, injection"
                    type="text"
                    value={tagsInput}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Required Keywords
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    onChange={(e) => setRequiredKeywordsInput(e.target.value)}
                    placeholder="comma separated, e.g. UNION, WHERE, example"
                    type="text"
                    value={requiredKeywordsInput}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Preview
              </h2>
              <div className="bg-surface-container-highest p-6 rounded">
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="rounded-lg bg-primary-container text-on-primary-container px-2 py-1 font-headline text-sm font-bold">
                    {formData.level}
                  </span>
                  <span className="rounded-lg bg-secondary-container text-on-secondary-container px-2 py-1 font-headline text-sm font-bold">
                    {formData.category}
                  </span>
                </div>
                <h3 className="font-headline font-bold text-lg mb-2">{formData.title}</h3>
                <p className="text-sm text-on-surface-variant mb-4">{formData.description}</p>
                <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm">star</span>
                  <span>{formData.xp}</span>
                </div>
                <div className="mt-4 text-xs text-on-surface-variant space-y-1">
                  <p>Difficulty: {formData.difficulty || formData.level || 'N/A'}</p>
                  <p>Room Type: {normalizeRoomType(formData.roomType).toUpperCase()}</p>
                  <p>Estimated Time: {formData.estimateTime || 'N/A'}</p>
                  <p>Environment: {formData.environment || 'N/A'}</p>
                  <p>Tags: {splitCommaList(tagsInput).join(', ') || 'N/A'}</p>
                  <p>Required Keywords: {splitCommaList(requiredKeywordsInput).join(', ') || 'N/A'}</p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Content Editor Tab */}
        {activeTab === 'content' && (
          <div className="space-y-8">
            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Mission Overview
              </h2>
              <textarea
                className="rounded-2xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-4 px-4 outline-none"
                onChange={(e) => handleContentChange('missionOverview', e.target.value)}
                rows="6"
                value={formData.content?.missionOverview || ''}
              ></textarea>
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Further reading
              </h2>
              <textarea
                className="rounded-2xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-4 px-4 outline-none"
                onChange={(e) => handleContentChange('remediationProtocols', e.target.value)}
                rows="6"
                value={formData.content?.remediationProtocols || ''}
              ></textarea>
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Vulnerability Briefing
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Definition
                  </label>
                  <textarea
                    className="rounded-2xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-4 px-4 outline-none"
                    onChange={(e) =>
                      handleVulnerabilityBriefingChange('definition', e.target.value)
                    }
                    rows="4"
                    value={formData.content?.vulnerabilityBriefing?.definition || ''}
                  ></textarea>
                </div>
                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Impact
                  </label>
                  <textarea
                    className="rounded-2xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-4 px-4 outline-none"
                    onChange={(e) =>
                      handleVulnerabilityBriefingChange('impact', e.target.value)
                    }
                    rows="4"
                    value={formData.content?.vulnerabilityBriefing?.impact || ''}
                  ></textarea>
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Technical Deep Dive
              </h2>
              <textarea
                className="rounded-2xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-4 px-4 outline-none"
                onChange={(e) => handleContentChange('technicalDeepDive', e.target.value)}
                rows="8"
                value={formData.content?.technicalDeepDive || ''}
              ></textarea>
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Video Player Configuration
              </h2>
              <p className="text-xs text-on-surface-variant mb-4">
                Add a YouTube URL to display in the player area using an iframe.
              </p>
              <input
                className="rounded-2xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-4 px-4 outline-none"
                onChange={(e) => handleContentChange('youtubeVideoUrl', e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                type="url"
                value={formData.content?.youtubeVideoUrl || ''}
              />
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Markdown Content
              </h2>
              <p className="text-xs text-on-surface-variant mb-4">
                This is the primary content. Use markdown for structured text formatting.
              </p>
              <textarea
                className="rounded-2xl w-full bg-surface-container-highest  focus:ring-0 font-mono text-xs py-4 px-4 outline-none"
                onChange={(e) => handleContentChange('markdown', e.target.value)}
                rows="15"
                value={formData.content?.markdown || ''}
              ></textarea>
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                HTML Content
              </h2>
              <p className="text-xs text-on-surface-variant mb-4">
                Optional custom HTML for advanced styling. This will override markdown rendering.
              </p>
              <textarea
                className="rounded-2xl w-full bg-surface-container-highest  focus:ring-0 font-mono text-xs py-4 px-4 outline-none"
                onChange={(e) => handleContentChange('html', e.target.value)}
                rows="15"
                value={formData.content?.html || ''}
              ></textarea>
            </section>
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="space-y-8">
            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <div className="flex items-center justify-between gap-4 mb-6">
                <h2 className="font-headline text-xl font-bold tracking-tight">
                  Question Configuration
                </h2>
                {normalizeRoomType(formData.roomType) === 'practical' ? (
                  <button
                    className="rounded-full px-4 py-2 bg-secondary text-on-secondary font-headline text-sm font-bold hover:opacity-90 transition-opacity"
                    onClick={handleAddQuestion}
                    type="button"
                  >
                    Add Question
                  </button>
                ) : null}
              </div>

              {normalizeRoomType(formData.roomType) === 'practical' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                  <label className="rounded-2xl flex items-start gap-3 bg-surface-container-high p-5 cursor-pointer">
                    <input
                      checked={Boolean(formData.content?.questionsEnabled)}
                      className="mt-1 h-4 w-4"
                      onChange={(e) => handleContentChange('questionsEnabled', e.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <span className="block font-headline text-xs font-bold text-on-surface">
                        Enable Manual Questions
                      </span>
                      <span className="mt-1 block text-xs text-on-surface-variant">
                        Learners must answer the configured exact-answer questions before completion.
                      </span>
                    </span>
                  </label>
                  <label className="rounded-2xl flex items-start gap-3 bg-surface-container-high p-5 cursor-pointer">
                    <input
                      checked={Boolean(formData.content?.aiQuestionsEnabled)}
                      className="mt-1 h-4 w-4"
                      onChange={(e) => handleContentChange('aiQuestionsEnabled', e.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <span className="block font-headline text-xs font-bold text-on-surface">
                        Add AI Questions
                      </span>
                      <span className="mt-1 block text-xs text-on-surface-variant">
                        AI will generate extra content-aligned questions alongside the practical prompts.
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}

              {normalizeRoomType(formData.roomType) === 'practical' ? (
                <div className="rounded-2xl mb-8 bg-surface-container-high p-6 ">
                  <p className="font-headline text-xs font-bold text-primary mb-3">
                    Practical Room File
                  </p>
                  <input
                    className="rounded-lg block w-full text-sm text-on-surface-variant file:mr-4 file:border-0 file:bg-primary file:px-4 file:py-2 file:font-headline file:text-xs file:font-bold file: file:tracking-normal file:text-on-primary"
                    onChange={(e) => handleAttachmentUpload(e.target.files?.[0])}
                    type="file"
                  />
                  {formData.content?.attachment?.dataUrl ? (
                    <div className="rounded-2xl mt-4 flex flex-wrap items-center justify-between gap-3 bg-surface-container-lowest p-4">
                      <div>
                        <p className="font-headline text-xs font-bold">
                          {formData.content.attachment.name || 'Attached file'}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {Math.ceil(Number(formData.content.attachment.size || 0) / 1024)} KB
                        </p>
                      </div>
                      <button
                        className="px-3 py-2 text-primary hover:text-error transition-colors"
                        onClick={handleRemoveAttachment}
                        type="button"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {normalizeRoomType(formData.roomType) === 'practical' ? (
                <div className="rounded-2xl mb-8 bg-surface-container-high p-6 ">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      checked={Boolean(formData.content?.docker?.enabled)}
                      className="mt-1 h-4 w-4"
                      onChange={(e) => handleDockerChange('enabled', e.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <span className="block font-headline text-xs font-bold text-secondary">
                        Enable Docker Service
                      </span>
                      <span className="mt-1 block text-xs text-on-surface-variant">
                        Players can spawn a personal container and access the running service from the lab page.
                      </span>
                    </span>
                  </label>

                  <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="block md:col-span-2">
                      <span className="font-headline text-xs text-on-surface-variant font-bold">
                        Docker Image
                      </span>
                      <select
                        className="rounded-lg mt-2 w-full bg-surface-container-lowest border border-outline-variant/40 font-body text-sm py-2.5 px-3 outline-none"
                        onChange={(e) => handleDockerChange('image', e.target.value)}
                        value={formData.content?.docker?.image || ''}
                      >
                        <option value="">
                          {dockerImages.length ? 'Select Docker image' : 'No Docker images available'}
                        </option>
                        {dockerImages.map((image) => (
                          <option key={`${image.id}-${image.name}`} value={image.name}>
                            {image.name}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <p className="text-xs text-on-surface-variant">
                          {dockerImages.length
                            ? `${dockerImages.length} image${dockerImages.length === 1 ? '' : 's'} detected`
                            : 'No images detected from Docker config'}
                        </p>
                        <button
                          className="text-xs font-bold text-secondary hover:text-primary"
                          onClick={() => navigate('/admin/docker')}
                          type="button"
                        >
                          Docker Config
                        </button>
                      </div>
                    </label>
                    <label className="block">
                      <span className="font-headline text-xs text-on-surface-variant font-bold">
                        Internal Service Port
                      </span>
                      <input
                        className="rounded-lg mt-2 w-full bg-surface-container-lowest border border-outline-variant/40 font-body text-sm py-2.5 px-3 outline-none"
                        min="1"
                        max="65535"
                        onChange={(e) => handleDockerChange('containerPort', e.target.value)}
                        placeholder="Optional, e.g. 80"
                        type="number"
                        value={formData.content?.docker?.containerPort || ''}
                      />
                      <p className="mt-1 text-[11px] text-on-surface-variant">
                        Optional when the image declares EXPOSE. Player access ports are assigned randomly when a machine is spawned.
                      </p>
                    </label>
                    <label className="block">
                      <span className="font-headline text-xs text-on-surface-variant font-bold">
                        Protocol
                      </span>
                      <select
                        className="rounded-lg mt-2 w-full bg-surface-container-lowest border border-outline-variant/40 font-body text-sm py-2.5 px-3 outline-none"
                        onChange={(e) => handleDockerChange('protocol', e.target.value)}
                        value={formData.content?.docker?.protocol || 'http'}
                      >
                        <option value="http">http</option>
                        <option value="https">https</option>
                        <option value="tcp">tcp</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="font-headline text-xs text-on-surface-variant font-bold">
                        Timeout Minutes
                      </span>
                      <input
                        className="rounded-lg mt-2 w-full bg-surface-container-lowest border border-outline-variant/40 font-body text-sm py-2.5 px-3 outline-none"
                        min="5"
                        max="720"
                        onChange={(e) => handleDockerChange('timeoutMinutes', e.target.value)}
                        placeholder="120"
                        type="number"
                        value={formData.content?.docker?.timeoutMinutes || 120}
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="font-headline text-xs text-on-surface-variant font-bold">
                        Player Instructions
                      </span>
                      <textarea
                        className="rounded-lg mt-2 w-full bg-surface-container-lowest border border-outline-variant/40 font-body text-sm py-2.5 px-3 outline-none"
                        onChange={(e) => handleDockerChange('instructions', e.target.value)}
                        placeholder="Describe what the spawned service exposes and how to use it."
                        rows="3"
                        value={formData.content?.docker?.instructions || ''}
                      ></textarea>
                    </label>
                    <label className="block md:col-span-2">
                      <span className="font-headline text-xs text-on-surface-variant font-bold">
                        Terminal Tools
                      </span>
                      <input
                        className="rounded-lg mt-2 w-full bg-surface-container-lowest border border-outline-variant/40 font-body text-sm py-2.5 px-3 outline-none"
                        onChange={(e) => handleDockerChange('terminalTools', e.target.value)}
                        onBlur={(e) => rememberTerminalToolPresets(e.target.value)}
                        placeholder="Comma or space separated packages, e.g. curl nmap netcat-openbsd python3"
                        type="text"
                        value={formData.content?.docker?.terminalTools || ''}
                      />
                      <p className="mt-1 text-[11px] text-on-surface-variant">
                        Installed after spawn with the container package manager. Use package names only.
                      </p>
                      {terminalToolPresets.length > 0 ? (
                        <select
                          className="rounded-lg mt-2 w-full bg-surface-container-lowest border border-outline-variant/40 font-body text-sm py-2.5 px-3 outline-none"
                          onChange={(e) => {
                            addTerminalToolPreset(e.target.value)
                            e.target.value = ''
                          }}
                          value=""
                        >
                          <option value="">Add saved tool preset</option>
                          {terminalToolPresets.map((tool) => (
                            <option key={tool} value={tool}>
                              {tool}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </label>
                    <label className="block">
                      <span className="font-headline text-xs text-on-surface-variant font-bold">
                        Terminal Mode
                      </span>
                      <select
                        className="rounded-lg mt-2 w-full bg-surface-container-lowest border border-outline-variant/40 font-body text-sm py-2.5 px-3 outline-none"
                        onChange={(e) => handleDockerChange('terminalMode', e.target.value)}
                        value={formData.content?.docker?.terminalMode || 'service'}
                      >
                        <option value="service">Service container</option>
                        <option value="isolated">Isolated utility container</option>
                      </select>
                      <p className="mt-1 text-[11px] text-on-surface-variant">
                        Use isolated mode for web challenges so terminal users cannot browse service source files.
                      </p>
                    </label>
                    {formData.content?.docker?.terminalMode === 'isolated' ? (
                      <label className="block md:col-span-2">
                        <span className="font-headline text-xs text-on-surface-variant font-bold">
                          Terminal Runtime Image
                        </span>
                        <select
                          className="rounded-lg mt-2 w-full bg-surface-container-lowest border border-outline-variant/40 font-body text-sm py-2.5 px-3 outline-none"
                          onChange={(e) => handleDockerChange('terminalImage', e.target.value)}
                          value={formData.content?.docker?.terminalImage || ''}
                        >
                          <option value="">
                            {dockerImages.length ? 'Select utility terminal image' : 'No Docker images available'}
                          </option>
                          {dockerImages.map((image) => (
                            <option key={`terminal-${image.id}-${image.name}`} value={image.name}>
                              {image.name}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px] text-on-surface-variant">
                          Choose a small image with a shell, such as alpine, debian, kali, or another prepared utility image.
                        </p>
                      </label>
                    ) : null}
                    <label className="rounded-2xl flex items-start gap-3 bg-surface-container-lowest p-4 md:col-span-3 cursor-pointer">
                      <input
                        checked={Boolean(formData.content?.docker?.exposeAttachmentToTerminal)}
                        className="mt-1 h-4 w-4"
                        onChange={(e) => handleDockerChange('exposeAttachmentToTerminal', e.target.checked)}
                        type="checkbox"
                      />
                      <span>
                        <span className="block font-headline text-xs font-bold text-on-surface">
                          Expose Uploaded File In Terminal
                        </span>
                        <span className="mt-1 block text-xs text-on-surface-variant">
                          Copies the uploaded practical-room file into /challenge for file-based labs. Leave disabled for web challenges so source files are not intentionally exposed through the terminal.
                        </span>
                      </span>
                    </label>
                  </div>
                  <div className="rounded-2xl mt-5 bg-surface-container-lowest p-4 ">
                    <p className="font-headline text-xs font-bold text-primary">
                      Docker Validation
                    </p>
                    <p className="mt-2 text-xs text-on-surface-variant">
                      The image name is hidden from learners. Add manual questions and expected answers to validate what they discover inside the running service.
                    </p>
                    <button
                      className="rounded-full mt-3 bg-secondary text-on-secondary px-4 py-2 font-headline text-sm font-bold"
                      onClick={enableDockerValidationQuestions}
                      type="button"
                    >
                      Enable Questions
                    </button>
                  </div>
                </div>
              ) : null}

              <p className="text-xs text-on-surface-variant mb-6">
                Theoretical rooms generate AI questions automatically for each learner. Practical rooms can use exact-answer questions, optional AI evaluation, uploaded files, and Docker-backed services.
              </p>

              {normalizeRoomType(formData.roomType) === 'theoretical' ? (
                <div className="rounded-2xl bg-surface-container-high p-6 ">
                  <p className="font-headline text-xs font-bold text-primary mb-2">
                    AI Theoretical Evaluation
                  </p>
                  <p className="text-sm text-on-surface-variant">
                    No manual questions are required. The system generates different open-ended questions for each learner and evaluates technical and grammatical quality with AI. Learners must score 100 technical to complete the room.
                  </p>
                </div>
              ) : Array.isArray(formData.content?.questions) && formData.content.questions.length > 0 ? (
                <div className="space-y-4">
                  {formData.content.questions.map((question, index) => (
                    <div key={`${question.id || 'q'}-${index}`} className="rounded-2xl bg-surface-container-high p-5 ">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <p className="font-headline text-xs font-bold text-secondary">
                          Question {index + 1}
                        </p>
                        <button
                          className="text-on-surface-variant hover:text-error transition-colors"
                          onClick={() => handleRemoveQuestion(index)}
                          type="button"
                        >
                          <span className="material-symbols-outlined">delete</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        <input
                          className="rounded-lg w-full bg-surface-container-lowest border border-outline-variant/40 font-body text-sm py-2.5 px-3 outline-none"
                          onChange={(e) => updateQuestionAt(index, 'id', e.target.value)}
                          placeholder="Question ID (e.g. q1)"
                          type="text"
                          value={question.id || ''}
                        />
                        <textarea
                          className="rounded-lg w-full bg-surface-container-lowest border border-outline-variant/40 font-body text-sm py-2.5 px-3 outline-none"
                          onChange={(e) => updateQuestionAt(index, 'prompt', e.target.value)}
                          placeholder="Question prompt"
                          rows="3"
                          value={question.prompt || ''}
                        ></textarea>
                        <input
                          className="rounded-lg w-full bg-surface-container-lowest border border-outline-variant/40 font-body text-sm py-2.5 px-3 outline-none"
                          onChange={(e) => updateQuestionAt(index, 'answer', e.target.value)}
                          placeholder="Expected answer"
                          type="text"
                          value={question.answer || ''}
                        />
                        <input
                          className="rounded-lg w-full bg-surface-container-lowest border border-outline-variant/40 font-body text-sm py-2.5 px-3 outline-none"
                          onChange={(e) => updateQuestionAt(index, 'hint', e.target.value)}
                          placeholder="Optional hint"
                          type="text"
                          value={question.hint || ''}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl bg-surface-container-high p-6 text-center">
                  <p className="text-sm text-on-surface-variant">No questions configured yet.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  )
}

export default AdminCourseEditorPage
