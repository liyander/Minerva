import { useMemo, useRef, useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { sendChatbotMessage } from '../services/chatbot'
import { parseMarkdownToHtml } from '../utils/markdown'
import { getResourceById } from '../data/resourcesData'
import { getCoursesData } from '../data/coursesData'

const INITIAL_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Hi! I can help with your courses, explain a concept, or summarise the page you are on.',
}

const SITE_SUMMARY =
  'Minerva Academy is an online learning platform with learning paths, hands-on projects, a resource library, upcoming events, and admin tools for managing the platform.'

const EXAMPLE_PROMPTS = [
  'Summarize this page',
  'What is this site?',
  'Explain this concept simply',
]

function clampText(value, limit = 420) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) {
    return ''
  }

  if (text.length <= limit) {
    return text
  }

  return `${text.slice(0, limit - 1).trimEnd()}…`
}

function summarizeRoom(room) {
  if (!room) {
    return ''
  }

  const parts = [
    room.title ? `Skill: ${room.title}` : '',
    room.category ? `Category: ${room.category}` : '',
    room.difficulty ? `Difficulty: ${room.difficulty}` : '',
    room.estimateTime ? `Estimated time: ${room.estimateTime}` : '',
    room.description ? `Description: ${room.description}` : '',
    room.content?.missionOverview ? `Mission overview: ${room.content.missionOverview}` : '',
    room.content?.vulnerabilityBriefing?.definition
      ? `Vulnerability focus: ${room.content.vulnerabilityBriefing.definition}`
      : '',
    room.content?.technicalDeepDive ? `Technical notes: ${room.content.technicalDeepDive}` : '',
  ]

  return clampText(parts.filter(Boolean).join(' | '), 1200)
}

function summarizeCve(cve) {
  if (!cve) {
    return ''
  }

  const parts = [
    cve.cve_id ? `Resource: ${cve.cve_id}` : '',
    cve.found_year ? `Found: ${cve.found_year}` : '',
    cve.short_description ? `Description: ${cve.short_description}` : '',
    cve.vulnerability_report ? `Report: ${cve.vulnerability_report}` : '',
    cve.method_followed ? `Discovery method: ${cve.method_followed}` : '',
  ]

  return clampText(parts.filter(Boolean).join(' | '), 1200)
}

function buildRouteContext(pathname) {
  const normalizedPath = String(pathname || '/')

  if (normalizedPath.startsWith('/learn/course/')) {
    const slug = normalizedPath.split('/learn/course/')[1]?.split('/')[0] || ''
    const room = getCoursesData().find((item) => item.slug === slug || item.id === slug)

    return {
      pageType: 'room',
      route: normalizedPath,
      siteSummary: SITE_SUMMARY,
      pageSummary: room
        ? summarizeRoom(room)
        : `Current page is an course page at ${normalizedPath}.`,
    }
  }

  if (normalizedPath.startsWith('/resources/')) {
    const cveId = normalizedPath.split('/resources/')[1]?.split('/')[0] || ''
    const cve = getResourceById(cveId)

    return {
      pageType: 'cve',
      route: normalizedPath,
      siteSummary: SITE_SUMMARY,
      pageSummary: cve
        ? summarizeCve(cve)
        : `Current page is a Resource detail view for ${cveId || 'an unknown resource'}.`,
    }
  }

  return {
    pageType: 'site',
    route: normalizedPath,
    siteSummary: SITE_SUMMARY,
    pageSummary: `Current page route: ${normalizedPath}.`,
  }
}

