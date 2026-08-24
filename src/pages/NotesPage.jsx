import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '../services/api'
import { parseMarkdownToHtml } from '../utils/markdown'

const EMPTY_NOTE_CONTENT = '# New note\n\nStart writing in Markdown...'
const markdownPreviewClassName =
  'overflow-y-auto p-6 border-l border-outline-variant/40 font-body leading-relaxed text-on-surface ' +
  '[&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:tracking-tight [&_h1]:mt-2 [&_h1]:mb-5 [&_h1]:pb-3 [&_h1]:border-b [&_h1]:border-outline-variant/30 ' +
  '[&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:mt-7 [&_h2]:mb-3 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-outline-variant/25 ' +
  '[&_h3]:text-xl [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_h4]:text-lg [&_h4]:font-bold [&_h4]:mt-5 [&_h4]:mb-2 ' +
  '[&_p]:mb-4 [&_p]:text-on-surface [&_strong]:font-bold [&_em]:italic [&_del]:line-through ' +
  '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1.5 ' +
  '[&_pre]:bg-surface-container-high [&_pre]:border [&_pre]:border-outline-variant/30 [&_pre]:p-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:my-5 ' +
  '[&_code]:font-mono [&_code]:text-[0.9em] [&_code]:bg-surface-container-highest [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre_code]:bg-transparent [&_pre_code]:p-0 ' +
  '[&_a]:text-primary [&_a]:underline hover:[&_a]:text-primary-container [&_hr]:my-6 [&_hr]:border-outline-variant/40 ' +
  '[&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:bg-surface-container-low [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:my-4 [&_blockquote]:italic ' +
  '[&_img]:max-w-full [&_img]:my-5 [&_img]:border [&_img]:border-outline-variant/30 ' +
  '[&_table]:w-full [&_table]:border-collapse [&_table]:my-5 [&_th]:text-left [&_th]:text-xs [&_th]:tracking-normal [&_th]:font-headline [&_th]:bg-surface-container-high [&_th]:p-3 [&_th]:border [&_th]:border-outline-variant/30 [&_td]:p-3 [&_td]:border [&_td]:border-outline-variant/30'

function createLocalNote() {
  return {
    id: null,
    title: 'Untitled note',
    content: EMPTY_NOTE_CONTENT,
    createdAt: null,
    updatedAt: null,
  }
}

function formatDate(value) {
  if (!value) return 'Not saved yet'

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Recently updated'
  }
}

