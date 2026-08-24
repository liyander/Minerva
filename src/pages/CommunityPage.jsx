import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAuthSession, hasRole, ROLES } from '../auth'
import { apiFetch } from '../services/api'
import {
  addClassroomMember,
  connectCommunitySocket,
  createChannel,
  createClassroom,
  createDiscussion,
  deleteMessage,
  editMessage,
  fetchChannels,
  fetchClassroom,
  fetchClassrooms,
  fetchDiscussion,
  fetchDiscussions,
  fetchMessages,
  fetchThread,
  postDiscussionComment,
  postMessage,
  removeClassroomMember,
  searchUsers,
  toggleReaction,
  updateDiscussion,
} from '../services/community'
import AssignmentsTab from '../components/community/AssignmentsTab'

const QUICK_EMOJIS = ['👍', '🎉', '❤️', '😂', '👀']

function formatTime(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  } catch {
    return ''
  }
}

function formatDay(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(
      new Date(value),
    )
  } catch {
    return ''
  }
}

function initialsFor(name) {
  return (name || '?')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function Avatar({ name, size = 9 }) {
  return (
    <div
      className={`w-${size} h-${size} shrink-0 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-headline font-bold text-xs`}
    >
      {initialsFor(name)}
    </div>
  )
}

function groupMessagesByDay(messages) {
  const groups = []
  let currentDay = ''
  for (const message of messages) {
    const day = formatDay(message.createdAt)
    if (day !== currentDay) {
      groups.push({ day, messages: [] })
      currentDay = day
    }
    groups[groups.length - 1].messages.push(message)
  }
  return groups
}

function MessageComposer({ placeholder, onSend, isSending }) {
  const [text, setText] = useState('')
  const textareaRef = useRef(null)

  const send = () => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return
    onSend(trimmed)
    setText('')
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-2">
      <textarea
        ref={textareaRef}
        className="w-full resize-none bg-transparent outline-none px-3 py-2 font-body text-sm text-on-surface min-h-[44px] max-h-40"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            send()
          }
        }}
        placeholder={placeholder}
        value={text}
      />
      <div className="flex items-center justify-end px-1 pb-1">
        <button
          className="rounded-full inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary font-headline text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          disabled={!text.trim() || isSending}
          onClick={send}
          type="button"
        >
          <span className="material-symbols-outlined text-sm">send</span>
          Send
        </button>
      </div>
    </div>
  )
}

function MessageReactions({ message, currentUserId, onToggle }) {
  if (!message.reactions?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {message.reactions.map((reaction) => (
        <button
          className={`rounded-full inline-flex items-center gap-1 px-2 py-0.5 text-xs border transition-colors ${
            reaction.userIds.includes(currentUserId)
              ? 'bg-primary-container border-primary text-on-primary-container'
              : 'bg-surface-container-high border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-highest'
          }`}
          key={reaction.emoji}
          onClick={() => onToggle(message.id, reaction.emoji)}
          type="button"
        >
          <span>{reaction.emoji}</span>
          <span className="font-headline font-bold">{reaction.count}</span>
        </button>
      ))}
    </div>
  )
}

