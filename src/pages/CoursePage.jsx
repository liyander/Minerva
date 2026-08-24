import { useEffect, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { getCoursesData } from '../data/coursesData'
import CourseEnrollmentPanel from '../components/CourseEnrollmentPanel'
import { API_BASE_URL, apiFetch, getAuthToken } from '../services/api'
import {
  getLabStatus,
  markLabCompleted,
  markLabIncomplete,
  markLabStarted,
} from '../services/labProgress'
import { parseMarkdownToHtml } from '../utils/markdown'

function renderRichContent(content, htmlOverride = '') {
  if (htmlOverride && String(htmlOverride).trim()) {
    return String(htmlOverride)
  }
  return parseMarkdownToHtml(content)
}

function hasContent(value) {
  return Boolean(String(value || '').trim())
}

function normalizeRoomType(value) {
  return String(value || 'theoretical').toLowerCase() === 'practical'
    ? 'practical'
    : 'theoretical'
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
  }
  return `${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
}

function blockClipboardInput(event) {
  event.preventDefault()
}

function toYouTubeEmbedUrl(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`

  try {
    const url = new URL(withProtocol)
    const host = url.hostname.toLowerCase()

    if (host.includes('youtu.be')) {
      const videoId = url.pathname.replace('/', '')
      return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}?rel=0` : ''
    }

    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const videoId = url.searchParams.get('v')
      if (videoId) {
        return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`
      }

      const pathParts = url.pathname.split('/').filter(Boolean)
      const embedIndex = pathParts.findIndex((part) => part === 'embed')
      if (embedIndex !== -1 && pathParts[embedIndex + 1]) {
        return `https://www.youtube-nocookie.com/embed/${pathParts[embedIndex + 1]}?rel=0`
      }

      const shortsIndex = pathParts.findIndex((part) => part === 'shorts')
      if (shortsIndex !== -1 && pathParts[shortsIndex + 1]) {
        return `https://www.youtube-nocookie.com/embed/${pathParts[shortsIndex + 1]}?rel=0`
      }
    }
  } catch {
    // Ignore invalid URLs.
  }

  // Fallback for raw IDs or unstructured strings containing a YouTube ID.
  const idMatch = raw.match(/([a-zA-Z0-9_-]{11})/)
  if (idMatch?.[1]) {
    return `https://www.youtube-nocookie.com/embed/${idMatch[1]}?rel=0`
  }

  return ''
}

