import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../services/api'

export default function TrainerContestsPage() {
  const navigate = useNavigate()
  const [contests, setContests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, live, draft, completed
  const [searchTerm, setSearchTerm] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const loadContests = async () => {
    try {
      setLoading(true)
      const data = await apiFetch('/contests?my=true')
      setContests(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load contests:', err)
      setContests([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadContests()
  }, [])

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('Are you sure you want to delete this contest?')) return
    try {
      setDeletingId(id)
      await apiFetch(`/contests/${id}`, { method: 'DELETE' })
      setContests((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      alert(err.message || 'Failed to delete contest.')
    } finally {
      setDeletingId(null)
    }
  }

  const filteredContests = contests.filter((c) => {
    const matchesSearch =
      c.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.courseTitle?.toLowerCase().includes(searchTerm.toLowerCase())

    if (!matchesSearch) return false

    if (filter === 'live') return c.status === 'live' || c.status === 'waiting'
    if (filter === 'draft') return c.status === 'draft'
    if (filter === 'completed') return c.status === 'completed'
    return true
  })

  const stats = {
    total: contests.length,
    live: contests.filter((c) => c.status === 'live' || c.status === 'waiting').length,
    completed: contests.filter((c) => c.status === 'completed').length,
    participants: contests.reduce((acc, c) => acc + (c.approvedParticipantCount || 0), 0),
  }

  return (
    <main className="min-h-screen p-4 pt-24 sm:p-6 sm:pt-24 lg:p-8 lg:pt-24 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-3xl">emoji_events</span>
            <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-on-surface">
              Live Contests &amp; Quizzes
            </h1>
          </div>
          <p className="font-body text-sm text-on-surface-variant mt-1">
            Design interactive Kahoot-style quizzes with AI, accept trainee enrollments, and host real-time multiplayer competitions.
          </p>
        </div>

        <Link
          to="/trainer/contests/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-headline text-sm font-bold text-on-primary shadow-soft hover:opacity-90 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          Create New Contest
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-surface-container p-4 border border-outline-variant/60">
          <p className="font-body text-xs text-on-surface-variant font-medium">Total Contests</p>
          <p className="font-headline text-2xl font-extrabold text-on-surface mt-1">{stats.total}</p>
        </div>
        <div className="rounded-2xl bg-surface-container p-4 border border-outline-variant/60">
          <p className="font-body text-xs text-mint font-medium flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-mint animate-pulse" />
            Live / Waiting
          </p>
          <p className="font-headline text-2xl font-extrabold text-mint mt-1">{stats.live}</p>
        </div>
        <div className="rounded-2xl bg-surface-container p-4 border border-outline-variant/60">
          <p className="font-body text-xs text-on-surface-variant font-medium">Completed</p>
          <p className="font-headline text-2xl font-extrabold text-on-surface mt-1">{stats.completed}</p>
        </div>
        <div className="rounded-2xl bg-surface-container p-4 border border-outline-variant/60">
          <p className="font-body text-xs text-on-surface-variant font-medium">Trainees Joined</p>
          <p className="font-headline text-2xl font-extrabold text-primary mt-1">{stats.participants}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-container-lowest p-3 rounded-2xl border border-outline-variant/60">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          {[
            { id: 'all', label: 'All Quizzes' },
            { id: 'live', label: 'Live / Lobby' },
            { id: 'draft', label: 'Drafts' },
            { id: 'completed', label: 'Finished' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              type="button"
              className={`rounded-xl px-4 py-2 font-headline text-xs font-bold transition-colors shrink-0 ${
                filter === tab.id
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search by title, subject..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-container text-on-surface font-body text-xs border border-outline-variant/60 focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Contests Grid */}
      {loading ? (
        <div className="py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
          <p className="mt-2 font-headline text-sm font-semibold">Loading contests...</p>
        </div>
      ) : filteredContests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant p-12 text-center bg-surface-container-lowest">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">quiz</span>
          <h3 className="font-headline text-base font-bold text-on-surface mt-2">No contests found</h3>
          <p className="font-body text-xs text-on-surface-variant mt-1">
            {searchTerm || filter !== 'all'
              ? 'Try changing your search keywords or filter tab.'
              : 'Create your first Kahoot-style contest or quiz with AI assistance.'}
          </p>
          <Link
            to="/trainer/contests/new"
            className="inline-flex items-center gap-2 mt-4 rounded-xl bg-primary px-4 py-2 font-headline text-xs font-bold text-on-primary hover:opacity-90"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Create Contest
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredContests.map((contest) => {
            const isLive = contest.status === 'live' || contest.status === 'waiting'
            const isCompleted = contest.status === 'completed'

            return (
              <div
                key={contest.id}
                className="rounded-2xl bg-surface-container-lowest border border-outline-variant/60 p-5 flex flex-col justify-between hover:border-primary/50 transition-all hover:shadow-card group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="rounded-full bg-secondary-container px-2.5 py-0.5 font-headline text-[11px] font-bold text-on-secondary-container">
                      {contest.subject || 'General'}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-headline text-[11px] font-bold ${
                        contest.status === 'live'
                          ? 'bg-rose-500/15 text-rose-500 animate-pulse'
                          : contest.status === 'waiting'
                          ? 'bg-mint/20 text-on-mint'
                          : isCompleted
                          ? 'bg-surface-container-high text-on-surface-variant'
                          : 'bg-butter/20 text-amber-600'
                      }`}
                    >
                      {isLive && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                      {contest.status === 'live'
                        ? 'LIVE NOW'
                        : contest.status === 'waiting'
                        ? 'WAITING LOBBY'
                        : isCompleted
                        ? 'COMPLETED'
                        : 'DRAFT'}
                    </span>
                  </div>

                  <h3 className="font-headline text-base font-bold text-on-surface group-hover:text-primary transition-colors line-clamp-1">
                    {contest.title}
                  </h3>

                  {contest.description && (
                    <p className="font-body text-xs text-on-surface-variant mt-1.5 line-clamp-2">
                      {contest.description}
                    </p>
                  )}

                  {contest.courseTitle && (
                    <div className="mt-3 flex items-center gap-1.5 font-body text-xs text-primary">
                      <span className="material-symbols-outlined text-[15px]">school</span>
                      <span className="truncate">{contest.courseTitle}</span>
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-outline-variant/40 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="font-headline text-xs font-bold text-on-surface">
                        {contest.questionCount}
                      </p>
                      <p className="font-body text-[10px] text-on-surface-variant">Questions</p>
                    </div>
                    <div>
                      <p className="font-headline text-xs font-bold text-on-surface">
                        {contest.approvedParticipantCount || 0}
                        {contest.participantCount > (contest.approvedParticipantCount || 0) && (
                          <span className="text-[10px] text-amber-500 font-normal ml-0.5">
                            (+{contest.participantCount - contest.approvedParticipantCount} pending)
                          </span>
                        )}
                      </p>
                      <p className="font-body text-[10px] text-on-surface-variant">Trainees</p>
                    </div>
                    <div>
                      <p className="font-headline text-xs font-bold text-on-surface">
                        {contest.defaultTimeLimit}s
                      </p>
                      <p className="font-body text-[10px] text-on-surface-variant">Per Q</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-outline-variant/60 flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/trainer/contests/${contest.id}/host`)}
                    type="button"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 font-headline text-xs font-bold text-on-primary hover:opacity-90 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {isLive ? 'podium' : 'play_arrow'}
                    </span>
                    {isLive ? 'Open Arena' : 'Host Live'}
                  </button>

                  <Link
                    to={`/trainer/contests/${contest.id}/edit`}
                    className="p-2 rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors"
                    title="Edit Quiz / Questions"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </Link>

                  <button
                    onClick={(e) => handleDelete(contest.id, e)}
                    disabled={deletingId === contest.id}
                    type="button"
                    className="p-2 rounded-xl bg-error-container text-on-error-container hover:opacity-80 transition-opacity"
                    title="Delete Contest"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
