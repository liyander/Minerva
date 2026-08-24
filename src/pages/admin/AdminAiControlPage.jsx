import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createAdminAiSession,
  deleteAdminAiSession,
  fetchAdminAiHistory,
  fetchAdminAiInsights,
  fetchAdminAiSessions,
  sendAdminAiMessage,
} from '../../services/adminAi'
import { parseMarkdownToHtml } from '../../utils/markdown'

const STARTER_PROMPTS = [
  'Give me platform insights and top risks right now.',
  'Add a new room for phishing incident response at Medium level.',
  'Create a career path for Cloud Security Operations.',
  'Add a module to full-stack-developer about web payload validation.',
]

function AdminAiControlPage() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [insights, setInsights] = useState(null)
  const [isLoadingInsights, setIsLoadingInsights] = useState(true)
  const [isLoadingSessions, setIsLoadingSessions] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(true)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [deletingSessionId, setDeletingSessionId] = useState(null)
  const listRef = useRef(null)

  const canSend = input.trim().length > 0 && !isSending

  const history = useMemo(
    () =>
      messages
        .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
        .map((entry) => ({ role: entry.role, message: entry.content })),
    [messages],
  )

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || null,
    [sessions, activeSessionId],
  )

  const refreshSessions = async (preferredSessionId = null) => {
    const data = await fetchAdminAiSessions(50)
    const nextSessions = Array.isArray(data?.items) ? data.items : []
    setSessions(nextSessions)

    if (preferredSessionId && nextSessions.some((session) => session.id === preferredSessionId)) {
      setActiveSessionId(preferredSessionId)
      return preferredSessionId
    }

    if (nextSessions.length && !nextSessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(nextSessions[0].id)
      return nextSessions[0].id
    }

    return activeSessionId
  }

  const loadSessionMessages = async (sessionId) => {
    if (!sessionId) {
      setMessages([])
      return
    }

    setIsLoadingMessages(true)
    try {
      const historyData = await fetchAdminAiHistory(sessionId, 120)
      const historyItems = Array.isArray(historyData?.items) ? historyData.items : []
      setMessages(
        historyItems
          .filter((entry) => (entry?.role === 'assistant' || entry?.role === 'user') && String(entry?.content || '').trim())
          .map((entry, index) => ({
            id: `history-${entry.id ?? index}`,
            role: entry.role,
            content: String(entry.content || '').trim(),
            action: null,
          })),
      )
    } catch (error) {
      setErrorMessage(error?.message || 'Failed to load session history.')
      setMessages([])
    } finally {
      setIsLoadingMessages(false)
    }
  }

  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoadingInsights(true)
      setIsLoadingSessions(true)
      setIsLoadingMessages(true)

      try {
        const [insightsData, sessionsData] = await Promise.all([fetchAdminAiInsights(), fetchAdminAiSessions(50)])
        setInsights(insightsData)

        const initialSessions = Array.isArray(sessionsData?.items) ? sessionsData.items : []
        setSessions(initialSessions)

        const firstSessionId = initialSessions[0]?.id || null
        setActiveSessionId(firstSessionId)

        if (firstSessionId) {
          await loadSessionMessages(firstSessionId)
        } else {
          setMessages([])
          setIsLoadingMessages(false)
        }
      } catch (error) {
        setErrorMessage(error?.message || 'Failed to load admin AI data.')
        setIsLoadingMessages(false)
      } finally {
        setIsLoadingInsights(false)
        setIsLoadingSessions(false)
      }
    }

    void loadInitialData()
  }, [])

  useEffect(() => {
    if (!activeSessionId) {
      return
    }

    void loadSessionMessages(activeSessionId)
  }, [activeSessionId])

  useEffect(() => {
    const node = listRef.current
    if (!node) {
      return
    }

    node.scrollTop = node.scrollHeight
  }, [messages])

  const sendMessage = async (text) => {
    const message = String(text || '').trim()
    if (!message || isSending || !activeSessionId) {
      return
    }

    setErrorMessage('')
    setIsSending(true)

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
    }

    setMessages((current) => [...current, userMessage])
    setInput('')

    try {
      const response = await sendAdminAiMessage(message, history, activeSessionId)
      if (response?.insights) {
        setInsights(response.insights)
      }

      if (response?.sessionId && response.sessionId !== activeSessionId) {
        setActiveSessionId(response.sessionId)
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: String(response?.content || 'Admin AI completed the request.'),
          action: response?.action || null,
        },
      ])

      await refreshSessions(response?.sessionId || activeSessionId)
    } catch (error) {
      setErrorMessage(error?.message || 'Failed to send message to Admin AI.')
    } finally {
      setIsSending(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    await sendMessage(input)
  }

  const handleClearLocalConversation = () => {
    setMessages([])
    setErrorMessage('')
  }

  const handleCreateSession = async () => {
    if (isCreatingSession) {
      return
    }

    setIsCreatingSession(true)
    setErrorMessage('')

    try {
      const created = await createAdminAiSession('New Session')
      const nextId = Number(created?.id)
      await refreshSessions(nextId)
      setActiveSessionId(nextId)
      setMessages([])
      setInput('')
    } catch (error) {
      setErrorMessage(error?.message || 'Failed to create a new session.')
    } finally {
      setIsCreatingSession(false)
      setIsLoadingMessages(false)
    }
  }

  const handleDeleteSession = async (sessionId) => {
    if (!sessionId || deletingSessionId) {
      return
    }

    setDeletingSessionId(sessionId)
    setErrorMessage('')

    try {
      const result = await deleteAdminAiSession(sessionId)
      const fallbackSessionId = Number(result?.fallbackSessionId) || null

      const refreshedActiveId = await refreshSessions(fallbackSessionId)
      const nextActiveId = fallbackSessionId || refreshedActiveId || null
      setActiveSessionId(nextActiveId)

      if (!nextActiveId) {
        setMessages([])
      }
    } catch (error) {
      setErrorMessage(error?.message || 'Failed to delete session.')
    } finally {
      setDeletingSessionId(null)
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-7xl mx-auto">
        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10 mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              className="text-primary hover:text-on-surface transition-colors"
              onClick={() => navigate('/admin')}
              type="button"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <span className="font-headline text-xs text-primary font-bold">
              AI Governance
            </span>
          </div>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight">
            Admin AI Control Center
          </h1>
          <p className="text-sm text-on-surface-variant mt-4 max-w-3xl">
            Monitor platform insights, chat with AI, and execute administrative content operations such as creating rooms, career paths, and modules.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[22rem,1fr] gap-6">
          <aside className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 h-fit shadow-lg shadow-black/10">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-headline text-lg font-bold tracking-tight text-secondary">History</h2>
              <button
                className="rounded-full border border-outline-variant bg-surface px-3 py-1.5 text-xs font-headline hover:border-primary transition-colors disabled:opacity-60"
                onClick={handleCreateSession}
                type="button"
                disabled={isCreatingSession}
              >
                {isCreatingSession ? 'Creating...' : 'New'}
              </button>
            </div>

            {isLoadingSessions ? (
              <p className="text-sm text-on-surface-variant">Loading sessions...</p>
            ) : (
              <div className="space-y-2 mb-6 max-h-[22rem] overflow-y-auto pr-1">
                {sessions.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">No sessions yet.</p>
                ) : null}

                {sessions.map((session) => (
                  <article
                    key={session.id}
                    className={`rounded-lg border px-3 py-2 transition-colors ${
                      session.id === activeSessionId
                        ? 'border-primary bg-surface text-on-surface'
                        : 'border-outline-variant bg-surface-container-high'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        className="flex-1 text-left hover:text-primary transition-colors"
                        onClick={() => {
                          setActiveSessionId(session.id)
                          setErrorMessage('')
                        }}
                        type="button"
                      >
                        <p className="text-xs text-on-surface-variant font-headline">Session #{session.id}</p>
                        <p className="text-sm font-semibold mt-1 line-clamp-1">{session.title || 'New Session'}</p>
                        <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">
                          {session.preview || 'No prompt yet'}
                        </p>
                      </button>

                      <button
                        className="rounded-xl h-8 w-8 inline-flex items-center justify-center border border-outline-variant bg-surface text-on-surface-variant hover:text-error hover:border-error/70 transition-colors disabled:opacity-50"
                        onClick={() => {
                          void handleDeleteSession(session.id)
                        }}
                        type="button"
                        aria-label={`Delete session ${session.id}`}
                        title="Delete session"
                        disabled={Boolean(deletingSessionId)}
                      >
                        <span className="material-symbols-outlined text-base">
                          {deletingSessionId === session.id ? 'hourglass_top' : 'delete'}
                        </span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <h2 className="font-headline text-lg font-bold tracking-tight mb-4 text-secondary">
              Platform Insights
            </h2>
            {isLoadingInsights ? (
              <p className="text-sm text-on-surface-variant">Loading insights...</p>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-surface-container-high p-3">
                    <p className="text-xs text-on-surface-variant">Courses</p>
                    <p className="font-headline text-xl font-bold">{insights?.metrics?.rooms ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-surface-container-high p-3">
                    <p className="text-xs text-on-surface-variant">Paths</p>
                    <p className="font-headline text-xl font-bold">{insights?.metrics?.careerPaths ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-surface-container-high p-3">
                    <p className="text-xs text-on-surface-variant">Modules</p>
                    <p className="font-headline text-xl font-bold">{insights?.metrics?.modules ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-surface-container-high p-3">
                    <p className="text-xs text-on-surface-variant">Resources</p>
                    <p className="font-headline text-xl font-bold">{insights?.metrics?.cves ?? 0}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-on-surface-variant mb-2">Starter Prompts</p>
                  <div className="flex flex-wrap gap-2">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        className="rounded-lg text-left border border-outline-variant bg-surface px-2.5 py-1.5 text-xs hover:border-primary transition-colors"
                        onClick={() => {
                          void sendMessage(prompt)
                        }}
                        type="button"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-outline-variant/40 bg-surface p-3">
                  <p className="text-xs text-on-surface-variant mb-1">Conversation</p>
                  <p className="font-headline text-sm font-bold text-on-surface">
                    {isLoadingMessages ? 'Loading history...' : `${messages.length} messages visible`}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {activeSession
                      ? `Session #${activeSession.id} selected.`
                      : 'Create a new session to start chatting.'}
                  </p>
                </div>
              </div>
            )}
          </aside>

          <section className="bg-surface-container-lowest shadow-soft flex flex-col min-h-[38rem] shadow-lg shadow-black/10">
            <div className="rounded-xl flex items-center justify-between gap-3 px-5 py-3 border-b border-outline-variant/40 bg-gradient-to-r from-surface-container to-surface-container-lowest">
              <div>
                <p className="font-headline text-xs text-primary font-bold">Admin AI Session</p>
                <p className="text-xs text-on-surface-variant">
                  {activeSession ? `Session #${activeSession.id}` : 'No active session selected.'}
                </p>
              </div>
              <button
                className="rounded-full border border-outline-variant bg-surface px-3 py-1.5 text-xs font-headline hover:border-primary transition-colors"
                onClick={handleClearLocalConversation}
                type="button"
              >
                Clear View
              </button>
            </div>

            <div ref={listRef} className="rounded-2xl flex-1 overflow-y-auto p-6 space-y-4 bg-surface">
              {isLoadingMessages ? (
                <article className="rounded-xl mr-auto max-w-[90%] px-4 py-3 border border-outline-variant/40 bg-surface-container-high text-sm text-on-surface-variant">
                  Loading selected session history...
                </article>
              ) : null}

              {!isLoadingMessages && messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-high/40 p-5">
                  <p className="text-sm text-on-surface">No messages in this session yet.</p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Send a prompt to begin this thread.
                  </p>
                </div>
              ) : null}

              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[90%] px-4 py-3 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'ml-auto bg-primary text-on-primary shadow-md shadow-primary/20'
                      : 'mr-auto bg-surface-container-high text-on-surface border border-outline-variant/30'
                  }`}
                >
                  <p className={`text-xs mb-2 font-headline ${message.role === 'user' ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
                    {message.role === 'user' ? 'You' : 'Admin AI'}
                  </p>
                  {message.role === 'assistant' ? (
                    <div
                      className="space-y-2 leading-6 [&_p]:m-0 [&_p+p]:mt-2 [&_ul]:m-0 [&_ol]:m-0 [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1 [&_strong]:font-semibold [&_em]:italic [&_code]:rounded [&_code]:bg-surface-container-lowest [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-outline-variant/30 [&_pre]:bg-surface-container-lowest [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:italic"
                      dangerouslySetInnerHTML={{ __html: parseMarkdownToHtml(String(message.content || '')) }}
                    />
                  ) : (
                    <p>{message.content}</p>
                  )}
                  {message.role === 'assistant' && message.action?.type && message.action.type !== 'none' ? (
                    <p className="mt-2 text-xs text-on-surface-variant">
                      Action: {message.action.type} ({message.action.status})
                    </p>
                  ) : null}
                </article>
              ))}

              {isSending ? (
                <article className="rounded-xl mr-auto max-w-[90%] px-4 py-3 bg-surface-container-high text-sm text-on-surface-variant">
                  Admin AI is working...
                </article>
              ) : null}
            </div>

            <form className="rounded-2xl border-t border-outline-variant p-4 bg-surface-container" onSubmit={handleSubmit}>
              <div className="flex items-center gap-2">
                <input
                  className="rounded-lg flex-1 border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask Admin AI to monitor or control platform content..."
                  maxLength={2200}
                  disabled={!activeSessionId}
                />
                <button
                  className="rounded-xl h-10 w-10 inline-flex items-center justify-center bg-primary text-on-primary disabled:opacity-60"
                  disabled={!canSend || !activeSessionId}
                  type="submit"
                  aria-label="Send admin AI message"
                >
                  <span className="material-symbols-outlined text-base">send</span>
                </button>
              </div>
              {errorMessage ? <p className="mt-2 text-xs text-error">{errorMessage}</p> : null}
            </form>
          </section>
        </div>
      </section>
    </main>
  )
}

export default AdminAiControlPage