function MessageRow({ message, currentUserId, onOpenThread, onToggleReaction, onDelete, onEdit, isThreadReply }) {
  const [showActions, setShowActions] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const isMine = message.author?.id === currentUserId

  if (message.deleted) {
    return (
      <div className="flex items-start gap-3 px-2 py-1.5 opacity-60">
        <Avatar name={message.author?.name} />
        <p className="font-body text-sm italic text-on-surface-variant mt-1.5">Message deleted</p>
      </div>
    )
  }

  return (
    <div
      className="group relative flex items-start gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-container-low/60 transition-colors"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <Avatar name={message.author?.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-headline text-sm font-bold text-on-surface">{message.author?.name}</span>
          <span className="font-body text-[11px] text-on-surface-variant">{formatTime(message.createdAt)}</span>
          {message.editedAt ? (
            <span className="font-body text-[11px] text-on-surface-variant">(edited)</span>
          ) : null}
        </div>

        {editing ? (
          <div className="mt-1 flex items-center gap-2">
            <input
              autoFocus
              className="flex-1 rounded-lg bg-surface-container-high px-3 py-1.5 text-sm font-body outline-none"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onEdit(message.id, draft)
                  setEditing(false)
                }
                if (event.key === 'Escape') setEditing(false)
              }}
              value={draft}
            />
            <button
              className="font-headline text-xs font-bold text-primary"
              onClick={() => {
                onEdit(message.id, draft)
                setEditing(false)
              }}
              type="button"
            >
              Save
            </button>
            <button
              className="font-headline text-xs font-bold text-on-surface-variant"
              onClick={() => setEditing(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        ) : (
          <p className="font-body text-sm text-on-surface whitespace-pre-wrap break-words mt-0.5">{message.body}</p>
        )}

        <MessageReactions currentUserId={currentUserId} message={message} onToggle={onToggleReaction} />

        {!isThreadReply && message.replyCount > 0 ? (
          <button
            className="mt-1.5 flex items-center gap-2 text-primary hover:underline"
            onClick={() => onOpenThread(message)}
            type="button"
          >
            <span className="font-headline text-xs font-bold">
              {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
            </span>
            <span className="font-body text-[11px] text-on-surface-variant">
              Last reply {formatTime(message.lastReplyAt)}
            </span>
          </button>
        ) : null}
      </div>

      {showActions && !editing ? (
        <div className="absolute right-2 top-0 flex items-center gap-0.5 rounded-lg border border-outline-variant/40 bg-surface-container-lowest shadow-soft px-1 py-0.5">
          {QUICK_EMOJIS.slice(0, 3).map((emoji) => (
            <button
              className="w-7 h-7 rounded hover:bg-surface-container-high text-sm"
              key={emoji}
              onClick={() => onToggleReaction(message.id, emoji)}
              type="button"
            >
              {emoji}
            </button>
          ))}
          {!isThreadReply ? (
            <button
              className="w-7 h-7 rounded hover:bg-surface-container-high inline-flex items-center justify-center"
              onClick={() => onOpenThread(message)}
              title="Reply in thread"
              type="button"
            >
              <span className="material-symbols-outlined text-base">chat_bubble</span>
            </button>
          ) : null}
          {isMine ? (
            <button
              className="w-7 h-7 rounded hover:bg-surface-container-high inline-flex items-center justify-center"
              onClick={() => setEditing(true)}
              title="Edit"
              type="button"
            >
              <span className="material-symbols-outlined text-base">edit</span>
            </button>
          ) : null}
          {isMine ? (
            <button
              className="w-7 h-7 rounded hover:bg-error/10 text-error inline-flex items-center justify-center"
              onClick={() => onDelete(message.id)}
              title="Delete"
              type="button"
            >
              <span className="material-symbols-outlined text-base">delete</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ChatPanel({ channel, messages, currentUserId, isLoading, onSend, onOpenThread, onToggleReaction, onDelete, onEdit }) {
  const scrollRef = useRef(null)
  const groups = useMemo(() => groupMessagesByDay(messages), [messages])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center text-on-surface-variant font-body text-sm">
        Select a channel to start chatting.
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 rounded-2xl bg-surface-container-lowest border border-outline-variant/40">
      <div className="px-5 py-3.5 border-b border-outline-variant/40">
        <p className="font-headline text-base font-extrabold text-on-surface">#{channel.name}</p>
        {channel.topic ? (
          <p className="font-body text-xs text-on-surface-variant mt-0.5">{channel.topic}</p>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3" ref={scrollRef}>
        {isLoading ? (
          <p className="text-center text-sm text-on-surface-variant font-body py-8">Loading messages…</p>
        ) : groups.length ? (
          groups.map((group) => (
            <div key={group.day}>
              <div className="flex items-center gap-3 my-3">
                <div className="h-px flex-1 bg-outline-variant/30" />
                <span className="font-headline text-[11px] font-bold text-on-surface-variant">{group.day}</span>
                <div className="h-px flex-1 bg-outline-variant/30" />
              </div>
              {group.messages.map((message) => (
                <MessageRow
                  currentUserId={currentUserId}
                  key={message.id}
                  message={message}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onOpenThread={onOpenThread}
                  onToggleReaction={onToggleReaction}
                />
              ))}
            </div>
          ))
        ) : (
          <p className="text-center text-sm text-on-surface-variant font-body py-8">
            No messages yet — say hello!
          </p>
        )}
      </div>

      <div className="p-3">
        <MessageComposer onSend={onSend} placeholder={`Send a message to #${channel.name}`} />
      </div>
    </div>
  )
}

function ThreadPanel({ channel, threadData, isLoading, currentUserId, onClose, onSend, onToggleReaction, onDelete, onEdit }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [threadData?.replies?.length])

  return (
    <div className="w-full lg:w-96 shrink-0 flex flex-col min-h-0 rounded-2xl bg-surface-container-lowest border border-outline-variant/40">
      <div className="px-4 py-3.5 border-b border-outline-variant/40 flex items-center justify-between">
        <div>
          <p className="font-headline text-sm font-extrabold text-on-surface">Thread</p>
          <p className="font-body text-xs text-on-surface-variant">#{channel?.name}</p>
        </div>
        <button
          className="w-8 h-8 rounded-full hover:bg-surface-container-high inline-flex items-center justify-center"
          onClick={onClose}
          type="button"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3" ref={scrollRef}>
        {isLoading || !threadData ? (
          <p className="text-center text-sm text-on-surface-variant font-body py-6">Loading thread…</p>
        ) : (
          <>
            <MessageRow
              currentUserId={currentUserId}
              isThreadReply
              message={threadData.root}
              onDelete={onDelete}
              onEdit={onEdit}
              onToggleReaction={onToggleReaction}
            />
            <div className="my-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-outline-variant/30" />
              <span className="font-headline text-[11px] font-bold text-on-surface-variant">
                {threadData.replies.length} {threadData.replies.length === 1 ? 'reply' : 'replies'}
              </span>
              <div className="h-px flex-1 bg-outline-variant/30" />
            </div>
            {threadData.replies.map((reply) => (
              <MessageRow
                currentUserId={currentUserId}
                isThreadReply
                key={reply.id}
                message={reply}
                onDelete={onDelete}
                onEdit={onEdit}
                onToggleReaction={onToggleReaction}
              />
            ))}
          </>
        )}
      </div>

      <div className="p-3">
        <MessageComposer onSend={onSend} placeholder="Reply in thread…" />
      </div>
    </div>
  )
}

function NewClassroomModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!name.trim()) return
    setIsSaving(true)
    setError('')
    try {
      const classroom = await createClassroom({ name: name.trim(), description: description.trim() })
      onCreated(classroom)
    } catch (submitError) {
      setError(submitError?.message || 'Failed to create classroom')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="font-headline text-lg font-extrabold text-on-surface">New classroom</p>
        {error ? <p className="mt-2 text-sm text-error font-body">{error}</p> : null}
        <input
          autoFocus
          className="mt-4 w-full rounded-xl bg-surface-container-high px-4 py-2.5 text-sm font-body outline-none"
          onChange={(event) => setName(event.target.value)}
          placeholder="Classroom name (e.g. III Year Cybersecurity)"
          value={name}
        />
        <textarea
          className="mt-3 w-full rounded-xl bg-surface-container-high px-4 py-2.5 text-sm font-body outline-none min-h-[80px] resize-none"
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description (optional)"
          value={description}
        />
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="rounded-full px-4 py-2 font-headline text-xs font-bold text-on-surface-variant hover:bg-surface-container-high"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-full px-5 py-2 bg-primary text-on-primary font-headline text-xs font-bold hover:opacity-90 disabled:opacity-50"
            disabled={!name.trim() || isSaving}
            onClick={submit}
            type="button"
          >
            {isSaving ? 'Creating…' : 'Create classroom'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NewChannelModal({ classroomId, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!name.trim()) return
    setIsSaving(true)
    setError('')
    try {
      const channel = await createChannel({ classroomId, name: name.trim(), topic: topic.trim() })
      onCreated(channel)
    } catch (submitError) {
      setError(submitError?.message || 'Failed to create channel')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="font-headline text-lg font-extrabold text-on-surface">New channel</p>
        {error ? <p className="mt-2 text-sm text-error font-body">{error}</p> : null}
        <input
          autoFocus
          className="mt-4 w-full rounded-xl bg-surface-container-high px-4 py-2.5 text-sm font-body outline-none"
          onChange={(event) => setName(event.target.value)}
          placeholder="channel-name"
          value={name}
        />
        <input
          className="mt-3 w-full rounded-xl bg-surface-container-high px-4 py-2.5 text-sm font-body outline-none"
          onChange={(event) => setTopic(event.target.value)}
          placeholder="Topic (optional)"
          value={topic}
        />
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="rounded-full px-4 py-2 font-headline text-xs font-bold text-on-surface-variant hover:bg-surface-container-high"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-full px-5 py-2 bg-primary text-on-primary font-headline text-xs font-bold hover:opacity-90 disabled:opacity-50"
            disabled={!name.trim() || isSaving}
            onClick={submit}
            type="button"
          >
            {isSaving ? 'Creating…' : 'Create channel'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DiscussionsTab({ classroomId, currentUserId, canModerate }) {
  const [discussions, setDiscussions] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const loadList = useCallback(async () => {
    setIsLoading(true)
    try {
      const issues = await fetchDiscussions({
        classroomId: classroomId || undefined,
        status: statusFilter || undefined,
      })
      setDiscussions(issues)
    } catch {
      setDiscussions([])
    } finally {
      setIsLoading(false)
    }
  }, [classroomId, statusFilter])

  useEffect(() => {
    void loadList()
    setSelectedId(null)
    setDetail(null)
  }, [loadList])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    fetchDiscussion(selectedId).then((data) => {
      if (!cancelled) setDetail(data)
    })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const submitDiscussion = async () => {
    if (!title.trim()) return
    const created = await createDiscussion({ classroomId: classroomId || undefined, title: title.trim(), body: body.trim() })
    setTitle('')
    setBody('')
    setIsComposerOpen(false)
    await loadList()
    setSelectedId(created.id)
  }

  const submitComment = async (text) => {
    const trimmed = (text || '').trim()
    if (!trimmed || !selectedId) return
    await postDiscussionComment(selectedId, { body: trimmed })
    const updated = await fetchDiscussion(selectedId)
    setDetail(updated)
    await loadList()
  }

  const setStatus = async (status) => {
    if (!selectedId) return
    await updateDiscussion(selectedId, { status })
    const updated = await fetchDiscussion(selectedId)
    setDetail(updated)
    await loadList()
  }

  const acceptComment = async (commentId) => {
    if (!selectedId) return
    await updateDiscussion(selectedId, { acceptedCommentId: commentId })
    const updated = await fetchDiscussion(selectedId)
    setDetail(updated)
    await loadList()
  }

  const statusStyles = {
    open: 'bg-sky text-on-sky',
    answered: 'bg-mint text-on-mint',
    closed: 'bg-surface-container-high text-on-surface-variant',
  }

  if (selectedId && detail) {
    return (
      <div className="flex-1 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 flex flex-col min-h-0">
        <div className="px-5 py-4 border-b border-outline-variant/40 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              className="font-headline text-xs font-bold text-primary hover:underline"
              onClick={() => setSelectedId(null)}
              type="button"
            >
              ← Back to discussions
            </button>
            <p className="font-headline text-xl font-extrabold text-on-surface mt-2">{detail.title}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`rounded-full px-2.5 py-0.5 font-headline text-[11px] font-bold ${statusStyles[detail.status]}`}>
                {detail.status}
              </span>
              {detail.labels?.map((label) => (
                <span
                  className="rounded-full px-2.5 py-0.5 font-headline text-[11px] font-bold text-white"
                  key={label.id}
                  style={{ backgroundColor: label.color }}
                >
                  {label.name}
                </span>
              ))}
              <span className="font-body text-xs text-on-surface-variant">by {detail.author?.name}</span>
            </div>
          </div>
          {(canModerate || detail.author?.id === currentUserId) ? (
            <div className="flex items-center gap-1.5 shrink-0">
              {detail.status !== 'closed' ? (
                <button
                  className="rounded-full px-3 py-1.5 font-headline text-[11px] font-bold text-on-surface-variant hover:bg-surface-container-high"
                  onClick={() => setStatus('closed')}
                  type="button"
                >
                  Close
                </button>
              ) : (
                <button
                  className="rounded-full px-3 py-1.5 font-headline text-[11px] font-bold text-on-surface-variant hover:bg-surface-container-high"
                  onClick={() => setStatus('open')}
                  type="button"
                >
                  Reopen
                </button>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {detail.body ? <p className="font-body text-sm text-on-surface whitespace-pre-wrap">{detail.body}</p> : null}

          <div className="mt-6 space-y-4">
            {detail.comments.map((comment) => (
              <div
                className={`rounded-xl p-3 border ${
                  comment.isAccepted ? 'border-primary bg-primary-container/30' : 'border-outline-variant/30 bg-surface-container-low'
                }`}
                key={comment.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={comment.author?.name} size={7} />
                    <span className="font-headline text-xs font-bold text-on-surface">{comment.author?.name}</span>
                    <span className="font-body text-[11px] text-on-surface-variant">{formatTime(comment.createdAt)}</span>
                  </div>
                  {comment.isAccepted ? (
                    <span className="flex items-center gap-1 font-headline text-[11px] font-bold text-primary">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      Accepted
                    </span>
                  ) : (canModerate || detail.author?.id === currentUserId) ? (
                    <button
                      className="font-headline text-[11px] font-bold text-on-surface-variant hover:text-primary"
                      onClick={() => acceptComment(comment.id)}
                      type="button"
                    >
                      Mark as answer
                    </button>
                  ) : null}
                </div>
                <p className="font-body text-sm text-on-surface whitespace-pre-wrap mt-2">{comment.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-outline-variant/40">
          <MessageComposer onSend={submitComment} placeholder="Write a comment…" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 flex flex-col min-h-0">
      <div className="px-5 py-4 border-b border-outline-variant/40 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {['', 'open', 'answered', 'closed'].map((status) => (
            <button
              className={`rounded-full px-3 py-1.5 font-headline text-xs font-bold ${
                statusFilter === status ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
              key={status || 'all'}
              onClick={() => setStatusFilter(status)}
              type="button"
            >
              {status ? status[0].toUpperCase() + status.slice(1) : 'All'}
            </button>
          ))}
        </div>
        <button
          className="rounded-full inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary font-headline text-xs font-bold hover:opacity-90"
          onClick={() => setIsComposerOpen((value) => !value)}
          type="button"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          New question
        </button>
      </div>

      {isComposerOpen ? (
        <div className="px-5 py-4 border-b border-outline-variant/40 bg-surface-container-low">
          <input
            autoFocus
            className="w-full rounded-xl bg-surface-container-lowest px-4 py-2.5 text-sm font-body outline-none"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title — summarize your question"
            value={title}
          />
          <textarea
            className="mt-2 w-full rounded-xl bg-surface-container-lowest px-4 py-2.5 text-sm font-body outline-none min-h-[100px] resize-none"
            onChange={(event) => setBody(event.target.value)}
            placeholder="Describe the problem, what you tried, and any code/errors."
            value={body}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              className="rounded-full px-4 py-2 font-headline text-xs font-bold text-on-surface-variant hover:bg-surface-container-high"
              onClick={() => setIsComposerOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-full px-4 py-2 bg-primary text-on-primary font-headline text-xs font-bold hover:opacity-90 disabled:opacity-50"
              disabled={!title.trim()}
              onClick={submitDiscussion}
              type="button"
            >
              Post
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/30">
        {isLoading ? (
          <p className="text-center text-sm text-on-surface-variant font-body py-8">Loading…</p>
        ) : discussions.length ? (
          discussions.map((issue) => (
            <button
              className="w-full text-left px-5 py-4 hover:bg-surface-container-low transition-colors"
              key={issue.id}
              onClick={() => setSelectedId(issue.id)}
              type="button"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`rounded-full px-2 py-0.5 font-headline text-[10px] font-bold ${statusStyles[issue.status]}`}>
                  {issue.status}
                </span>
                <span className="font-headline text-sm font-bold text-on-surface">{issue.title}</span>
              </div>
              <p className="font-body text-xs text-on-surface-variant mt-1">
                by {issue.author?.name} · {formatTime(issue.createdAt)} · {issue.commentCount} comments
              </p>
            </button>
          ))
        ) : (
          <p className="text-center text-sm text-on-surface-variant font-body py-8">
            No discussions yet. Ask the first question.
          </p>
        )}
      </div>
    </div>
  )
}

function MembersTab({ classroomId, canManage }) {
  const [classroom, setClassroom] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  const load = useCallback(async () => {
    const data = await fetchClassroom(classroomId)
    setClassroom(data)
  }, [classroomId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return undefined
    }
    let cancelled = false
    const timeout = window.setTimeout(async () => {
      try {
        const found = await searchUsers(query.trim())
        if (!cancelled) setResults(found)
      } catch {
        if (!cancelled) setResults([])
      }
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [query])

  const addMember = async (userId) => {
    await addClassroomMember(classroomId, { userId, role: 'student' })
    setQuery('')
    setResults([])
    await load()
  }

  const removeMember = async (userId) => {
    await removeClassroomMember(classroomId, userId)
    await load()
  }

  return (
    <div className="flex-1 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 p-5 overflow-y-auto">
      <p className="font-headline text-base font-extrabold text-on-surface">
        Members {classroom ? `(${classroom.members?.length || 0})` : ''}
      </p>

      {canManage ? (
        <div className="relative mt-3">
          <input
            className="w-full rounded-xl bg-surface-container-high px-4 py-2.5 text-sm font-body outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search students or trainers to add…"
            value={query}
          />
          {results.length ? (
            <div className="absolute z-10 mt-1 w-full rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-card max-h-56 overflow-y-auto">
              {results.map((user) => (
                <button
                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-surface-container-high text-left"
                  key={user.id}
                  onClick={() => addMember(user.id)}
                  type="button"
                >
                  <Avatar name={user.name} size={7} />
                  <span className="font-body text-sm text-on-surface">{user.name}</span>
                  <span className="font-body text-xs text-on-surface-variant">@{user.username}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {classroom?.members?.map((member) => (
          <div className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-2.5" key={member.id}>
            <div className="flex items-center gap-2.5">
              <Avatar name={member.name} size={8} />
              <div>
                <p className="font-headline text-sm font-bold text-on-surface">{member.name}</p>
                <p className="font-body text-[11px] text-on-surface-variant">@{member.username}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 font-headline text-[10px] font-bold ${
                  member.classroomRole === 'teacher'
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'bg-surface-container-high text-on-surface-variant'
                }`}
              >
                {member.classroomRole}
              </span>
              {canManage && member.classroomRole !== 'teacher' ? (
                <button
                  className="w-7 h-7 rounded-full hover:bg-error/10 text-error inline-flex items-center justify-center"
                  onClick={() => removeMember(member.id)}
                  title="Remove"
                  type="button"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommunityPage() {
  const session = getAuthSession()
  const canModerate = hasRole(session, ROLES.TRAINER, ROLES.ADMIN)

  const [currentUserId, setCurrentUserId] = useState(null)
  const [classrooms, setClassrooms] = useState([])
  const [space, setSpace] = useState({ type: 'general' })
  const [viewMode, setViewMode] = useState('chat')
  const [channels, setChannels] = useState([])
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [messages, setMessages] = useState([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [threadMessage, setThreadMessage] = useState(null)
  const [threadData, setThreadData] = useState(null)
  const [isThreadLoading, setIsThreadLoading] = useState(false)
  const [showNewClassroom, setShowNewClassroom] = useState(false)
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [expandedClassrooms, setExpandedClassrooms] = useState({})

  const socketRef = useRef(null)
  const selectedChannelIdRef = useRef(null)
  const threadMessageIdRef = useRef(null)

  useEffect(() => {
    selectedChannelIdRef.current = selectedChannel?.id || null
  }, [selectedChannel])

  useEffect(() => {
    threadMessageIdRef.current = threadMessage?.id || null
  }, [threadMessage])

  useEffect(() => {
    void fetchClassrooms().then(setClassrooms).catch(() => setClassrooms([]))
    void apiFetch('/users/me').then((user) => setCurrentUserId(user?.id)).catch(() => {})
  }, [])

  // Sending/editing/reacting applies the REST response to local state right
  // away for a snappy, non-blocked-on-the-socket feel. The WebSocket message
  // for the same event arrives shortly after (for this tab and any others),
  // so "created" events are deduped by id — otherwise a reply's parent would
  // get its replyCount bumped twice for the sender's own message.
  const processedCreatedIdsRef = useRef(new Set())

  const applyMessageCreated = useCallback((message) => {
    if (processedCreatedIdsRef.current.has(message.id)) return
    processedCreatedIdsRef.current.add(message.id)

    if (message.parentMessageId) {
      setMessages((current) =>
        current.map((item) =>
          item.id === message.parentMessageId
            ? { ...item, replyCount: item.replyCount + 1, lastReplyAt: message.createdAt }
            : item,
        ),
      )
      setThreadData((current) =>
        current && current.root.id === message.parentMessageId && !current.replies.some((reply) => reply.id === message.id)
          ? { ...current, replies: [...current.replies, message] }
          : current,
      )
    } else {
      setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]))
    }
  }, [])

  const applyMessageUpdate = useCallback((message) => {
    setMessages((current) => current.map((item) => (item.id === message.id ? message : item)))
    setThreadData((current) => {
      if (!current) return current
      if (current.root.id === message.id) return { ...current, root: message }
      return {
        ...current,
        replies: current.replies.map((reply) => (reply.id === message.id ? message : reply)),
      }
    })
  }, [])

  const applyMessageDeleted = useCallback((messageId) => {
    setMessages((current) =>
      current.map((item) => (item.id === messageId ? { ...item, deleted: true, body: '' } : item)),
    )
    setThreadData((current) => {
      if (!current) return current
      if (current.root.id === messageId) return { ...current, root: { ...current.root, deleted: true, body: '' } }
      return {
        ...current,
        replies: current.replies.map((reply) =>
          reply.id === messageId ? { ...reply, deleted: true, body: '' } : reply,
        ),
      }
    })
  }, [])

  useEffect(() => {
    const socket = connectCommunitySocket({
      onMessage: (payload) => {
        if (payload.channelId !== selectedChannelIdRef.current) return

        if (payload.type === 'message.created') applyMessageCreated(payload.message)
        if (payload.type === 'message.updated') applyMessageUpdate(payload.message)
        if (payload.type === 'message.deleted') applyMessageDeleted(payload.messageId)
      },
    })
    socketRef.current = socket
    return () => socket.close()
  }, [applyMessageCreated, applyMessageDeleted, applyMessageUpdate])

  const loadChannelsForSpace = useCallback(async (nextSpace) => {
    const classroomId = nextSpace.type === 'classroom' ? nextSpace.id : undefined
    const list = await fetchChannels(classroomId)
    setChannels(list)
    return list
  }, [])

  useEffect(() => {
    let cancelled = false
    setSelectedChannel(null)
    setMessages([])
    setThreadMessage(null)
    setThreadData(null)

    loadChannelsForSpace(space).then((list) => {
      if (cancelled) return
      const preferred = list.find((channel) => channel.kind === 'general') || list[0]
      setSelectedChannel(preferred || null)
    })

    return () => {
      cancelled = true
    }
  }, [space, loadChannelsForSpace])

  useEffect(() => {
    if (!selectedChannel) return undefined
    let cancelled = false
    setIsLoadingMessages(true)
    socketRef.current?.join(selectedChannel.id)

    fetchMessages(selectedChannel.id)
      .then((list) => {
        if (!cancelled) setMessages(list)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMessages(false)
      })

    return () => {
      cancelled = true
      socketRef.current?.leave(selectedChannel.id)
    }
  }, [selectedChannel])

  const openThread = async (message) => {
    setThreadMessage(message)
    setIsThreadLoading(true)
    try {
      const data = await fetchThread(message.id)
      setThreadData(data)
    } finally {
      setIsThreadLoading(false)
    }
  }

  const sendMessage = async (text) => {
    if (!selectedChannel) return
    const message = await postMessage(selectedChannel.id, { body: text })
    applyMessageCreated(message)
  }

  const sendReply = async (text) => {
    if (!selectedChannel || !threadMessage) return
    const message = await postMessage(selectedChannel.id, { body: text, parentMessageId: threadMessage.id })
    applyMessageCreated(message)
  }

  const handleToggleReaction = async (messageId, emoji) => {
    const message = await toggleReaction(messageId, emoji)
    applyMessageUpdate(message)
  }

  const handleEdit = async (messageId, body) => {
    if (!body.trim()) return
    const message = await editMessage(messageId, body.trim())
    applyMessageUpdate(message)
  }

  const handleDelete = async (messageId) => {
    await deleteMessage(messageId)
    applyMessageDeleted(messageId)
  }

  const currentClassroom = space.type === 'classroom' ? space : null
  const canManageSpace =
    canModerate && (space.type === 'general' ? session?.role === 'admin' : true)

  const tabs = [
    { id: 'chat', label: 'Chat', icon: 'forum' },
    { id: 'discussions', label: 'Discussions', icon: 'quiz' },
    ...(currentClassroom
      ? [
          { id: 'assignments', label: 'Assignments', icon: 'assignment' },
          { id: 'members', label: 'Members', icon: 'group' },
        ]
      : []),
  ]

  return (
    <div className="bg-surface min-h-screen p-4 lg:p-6 mt-16 md:mt-20">
      <div className="flex flex-col gap-4 h-[calc(100vh-6rem)] min-h-[600px]">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-headline text-xs text-on-surface-variant font-bold">Community</span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-on-background font-headline mt-0.5">
              {space.type === 'general' ? 'General Community' : space.name}
            </h1>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 gap-4">
          <aside className="w-64 shrink-0 rounded-2xl bg-surface-container-low border border-outline-variant/40 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div>
                <button
                  className={`w-full text-left rounded-xl px-3 py-2 font-headline text-sm font-bold flex items-center gap-2 ${
                    space.type === 'general'
                      ? 'bg-primary-container text-on-primary-container'
                      : 'text-on-surface hover:bg-surface-container-high'
                  }`}
                  onClick={() => {
                    setSpace({ type: 'general' })
                    setViewMode('chat')
                  }}
                  type="button"
                >
                  <span className="material-symbols-outlined text-base">public</span>
                  General
                </button>
                {space.type === 'general' ? (
                  <div className="mt-1 ml-2 space-y-0.5">
                    {channels.map((channel) => (
                      <button
                        className={`w-full text-left rounded-lg px-3 py-1.5 font-body text-sm flex items-center gap-1.5 ${
                          selectedChannel?.id === channel.id
                            ? 'bg-surface-container-highest text-on-surface font-semibold'
                            : 'text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                        key={channel.id}
                        onClick={() => {
                          setSelectedChannel(channel)
                          setViewMode('chat')
                        }}
                        type="button"
                      >
                        <span className="text-on-surface-variant">#</span>
                        {channel.name}
                      </button>
                    ))}
                    {session?.role === 'admin' ? (
                      <button
                        className="w-full text-left rounded-lg px-3 py-1.5 font-body text-xs text-primary hover:bg-surface-container-high"
                        onClick={() => setShowNewChannel(true)}
                        type="button"
                      >
                        + Add channel
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div>
                <div className="flex items-center justify-between px-1">
                  <span className="font-headline text-[11px] font-bold text-on-surface-variant uppercase tracking-wide">
                    Classrooms
                  </span>
                  {canModerate ? (
                    <button
                      className="w-6 h-6 rounded-full hover:bg-surface-container-high inline-flex items-center justify-center text-primary"
                      onClick={() => setShowNewClassroom(true)}
                      title="New classroom"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-base">add</span>
                    </button>
                  ) : null}
                </div>
                <div className="mt-1 space-y-1">
                  {classrooms.map((classroom) => {
                    const isActive = space.type === 'classroom' && space.id === classroom.id
                    const isExpanded = isActive || expandedClassrooms[classroom.id]
                    return (
                      <div key={classroom.id}>
                        <button
                          className={`w-full text-left rounded-xl px-3 py-2 font-headline text-sm font-bold flex items-center gap-2 ${
                            isActive ? 'bg-primary-container text-on-primary-container' : 'text-on-surface hover:bg-surface-container-high'
                          }`}
                          onClick={() => {
                            setSpace({ type: 'classroom', id: classroom.id, name: classroom.name, myRole: classroom.myRole })
                            setViewMode('chat')
                            setExpandedClassrooms((current) => ({ ...current, [classroom.id]: true }))
                          }}
                          type="button"
                        >
                          <span className="material-symbols-outlined text-base">school</span>
                          <span className="truncate flex-1">{classroom.name}</span>
                        </button>
                        {isActive && isExpanded ? (
                          <div className="mt-1 ml-2 space-y-0.5">
                            {channels.map((channel) => (
                              <button
                                className={`w-full text-left rounded-lg px-3 py-1.5 font-body text-sm flex items-center gap-1.5 ${
                                  selectedChannel?.id === channel.id && viewMode === 'chat'
                                    ? 'bg-surface-container-highest text-on-surface font-semibold'
                                    : 'text-on-surface-variant hover:bg-surface-container-high'
                                }`}
                                key={channel.id}
                                onClick={() => {
                                  setSelectedChannel(channel)
                                  setViewMode('chat')
                                }}
                                type="button"
                              >
                                <span className="text-on-surface-variant">#</span>
                                {channel.name}
                              </button>
                            ))}
                            {classroom.myRole === 'teacher' || session?.role === 'admin' ? (
                              <button
                                className="w-full text-left rounded-lg px-3 py-1.5 font-body text-xs text-primary hover:bg-surface-container-high"
                                onClick={() => setShowNewChannel(true)}
                                type="button"
                              >
                                + Add channel
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                  {!classrooms.length ? (
                    <p className="px-3 py-2 font-body text-xs text-on-surface-variant">
                      {canModerate ? 'No classrooms yet — create one.' : 'You are not in any classroom yet.'}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </aside>

          <div className="flex-1 flex flex-col min-h-0 gap-3">
            <div className="flex items-center gap-1 rounded-2xl bg-surface-container-low border border-outline-variant/40 p-1.5 w-fit">
              {tabs.map((tab) => (
                <button
                  className={`rounded-xl px-4 py-2 font-headline text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    viewMode === tab.id
                      ? 'bg-surface-container-lowest text-primary shadow-soft'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  key={tab.id}
                  onClick={() => setViewMode(tab.id)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-base">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-1 min-h-0 gap-3">
              {viewMode === 'chat' ? (
                <>
                  <ChatPanel
                    channel={selectedChannel}
                    currentUserId={currentUserId}
                    isLoading={isLoadingMessages}
                    messages={messages}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    onOpenThread={openThread}
                    onSend={sendMessage}
                    onToggleReaction={handleToggleReaction}
                  />
                  {threadMessage ? (
                    <ThreadPanel
                      channel={selectedChannel}
                      currentUserId={currentUserId}
                      isLoading={isThreadLoading}
                      onClose={() => {
                        setThreadMessage(null)
                        setThreadData(null)
                      }}
                      onDelete={handleDelete}
                      onEdit={handleEdit}
                      onSend={sendReply}
                      onToggleReaction={handleToggleReaction}
                      threadData={threadData}
                    />
                  ) : null}
                </>
              ) : null}

              {viewMode === 'discussions' ? (
                <DiscussionsTab
                  canModerate={canModerate}
                  classroomId={currentClassroom?.id}
                  currentUserId={currentUserId}
                />
              ) : null}

              {viewMode === 'assignments' && currentClassroom ? (
                <AssignmentsTab
                  canManage={currentClassroom.myRole === 'teacher' || session?.role === 'admin'}
                  classroomId={currentClassroom.id}
                />
              ) : null}

              {viewMode === 'members' && currentClassroom ? (
                <MembersTab canManage={canManageSpace} classroomId={currentClassroom.id} />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {showNewClassroom ? (
        <NewClassroomModal
          onClose={() => setShowNewClassroom(false)}
          onCreated={(classroom) => {
            setClassrooms((current) => [{ ...classroom, myRole: 'teacher' }, ...current])
            setShowNewClassroom(false)
            setSpace({ type: 'classroom', id: classroom.id, name: classroom.name, myRole: 'teacher' })
          }}
        />
      ) : null}

      {showNewChannel ? (
        <NewChannelModal
          classroomId={currentClassroom?.id}
          onClose={() => setShowNewChannel(false)}
          onCreated={(channel) => {
            setChannels((current) => [...current, channel])
            setShowNewChannel(false)
          }}
        />
      ) : null}
    </div>
  )
}

export default CommunityPage
