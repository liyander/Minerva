import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../services/api'

export default function TraineeContestsPage() {
  const navigate = useNavigate()
  const [contests, setContests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('live') // live, my, completed, all
  const [searchTerm, setSearchTerm] = useState('')
  const [enrollingId, setEnrollingId] = useState(null)

  const loadContests = async () => {
    try {
      setLoading(true)
      const data = await apiFetch('/contests')
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
    const interval = window.setInterval(loadContests, 5000)
    return () => window.clearInterval(interval)
  }, [])

  const handleEnroll = async (contestId, e) => {
    e.stopPropagation()
    try {
      setEnrollingId(contestId)
      await apiFetch(`/contests/${contestId}/enroll`, { method: 'POST' })
      await loadContests()
    } catch (err) {
      alert(err.message || 'Failed to request enrollment.')
    } finally {
      setEnrollingId(null)
    }
  }

  const filteredContests = contests.filter((c) => {
    const matchesSearch =
      c.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.courseTitle?.toLowerCase().includes(searchTerm.toLowerCase())

    if (!matchesSearch) return false

    if (filter === 'live') return c.status === 'live' || c.status === 'waiting'
    if (filter === 'my') return Boolean(c.myStatus)
    if (filter === 'completed') return c.status === 'completed'
    return true
  })

  return (
    <main className="min-h-screen pt-24 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
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
            Enroll in live course quizzes, get approved by your trainer, and compete in fast-paced Kahoot-style quiz arenas with live leaderboards!
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-container-lowest p-3 rounded-2xl border border-outline-variant/60">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          {[
            { id: 'live', label: '🔥 Live & Lobby' },
            { id: 'my', label: 'My Enrolled Quizzes' },
            { id: 'all', label: 'All Contests' },
            { id: 'completed', label: 'Past Contests' },
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
            placeholder="Search by topic or course..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-container text-on-surface font-body text-xs border border-outline-variant/60 focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Contests Grid */}
      {loading && contests.length === 0 ? (
        <div className="py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
          <p className="mt-2 font-headline text-sm font-semibold">Loading available quizzes...</p>
        </div>
      ) : filteredContests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant p-12 text-center bg-surface-container-lowest">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">quiz</span>
          <h3 className="font-headline text-base font-bold text-on-surface mt-2">No contests found</h3>
          <p className="font-body text-xs text-on-surface-variant mt-1">
            {filter === 'live'
              ? 'There are currently no live or waiting quizzes. Check back soon or view all contests!'
              : 'Try changing your search keywords or filter tab.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredContests.map((contest) => {
            const isLive = contest.status === 'live'
            const isWaiting = contest.status === 'waiting'
            const isCompleted = contest.status === 'completed'
            const isApproved = contest.myStatus === 'approved'
            const isPending = contest.myStatus === 'pending'
            const isRejected = contest.myStatus === 'rejected'

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
                        isLive
                          ? 'bg-rose-500/15 text-rose-500 animate-pulse'
                          : isWaiting
                          ? 'bg-mint/20 text-on-mint'
                          : isCompleted
                          ? 'bg-surface-container-high text-on-surface-variant'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {(isLive || isWaiting) && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                      {isLive
                        ? 'LIVE NOW'
                        : isWaiting
                        ? 'WAITING LOBBY'
                        : isCompleted
                        ? 'COMPLETED'
                        : 'UPCOMING'}
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

                  <div className="mt-3 flex items-center justify-between text-xs text-on-surface-variant">
                    <span className="flex items-center gap-1 font-body text-xs">
                      <span className="material-symbols-outlined text-[15px]">person</span>
                      Trainer: {contest.trainerName}
                    </span>
                    {contest.courseTitle && (
                      <span className="flex items-center gap-1 font-body text-xs text-primary truncate max-w-[150px]">
                        <span className="material-symbols-outlined text-[15px]">school</span>
                        {contest.courseTitle}
                      </span>
                    )}
                  </div>

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
                      </p>
                      <p className="font-body text-[10px] text-on-surface-variant">Enrolled</p>
                    </div>
                    <div>
                      <p className="font-headline text-xs font-bold text-on-surface">
                        {contest.defaultTimeLimit}s
                      </p>
                      <p className="font-body text-[10px] text-on-surface-variant">Speed Limit</p>
                    </div>
                  </div>
                </div>

                {/* Enrollment & Action Buttons */}
                <div className="mt-5 pt-3 border-t border-outline-variant/60">
                  {isApproved ? (
                    <button
                      onClick={() => navigate(`/contests/${contest.id}/play`)}
                      type="button"
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 font-headline text-xs font-bold text-white shadow-soft hover:bg-emerald-600 transition-all"
                    >
                      <span className="material-symbols-outlined text-[18px]">sports_esports</span>
                      {isLive ? 'Join Live Arena Now' : 'Enter Waiting Lobby'}
                    </button>
                  ) : isPending ? (
                    <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-4 py-2.5 font-headline text-xs font-bold">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                      Pending Trainer Acceptance...
                    </div>
                  ) : isRejected ? (
                    <div className="text-center rounded-xl bg-rose-500/10 text-rose-500 px-4 py-2 font-headline text-xs font-bold">
                      Enrollment Request Declined
                    </div>
                  ) : isCompleted ? (
                    <button
                      onClick={() => navigate(`/contests/${contest.id}/play`)}
                      type="button"
                      className="w-full rounded-xl bg-surface-container px-4 py-2.5 font-headline text-xs font-bold text-on-surface hover:bg-surface-container-high transition-colors"
                    >
                      View Results &amp; Leaderboard
                    </button>
                  ) : (
                    <button
                      onClick={(e) => handleEnroll(contest.id, e)}
                      disabled={enrollingId === contest.id}
                      type="button"
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-headline text-xs font-bold text-on-primary shadow-soft hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      {enrollingId === contest.id ? (
                        <>
                          <span className="material-symbols-outlined text-sm animate-spin">
                            progress_activity
                          </span>
                          Requesting Enrollment...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">how_to_reg</span>
                          Enroll to Participate
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