function CoursePage() {
  const { courseId } = useParams()
  const [room, setRoom] = useState(() => getCoursesData().find((item) => item.slug === courseId) || null)
  const [isLoadingRoom, setIsLoadingRoom] = useState(true)
  const [labStatus, setLabStatus] = useState('in-progress')
  const [questionStatus, setQuestionStatus] = useState({
    enabled: false,
    total: 0,
    correct: 0,
    allCorrect: true,
    mode: 'practical',
    technicalScore: 0,
    grammarScore: 0,
    bonusScore: 0,
    feedback: '',
    questions: [],
  })
  const [questionAnswers, setQuestionAnswers] = useState({})
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false)
  const [isSubmittingQuestions, setIsSubmittingQuestions] = useState(false)
  const [questionFeedback, setQuestionFeedback] = useState('')
  const [resultModal, setResultModal] = useState(null)
  const [completionError, setCompletionError] = useState('')
  const [dockerStatus, setDockerStatus] = useState({
    enabled: false,
    running: false,
    access: null,
    instructions: '',
    expired: false,
  })
  const [dockerNow, setDockerNow] = useState(Date.now())
  const [isDockerWorking, setIsDockerWorking] = useState(false)
  const [dockerAction, setDockerAction] = useState('')
  const [dockerError, setDockerError] = useState('')
  const [isTerminalOpen, setIsTerminalOpen] = useState(false)
  const [terminalLayout, setTerminalLayout] = useState('overlay')
  const [isTerminalMinimized, setIsTerminalMinimized] = useState(false)
  const contentRootRef = useRef(null)
  const xtermHostRef = useRef(null)
  const xtermRef = useRef(null)
  const terminalSocketRef = useRef(null)
  const terminalTranscriptRef = useRef('')
  const roomId = room?.id || ''
  const roomDocker = room?.content?.docker || {}
  const roomType = normalizeRoomType(room?.roomType)
  const isPracticalRoom = roomType === 'practical'
  const dockerAvailable = isPracticalRoom
  const isTerminalMounted = isTerminalOpen
  const isTerminalOverlay = isTerminalMounted && terminalLayout === 'overlay'
  const isTerminalSplit = isTerminalMounted && terminalLayout === 'split'
  const isTerminalSplitLayout = isTerminalSplit && !isTerminalMinimized
  const questionsEnabled =
    !isPracticalRoom ||
    Boolean(room?.content?.questionsEnabled || room?.content?.aiQuestionsEnabled)

  useEffect(() => {
    let cancelled = false

    const loadRoom = async () => {
      try {
        const response = await apiFetch(`/rooms/${encodeURIComponent(courseId)}`)
        if (!cancelled && response) {
          setRoom(response)
        }
      } catch {
        if (!cancelled) {
          const fallback = getCoursesData().find((item) => item.slug === courseId) || null
          setRoom(fallback)
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRoom(false)
        }
      }
    }

    void loadRoom()

    return () => {
      cancelled = true
    }
  }, [courseId])

  useEffect(() => {
    if (!roomId) {
      return
    }

    markLabStarted(roomId)
    setLabStatus(getLabStatus(roomId))
  }, [roomId])

  useEffect(() => {
    let cancelled = false

    const loadQuestionStatus = async () => {
      if (!roomId) {
        if (!cancelled) {
          setIsLoadingQuestions(false)
          setQuestionStatus({
            enabled: false,
            mode: 'practical',
            total: 0,
            correct: 0,
            allCorrect: true,
            technicalScore: 0,
            grammarScore: 0,
            bonusScore: 0,
            feedback: '',
            questions: [],
          })
        }
        return
      }

      if (!questionsEnabled) {
        if (!cancelled) {
          setIsLoadingQuestions(false)
          setQuestionStatus({
            enabled: false,
            mode: 'practical',
            total: 0,
            correct: 0,
            allCorrect: true,
            technicalScore: 0,
            grammarScore: 0,
            bonusScore: 0,
            feedback: '',
            questions: [],
          })
        }
        return
      }

      try {
        setIsLoadingQuestions(true)
        const response = await apiFetch(`/rooms/${encodeURIComponent(roomId)}/questions/status`)
        if (!cancelled) {
          setQuestionStatus({
            enabled: Boolean(response?.enabled),
            mode: response?.mode || 'practical',
            total: Number(response?.total || 0),
            correct: Number(response?.correct || 0),
            allCorrect: Boolean(response?.allCorrect),
            technicalScore: Number(response?.technicalScore || 0),
            grammarScore: Number(response?.grammarScore || 0),
            bonusScore: Number(response?.bonusScore || 0),
            feedback: response?.feedback || '',
            questions: Array.isArray(response?.questions) ? response.questions : [],
          })
          if (response?.answers && typeof response.answers === 'object') {
            setQuestionAnswers(response.answers)
          }
        }
      } catch (error) {
        if (!cancelled) {
          setQuestionFeedback(error?.message || 'Failed to load question status.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingQuestions(false)
        }
      }
    }

    void loadQuestionStatus()

    return () => {
      cancelled = true
    }
  }, [roomId, questionsEnabled])

  useEffect(() => {
    let cancelled = false

    const loadDockerStatus = async () => {
      if (!roomId || !dockerAvailable) {
        if (!cancelled) {
          setDockerStatus({
            enabled: false,
            running: false,
            access: null,
            instructions: '',
            expired: false,
          })
          setDockerError('')
        }
        return
      }

      try {
        const response = await apiFetch(`/rooms/${encodeURIComponent(roomId)}/docker/status`)
        if (!cancelled) {
          setDockerStatus({
            enabled: Boolean(response?.enabled),
            running: Boolean(response?.running),
            access: response?.access || null,
            containerPort: response?.containerPort || roomDocker.containerPort || '',
            hostPort: response?.hostPort || response?.access?.port || '',
            instructions: response?.instructions || roomDocker.instructions || '',
            timeoutMinutes: response?.timeoutMinutes || roomDocker.timeoutMinutes || 120,
            createdAt: response?.createdAt || null,
            expiresAt: response?.expiresAt || null,
            expired: Boolean(response?.expired),
          })
          setDockerError('')
        }
      } catch (error) {
        if (!cancelled) {
          setDockerError(error?.message || 'Unable to load Docker service status.')
        }
      }
    }

    void loadDockerStatus()

    return () => {
      cancelled = true
    }
  }, [
    roomId,
    roomDocker.containerPort,
    dockerAvailable,
    roomDocker.instructions,
    roomDocker.timeoutMinutes,
  ])

  useEffect(() => {
    if (!dockerStatus.running || !dockerStatus.expiresAt) {
      return undefined
    }

    const expiresAt = new Date(dockerStatus.expiresAt).getTime()
    const refreshDockerTime = () => {
      const now = Date.now()
      setDockerNow(now)
      if (expiresAt && now >= expiresAt) {
        setDockerStatus((current) => {
          if (!current.running || current.expiresAt !== dockerStatus.expiresAt) {
            return current
          }
          return {
            ...current,
            running: false,
            access: null,
            hostPort: '',
            expired: true,
          }
        })
        setDockerError('')
      }
    }

    refreshDockerTime()
    const intervalId = window.setInterval(() => {
      refreshDockerTime()
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [dockerStatus.expiresAt, dockerStatus.running])

  useEffect(() => {
    const root = contentRootRef.current
    if (!root) {
      return undefined
    }

    const cleanupHandlers = []
    const codeBlocks = root.querySelectorAll('pre')

    codeBlocks.forEach((block) => {
      if (block.querySelector('[data-copy-code]')) {
        return
      }

      block.classList.add('relative', 'group')
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.copyCode = 'true'
      button.className =
        'absolute right-3 top-3 bg-surface-container-lowest border border-outline-variant/40 px-3 py-1.5 font-headline text-xs font-bold text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary'
      button.textContent = 'Copy'

      const handleClick = async () => {
        const code = block.querySelector('code')?.textContent || block.textContent || ''
        try {
          await navigator.clipboard.writeText(code)
          button.textContent = 'Copied'
          window.setTimeout(() => {
            button.textContent = 'Copy'
          }, 1200)
        } catch {
          button.textContent = 'Failed'
          window.setTimeout(() => {
            button.textContent = 'Copy'
          }, 1200)
        }
      }

      button.addEventListener('click', handleClick)
      block.appendChild(button)
      cleanupHandlers.push(() => {
        button.removeEventListener('click', handleClick)
        button.remove()
      })
    })

    return () => {
      cleanupHandlers.forEach((cleanup) => cleanup())
    }
  }, [roomId, room?.content])

  useEffect(() => {
    const dockerExpiresAtForTerminal = dockerStatus.expiresAt ? new Date(dockerStatus.expiresAt).getTime() : 0
    const dockerRemainingMsForTerminal = dockerStatus.running && dockerExpiresAtForTerminal
      ? Math.max(0, dockerExpiresAtForTerminal - Date.now())
      : 0
    const terminalServiceActive = dockerStatus.running && (!dockerExpiresAtForTerminal || dockerRemainingMsForTerminal > 0)

    if (!isTerminalMounted || !terminalServiceActive || !xtermHostRef.current || xtermRef.current) {
      return undefined
    }

    const terminalHost = xtermHostRef.current
    const isLightTerminalTheme = document.documentElement.getAttribute('data-theme') !== 'dark'
    const terminalPalette = isLightTerminalTheme
      ? {
          background: '#fbfcfd',
          foreground: '#14212a',
          cursor: '#b6171e',
          selectionBackground: '#cfeaf1',
          black: '#111827',
          red: '#b6171e',
          green: '#16794f',
          yellow: '#8a5d00',
          blue: '#006878',
          magenta: '#8f1c58',
          cyan: '#006878',
          white: '#f8f9fb',
        }
      : {
          background: '#020405',
          foreground: '#d7f7ff',
          cursor: '#66d9ef',
          selectionBackground: '#2b3f4a',
          black: '#020405',
          red: '#ff6670',
          green: '#78d97b',
          yellow: '#f7d66b',
          blue: '#66d9ef',
          magenta: '#ff7aa8',
          cyan: '#66d9ef',
          white: '#d7f7ff',
        }
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 16,
      lineHeight: 1.25,
      rows: 32,
      scrollback: 5000,
      theme: terminalPalette,
    })
    terminal.open(terminalHost)
    let terminalSocket = null
    const fitTerminalToHost = () => {
      const host = xtermHostRef.current
      if (!host) return

      const cols = Math.max(80, Math.floor((host.clientWidth - 32) / 10))
      const rows = Math.max(20, Math.floor((host.clientHeight - 56) / 21))
      terminal.resize(cols, rows)

      if (terminalSocket?.readyState === WebSocket.OPEN) {
        terminalSocket.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    }
    const settleTerminalView = () => {
      window.setTimeout(() => {
        terminal.scrollToBottom()
        terminal.focus()
      }, 0)
      window.setTimeout(() => {
        terminal.scrollToBottom()
      }, 50)
    }
    const appendTerminalTranscript = (text) => {
      terminalTranscriptRef.current = `${terminalTranscriptRef.current}${text}`.slice(-120000)
    }
    const writeTerminal = (text) => {
      appendTerminalTranscript(text)
      terminal.write(text, settleTerminalView)
    }
    const writeLine = (text = '') => {
      appendTerminalTranscript(`${text}\r\n`)
      terminal.writeln(text)
      settleTerminalView()
    }
    const sendTerminalInput = (data) => {
      if (data && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'input', data: btoa(data) }))
      }
    }
    const pasteFromClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText()
        sendTerminalInput(text)
        settleTerminalView()
      } catch {
        writeLine('\x1b[31mClipboard paste is blocked by the browser. Use the browser permission prompt or right-click paste.\x1b[0m')
      }
    }
    const handleTerminalPaste = (event) => {
      const text = event.clipboardData?.getData('text/plain') || ''
      if (!text) return
      event.preventDefault()
      sendTerminalInput(text)
      settleTerminalView()
    }
    terminal.attachCustomKeyEventHandler((event) => {
      const wantsPaste = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v'
      const wantsShiftInsert = event.shiftKey && event.key === 'Insert'
      if (event.type === 'keydown' && (wantsPaste || wantsShiftInsert)) {
        event.preventDefault()
        void pasteFromClipboard()
        return false
      }

      const wantsCopy = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c'
      if (event.type === 'keydown' && wantsCopy && terminal.hasSelection()) {
        event.preventDefault()
        void navigator.clipboard.writeText(terminal.getSelection())
        terminal.clearSelection()
        return false
      }

      return true
    })
    const resizeObserver = new ResizeObserver(() => {
      fitTerminalToHost()
      settleTerminalView()
    })
    resizeObserver.observe(terminalHost)
    fitTerminalToHost()
    if (terminalTranscriptRef.current) {
      terminal.write(terminalTranscriptRef.current, settleTerminalView)
    } else {
      writeLine('Welcome to Minerva Academy')
      writeLine('Opening interactive sandbox shell...')
    }
    xtermRef.current = terminal

    const token = encodeURIComponent(getAuthToken())
    const wsBaseUrl = API_BASE_URL.replace(/^http/i, 'ws').replace(/\/api$/, '')
    const socket = new WebSocket(`${wsBaseUrl}/api/rooms/${encodeURIComponent(roomId)}/docker/terminal/ws?token=${token}`)
    terminalSocket = socket
    terminalSocketRef.current = socket

    const inputDisposable = terminal.onData((data) => {
      sendTerminalInput(data)
    })
    terminalHost.addEventListener('paste', handleTerminalPaste)

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}'))
        if (payload.type === 'output') {
          writeTerminal(atob(payload.data || ''))
        } else if (payload.type === 'ready') {
          fitTerminalToHost()
          writeLine('')
          writeLine(`Connected. Workdir: ${payload.cwd || '/'}`)
        } else if (payload.type === 'error') {
          writeLine('')
          writeLine(`\x1b[31m${payload.message || 'Terminal error.'}\x1b[0m`)
        } else if (payload.type === 'exit') {
          writeLine('')
          writeLine(`\x1b[33mTerminal session closed (${payload.code ?? 0}).\x1b[0m`)
        }
      } catch {
        writeTerminal(String(event.data || ''))
      }
    })

    socket.addEventListener('close', () => {
      writeLine('')
      writeLine('\x1b[33mDisconnected from sandbox terminal.\x1b[0m')
    })

    socket.addEventListener('error', () => {
      writeLine('')
      writeLine('\x1b[31mUnable to connect to sandbox terminal.\x1b[0m')
    })

    return () => {
      resizeObserver.disconnect()
      terminalHost.removeEventListener('paste', handleTerminalPaste)
      inputDisposable.dispose()
      socket.close()
      terminal.dispose()
      xtermRef.current = null
      terminalSocketRef.current = null
    }
  }, [dockerStatus.expiresAt, dockerStatus.running, isTerminalMounted, roomId, terminalLayout])

  if (isLoadingRoom) {
    return (
      <main className="pt-16 md:pt-20 min-h-screen flex items-center justify-center">
        <p className="text-on-surface-variant font-headline text-xs">
          Loading room content...
        </p>
      </main>
    )
  }

  if (!room) {
    return <Navigate to="/learn" replace />
  }

  const primaryMarkdown = room.content?.markdown || ''
  const missionOverview = hasContent(primaryMarkdown)
    ? primaryMarkdown
    : room.content?.missionOverview || room.description
  const remediationProtocols =
    room.content?.remediationProtocols ||
    'Apply secure coding practices, validate all user input, and enforce least privilege access.'
  const vulnerabilityDefinition =
    room.content?.vulnerabilityBriefing?.definition ||
    'No vulnerability definition has been configured for this room yet.'
  const vulnerabilityImpact =
    room.content?.vulnerabilityBriefing?.impact ||
    'No impact summary has been configured for this room yet.'
  const technicalDeepDive =
    room.content?.technicalDeepDive ||
    'No technical deep dive has been configured for this room yet.'

  const roomTags = room.tags?.length ? room.tags : [room.categoryTag || room.category].filter(Boolean)
  const keywordTags = room.requiredKeywords?.length ? room.requiredKeywords : []
  const missionOverviewMarkup = hasContent(primaryMarkdown)
    ? parseMarkdownToHtml(missionOverview)
    : renderRichContent(missionOverview, room.content?.html)
  const remediationProtocolsMarkup = renderRichContent(remediationProtocols)
  const technicalDeepDiveMarkup = renderRichContent(technicalDeepDive)
  const vulnerabilityDefinitionMarkup = renderRichContent(vulnerabilityDefinition)
  const vulnerabilityImpactMarkup = renderRichContent(vulnerabilityImpact)
  const youtubeEmbedUrl = toYouTubeEmbedUrl(room.content?.youtubeVideoUrl)
  const roomAttachment = room.content?.attachment
  const isAiQuestionMode = questionStatus.mode === 'theoretical' || questionStatus.mode === 'hybrid'
  const isPreparingTheoreticalQuestions =
    isLoadingQuestions && questionsEnabled && (roomType === 'theoretical' || Boolean(room.content?.aiQuestionsEnabled))
  const requiredAssessmentQuestions = questionStatus.questions.filter((question) => !question.bonus && !question.optional)
  const bonusAssessmentQuestions = questionStatus.questions.filter((question) => question.bonus || question.optional)
  const remainingPracticalQuestions = requiredAssessmentQuestions.filter(
    (question) => question.questionType === 'manual' && !question.answeredCorrectly,
  ).length
  const isAiEvaluatingAnswers = isSubmittingQuestions && isAiQuestionMode
  const assessmentClipboardBlocker = isPracticalRoom ? undefined : blockClipboardInput
  const dockerExpiresAt = dockerStatus.expiresAt ? new Date(dockerStatus.expiresAt).getTime() : 0
  const dockerRemainingMs = dockerStatus.running && dockerExpiresAt ? Math.max(0, dockerExpiresAt - dockerNow) : 0
  const isDockerServiceActive = dockerStatus.running && (!dockerExpiresAt || dockerRemainingMs > 0)
  const dockerRemainingPercent =
    isDockerServiceActive && dockerStatus.expiresAt
      ? Math.max(
          0,
          Math.min(
            100,
            (dockerRemainingMs / ((dockerStatus.timeoutMinutes || 120) * 60 * 1000)) * 100,
          ),
        )
      : 0

  const handleMarkComplete = async () => {
    setCompletionError('')

    if (isPreparingTheoreticalQuestions) {
      setCompletionError('AI is preparing your theoretical questions. Complete the assessment before marking this room complete.')
      return
    }

    if (questionStatus.enabled && !questionStatus.allCorrect) {
      setCompletionError(
        isAiQuestionMode
          ? 'Score 100 in the technical evaluation before marking complete.'
          : 'Answer all room questions correctly before marking complete.',
      )
      return
    }

    const success = await markLabCompleted(room.id)
    if (!success) {
      setCompletionError('Unable to mark complete yet. Verify question requirements and try again.')
      return
    }

    setLabStatus('completed')
  }

  const handleMarkIncomplete = () => {
    markLabIncomplete(room.id)
    setLabStatus('in-progress')
    setCompletionError('')
  }

  const handleQuestionAnswerChange = (questionId, value) => {
    const question = questionStatus.questions.find((item) => String(item.id) === String(questionId))
    if (isPracticalRoom && question?.questionType === 'manual' && question?.answeredCorrectly) {
      return
    }

    setQuestionAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }))
  }

  const handleSpawnDocker = async () => {
    setDockerError('')
    setDockerAction('Spawning sandbox')
    setIsDockerWorking(true)
    try {
      const response = await apiFetch(`/rooms/${encodeURIComponent(room.id)}/docker/spawn`, {
        method: 'POST',
      })
      setDockerStatus({
        enabled: Boolean(response?.enabled),
        running: Boolean(response?.running),
        access: response?.access || null,
        containerPort: response?.containerPort || room.content?.docker?.containerPort || '',
        hostPort: response?.hostPort || response?.access?.port || '',
        instructions: response?.instructions || room.content?.docker?.instructions || '',
        timeoutMinutes: response?.timeoutMinutes || room.content?.docker?.timeoutMinutes || 120,
        createdAt: response?.createdAt || null,
        expiresAt: response?.expiresAt || null,
        expired: false,
      })
    } catch (error) {
      setDockerError(error?.message || 'Unable to spawn Docker service.')
    } finally {
      setIsDockerWorking(false)
      setDockerAction('')
    }
  }

  const handleRevertDocker = async () => {
    setDockerError('')
    setDockerAction('Reverting sandbox')
    setIsDockerWorking(true)
    try {
      const response = await apiFetch(`/rooms/${encodeURIComponent(room.id)}/docker/spawn`, {
        method: 'POST',
        body: JSON.stringify({ revert: true }),
      })
      setDockerStatus({
        enabled: Boolean(response?.enabled),
        running: Boolean(response?.running),
        access: response?.access || null,
        containerPort: response?.containerPort || room.content?.docker?.containerPort || '',
        hostPort: response?.hostPort || response?.access?.port || '',
        instructions: response?.instructions || room.content?.docker?.instructions || '',
        timeoutMinutes: response?.timeoutMinutes || room.content?.docker?.timeoutMinutes || 120,
        createdAt: response?.createdAt || null,
        expiresAt: response?.expiresAt || null,
        expired: false,
      })
    } catch (error) {
      setDockerError(error?.message || 'Unable to revert Docker service.')
    } finally {
      setIsDockerWorking(false)
      setDockerAction('')
    }
  }

  const handleStopDocker = async () => {
    setDockerError('')
    setDockerAction('Stopping sandbox')
    setIsDockerWorking(true)
    try {
      await apiFetch(`/rooms/${encodeURIComponent(room.id)}/docker/stop`, {
        method: 'POST',
      })
      setDockerStatus((current) => ({
        ...current,
        running: false,
        access: null,
        hostPort: '',
        expiresAt: null,
        expired: false,
      }))
    } catch (error) {
      setDockerError(error?.message || 'Unable to stop Docker service.')
    } finally {
      setIsDockerWorking(false)
      setDockerAction('')
    }
  }

  const handleSubmitQuestions = async () => {
    setQuestionFeedback('')
    setIsSubmittingQuestions(true)

    try {
      const result = await apiFetch(`/rooms/${encodeURIComponent(room.id)}/questions/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers: questionAnswers }),
      })
      const resultMode = result?.mode || questionStatus.mode || 'practical'
      const passed = Boolean(result?.allCorrect)
      const technicalScore = Number(result?.technicalScore || 0)
      const grammarScore = Number(result?.grammarScore || 0)
      const bonusScore = Number(result?.bonusScore || 0)
      const correct = Number(result?.correct || 0)
      const total = Number(result?.total || questionStatus.total || 0)

      setQuestionStatus((prev) => ({
        ...prev,
        correct,
        total,
        allCorrect: passed,
        technicalScore: technicalScore || prev.technicalScore || 0,
        grammarScore: grammarScore || prev.grammarScore || 0,
        bonusScore,
        feedback: result?.feedback || prev.feedback || '',
        questions: Array.isArray(result?.questions) && result.questions.length
          ? result.questions
          : prev.questions,
      }))

      if (result?.answers && typeof result.answers === 'object') {
        setQuestionAnswers(result.answers)
      } else if (!passed && Array.isArray(result?.questions) && result.questions.length) {
        setQuestionAnswers({})
      }

      setResultModal({
        mode: resultMode,
        passed,
        technicalScore,
        grammarScore,
        bonusScore,
        correct,
        total,
        feedback: result?.feedback || '',
      })

      if (passed) {
        if (resultMode === 'theoretical') {
          await markLabCompleted(room.id)
          setLabStatus('completed')
        }
        setQuestionFeedback(
          resultMode === 'theoretical'
            ? 'Technical score is 100. This room has been completed.'
            : resultMode === 'hybrid'
              ? 'Manual and AI checks passed. You can now complete this room.'
            : 'All answers are correct. You can now complete this room.',
        )
      } else {
        setQuestionFeedback(
          resultMode === 'theoretical' || resultMode === 'hybrid'
            ? `Technical: ${technicalScore} / Grammar: ${grammarScore}. ${result?.feedback || 'Review and try again.'}`
            : 'Some answers are incorrect. Review and try again.',
        )
      }
    } catch (error) {
      setQuestionFeedback(error?.message || 'Unable to submit answers right now.')
    } finally {
      setIsSubmittingQuestions(false)
    }
  }

  return (
    <main className="pt-16 md:pt-20 min-h-screen">
      {isAiEvaluatingAnswers ? (
        <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant/40 shadow-2xl">
            <div className="rounded-xl h-1 bg-primary"></div>
            <div className="p-8 text-center">
              <div className="rounded-xl mx-auto mb-6 flex h-16 w-16 items-center justify-center bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-4xl animate-pulse">
                  psychology
                </span>
              </div>
              <p className="font-headline text-xs text-primary font-bold">
                AI Evaluation
              </p>
              <h2 className="mt-3 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                Reviewing Your Answers
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
                AI is checking your required answers, optional interview bonus, grammar, and improvement areas.
              </p>
              <div className="rounded-xl mt-6 h-1.5 overflow-hidden bg-surface-container-high">
                <div className="h-full w-2/3 bg-primary animate-pulse"></div>
              </div>
              <p className="mt-4 font-headline text-xs text-on-surface-variant">
                Please keep this room open
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {resultModal ? (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 md:p-6">
          <div className="my-6 w-full max-w-lg max-h-[calc(100vh-3rem)] bg-surface-container-lowest border border-outline-variant/40 shadow-2xl flex flex-col">
            <div className={`h-1 ${resultModal.passed ? 'bg-secondary' : 'bg-primary'}`}></div>
            <div className="p-8 overflow-y-auto">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <span className="font-headline text-xs text-primary font-bold">
                    Evaluation Result
                  </span>
                  <h2 className="font-headline text-3xl font-extrabold tracking-tight mt-2 text-on-background">
                    {resultModal.passed ? 'Passed' : 'Not Passed'}
                  </h2>
                </div>
                <button
                  className="rounded-xl inline-flex items-center justify-center h-10 w-10 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                  onClick={() => setResultModal(null)}
                  type="button"
                  aria-label="Close result"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {resultModal.mode === 'theoretical' || resultModal.mode === 'hybrid' ? (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="rounded-2xl bg-surface-container-low p-5">
                    <p className="font-headline text-xs text-on-surface-variant font-bold mb-2">
                      Technical
                    </p>
                    <p className="font-headline text-4xl font-extrabold text-primary">
                      {resultModal.technicalScore}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-2">Required: 100</p>
                  </div>
                  <div className="rounded-2xl bg-surface-container-low p-5">
                    <p className="font-headline text-xs text-on-surface-variant font-bold mb-2">
                      Grammar
                    </p>
                    <p className="font-headline text-4xl font-extrabold text-secondary">
                      {resultModal.grammarScore}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-2">Writing quality</p>
                  </div>
                  <div className="rounded-2xl col-span-2 bg-surface-container-low p-4">
                    <p className="font-headline text-xs text-on-surface-variant font-bold mb-1">
                      Interview Bonus
                    </p>
                    <p className="font-headline text-2xl font-extrabold text-secondary">
                      +{resultModal.bonusScore || 0}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">Optional margin, up to 10</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-surface-container-low p-5 mb-6">
                  <p className="font-headline text-xs text-on-surface-variant font-bold mb-2">
                    Correct Answers
                  </p>
                  <p className="font-headline text-4xl font-extrabold text-primary">
                    {resultModal.correct}/{resultModal.total}
                  </p>
                </div>
              )}

              <p className="text-sm text-on-surface-variant leading-relaxed mb-6 whitespace-pre-wrap break-words">
                {resultModal.feedback ||
                  (resultModal.passed
                    ? 'You met the completion requirement for this room.'
                    : resultModal.mode === 'theoretical' || resultModal.mode === 'hybrid'
                      ? 'Improve the technical accuracy of your answers and submit again.'
                      : 'Review the incorrect answers and submit again.')}
              </p>

              <button
                className="rounded-full w-full py-3 bg-primary text-on-primary font-headline text-sm font-bold hover:opacity-90 transition-colors"
                onClick={() => setResultModal(null)}
                type="button"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div ref={contentRootRef} className="max-w-[96rem] mx-auto p-8 lg:p-12">
        <header className="mb-12 shadow-soft pl-8">
          <div className="flex flex-wrap gap-2 mb-4">
            {roomTags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg bg-primary-container text-on-primary-container px-3 py-1 font-headline text-sm font-bold"
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="text-5xl lg:text-6xl font-extrabold tracking-tighter mb-4 text-on-background font-headline">
            {room.title}
          </h1>
          <p className="text-on-surface-variant max-w-2xl text-lg font-body leading-relaxed">
            {room.description}
          </p>
          {room.trainerName ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-secondary-container px-4 py-2 text-on-secondary-container">
              <span className="material-symbols-outlined text-base">co_present</span>
              <span className="font-headline text-sm font-bold">Trainer: {room.trainerName}</span>
            </div>
          ) : null}
        </header>

        <div className={`grid grid-cols-1 ${isTerminalSplitLayout ? 'xl:grid-cols-[minmax(0,1fr)_minmax(34rem,0.9fr)] gap-8 items-start' : 'lg:grid-cols-12 gap-12'}`}>
          <div className={`${isTerminalSplitLayout ? 'min-w-0 space-y-12' : 'lg:col-span-8 space-y-12'}`}>
            <section className="rounded-2xl bg-surface-container-lowest p-8 relative overflow-hidden">
              <div className="rounded-xl absolute top-0 right-0 w-32 h-32 bg-primary/5 -rotate-45 translate-x-16 -translate-y-16"></div>
              <h2 className="font-headline text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="text-primary">01</span> Overview
              </h2>
              <div
                className="space-y-4 text-on-surface font-body leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:mt-8 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:mt-7 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1.5 [&_pre]:bg-surface-container-high [&_pre]:border [&_pre]:border-outline-variant/30 [&_pre]:p-5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:my-5 [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:bg-surface-container-highest [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-primary [&_a]:underline [&_hr]:my-6 [&_hr]:border-outline-variant/40 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:bg-surface-container-low [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:my-5 [&_th]:text-left [&_th]:text-xs [&_th]:tracking-normal [&_th]:font-headline [&_th]:bg-surface-container-high [&_th]:p-3 [&_th]:border [&_th]:border-outline-variant/30 [&_td]:p-3 [&_td]:border [&_td]:border-outline-variant/30"
                dangerouslySetInnerHTML={{ __html: missionOverviewMarkup }}
              >
              </div>
            </section>

            <section className="p-2 border-l border-outline-variant/30">
              <h2 className="font-headline text-2xl font-bold mb-6 flex items-center gap-3 pl-6">
                <span className="text-primary">02</span>
                Topic briefing
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pl-6">
                <div className="rounded-2xl bg-surface-container-low p-6">
                  <h3 className="font-headline text-xs font-bold text-primary mb-3">
                    Definition
                  </h3>
                  <div
                    className="text-sm leading-relaxed [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1 [&_code]:font-mono"
                    dangerouslySetInnerHTML={{ __html: vulnerabilityDefinitionMarkup }}
                  ></div>
                </div>
                <div className="rounded-2xl bg-surface-container-low p-6">
                  <h3 className="font-headline text-xs font-bold text-primary mb-3">
                    Impact
                  </h3>
                  <div
                    className="text-sm leading-relaxed [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1 [&_code]:font-mono"
                    dangerouslySetInnerHTML={{ __html: vulnerabilityImpactMarkup }}
                  ></div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="text-primary">03</span> Deep dive
              </h2>
              <div className="space-y-6">
                <div
                  className="font-body leading-relaxed text-on-surface [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:pb-2 [&_h1]:border-b [&_h1]:border-outline-variant/30 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-outline-variant/30 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-2 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1.5 [&_pre]:bg-on-surface/5 [&_pre]:p-4 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:my-4 [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:bg-on-surface/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-primary [&_a]:underline hover:[&_a]:text-primary-container transition-colors [&_blockquote]:border-l-4 [&_blockquote]:border-on-surface-variant/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4"
                  dangerouslySetInnerHTML={{ __html: technicalDeepDiveMarkup }}
                ></div>
                <div className="bg-surface-container-high aspect-video w-full flex items-center justify-center relative overflow-hidden">
                  {youtubeEmbedUrl ? (
                    <iframe
                      allow="fullscreen"
                      allowFullScreen
                      className="absolute inset-0 h-full w-full"
                      referrerPolicy="strict-origin-when-cross-origin"
                      src={youtubeEmbedUrl}
                      title="Course walkthrough video"
                    ></iframe>
                  ) : (
                    <>
                      <img
                        alt="Technical Logic Diagram"
                        className="absolute inset-0 w-full h-full object-cover opacity-20 grayscale"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuDvAt-0JW07N76LyAzfo2fdJ5rClw4KqFDM3mwsBWdDTmv-2_e8-lwHPSpO1fMUKIPqvqaiE5UU8MJ5g57pCHOwIXd2a3Jqj1ZQ7y7SD3fAOMpWfNsBZCnJUuhu2bTK2qOEveqZmBe2HclDQj5B1X16u5FjdKT9f15K5LaeyHgREIXf-UBum34rsfFp_T_tYzqry6b0EpxoPZh_GE-51Dm_XL_NpcSZ_8Z_s_-OZlc0b4HgAPUmCoLPJM7hR4GaFqzV5q5Af_aY27o"
                      />
                      <div className="rounded-2xl z-10 text-center p-8 bg-surface/90 backdrop-blur-md border border-primary/20">
                        <span className="material-symbols-outlined text-4xl text-primary mb-2">
                          schema
                        </span>
                        <p className="font-headline font-bold text-xs">
                          Logic Alteration Visualization
                        </p>
                        <p className="text-xs text-on-surface-variant mt-1">
                          Payload: Admin'--
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className={`${isTerminalSplitLayout ? 'xl:col-start-2 space-y-8' : 'lg:col-span-4 space-y-8'}`}>
            {isTerminalSplit ? (
              <div className={`${isTerminalMinimized ? 'fixed -left-[10000px] top-0 h-[640px] w-[640px] overflow-hidden opacity-0 pointer-events-none' : 'min-h-[560px] xl:min-h-[640px]'}`}>
                <div className="flex h-[min(72vh,48rem)] min-h-[560px] flex-col border border-outline-variant bg-surface-container-lowest text-on-surface shadow-2xl xl:h-[calc(100vh-7rem)]">
                  <div className="rounded-xl flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 py-3 dark:border-[#24313a] dark:bg-[#10161a]">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-primary"></span>
                      <span className="h-3 w-3 rounded-full bg-secondary"></span>
                      <span className="h-3 w-3 rounded-full bg-outline-variant"></span>
                      <div>
                        <p className="font-headline text-xs font-bold text-primary">
                          Split Terminal
                        </p>
                        <h3 className="font-headline text-lg font-extrabold tracking-tight text-on-background">
                          Sandbox Shell
                        </h3>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="grid h-9 w-9 place-items-center border border-outline-variant text-on-background hover:border-secondary hover:text-secondary"
                        onClick={() => setTerminalLayout('overlay')}
                        title="Open full screen"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-lg">open_in_full</span>
                      </button>
                      <button
                        className="grid h-9 w-9 place-items-center border border-outline-variant text-on-background hover:border-primary hover:text-primary"
                        onClick={() => setIsTerminalMinimized(true)}
                        title="Minimize terminal"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-lg">minimize</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col p-4">
                    <div className="rounded-xl mb-3 flex flex-wrap items-center justify-between gap-3 border border-outline-variant bg-surface-container-lowest px-4 py-3 dark:border-[#233039] dark:bg-[#0b0f12]">
                      <p className="font-headline text-xs text-on-surface-variant dark:text-[#9ed8e8]">
                        Commands run inside your personal challenge sandbox.
                      </p>
                      {dockerStatus.access?.url && isDockerServiceActive ? (
                        <p className="font-headline text-xs text-secondary break-all">
                          target: proxied through platform
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-xl min-h-0 flex-1 overflow-hidden border border-outline-variant bg-surface-container-lowest p-3 shadow-[inset_0_0_28px_rgba(25,28,30,0.08)] dark:border-[#26343d] dark:bg-[#020405]">
                      {isDockerServiceActive ? (
                        <div
                          className="h-full w-full pb-6 [&_.xterm]:h-full [&_.xterm-screen]:!h-full [&_.xterm-viewport]:!bg-[#fbfcfd] dark:[&_.xterm-viewport]:!bg-[#020405]"
                          onClick={() => xtermRef.current?.focus()}
                          ref={xtermHostRef}
                        ></div>
                      ) : (
                        <div className="space-y-3 p-5 font-headline text-sm text-on-surface-variant dark:text-[#9ed8e8]">
                          <pre className="whitespace-pre-wrap text-secondary">
{`Welcome to Minerva Academy
Interactive sandbox terminal waiting for Docker spawn.`}
                          </pre>
                          <p>Spawn the Docker service, then open terminal access for a real interactive shell.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl bg-secondary text-on-secondary p-8">
              <h2 className="font-headline text-xl font-bold mb-6 flex items-center gap-3 tracking-tight">
                <span className="material-symbols-outlined">shield_with_heart</span>{' '}
                Further reading
              </h2>
              <div
                className="font-body text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1.5 [&_pre]:bg-black/20 [&_pre]:border [&_pre]:border-white/10 [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:my-4 [&_code]:font-mono [&_code]:bg-black/20 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_blockquote]:border-l-4 [&_blockquote]:border-white/25 [&_blockquote]:pl-3 [&_blockquote]:my-3"
                dangerouslySetInnerHTML={{ __html: remediationProtocolsMarkup }}
              ></div>
            </div>

            <div className="rounded-2xl bg-surface-container-low p-8 border-t-2 border-primary">
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div>
                  <p className="font-headline text-xs text-on-surface-variant mb-1">
                    Difficulty
                  </p>
                  <p className="font-headline font-bold text-lg">
                    {(room.difficulty || room.level || 'N/A').toUpperCase()}
                  </p>
                </div>
                <div>
                  <p className="font-headline text-xs text-on-surface-variant mb-1">
                    Estimated Time
                  </p>
                  <p className="font-headline font-bold text-lg">{(room.estimateTime || 'N/A').toUpperCase()}</p>
                </div>
                <div>
                  <p className="font-headline text-xs text-on-surface-variant mb-1">
                    Environment
                  </p>
                  <p className="font-headline font-bold text-lg">{(room.environment || 'N/A').toUpperCase()}</p>
                </div>
                <div>
                  <p className="font-headline text-xs text-on-surface-variant mb-1">
                    XP Reward
                  </p>
                  <p className="font-headline font-bold text-lg">{(room.xp || 'N/A').toUpperCase()}</p>
                </div>
                <div>
                  <p className="font-headline text-xs text-on-surface-variant mb-1">
                    Room Type
                  </p>
                  <p className="font-headline font-bold text-lg">{roomType.toUpperCase()}</p>
                </div>
              </div>
              {roomAttachment?.dataUrl ? (
                <a
                  className="rounded-2xl mb-8 flex items-center justify-between gap-4 bg-surface-container-high p-4  hover:bg-surface-container-highest transition-colors"
                  download={roomAttachment.name || 'lab-file'}
                  href={roomAttachment.dataUrl}
                >
                  <span>
                    <span className="block font-headline text-xs font-bold text-secondary">
                      Lab File
                    </span>
                    <span className="mt-1 block text-sm text-on-surface">
                      {roomAttachment.name || 'Download attachment'}
                    </span>
                    <span className="mt-1 block text-xs text-on-surface-variant">
                      {Math.ceil(Number(roomAttachment.size || 0) / 1024)} KB
                    </span>
                  </span>
                  <span className="material-symbols-outlined text-secondary">download</span>
                </a>
              ) : null}
              <div className="space-y-4">
                <h3 className="font-headline text-xs font-extrabold text-primary border-b border-primary/20 pb-2">
                  Required Keywords
                </h3>
                <div className="flex flex-wrap gap-2">
                  {keywordTags.length > 0 ? (
                    keywordTags.map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-full text-xs font-headline border border-outline-variant px-2 py-1"
                      >
                        {keyword}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-headline text-on-surface-variant">
                      No keywords configured
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <button
                className="rounded-2xl w-full group relative bg-primary hover:opacity-90 text-on-primary p-6 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!dockerAvailable}
                onClick={() => {
                  setTerminalLayout('overlay')
                  setIsTerminalMinimized(false)
                  setIsTerminalOpen(true)
                }}
                type="button"
              >
                <div className="flex justify-between items-center">
                  <span className="font-headline text-xl font-bold tracking-tighter italic">
                    Access Terminal
                  </span>
                  <span className="material-symbols-outlined group-hover:translate-x-2 transition-transform">
                    open_in_full
                  </span>
                </div>
                <div className="rounded-xl absolute bottom-0 left-0 h-1 bg-white/20 w-full"></div>
              </button>
              {dockerAvailable ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className="rounded-xl bg-surface-container-high px-4 py-3 font-headline text-xs font-bold text-on-surface hover:text-secondary disabled:opacity-60"
                    disabled={!dockerAvailable}
                    onClick={() => {
                      setTerminalLayout('split')
                      setIsTerminalMinimized(false)
                      setIsTerminalOpen(true)
                    }}
                    type="button"
                  >
                    Split Screen
                  </button>
                  <button
                    className="rounded-xl bg-surface-container-high px-4 py-3 font-headline text-xs font-bold text-on-surface hover:text-primary disabled:opacity-60"
                    disabled={!isTerminalOpen}
                    onClick={() => setIsTerminalMinimized(true)}
                    type="button"
                  >
                    Minimize
                  </button>
                </div>
              ) : null}
              {isTerminalOpen && isTerminalMinimized ? (
                <button
                  className="rounded-xl w-full border border-outline-variant bg-surface-container-high px-4 py-3 text-left font-headline text-xs font-bold text-secondary hover:border-secondary"
                  onClick={() => {
                    setIsTerminalMinimized(false)
                    setTerminalLayout(terminalLayout || 'overlay')
                  }}
                  type="button"
                >
                  <span className="inline-flex w-full items-center justify-between gap-3">
                    Terminal minimized
                    <span className="material-symbols-outlined text-lg">keyboard_arrow_up</span>
                  </span>
                </button>
              ) : null}
              <p className="text-xs font-headline text-on-surface-variant text-center">
                Ready for deployment? Ensure secure connection protocols are
                active.
              </p>

              {isTerminalOverlay ? (
                <div className={isTerminalMinimized
                  ? 'fixed -left-[10000px] top-0 z-[-1] h-[640px] w-[640px] overflow-hidden bg-surface text-on-surface opacity-0 pointer-events-none'
                  : 'fixed inset-0 z-[120] bg-surface text-on-surface'}
                >
                  <div className="flex h-full flex-col">
                    <div className="rounded-xl flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-5 py-3 dark:border-[#24313a] dark:bg-[#10161a]">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full bg-primary"></span>
                        <span className="h-3 w-3 rounded-full bg-secondary"></span>
                        <span className="h-3 w-3 rounded-full bg-outline-variant"></span>
                        <div className="ml-3">
                          <p className="font-headline text-xs font-bold text-primary">
                            Browser Terminal
                          </p>
                          <h3 className="font-headline text-xl font-extrabold tracking-tight text-on-background">
                            Sandbox Shell
                          </h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`font-headline text-xs font-bold ${isDockerServiceActive ? 'text-secondary' : 'text-primary'}`}>
                          {isDockerServiceActive ? 'Ready' : 'Spawn Required'}
                        </span>
                        <button
                          className="grid h-10 w-10 place-items-center border border-outline-variant text-on-background hover:border-secondary hover:text-secondary"
                          onClick={() => setTerminalLayout('split')}
                          title="Split screen"
                          type="button"
                        >
                          <span className="material-symbols-outlined">splitscreen</span>
                        </button>
                        <button
                          className="grid h-10 w-10 place-items-center border border-outline-variant text-on-background hover:border-primary hover:text-primary"
                          onClick={() => setIsTerminalMinimized(true)}
                          title="Minimize terminal"
                          type="button"
                        >
                          <span className="material-symbols-outlined">minimize</span>
                        </button>
                        <button
                          className="grid h-10 w-10 place-items-center border border-outline-variant text-on-background hover:border-primary hover:text-primary"
                          onClick={() => {
                            setIsTerminalOpen(false)
                            setIsTerminalMinimized(false)
                          }}
                          type="button"
                        >
                          <span className="material-symbols-outlined">close</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
                      <div className="rounded-xl mb-3 flex flex-wrap items-center justify-between gap-3 border border-outline-variant bg-surface-container-lowest px-4 py-3 dark:border-[#233039] dark:bg-[#0b0f12]">
                        <p className="font-headline text-xs text-on-surface-variant dark:text-[#9ed8e8]">
                          Commands run inside your personal challenge sandbox. Uploaded files appear in /challenge only when enabled by admin.
                        </p>
                        {dockerStatus.access?.url && isDockerServiceActive ? (
                          <p className="font-headline text-xs text-secondary">
                            target: proxied through platform
                          </p>
                        ) : null}
                        <p className="font-headline text-xs text-on-surface-variant dark:text-[#9ed8e8]">
                          mode: interactive shell
                        </p>
                      </div>

                      <div className="rounded-xl min-h-0 flex-1 overflow-hidden border border-outline-variant bg-surface-container-lowest p-3 shadow-[inset_0_0_28px_rgba(25,28,30,0.08)] dark:border-[#26343d] dark:bg-[#020405] dark:shadow-[inset_0_0_40px_rgba(0,0,0,0.7)]">
                        {isDockerServiceActive ? (
                          <div
                            className="h-full w-full pb-6 [&_.xterm]:h-full [&_.xterm-screen]:!h-full [&_.xterm-viewport]:!bg-[#fbfcfd] dark:[&_.xterm-viewport]:!bg-[#020405]"
                            onClick={() => xtermRef.current?.focus()}
                            ref={xtermHostRef}
                          ></div>
                        ) : (
                          <div className="space-y-3 p-5 font-headline text-sm text-on-surface-variant dark:text-[#9ed8e8]">
                            <pre className="whitespace-pre-wrap text-secondary">
{`Welcome to Minerva Academy
Interactive sandbox terminal waiting for Docker spawn.`}
                            </pre>
                            <p>Spawn the Docker service, then open terminal access for a real interactive shell.</p>
                            <p>Admin-prepared tools and /challenge file access are applied before the shell opens.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {dockerAvailable ? (
                <div className="rounded-2xl relative overflow-hidden bg-surface-container-low p-5 ">
                  {isDockerWorking ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-container-low/90 backdrop-blur-sm">
                      <div className="rounded-2xl border border-outline-variant bg-surface-container-high px-6 py-5 text-center shadow-xl">
                        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-secondary border-t-transparent"></div>
                        <p className="font-headline text-xs font-bold text-secondary">
                          Docker Runtime
                        </p>
                        <h4 className="mt-2 font-headline text-lg font-extrabold tracking-tight text-on-surface">
                          {dockerAction || 'Updating sandbox'}
                        </h4>
                        <p className="mt-2 text-xs text-on-surface-variant">
                          Preparing your isolated lab machine...
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-headline text-xs font-bold text-secondary">
                        Docker Service
                      </p>
                      <h3 className="mt-2 font-headline text-lg font-extrabold tracking-tight">
                        {isDockerServiceActive ? 'Service Running' : 'Spawn Target'}
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
                        Personal lab machine with isolated runtime access.
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                        Auto cleanup: {dockerStatus.timeoutMinutes || room.content?.docker?.timeoutMinutes || 120} minutes
                      </p>
                      {isDockerServiceActive && dockerStatus.access?.url ? (
                        <p className="mt-1 text-xs leading-relaxed text-secondary">
                          Web access: proxied through platform
                        </p>
                      ) : isDockerServiceActive ? (
                        <p className="mt-1 text-xs leading-relaxed text-secondary">
                          Terminal-only runtime: no service port published
                        </p>
                      ) : (
                        <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                          Web access: assigned automatically when the image exposes a service
                        </p>
                      )}
                      {isDockerServiceActive && dockerStatus.expiresAt ? (
                        <div className="mt-3 max-w-xs">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-headline text-xs font-bold text-on-surface-variant">
                              Time Remaining
                            </p>
                            <p className="font-headline text-sm font-bold text-secondary">
                              {formatDuration(dockerRemainingMs)}
                            </p>
                          </div>
                          <div className="rounded-xl mt-2 h-1.5 bg-surface-container-high overflow-hidden">
                            <div
                              className="h-full bg-secondary transition-all duration-500"
                              style={{ width: `${dockerRemainingPercent}%` }}
                            ></div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <span className={`px-2 py-1 font-headline text-xs font-bold ${isDockerServiceActive ? 'bg-secondary/15 text-secondary' : 'bg-primary/10 text-primary'}`}>
                      {isDockerServiceActive ? 'Online' : 'Offline'}
                    </span>
                  </div>

                  {dockerStatus.instructions ? (
                    <p className="mt-4 text-xs leading-relaxed text-on-surface-variant whitespace-pre-wrap">
                      {dockerStatus.instructions}
                    </p>
                  ) : null}

                  {isDockerServiceActive && dockerStatus.access?.url ? (
                    <a
                      className="rounded-xl mt-4 flex items-center justify-between gap-3 bg-surface-container-high p-3 text-sm font-bold text-on-surface hover:text-primary transition-colors"
                      href={dockerStatus.access.url.startsWith('http') ? dockerStatus.access.url : undefined}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="break-all">
                        {dockerStatus.access.proxyPath || 'Open proxied challenge service'}
                      </span>
                      <span className="material-symbols-outlined">open_in_new</span>
                    </a>
                  ) : null}

                  {dockerError ? (
                    <p className="mt-3 text-xs text-error">{dockerError}</p>
                  ) : null}

                  <div className="mt-4 flex gap-3">
                    <button
                      className="rounded-full flex-1 bg-secondary text-on-secondary px-4 py-3 font-headline text-sm font-bold disabled:opacity-60"
                      disabled={isDockerWorking || isDockerServiceActive}
                      onClick={handleSpawnDocker}
                      type="button"
                    >
                      Spawn Docker
                    </button>
                    <button
                      className="rounded-xl flex-1 bg-surface-container-high text-on-surface px-4 py-3 font-headline text-xs font-bold disabled:opacity-60"
                      disabled={isDockerWorking || !isDockerServiceActive}
                      onClick={handleStopDocker}
                      type="button"
                    >
                      Stop
                    </button>
                    <button
                      className="rounded-full flex-1 bg-primary text-on-primary px-4 py-3 font-headline text-sm font-bold disabled:opacity-60"
                      disabled={isDockerWorking}
                      onClick={handleRevertDocker}
                      type="button"
                    >
                      Revert
                    </button>
                  </div>
                </div>
              ) : null}

              {isPreparingTheoreticalQuestions ? (
                <div className="rounded-2xl bg-surface-container-low p-5 ">
                  <div className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-primary animate-pulse">
                      psychology
                    </span>
                    <div>
                      <p className="font-headline text-xs font-bold text-primary">
                        AI Assessment
                      </p>
                      <h3 className="mt-2 font-headline text-lg font-extrabold tracking-tight">
                        AI is preparing questions for you
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
                        Your theoretical assessment is being generated from this room and your learner profile.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl mt-4 h-1.5 bg-surface-container-high overflow-hidden">
                    <div className="h-full w-1/2 bg-primary animate-pulse"></div>
                  </div>
                </div>
              ) : null}

              {questionStatus.enabled ? (
                <div className="rounded-2xl bg-surface-container-low p-4  space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-headline text-xs font-bold text-on-surface-variant">
                      Question Challenge
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {isPracticalRoom && remainingPracticalQuestions > 0 ? (
                        <span className="rounded-lg text-xs font-headline font-bold px-2 py-1 bg-primary/10 text-primary">
                          {remainingPracticalQuestions} Remaining
                        </span>
                      ) : null}
                      <span className="rounded-lg text-xs font-headline font-bold px-2 py-1 bg-secondary/15 text-secondary">
                        {isAiQuestionMode
                          ? `Tech ${questionStatus.technicalScore}/100`
                          : `${questionStatus.correct}/${questionStatus.total} Correct`}
                      </span>
                    </div>
                  </div>

                  {isAiQuestionMode ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-surface-container-high p-3">
                        <p className="font-headline text-xs text-on-surface-variant">
                          Technical
                        </p>
                        <p className="font-headline text-2xl font-bold text-primary">
                          {questionStatus.technicalScore}
                        </p>
                      </div>
                      <div className="rounded-xl bg-surface-container-high p-3">
                        <p className="font-headline text-xs text-on-surface-variant">
                          Grammar
                        </p>
                        <p className="font-headline text-2xl font-bold text-secondary">
                          {questionStatus.grammarScore}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {requiredAssessmentQuestions.map((question, index) => {
                      const isManualSolved =
                        isPracticalRoom && question.questionType === 'manual' && question.answeredCorrectly

                      return (
                      <div
                        key={question.id || `question-${index}`}
                        className={`relative overflow-hidden border p-3 transition-colors ${
                          isManualSolved
                            ? 'border-secondary/50 bg-secondary/10'
                            : 'border-transparent bg-surface-container-high'
                        }`}
                      >
                        {isManualSolved ? (
                          <div className="pointer-events-none absolute inset-0 bg-secondary/5"></div>
                        ) : null}
                        <div className="relative">
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <p className="text-[11px] font-headline font-bold text-on-surface tracking-wide">
                              Q{index + 1}. {question.prompt}
                            </p>
                            {isManualSolved ? (
                              <span className="rounded-lg shrink-0 inline-flex items-center gap-1 bg-secondary/20 px-2 py-1 font-headline text-sm font-bold text-secondary">
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                Permanent
                              </span>
                            ) : null}
                          </div>
                        {question.hint ? (
                          <p className="text-xs text-on-surface-variant mb-2">Hint: {question.hint}</p>
                        ) : null}
                        {question.sourceType === 'interview' ? (
                          <div className="rounded-lg mb-3 border-l-2 border-primary/60 bg-primary/10 px-3 py-2">
                            <p className="font-headline text-xs font-bold text-primary">
                              Interview Source
                            </p>
                            {question.company ? (
                              <p className="mt-1 text-xs font-bold text-on-surface">
                                Company: {question.company}
                              </p>
                            ) : null}
                            <p className="mt-1 text-xs text-on-surface-variant">
                              {[question.company, question.interview].filter(Boolean).join(' • ') ||
                                'Interview-style question'}
                            </p>
                            {question.sourceInfo ? (
                              <p className="mt-1 text-xs text-on-surface-variant">{question.sourceInfo}</p>
                            ) : null}
                          </div>
                        ) : null}
                        {questionStatus.mode === 'theoretical' || question.questionType === 'ai' ? (
                          <textarea
                            className="rounded-lg w-full bg-surface-container-lowest border border-outline-variant/40 text-sm py-2 px-3 outline-none"
                            onChange={(e) => handleQuestionAnswerChange(question.id, e.target.value)}
                            onDrop={assessmentClipboardBlocker}
                            onPaste={assessmentClipboardBlocker}
                            placeholder="Write a complete answer"
                            rows="5"
                            value={questionAnswers[question.id] || ''}
                          ></textarea>
                        ) : (
                          <input
                            className={`rounded-lg w-full border text-sm py-2 px-3 outline-none ${
                              isManualSolved
                                ? 'bg-secondary/10 border-secondary/30 text-secondary font-bold cursor-not-allowed'
                                : 'bg-surface-container-lowest border-outline-variant/40'
                            }`}
                            disabled={isManualSolved}
                            onChange={(e) => handleQuestionAnswerChange(question.id, e.target.value)}
                            onDrop={assessmentClipboardBlocker}
                            onPaste={assessmentClipboardBlocker}
                            placeholder={isManualSolved ? 'Answer locked after correct submission' : 'Enter your answer'}
                            type="text"
                            value={questionAnswers[question.id] || ''}
                          />
                        )}
                        {isManualSolved ? (
                          <p className="mt-2 text-xs font-headline font-bold text-secondary">
                            Correct answer saved. Continue with the remaining questions.
                          </p>
                        ) : null}
                        </div>
                      </div>
                      )
                    })}
                    {bonusAssessmentQuestions.map((question) => (
                      <div key={question.id || 'bonus-interview'} className="rounded-xl bg-primary/10 border border-primary/30 p-3">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="font-headline text-xs font-bold text-primary">
                              Optional Interview Bonus
                            </p>
                            <p className="mt-1 text-xs text-on-surface-variant">
                              Answering this can add up to 10 bonus points.
                            </p>
                          </div>
                          <span className="rounded-full font-headline text-sm font-bold bg-primary text-on-primary px-2 py-1">
                            +10 max
                          </span>
                        </div>
                        <p className="text-[11px] font-headline font-bold text-on-surface tracking-wide mb-2">
                          {question.prompt}
                        </p>
                        <div className="rounded-lg mb-3 border-l-2 border-primary/60 bg-surface-container-lowest/60 px-3 py-2">
                          <p className="font-headline text-xs font-bold text-primary">
                            Interview Source
                          </p>
                          <p className="mt-1 text-xs font-bold text-on-surface">
                            Company: {question.company || 'General interview practice'}
                          </p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {question.interview || 'Interview-style question'}
                          </p>
                          {question.sourceInfo ? (
                            <p className="mt-1 text-xs text-on-surface-variant">{question.sourceInfo}</p>
                          ) : null}
                        </div>
                        <textarea
                          className="rounded-lg w-full bg-surface-container-lowest border border-outline-variant/40 text-sm py-2 px-3 outline-none"
                          onChange={(e) => handleQuestionAnswerChange(question.id, e.target.value)}
                          onDrop={assessmentClipboardBlocker}
                          onPaste={assessmentClipboardBlocker}
                          placeholder="Optional bonus answer"
                          rows="4"
                          value={questionAnswers[question.id] || ''}
                        ></textarea>
                      </div>
                    ))}
                  </div>

                  <button
                    className="rounded-full w-full py-3 bg-secondary text-on-secondary font-headline text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
                    disabled={isSubmittingQuestions}
                    onClick={handleSubmitQuestions}
                    type="button"
                  >
                    {isSubmittingQuestions
                      ? isAiQuestionMode
                        ? 'Evaluating...'
                        : 'Checking Answers...'
                      : isAiQuestionMode
                        ? 'Submit For AI Evaluation'
                        : 'Submit Answers'}
                  </button>

                  {questionFeedback || questionStatus.feedback ? (
                    <p className="text-xs text-on-surface-variant">{questionFeedback || questionStatus.feedback}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-2xl bg-surface-container-low p-4 ">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    Lab Status
                  </span>
                  <span className={`text-xs font-headline font-bold px-2 py-1 ${labStatus === 'completed' ? 'bg-secondary/15 text-secondary' : 'bg-primary/10 text-primary'}`}>
                    {labStatus === 'completed' ? 'Completed' : 'In Progress'}
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  {labStatus !== 'completed' ? (
                    <button
                      className="rounded-full w-full py-3 bg-secondary text-on-secondary font-headline text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
                      disabled={isPreparingTheoreticalQuestions || (questionStatus.enabled && !questionStatus.allCorrect)}
                      onClick={handleMarkComplete}
                      type="button"
                    >
                      {isPreparingTheoreticalQuestions ? 'Preparing Assessment...' : 'Mark Complete'}
                    </button>
                  ) : (
                    <button
                      className="rounded-xl w-full py-3 bg-surface-container-high text-on-surface font-headline text-xs font-bold"
                      onClick={handleMarkIncomplete}
                      type="button"
                    >
                      Mark Incomplete
                    </button>
                  )}
                </div>
                {completionError ? (
                  <p className="mt-2 text-xs text-error">{completionError}</p>
                ) : null}
              </div>
            </div>

          </div>
        </div>

        <div className="px-5 sm:px-8 lg:px-10 pb-10">
          <CourseEnrollmentPanel courseTitle={room?.title} roomId={room?.id} />
        </div>
      </div>
    </main>
  )
}

export default CoursePage
