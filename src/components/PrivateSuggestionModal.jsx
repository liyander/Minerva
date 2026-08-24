import { useEffect, useState } from 'react'
import { apiFetch } from '../services/api'

export default function PrivateSuggestionModal({ student, rooms = [], isOpen, onClose, onSent }) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [resourceUrl, setResourceUrl] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  useEffect(() => {
    if (isOpen && student?.id) {
      setTitle('')
      setMessage('')
      setResourceUrl('')
      setError('')
      loadHistory()
    }
  }, [isOpen, student?.id])

  const loadHistory = async () => {
    if (!student?.id) return
    setIsLoadingHistory(true)
    try {
      const data = await apiFetch(`/youtube/trainer/suggestions/student/${student.id}`)
      setHistory(data.suggestions || [])
    } catch {
      setHistory([])
    } finally {
      setIsLoadingHistory(false)
    }
  }

  if (!isOpen || !student) return null

  const handleSend = async (e) => {
    e.preventDefault()
    if (!title.trim() || !message.trim()) return

    setIsSending(true)
    setError('')
    try {
      await apiFetch(`/youtube/trainer/suggestions`, {
        method: 'POST',
        body: JSON.stringify({
          studentId: student.id,
          roomId: selectedRoomId || null,
          title: title.trim(),
          message: message.trim(),
          resourceUrl: resourceUrl.trim() || null,
        }),
      })
      if (onSent) onSent()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to send suggestion')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-surface-container-lowest border border-outline-variant/40 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-outline-variant/30 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">1-on-1 Mentorship</span>
            <h3 className="text-xl font-extrabold font-headline text-on-background">
              Suggest to {student.name || student.username}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-on-surface-variant hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 bg-blush/20 border border-blush text-on-blush rounded-xl text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">
                Associated Course (Optional)
              </label>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-xl bg-surface border border-outline-variant focus:outline-none focus:border-primary text-on-surface"
              >
                <option value="">-- General Learning Recommendation --</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">
                Guidance / Suggestion Topic *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Focus on Buffer Overflow fundamentals"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-xl bg-surface border border-outline-variant focus:outline-none focus:border-primary text-on-surface"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">
                Private Note / Feedback *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Write specific feedback, advice, or what to review..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-xl bg-surface border border-outline-variant focus:outline-none focus:border-primary text-on-surface"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">
                Recommended Resource / YouTube URL (Optional)
              </label>
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={resourceUrl}
                onChange={(e) => setResourceUrl(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-xl bg-surface border border-outline-variant focus:outline-none focus:border-primary text-on-surface"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full bg-surface-container-high text-xs font-bold text-on-surface"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="px-5 py-2 rounded-full bg-primary text-on-primary text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">send</span>
                {isSending ? 'Sending...' : 'Send Suggestion'}
              </button>
            </div>
          </form>

          {/* Past Suggestions */}
          {history.length > 0 && (
            <div className="pt-4 border-t border-outline-variant/30">
              <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-3">
                Previously Sent Suggestions ({history.length})
              </h4>
              <div className="space-y-2.5 max-h-48 overflow-y-auto">
                {history.map((item) => (
                  <div key={item.id} className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs">
                    <div className="flex justify-between items-start gap-2">
                      <h5 className="font-bold text-on-surface">{item.title}</h5>
                      <span className="text-[10px] text-on-surface-variant shrink-0">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-on-surface-variant mt-1">{item.message}</p>
                    {item.resource_url && (
                      <a
                        href={item.resource_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary text-[11px] font-semibold mt-1.5 hover:underline"
                      >
                        <span className="material-symbols-outlined text-xs">link</span>
                        {item.resource_url}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