function looksLikeCodeLine(line) {
  const trimmed = String(line || '').trim()
  if (!trimmed) {
    return false
  }

  if (/^(?:```|~~~)/.test(trimmed)) {
    return true
  }

  if (
    /^(?:\/\/|#include|<\/?[a-z][^>]*>|\$[A-Za-z_][\w$]*\s*=|(?:const|let|var|function|class|return|if|for|while|try|catch|import|from|public|private|protected|package)\b)/i.test(trimmed)
  ) {
    return true
  }

  return /(?:=>|[;{}[\]=<>])/.test(trimmed) && trimmed.length < 220
}

function normalizeAssistantContent(content) {
  const text = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!text) {
    return ''
  }

  if (/```|~~~/.test(text)) {
    return text
  }

  const lines = text.split('\n')
  const chunks = []
  let buffer = []
  let bufferType = null

  const flushBuffer = () => {
    if (!buffer.length) {
      return
    }

    if (bufferType === 'code' && buffer.length >= 2) {
      chunks.push(['```', ...buffer, '```'].join('\n'))
    } else {
      chunks.push(buffer.join('\n'))
    }

    buffer = []
    bufferType = null
  }

  lines.forEach((line) => {
    if (!line.trim()) {
      flushBuffer()
      chunks.push('')
      return
    }

    const lineType = looksLikeCodeLine(line) ? 'code' : 'text'
    if (bufferType && lineType !== bufferType) {
      flushBuffer()
    }

    bufferType = bufferType || lineType
    buffer.push(line)
  })

  flushBuffer()

  return chunks.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function splitTypingSegments(content) {
  const text = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()

  if (!text) {
    return []
  }

  if (text.includes('\n')) {
    return text.split('\n')
  }

  const sentenceSegments = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
  if (sentenceSegments && sentenceSegments.length > 1) {
    return sentenceSegments.map((segment) => segment.trim()).filter(Boolean)
  }

  const words = text.split(/\s+/)
  const chunks = []
  let current = ''

  words.forEach((word) => {
    if (!current) {
      current = word
      return
    }

    if ((current + ' ' + word).length > 84) {
      chunks.push(current)
      current = word
      return
    }

    current += ` ${word}`
  })

  if (current) {
    chunks.push(current)
  }

  return chunks.length ? chunks : [text]
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <article className="ml-auto max-w-[92%] rounded-xl rounded-br-md bg-primary px-4 py-3 text-sm leading-relaxed text-on-primary shadow-sm">
        {message.content}
      </article>
    )
  }

  return (
    <article className="mr-auto max-w-[92%] rounded-2xl rounded-bl-md border border-outline-variant/60 bg-surface-container-high px-4 py-3 text-sm leading-relaxed text-on-surface shadow-sm">
      <div
        className="space-y-2 leading-6 [&_p]:m-0 [&_p+p]:mt-2 [&_ul]:m-0 [&_ol]:m-0 [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1 [&_strong]:font-semibold [&_em]:italic [&_code]:rounded [&_code]:bg-surface-container-lowest [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-outline-variant/30 [&_pre]:bg-surface-container-lowest [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:italic"
        dangerouslySetInnerHTML={{ __html: parseMarkdownToHtml(normalizeAssistantContent(message.content)) }}
      />
    </article>
  )
}

