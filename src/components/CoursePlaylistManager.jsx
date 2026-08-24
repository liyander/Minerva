import { useEffect, useState } from 'react'
import { apiFetch } from '../services/api'

export default function CoursePlaylistManager({ roomId, courseTitle, onPlaylistUpdated }) {
  const [candidates, setCandidates] = useState([])
  const [playlist, setPlaylist] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [customSearchTerm, setCustomSearchTerm] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  // Custom external video form
  const [customFormOpen, setCustomFormOpen] = useState(false)
  const [customVideo, setCustomVideo] = useState({
    title: '',
    url: '',
    description: '',
    channelTitle: '',
    source: 'youtube',
  })

  const loadCandidatesAndPlaylist = async () => {
    if (!roomId) return
    setIsLoading(true)
    setError('')
    try {
      const data = await apiFetch(`/youtube/trainer/courses/${encodeURIComponent(roomId)}/candidates`)
      setCandidates(data.candidates || [])
      setPlaylist(data.playlist || [])
      setSearchQuery(data.searchQuery || '')
    } catch (err) {
      setError(err.message || 'Failed to load video candidates')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadCandidatesAndPlaylist()
  }, [roomId])

  const handleApproveCandidate = async (video) => {
    setIsAdding(true)
    setError('')
    try {
      await apiFetch(`/youtube/trainer/courses/${encodeURIComponent(roomId)}/playlist`, {
        method: 'POST',
        body: JSON.stringify({
          url: video.url,
          title: video.title,
          description: video.description,
          thumbnail: video.thumbnail,
          channelTitle: video.channelTitle,
          publishedAt: video.publishedAt,
          source: 'youtube',
        }),
      })
      setNotice(`Approved "${video.title.slice(0, 40)}..." into course playlist`)
      await loadCandidatesAndPlaylist()
      if (onPlaylistUpdated) onPlaylistUpdated()
    } catch (err) {
      setError(err.message || 'Failed to approve video')
    } finally {
      setIsAdding(false)
    }
  }

  const handleAddCustomVideo = async (e) => {
    e.preventDefault()
    if (!customVideo.url || !customVideo.title) return
    setIsAdding(true)
    setError('')
    try {
      await apiFetch(`/youtube/trainer/courses/${encodeURIComponent(roomId)}/playlist`, {
        method: 'POST',
        body: JSON.stringify({
          url: customVideo.url,
          title: customVideo.title,
          description: customVideo.description,
          channelTitle: customVideo.channelTitle || 'Trainer Provided',
          source: customVideo.source || 'youtube',
        }),
      })
      setNotice(`Added external video to playlist`)
      setCustomVideo({ title: '', url: '', description: '', channelTitle: '', source: 'youtube' })
      setCustomFormOpen(false)
      await loadCandidatesAndPlaylist()
      if (onPlaylistUpdated) onPlaylistUpdated()
    } catch (err) {
      setError(err.message || 'Failed to add custom video')
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemoveFromPlaylist = async (itemId) => {
    setError('')
    try {
      await apiFetch(`/youtube/trainer/playlist/${itemId}`, { method: 'DELETE' })
      setNotice('Removed from playlist')
      await loadCandidatesAndPlaylist()
      if (onPlaylistUpdated) onPlaylistUpdated()
    } catch (err) {
      setError(err.message || 'Failed to delete item')
    }
  }

  const handleManualSearch = async (e) => {
    e.preventDefault()
    if (!customSearchTerm.trim()) return
    setIsSearching(true)
    setError('')
    try {
      const data = await apiFetch(`/youtube/search?q=${encodeURIComponent(customSearchTerm.trim())}&limit=8`)
      const approvedIds = new Set(playlist.map((p) => p.video_id).filter(Boolean))
      setCandidates(
        (data.videos || []).map((v) => ({
          ...v,
          isAlreadyAdded: approvedIds.has(v.id),
        })),
      )
    } catch (err) {
      setError(err.message || 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary mb-2">
          progress_activity
        </span>
        <p className="text-xs text-on-surface-variant font-headline">Fetching video candidates from YouTube...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="p-3 bg-mint/20 border border-mint text-on-mint rounded-xl text-xs flex justify-between items-center">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-xs font-bold underline">Dismiss</button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-blush/20 border border-blush text-on-blush rounded-xl text-xs flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs font-bold underline">Dismiss</button>
        </div>
      )}

      {/* SECTION 1: OFFICIAL APPROVED PLAYLIST */}
      <div className="rounded-2xl bg-surface-container-lowest p-6 border border-outline-variant/30">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-headline text-base font-extrabold text-on-background flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">playlist_play</span>
              Approved Course Playlist ({playlist.length})
            </h3>
            <p className="text-xs text-on-surface-variant mt-1">
              Students will only see these approved videos when learning this course.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCustomFormOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 text-xs font-headline font-bold transition-colors"
          >
            <span className="material-symbols-outlined text-sm">add_link</span>
            {customFormOpen ? 'Cancel' : 'Add External Video'}
          </button>
        </div>

        {customFormOpen && (
          <form onSubmit={handleAddCustomVideo} className="mb-6 p-4 rounded-xl bg-surface-container-low border border-primary/20 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Add Custom / External Video</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant mb-1">Video Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Masterclass Lecture Part 1"
                  value={customVideo.title}
                  onChange={(e) => setCustomVideo((v) => ({ ...v, title: e.target.value }))}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-surface border border-outline-variant focus:outline-none focus:border-primary text-on-surface"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant mb-1">Video URL (YouTube, Vimeo, MP4) *</label>
                <input
                  type="url"
                  required
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={customVideo.url}
                  onChange={(e) => setCustomVideo((v) => ({ ...v, url: e.target.value }))}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-surface border border-outline-variant focus:outline-none focus:border-primary text-on-surface"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCustomFormOpen(false)}
                className="px-3 py-1.5 rounded-full bg-surface-container-high text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAdding}
                className="px-4 py-1.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:opacity-90 disabled:opacity-50"
              >
                {isAdding ? 'Adding...' : 'Add to Playlist'}
              </button>
            </div>
          </form>
        )}

        {playlist.length === 0 ? (
          <div className="text-center py-6 border-2 border-dashed border-outline-variant/50 rounded-xl">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/40 mb-1">video_library</span>
            <p className="text-xs text-on-surface-variant font-medium">No videos approved in this playlist yet.</p>
            <p className="text-[11px] text-on-surface-variant/70 mt-1">
              Review and click "Approve" on the suggested candidates below or add an external URL.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {playlist.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-container border border-outline-variant/40 hover:border-primary/40 transition-colors"
              >
                <span className="text-xs font-bold text-on-surface-variant px-1.5 py-0.5 rounded bg-surface-container-high shrink-0">
                  #{idx + 1}
                </span>
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-20 h-14 object-cover rounded-lg bg-black shrink-0"
                  />
                ) : (
                  <div className="w-20 h-14 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary">play_circle</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-on-surface line-clamp-1">{item.title}</h4>
                  <p className="text-[11px] text-on-surface-variant truncate mt-0.5">{item.channel_title || 'Approved'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFromPlaylist(item.id)}
                  className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors shrink-0"
                  title="Remove from playlist"
                >
                  <span className="material-symbols-outlined text-base">delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: DISCOVERY & APPROVAL QUEUE */}
      <div className="rounded-2xl bg-surface-container-lowest p-6 border border-outline-variant/30">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-headline text-base font-extrabold text-on-background flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-xl">auto_fix_high</span>
              Discovered Candidate Videos
            </h3>
            <p className="text-xs text-on-surface-variant mt-1">
              Automated video candidates matching topic: <span className="font-semibold text-primary">{searchQuery}</span>
            </p>
          </div>

          <form onSubmit={handleManualSearch} className="flex gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search custom topic..."
              value={customSearchTerm}
              onChange={(e) => setCustomSearchTerm(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-full bg-surface border border-outline-variant focus:outline-none focus:border-primary text-on-surface w-48 sm:w-60"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="px-3 py-1.5 rounded-full bg-secondary text-on-secondary text-xs font-bold hover:opacity-90 disabled:opacity-50"
            >
              {isSearching ? '...' : 'Search'}
            </button>
          </form>
        </div>

        {candidates.length === 0 ? (
          <p className="text-center py-6 text-xs text-on-surface-variant">No candidates found for this query.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {candidates.map((video) => (
              <div
                key={video.id}
                className="flex flex-col justify-between rounded-xl bg-surface-container p-3 border border-outline-variant/30"
              >
                <div>
                  <div className="relative aspect-video rounded-lg overflow-hidden mb-2 bg-black">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                    {video.isAlreadyAdded && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 bg-mint text-on-mint text-[10px] font-bold rounded-full shadow">
                        ✓ Approved
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-on-surface line-clamp-2 leading-tight">
                    {video.title}
                  </h4>
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    {video.channelTitle} {video.publishedAt ? `• ${video.publishedAt}` : ''}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-outline-variant/30 flex items-center justify-between gap-2">
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-primary hover:underline flex items-center gap-1"
                  >
                    <span>Preview</span>
                    <span className="material-symbols-outlined text-xs">open_in_new</span>
                  </a>

                  <button
                    type="button"
                    disabled={video.isAlreadyAdded || isAdding}
                    onClick={() => handleApproveCandidate(video)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      video.isAlreadyAdded
                        ? 'bg-surface-container-high text-on-surface-variant/50 cursor-not-allowed'
                        : 'bg-primary text-on-primary hover:opacity-90'
                    }`}
                  >
                    {video.isAlreadyAdded ? 'In Playlist' : '+ Approve'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
