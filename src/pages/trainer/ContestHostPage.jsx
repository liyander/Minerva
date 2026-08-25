import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../../services/api'

const KAHOOT_STYLES = [
  { bg: 'bg-rose-500 text-white', light: 'bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400', icon: 'change_history', label: 'Triangle' },
  { bg: 'bg-blue-500 text-white', light: 'bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-400', icon: 'diamond', label: 'Diamond' },
  { bg: 'bg-amber-500 text-white', light: 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400', icon: 'circle', label: 'Circle' },
  { bg: 'bg-emerald-500 text-white', light: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400', icon: 'square', label: 'Square' },
]

export default function ContestHostPage() {
  const { id: contestId } = useParams()
  const [contest, setContest] = useState(null)
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [leaderboardCountdown, setLeaderboardCountdown] = useState(0)
  const [actionLoading, setActionLoading] = useState(false)

  const pollingRef = useRef(null)

  const loadData = async () => {
    try {
      const [contestData, participantsData] = await Promise.all([
        apiFetch(`/contests/${contestId}/live`),
        apiFetch(`/contests/${contestId}/participants`),
      ])
      setContest(contestData)
      setParticipants(Array.isArray(participantsData) ? participantsData : [])
    } catch (err) {
      console.error('Failed to poll contest host state:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    pollingRef.current = window.setInterval(loadData, 1500)
    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current)
    }
  }, [contestId])

  // Timer countdown handling for live question
  useEffect(() => {
    if (contest?.status === 'live' && contest?.currentQuestion && contest?.currentQuestionStartedAt) {
      const started = new Date(contest.currentQuestionStartedAt).getTime()
      const limitMs = (contest.currentQuestion.timeLimitSeconds || 20) * 1000

      const updateTimer = () => {
        const elapsed = Date.now() - started
        const left = Math.max(0, Math.ceil((limitMs - elapsed) / 1000))
        setTimeRemaining(left)
        if (left === 0 && contest.status === 'live') {
          // Timer ended - automatically go to answer reveal
          if (!actionLoading) {
            handleStateChange('question_ended')
          }
        }
      }

      updateTimer()
      const timerId = window.setInterval(updateTimer, 500)
      return () => window.clearInterval(timerId)
    }
  }, [contest?.status, contest?.currentQuestion, contest?.currentQuestionStartedAt, actionLoading])

  // Automatically move from answer reveal to leaderboard after 4 seconds
  useEffect(() => {
    if (contest?.status === 'question_ended') {
      const timeoutId = window.setTimeout(() => {
        if (!actionLoading) {
          handleStateChange('show_leaderboard')
        }
      }, 4000)
      return () => window.clearTimeout(timeoutId)
    }
  }, [contest?.status, actionLoading])

  // Leaderboard countdown timer - automatically go to next question after 10 seconds
  useEffect(() => {
    if (contest?.status === 'leaderboard') {
      const duration = 10 // Force 10 seconds as per user request
      setLeaderboardCountdown(duration)
      
      const interval = window.setInterval(() => {
        setLeaderboardCountdown((prev) => {
          if (prev <= 1) {
            window.clearInterval(interval)
            // Time is up, move to next question or finish
            if (!actionLoading) {
              const currentIdx = contest?.currentQuestionIndex ?? -1
              const totalQ = contest?.totalQuestions || 0
              if (currentIdx >= totalQ - 1) {
                handleStateChange('finish')
              } else {
                handleStateChange('start_question')
              }
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => window.clearInterval(interval)
    }
  }, [contest?.status, contest?.currentQuestionIndex, contest?.totalQuestions, actionLoading])

  const handleStateChange = async (action, questionIndex) => {
    try {
      setActionLoading(true)
      await apiFetch(`/contests/${contestId}/state`, {
        method: 'POST',
        body: JSON.stringify({ action, questionIndex }),
      })
      await loadData()
    } catch (err) {
      alert(err.message || 'Failed to update contest state.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleParticipantStatus = async (userId, status) => {
    try {
      await apiFetch(`/contests/${contestId}/participants/${userId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      setParticipants((prev) =>
        prev.map((p) => (p.userId === userId ? { ...p, status } : p)),
      )
    } catch (err) {
      alert(err.message || 'Failed to update participant.')
    }
  }

  const handleApproveAll = async () => {
    try {
      await apiFetch(`/contests/${contestId}/participants/approve-all`, {
        method: 'POST',
      })
      setParticipants((prev) =>
        prev.map((p) => ({ ...p, status: 'approved' })),
      )
    } catch (err) {
      alert(err.message || 'Failed to approve participants.')
    }
  }

  if (loading && !contest) {
    return (
      <div className="p-12 text-center text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
        <p className="mt-2 font-headline text-sm font-semibold">Opening live contest arena...</p>
      </div>
    )
  }

  const pendingParticipants = participants.filter((p) => p.status === 'pending')
  const approvedParticipants = participants.filter((p) => p.status === 'approved')
  const currentQ = contest?.currentQuestion
  const currentIdx = contest?.currentQuestionIndex ?? -1
  const totalQ = contest?.totalQuestions || 0
  const isLastQuestion = currentIdx >= totalQ - 1

  return (
    <main className="min-h-screen pt-24 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/60">
        <div className="flex items-center gap-3">
          <Link
            to="/trainer/contests"
            className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
            title="Back to Contests"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-headline font-bold bg-primary-container text-on-primary-container">
                <span className="material-symbols-outlined text-[14px]">sports_esports</span>
                Trainer Host Control
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-headline font-bold ${
                  contest?.status === 'live'
                    ? 'bg-rose-500/20 text-rose-500 animate-pulse'
                    : contest?.status === 'waiting'
                    ? 'bg-mint/20 text-on-mint'
                    : contest?.status === 'completed'
                    ? 'bg-surface-container-high text-on-surface'
                    : 'bg-butter/20 text-amber-600'
                }`}
              >
                STATUS: {contest?.status?.toUpperCase()}
              </span>
            </div>
            <h1 className="font-headline text-lg sm:text-xl font-extrabold text-on-surface mt-1">
              {contest?.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={`/trainer/contests/${contestId}/edit`}
            className="p-2 rounded-xl border border-outline-variant/60 text-on-surface hover:bg-surface-container"
            title="Edit Quiz"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </Link>

          {contest?.status !== 'draft' && contest?.status !== 'waiting' && (
            <button
              onClick={() => handleStateChange('open_waiting')}
              disabled={actionLoading}
              type="button"
              className="px-3 py-2 rounded-xl bg-surface-container font-headline text-xs font-bold text-on-surface hover:bg-surface-container-high"
            >
              Reset to Lobby
            </button>
          )}
        </div>
      </div>

      {/* PHASE 1: WAITING LOBBY / DRAFT */}
      {(contest?.status === 'draft' || contest?.status === 'waiting') && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-gradient-to-br from-secondary-container via-surface-container to-surface-container-high p-8 text-center border border-outline-variant/60 shadow-card relative overflow-hidden">
            <div className="relative z-10 max-w-xl mx-auto space-y-4">
              <span className="material-flex inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container-lowest/80 text-primary font-headline text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                Live Waiting Arena
              </span>

              <h2 className="font-headline text-3xl sm:text-4xl font-extrabold text-on-surface">
                Waiting for Trainees to Join
              </h2>

              <p className="font-body text-sm text-on-surface-variant">
                Trainees can view this contest in their Contests sidebar tab and click <strong>Enroll</strong>. Once you approve their enrollment below, they enter the live game arena!
              </p>

              <div className="flex items-center justify-center gap-4 pt-2">
                <div className="bg-surface-container-lowest px-6 py-3 rounded-2xl border border-outline-variant/60 shadow-soft">
                  <p className="font-headline text-2xl font-black text-primary">
                    {approvedParticipants.length}
                  </p>
                  <p className="font-body text-xs text-on-surface-variant font-medium">Ready in Lobby</p>
                </div>

                <div className="bg-surface-container-lowest px-6 py-3 rounded-2xl border border-outline-variant/60 shadow-soft">
                  <p className="font-headline text-2xl font-black text-amber-500">
                    {pendingParticipants.length}
                  </p>
                  <p className="font-body text-xs text-on-surface-variant font-medium">Pending Requests</p>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-center gap-3">
                {contest?.status === 'draft' ? (
                  <button
                    onClick={() => handleStateChange('open_waiting')}
                    disabled={actionLoading}
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-headline text-sm font-bold text-on-primary shadow-soft hover:opacity-90 transition-all"
                  >
                    <span className="material-symbols-outlined">meeting_room</span>
                    Open Waiting Room for Trainees
                  </button>
                ) : (
                  <button
                    onClick={() => handleStateChange('start_question', 0)}
                    disabled={actionLoading || approvedParticipants.length === 0}
                    type="button"
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-8 py-3.5 font-headline text-base font-extrabold text-white shadow-lift hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-2xl">rocket_launch</span>
                    Start Contest (Question 1)
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Enrolled Trainees & Approval Panel */}
          <div className="rounded-2xl bg-surface-container-lowest p-6 border border-outline-variant/60 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-headline text-base font-bold text-on-surface">
                  Trainee Enrollment Requests ({participants.length})
                </h3>
                <p className="font-body text-xs text-on-surface-variant">
                  Review incoming join requests and accept trainees into the live quiz.
                </p>
              </div>

              {pendingParticipants.length > 0 && (
                <button
                  onClick={handleApproveAll}
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-4 py-2 font-headline text-xs font-bold hover:bg-emerald-500/25 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">done_all</span>
                  Approve All Pending ({pendingParticipants.length})
                </button>
              )}
            </div>

            {participants.length === 0 ? (
              <div className="py-8 text-center text-on-surface-variant border border-dashed border-outline-variant rounded-xl">
                <span className="material-symbols-outlined text-3xl opacity-40">groups</span>
                <p className="font-headline text-xs font-bold mt-1">No trainees enrolled yet</p>
                <p className="font-body text-[11px] opacity-70">
                  Ask trainees to open their <strong>Contests</strong> sidebar and click Enroll.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/40">
                {participants.map((p) => (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-secondary-container text-on-secondary-container font-headline font-bold text-xs flex items-center justify-center">
                        {p.username?.slice(0, 2)?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-headline text-xs font-bold text-on-surface">
                          {p.name} <span className="text-on-surface-variant font-normal">(@{p.username})</span>
                        </p>
                        <p className="font-body text-[10px] text-on-surface-variant">
                          Enrolled at {new Date(p.enrolledAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {p.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-headline font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          <span className="material-symbols-outlined text-[14px]">check</span>
                          Approved
                        </span>
                      ) : p.status === 'rejected' ? (
                        <span className="px-3 py-1 rounded-full text-[11px] font-headline font-bold bg-rose-500/15 text-rose-500">
                          Rejected
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleParticipantStatus(p.userId, 'approved')}
                            type="button"
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-headline text-xs font-bold hover:bg-emerald-600 transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleParticipantStatus(p.userId, 'rejected')}
                            type="button"
                            className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant font-headline text-xs font-bold hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PHASE 2: LIVE QUESTION SCREEN */}
      {contest?.status === 'live' && currentQ && (
        <div className="space-y-6">
          {/* Question Banner */}
          <div className="rounded-3xl bg-surface-container-lowest p-6 sm:p-8 border border-outline-variant/60 shadow-card text-center space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-headline text-xs font-extrabold">
                Question {currentIdx + 1} of {totalQ}
              </span>

              {/* Countdown Timer */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-headline text-lg font-black border-4 transition-all ${
                    timeRemaining <= 5
                      ? 'border-rose-500 text-rose-500 bg-rose-500/10 animate-ping'
                      : 'border-primary text-primary bg-primary/10'
                  }`}
                >
                  {timeRemaining}s
                </div>
              </div>

              <span className="px-3 py-1 rounded-full bg-surface-container font-headline text-xs font-bold text-on-surface-variant">
                Answers: {contest.answersCount || 0} / {approvedParticipants.length}
              </span>
            </div>

            {/* Prompt */}
            <h2 className="font-headline text-2xl sm:text-3xl font-black text-on-surface max-w-3xl mx-auto pt-2">
              {currentQ.prompt}
            </h2>

            {/* Response Progress Bar */}
            <div className="w-full bg-surface-container rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-primary h-2.5 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    approvedParticipants.length > 0
                      ? Math.min(100, ((contest.answersCount || 0) / approvedParticipants.length) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* 4 Colored Options Presentation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {currentQ.options.map((opt, idx) => {
              const style = KAHOOT_STYLES[idx]
              return (
                <div
                  key={idx}
                  className={`p-6 rounded-2xl font-headline font-bold text-lg flex items-center gap-4 shadow-card ${style.bg}`}
                >
                  <span className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-2xl">{style.icon}</span>
                  </span>
                  <span className="flex-1">{opt}</span>
                </div>
              )
            })}
          </div>

          {/* Host Controls */}
          <div className="flex items-center justify-end gap-4 pt-2">
            <span className="font-headline text-xs font-bold text-on-surface-variant animate-pulse flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">hourglass_empty</span>
              Auto-ends when time is up...
            </span>
            <button
              onClick={() => handleStateChange('end_question')}
              disabled={actionLoading}
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-6 py-3 font-headline text-xs font-bold text-white shadow-soft hover:bg-rose-600 transition-all"
            >
              <span className="material-symbols-outlined">stop_circle</span>
              End Early
            </button>
          </div>
        </div>
      )}

      {/* PHASE 3: QUESTION ENDED & ANSWER REVEAL */}
      {contest?.status === 'question_ended' && currentQ && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-surface-container-lowest p-6 sm:p-8 border border-outline-variant/60 shadow-card text-center space-y-4">
            <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-headline text-xs font-extrabold">
              Answer Reveal • Question {currentIdx + 1} of {totalQ}
            </span>

            <h2 className="font-headline text-xl sm:text-2xl font-bold text-on-surface max-w-3xl mx-auto">
              {currentQ.prompt}
            </h2>

            {currentQ.explanation && (
              <p className="font-body text-xs sm:text-sm text-on-surface-variant max-w-2xl mx-auto bg-surface-container p-3 rounded-xl">
                <strong>Explanation:</strong> {currentQ.explanation}
              </p>
            )}
          </div>

          {/* 4 Options with Distribution */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {currentQ.options.map((opt, idx) => {
              const style = KAHOOT_STYLES[idx]
              const isCorrect = currentQ.correctIndex === idx
              const count = contest.optionDistribution?.[idx] || 0

              return (
                <div
                  key={idx}
                  className={`p-6 rounded-2xl font-headline font-bold text-lg flex items-center justify-between gap-4 shadow-card border-4 transition-all ${
                    isCorrect
                      ? 'border-emerald-400 ring-4 ring-emerald-400/30 ' + style.bg
                      : 'opacity-60 border-transparent ' + style.bg
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-2xl">
                        {isCorrect ? 'check_circle' : style.icon}
                      </span>
                    </span>
                    <span className="truncate">{opt}</span>
                  </div>

                  <span className="px-3 py-1 rounded-xl bg-black/30 text-white font-headline text-sm font-extrabold shrink-0">
                    {count} {count === 1 ? 'vote' : 'votes'}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Auto advance info */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <span className="inline-flex items-center gap-2 px-7 py-3.5 font-headline text-sm font-bold text-on-surface-variant animate-pulse">
              <span className="material-symbols-outlined">hourglass_empty</span>
              Automatically advancing to Leaderboard...
            </span>
          </div>
        </div>
      )}

      {/* PHASE 4: DYNAMIC LEADERBOARD (Shown for few seconds) */}
      {contest?.status === 'leaderboard' && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-gradient-to-b from-surface-container-lowest to-surface-container p-6 sm:p-8 border border-outline-variant/60 shadow-card text-center space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-headline text-xs font-extrabold flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">leaderboard</span>
                Leaderboard Standings
              </span>

              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container font-headline text-xs font-bold text-on-surface">
                <span className="material-symbols-outlined text-xs animate-spin">timelapse</span>
                Timer: {leaderboardCountdown}s
              </div>
            </div>

            <h2 className="font-headline text-2xl sm:text-3xl font-black text-on-surface">
              Top Players After Question {currentIdx + 1}
            </h2>

            {/* Leaderboard Table */}
            <div className="max-w-2xl mx-auto space-y-2.5 pt-2">
              {(contest.leaderboard || []).map((p, idx) => (
                <div
                  key={p.userId}
                  className={`p-3.5 sm:p-4 rounded-2xl flex items-center justify-between gap-3 shadow-soft border transition-all ${
                    idx === 0
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 font-extrabold'
                      : idx === 1
                      ? 'bg-slate-500/10 border-slate-400/40 text-on-surface font-bold'
                      : idx === 2
                      ? 'bg-amber-700/10 border-amber-700/30 text-on-surface font-bold'
                      : 'bg-surface-container-lowest border-outline-variant/50 text-on-surface'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center font-headline text-sm font-black">
                      {idx === 0 ? '👑 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : `#${idx + 1}`}
                    </span>
                    <div className="text-left">
                      <p className="font-headline text-sm truncate">{p.name}</p>
                      {p.streak > 1 && (
                        <p className="font-body text-[10px] text-rose-500 font-bold flex items-center gap-0.5">
                          🔥 {p.streak} in a row!
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="font-headline text-base font-black tracking-tight">
                    {p.score.toLocaleString()} pts
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Action for next question */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {isLastQuestion ? (
              <button
                onClick={() => handleStateChange('finish')}
                disabled={actionLoading}
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-7 py-3.5 font-headline text-sm font-bold text-white shadow-lift hover:bg-emerald-600 transition-all"
              >
                <span className="material-symbols-outlined">emoji_events</span>
                Finish Contest &amp; Reveal Podium!
              </button>
            ) : (
              <button
                onClick={() => handleStateChange('start_question', currentIdx + 1)}
                disabled={actionLoading}
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 font-headline text-sm font-bold text-on-primary shadow-lift hover:opacity-90 transition-all"
              >
                <span className="material-symbols-outlined">arrow_forward</span>
                Next Question ({currentIdx + 2}/{totalQ})
              </button>
            )}
          </div>
        </div>
      )}

      {/* PHASE 5: COMPLETED PODIUM FINALE */}
      {contest?.status === 'completed' && (
        <div className="space-y-6 text-center">
          <div className="rounded-3xl bg-surface-container-lowest p-8 border border-outline-variant/60 shadow-card space-y-6">
            <span className="px-4 py-1.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-headline text-xs font-extrabold inline-flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">emoji_events</span>
              Contest Completed!
            </span>

            <h2 className="font-headline text-3xl sm:text-4xl font-black text-on-surface">
              Final Champions Podium
            </h2>

            {/* Podium Visual */}
            <div className="flex items-end justify-center gap-3 sm:gap-6 pt-8 pb-4 max-w-xl mx-auto">
              {/* 2nd place */}
              {contest.leaderboard?.[1] && (
                <div className="flex-1 flex flex-col items-center">
                  <span className="text-2xl mb-1">🥈</span>
                  <div className="font-headline text-xs font-bold text-on-surface truncate max-w-[100px]">
                    {contest.leaderboard[1].name}
                  </div>
                  <p className="font-body text-[11px] text-on-surface-variant">
                    {contest.leaderboard[1].score} pts
                  </p>
                  <div className="w-full h-24 bg-slate-300 dark:bg-slate-700 rounded-t-2xl mt-2 flex items-center justify-center font-headline font-black text-xl text-on-surface">
                    2
                  </div>
                </div>
              )}

              {/* 1st place */}
              {contest.leaderboard?.[0] && (
                <div className="flex-1 flex flex-col items-center">
                  <span className="text-3xl mb-1 animate-bounce">👑</span>
                  <div className="font-headline text-sm font-black text-amber-500 truncate max-w-[120px]">
                    {contest.leaderboard[0].name}
                  </div>
                  <p className="font-body text-xs font-bold text-on-surface">
                    {contest.leaderboard[0].score} pts
                  </p>
                  <div className="w-full h-36 bg-amber-400 dark:bg-amber-500 rounded-t-2xl mt-2 flex items-center justify-center font-headline font-black text-2xl text-amber-950 shadow-lift">
                    1
                  </div>
                </div>
              )}

              {/* 3rd place */}
              {contest.leaderboard?.[2] && (
                <div className="flex-1 flex flex-col items-center">
                  <span className="text-2xl mb-1">🥉</span>
                  <div className="font-headline text-xs font-bold text-on-surface truncate max-w-[100px]">
                    {contest.leaderboard[2].name}
                  </div>
                  <p className="font-body text-[11px] text-on-surface-variant">
                    {contest.leaderboard[2].score} pts
                  </p>
                  <div className="w-full h-16 bg-amber-700/60 rounded-t-2xl mt-2 flex items-center justify-center font-headline font-black text-lg text-white">
                    3
                  </div>
                </div>
              )}
            </div>

            {/* Scoreboard list */}
            <div className="max-w-2xl mx-auto pt-6 border-t border-outline-variant/40 text-left">
              <h3 className="font-headline text-sm font-bold text-on-surface mb-3">
                Full Final Standings
              </h3>
              <div className="space-y-2">
                {(contest.leaderboard || []).map((p, idx) => (
                  <div
                    key={p.userId}
                    className="p-3 rounded-xl bg-surface-container flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-headline font-bold text-on-surface-variant w-6">
                        #{idx + 1}
                      </span>
                      <span className="font-headline font-bold text-on-surface">{p.name}</span>
                    </div>
                    <span className="font-headline font-extrabold text-primary">
                      {p.score.toLocaleString()} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => handleStateChange('open_waiting')}
                type="button"
                className="px-5 py-2.5 rounded-xl bg-surface-container font-headline text-xs font-bold text-on-surface hover:bg-surface-container-high"
              >
                Replay / Re-open Lobby
              </button>
              <Link
                to="/trainer/contests"
                className="px-6 py-2.5 rounded-xl bg-primary font-headline text-xs font-bold text-on-primary shadow-soft hover:opacity-90"
              >
                Back to Contests
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