function AssistantChatbot() {
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [mode, setMode] = useState('brief')
  const [messages, setMessages] = useState([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const listRef = useRef(null)
  const typingTimerRef = useRef(null)

  const canSend = input.trim().length > 0 && !isSending

  const historyPayload = useMemo(
    () =>
      messages
        .filter((entry) => entry.role === 'user' || (entry.role === 'assistant' && entry.content.trim()))
        .map((entry) => ({ role: entry.role, message: entry.content })),
    [messages],
  )

  const routeContext = useMemo(
    () => buildRouteContext(location.pathname),
    [location.pathname],
  )

  const requestContext = useMemo(
    () => ({
      mode,
      ...routeContext,
    }),
    [mode, routeContext],
  )

  const showExamplePrompts = !messages.some((entry) => entry.role === 'user')

  useEffect(() => {
    const node = listRef.current
    if (!node) {
      return
    }

    node.scrollTop = node.scrollHeight
  }, [messages, isOpen, isExpanded])

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current)
        typingTimerRef.current = null
      }
    }
  }, [])

  const stopTypingAnimation = () => {
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current)
      typingTimerRef.current = null
    }
  }

  const animateAssistantReply = (messageId, replyText) => {
    stopTypingAnimation()

    if (mode === 'brief') {
      setMessages((current) =>
        current.map((entry) =>
          entry.id === messageId ? { ...entry, content: replyText } : entry,
        ),
      )
      return
    }

    const segments = splitTypingSegments(replyText)
    if (!segments.length) {
      setMessages((current) =>
        current.map((entry) =>
          entry.id === messageId ? { ...entry, content: replyText } : entry,
        ),
      )
      return
    }

    let segmentIndex = 0
    const tick = () => {
      setMessages((current) =>
        current.map((entry) =>
          entry.id === messageId
            ? { ...entry, content: segments.slice(0, segmentIndex + 1).join('\n') }
            : entry,
        ),
      )

      if (segmentIndex >= segments.length - 1) {
        typingTimerRef.current = null
        return
      }

      segmentIndex += 1
      typingTimerRef.current = window.setTimeout(tick, isExpanded ? 120 : 170)
    }

    typingTimerRef.current = window.setTimeout(tick, 220)
  }

  const sendMessage = async (messageText) => {
    const nextMessage = String(messageText || '').trim()
    if (!nextMessage || isSending) {
      return
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: nextMessage,
    }

    setMessages((current) => [...current, userMessage])
    setInput('')
    setErrorMessage('')
    setIsSending(true)

    try {
      const response = await sendChatbotMessage(nextMessage, historyPayload, requestContext)
      const assistantMessageId = `assistant-${Date.now()}`
      const assistantReply =
        response?.content ||
        'I can only help with course material. Try asking about something on the platform.'

      setMessages((current) => [
        ...current,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
        },
      ])

      animateAssistantReply(assistantMessageId, assistantReply)
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to reach the chatbot service right now.')
    } finally {
      setIsSending(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    await sendMessage(input)
  }

  const handlePromptClick = (prompt) => {
    setIsOpen(true)
    void sendMessage(prompt)
  }

  const handleClose = () => {
    stopTypingAnimation()
    setIsOpen(false)
    setIsExpanded(false)
  }

  return (
    <>
      <button
        className="rounded-xl fixed bottom-5 right-[7.75rem] z-[90] inline-flex h-11 items-center gap-2 whitespace-nowrap border border-primary bg-primary px-4 text-[11px] font-headline font-bold text-on-primary shadow-xl transition-all hover:brightness-95"
        onClick={() => {
          setIsOpen((value) => {
            const nextValue = !value
            if (!nextValue) {
              setIsExpanded(false)
            }
            return nextValue
          })
        }}
        type="button"
        aria-label="Toggle study assistant"
        title="Study assistant"
      >
        <span className="material-symbols-outlined text-base">smart_toy</span>
        {isOpen ? 'Close' : 'Ask AI'}
      </button>

      {isOpen ? (
        <section
          className={`fixed z-[95] flex flex-col overflow-hidden border border-outline-variant bg-surface-container-low shadow-2xl transition-all duration-300 ${
            isExpanded
              ? 'inset-4 rounded-3xl md:inset-8'
              : 'bottom-20 right-3 h-[28rem] w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-2xl md:right-5'
          }`}
        >
          <header className="rounded-xl flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-container px-4 py-3">
            <div>
              <h2 className="font-headline text-sm font-bold text-on-surface">
                {isExpanded ? 'AI Study Workspace' : 'Study Assistant'}
              </h2>
              <p className="text-[11px] text-on-surface-variant">
                {isExpanded
                  ? 'Expanded view for longer prompts and deeper analysis'
                  : 'Ask about any subject you are studying'}
              </p>
              <div className="mt-3 inline-flex overflow-hidden rounded-full border border-outline-variant bg-surface-container-low text-xs font-bold">
                <button
                  className={`px-3 py-1.5 transition-colors ${mode === 'brief' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                  onClick={() => setMode('brief')}
                  type="button"
                  aria-pressed={mode === 'brief'}
                  title="Brief mode"
                >
                  Brief
                </button>
                <button
                  className={`px-3 py-1.5 transition-colors ${mode === 'detailed' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                  onClick={() => setMode('detailed')}
                  type="button"
                  aria-pressed={mode === 'detailed'}
                  title="Detailed mode"
                >
                  Detailed
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="inline-flex h-8 w-8 items-center justify-center text-on-surface-variant hover:text-on-surface"
                onClick={() => setIsExpanded((value) => !value)}
                type="button"
                aria-label={isExpanded ? 'Collapse chatbot workspace' : 'Expand chatbot workspace'}
                title={isExpanded ? 'Collapse workspace' : 'Expand workspace'}
              >
                <span className="material-symbols-outlined text-base">
                  {isExpanded ? 'fullscreen_exit' : 'open_in_full'}
                </span>
              </button>
              <button
                className="inline-flex h-8 w-8 items-center justify-center text-on-surface-variant hover:text-on-surface"
                onClick={handleClose}
                type="button"
                aria-label="Close chatbot"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
          </header>

          {showExamplePrompts ? (
            <div className={`rounded-xl border-b border-outline-variant bg-surface-container-low px-4 py-3 ${isExpanded ? 'md:px-6' : ''}`}>
              <p className="mb-2 text-xs font-bold text-on-surface-variant">
                Example prompts
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    className="rounded-full border border-outline-variant bg-surface px-3 py-1.5 text-[11px] font-medium text-on-surface-variant transition-colors hover:border-primary hover:text-on-surface"
                    onClick={() => handlePromptClick(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div
            ref={listRef}
            className={`rounded-xl flex-1 space-y-3 overflow-y-auto bg-surface px-3 py-3 ${
              isExpanded ? 'md:px-6 md:py-6' : ''
            }`}
          >
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isSending ? (
              <article className="mr-auto max-w-[90%] rounded-md bg-surface-container-high px-3 py-2 text-sm text-on-surface-variant">
                Thinking...
              </article>
            ) : null}
          </div>

          <form
            className={`rounded-xl border-t border-outline-variant bg-surface-container px-3 py-3 ${
              isExpanded ? 'md:px-6 md:py-4' : ''
            }`}
            onSubmit={handleSubmit}
          >
            <label className="sr-only" htmlFor="study-assistant-input">
              Ask a question
            </label>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <input
                id="study-assistant-input"
                className="rounded-lg flex-1 border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface outline-none transition-colors focus:border-primary"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask a question..."
                maxLength={1500}
              />
              <button
                className="rounded-xl inline-flex h-10 w-10 items-center justify-center bg-primary text-on-primary disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
              >
                <span className="material-symbols-outlined text-base">send</span>
              </button>
            </div>
            {errorMessage ? (
              <p className="mt-2 text-xs text-error">{errorMessage}</p>
            ) : (
              <p className="mt-2 text-[11px] text-on-surface-variant">
                {mode === 'brief'
                  ? 'Brief mode gives short, clear answers. Detailed mode expands with deeper explanations.'
                  : 'Detailed mode gives deeper explanations with extra context, examples, and steps.'}
              </p>
            )}
          </form>
        </section>
      ) : null}
    </>
  )
}

export default AssistantChatbot