function NotesPage() {
  const [notes, setNotes] = useState([])
  const [activeNoteId, setActiveNoteId] = useState(null)
  const [draft, setDraft] = useState(createLocalNote)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('edit')
  const saveTimerRef = useRef(null)
  const lastSavedDraftRef = useRef('')
  const contentEditorRef = useRef(null)

  const previewHtml = useMemo(() => parseMarkdownToHtml(draft.content), [draft.content])

  useEffect(() => {
    let cancelled = false

    const loadNotes = async () => {
      setIsLoading(true)
      setError('')

      try {
        const response = await apiFetch('/notes')
        if (cancelled) return

        const loadedNotes = Array.isArray(response) ? response : []
        setNotes(loadedNotes)

        const firstNote = loadedNotes[0] || null
        setActiveNoteId(firstNote?.id || null)
        setDraft(firstNote || createLocalNote())
        lastSavedDraftRef.current = firstNote
          ? JSON.stringify({ id: firstNote.id, title: firstNote.title, content: firstNote.content })
          : ''
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || 'Failed to load notes')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadNotes()

    return () => {
      cancelled = true
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  const saveDraft = useCallback(async (noteDraft) => {
    const snapshot = JSON.stringify({
      id: noteDraft.id,
      title: noteDraft.title,
      content: noteDraft.content,
    })

    if (snapshot === lastSavedDraftRef.current) {
      return noteDraft
    }

    setIsSaving(true)
    setError('')

    try {
      const payload = {
        title: noteDraft.title,
        content: noteDraft.content,
      }
      const saved = noteDraft.id
        ? await apiFetch(`/notes/${noteDraft.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiFetch('/notes', {
            method: 'POST',
            body: JSON.stringify(payload),
          })

      setNotes((current) => {
        const exists = current.some((note) => note.id === saved.id)
        const next = exists
          ? current.map((note) => (note.id === saved.id ? saved : note))
          : [saved, ...current]

        return next.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      })
      setActiveNoteId(saved.id)
      setDraft(saved)
      lastSavedDraftRef.current = JSON.stringify({
        id: saved.id,
        title: saved.title,
        content: saved.content,
      })

      return saved
    } catch (saveError) {
      setError(saveError?.message || 'Failed to save note')
      return noteDraft
    } finally {
      setIsSaving(false)
    }
  }, [])

  useEffect(() => {
    if (isLoading) return

    const snapshot = JSON.stringify({
      id: draft.id,
      title: draft.title,
      content: draft.content,
    })

    if (snapshot === lastSavedDraftRef.current) {
      return
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveDraft(draft)
    }, 700)

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [draft, isLoading, saveDraft])

  const handleCreateNote = () => {
    const nextNote = createLocalNote()
    setActiveNoteId(null)
    setDraft(nextNote)
    lastSavedDraftRef.current = ''
    setMode('edit')
  }

  const handleSelectNote = async (note) => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
    }

    await saveDraft(draft)
    setActiveNoteId(note.id)
    setDraft(note)
    lastSavedDraftRef.current = JSON.stringify({
      id: note.id,
      title: note.title,
      content: note.content,
    })
  }

  const updateDraft = (updates) => {
    const next = {
      ...draft,
      ...updates,
    }

    setDraft(next)

    if (next.id) {
      setNotes((items) => items.map((note) => (note.id === next.id ? next : note)))
    }
  }

  const insertIntoContent = (insertedText) => {
    const editor = contentEditorRef.current
    if (!editor) return

    const start = editor.selectionStart
    const end = editor.selectionEnd
    const currentContent = draft.content || ''
    const nextContent = `${currentContent.slice(0, start)}${insertedText}${currentContent.slice(end)}`
    const nextPosition = start + insertedText.length

    updateDraft({ content: nextContent })
    window.requestAnimationFrame(() => {
      editor.setSelectionRange(nextPosition, nextPosition)
    })
  }

  const handleContentKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      insertIntoContent('\n')
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      insertIntoContent('  ')
    }
  }

  const handleDeleteNote = async () => {
    if (!draft.id) {
      handleCreateNote()
      return
    }

    const confirmed = window.confirm(`Delete "${draft.title || 'Untitled note'}"?`)
    if (!confirmed) return

    setIsSaving(true)
    setError('')

    try {
      await apiFetch(`/notes/${draft.id}`, { method: 'DELETE' })
      const remaining = notes.filter((note) => note.id !== draft.id)
      const nextNote = remaining[0] || createLocalNote()
      setNotes(remaining)
      setActiveNoteId(nextNote.id || null)
      setDraft(nextNote)
      lastSavedDraftRef.current = nextNote.id
        ? JSON.stringify({ id: nextNote.id, title: nextNote.title, content: nextNote.content })
        : ''
    } catch (deleteError) {
      setError(deleteError?.message || 'Failed to delete note')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="bg-surface min-h-screen p-6 lg:p-10 mt-16 md:mt-20">
      <div className="flex flex-col gap-6 h-[calc(100vh-8rem)] min-h-[680px]">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="font-headline text-xs text-on-surface-variant font-bold">
              Your notebook
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold text-on-background font-headline mt-1">
              Notes
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-headline text-xs text-on-surface-variant font-bold">
              {isSaving ? 'Saving…' : 'All changes saved'}
            </span>
            <button
              className="rounded-full inline-flex items-center gap-2 px-5 py-3 bg-primary text-on-primary font-headline text-sm font-bold hover:opacity-90 transition-opacity"
              onClick={handleCreateNote}
              type="button"
            >
              <span className="material-symbols-outlined text-base">add</span>
              New Note
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl shadow-soft bg-error/10 px-4 py-3 text-error font-body text-sm">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-[18rem_minmax(0,1fr)] gap-6 flex-1 min-h-0">
          <aside className="rounded-xl bg-surface-container-low border border-outline-variant/40 flex flex-col min-h-0">
            <div className="rounded-xl px-4 py-3 border-b border-outline-variant/40 flex items-center justify-between">
              <span className="font-headline text-xs text-on-surface-variant font-bold">
                Notes
              </span>
              <span className="font-headline text-xs text-primary font-bold">{notes.length}</span>
            </div>
            <div className="overflow-y-auto flex-1">
              {isLoading ? (
                <div className="p-4 text-sm text-on-surface-variant font-body">Loading notes...</div>
              ) : notes.length ? (
                notes.map((note) => (
                  <button
                    className={`rounded-2xl w-full text-left px-4 py-4 border-b border-outline-variant/30 transition-colors ${
                      note.id === activeNoteId
                        ? 'bg-surface-container-highest text-on-background'
                        : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                    }`}
                    key={note.id}
                    onClick={() => {
                      void handleSelectNote(note)
                    }}
                    type="button"
                  >
                    <span className="block font-headline text-sm font-bold truncate">
                      {note.title || 'Untitled note'}
                    </span>
                    <span className="block font-body text-xs mt-1 truncate">
                      {String(note.content || '').replace(/\s+/g, ' ').slice(0, 90) || 'Empty note'}
                    </span>
                    <span className="block font-headline text-xs mt-2 text-primary">
                      {formatDate(note.updatedAt)}
                    </span>
                  </button>
                ))
              ) : (
                <div className="p-4 text-sm text-on-surface-variant font-body">
                  No notes yet.
                </div>
              )}
            </div>
          </aside>

          <section className="rounded-xl bg-surface-container-lowest border border-outline-variant/40 flex flex-col min-h-0">
            <div className="rounded-2xl px-5 py-4 border-b border-outline-variant/40 flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
              <input
                className="bg-transparent outline-none font-headline text-2xl lg:text-3xl font-extrabold tracking-tight text-on-background min-w-0 flex-1"
                onBlur={() => {
                  void saveDraft(draft)
                }}
                onChange={(event) => updateDraft({ title: event.target.value })}
                placeholder="Untitled note"
                type="text"
                value={draft.title}
              />
              <div className="flex items-center gap-2 shrink-0">
                <div className="rounded-xl bg-surface-container-low p-1 flex">
                  <button
                    className={`px-3 py-2 font-headline text-xs font-bold ${
                      mode === 'edit' ? 'bg-surface-container-lowest text-primary' : 'text-on-surface-variant'
                    }`}
                    onClick={() => setMode('edit')}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className={`px-3 py-2 font-headline text-xs font-bold ${
                      mode === 'preview' ? 'bg-surface-container-lowest text-primary' : 'text-on-surface-variant'
                    }`}
                    onClick={() => setMode('preview')}
                    type="button"
                  >
                    Preview
                  </button>
                </div>
                <button
                  className="rounded-xl inline-flex items-center justify-center h-10 w-10 text-error hover:bg-error/10 transition-colors"
                  onClick={handleDeleteNote}
                  title="Delete note"
                  type="button"
                >
                  <span className="material-symbols-outlined text-base">delete</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0">
              <textarea
                ref={contentEditorRef}
                className={`rounded-2xl w-full h-full min-h-[420px] resize-none bg-surface-container-lowest border-0 outline-none p-6 font-headline text-sm leading-7 text-on-background ${
                  mode === 'preview' ? 'hidden lg:block' : 'block'
                }`}
                onBlur={() => {
                  void saveDraft(draft)
                }}
                onChange={(event) => updateDraft({ content: event.target.value })}
                onKeyDown={handleContentKeyDown}
                placeholder="Write Markdown notes..."
                spellCheck="true"
                value={draft.content}
                wrap="soft"
              />
              <div
                className={`${markdownPreviewClassName} ${
                  mode === 'edit' ? 'hidden lg:block' : 'block'
                }`}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default NotesPage
