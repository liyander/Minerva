import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../services/api'
import { getAuthSession } from '../../auth'

const KAHOOT_CHOICES = [
  { bg: 'bg-rose-500 hover:bg-rose-600 text-white', ring: 'ring-rose-400', icon: 'change_history', label: 'Triangle' },
  { bg: 'bg-blue-500 hover:bg-blue-600 text-white', ring: 'ring-blue-400', icon: 'diamond', label: 'Diamond' },
  { bg: 'bg-amber-500 hover:bg-amber-600 text-white', ring: 'ring-amber-400', icon: 'circle', label: 'Circle' },
  { bg: 'bg-emerald-500 hover:bg-emerald-600 text-white', ring: 'ring-emerald-400', icon: 'square', label: 'Square' },
]

export default function ContestPlayPage() {
  const { id: contestId } = useParams()
  const navigate = useNavigate()
  const authSession = getAuthSession()

  const [contest, setContest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedOption, setSelectedOption] = useState(null)
  const [submittingAnswer, setSubmittingAnswer] = useState(false)
  const [answerResult, setAnswerResult] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [lastAnsweredQIdx, setLastAnsweredQIdx] = useState(-1)
  const [questionStartTimestamp, setQuestionStartTimestamp] = useState(null)

  const pollingRef = useRef(null)

  const loadData = async () => {
    try {
      const data = await apiFetch(`/contests/${contestId}/live`)
      setContest(data)

      // Sync user answer if already answered on backend
      if (data?.myAnswer && selectedOption === null) {
        setSelectedOption(data.myAnswer.selectedIndex)
        setAnswerResult({
          isCorrect: data.myAnswer.isCorrect,
          pointsAwarded: data.myAnswer.pointsAwarded,
        })
      }
    } catch (err) {
      console.error('Failed to poll live contest play:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    pollingRef.current = window.setInterval(loadData, 1000)
    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current)
    }
  }, [contestId])

  // Detect when question changes to reset selected option
  useEffect(() => {
    if (contest?.status === 'live' && contest?.currentQuestionIndex !== lastAnsweredQIdx) {
      setSelectedOption(contest?.myAnswer ? contest.myAnswer.selectedIndex : null)
      setAnswerResult(contest?.myAnswer || null)
      setLastAnsweredQIdx(contest.currentQuestionIndex)
      setQuestionStartTimestamp(Date.now())
    }
  }, [contest?.currentQuestionIndex, contest?.status, contest?.myAnswer, lastAnsweredQIdx])

  // Timer countdown
  useEffect(() => {
    if (contest?.status === 'live' && contest?.currentQuestion && contest?.currentQuestionStartedAt) {
      const started = new Date(contest.currentQuestionStartedAt).getTime()
      const limitMs = (contest.currentQuestion.timeLimitSeconds || 20) * 1000

      const updateTimer = () => {
        const elapsed = Date.now() - started
        const left = Math.max(0, Math.ceil((limitMs - elapsed) / 1000))
        setTimeRemaining(left)
      }

      updateTimer()
      const timerId = window.setInterval(updateTimer, 300)
      return () => window.clearInterval(timerId)
    }
  }, [contest?.status, contest?.currentQuestion, contest?.currentQuestionStartedAt])

  const handleSelectAnswer = async (index) => {
    if (selectedOption !== null || submittingAnswer || contest?.status !== 'live') return

    try {
      setSelectedOption(index)
      setSubmittingAnswer(true)

      const responseTimeMs = questionStartTimestamp
        ? Date.now() - questionStartTimestamp
        : 1500

      const res = await apiFetch(`/contests/${contestId}/answer`, {
        method: 'POST',
        body: JSON.stringify({
          questionIndex: contest.currentQuestionIndex,
          selectedIndex: index,
          responseTimeMs,
        }),
      })

      setAnswerResult(res)
    } catch (err) {
      console.error('Answer submission error:', err)
    } finally {
      setSubmittingAnswer(false)
    }
  }

  if (loading && !contest) {
    return (
      <div className="p-12 text-center text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
        <p className="mt-2 font-headline text-sm font-semibold">Connecting to live quiz arena...</p>
      </div>
    )
  }

  const currentQ = contest?.currentQuestion
  const currentIdx = contest?.currentQuestionIndex ?? -1
  const totalQ = contest?.totalQuestions || 0
  const myParticipant = contest?.myParticipant

  // Check enrollment permission
  if (myParticipant && myParticipant.status === 'pending') {
    return (
      <div className="p-4 sm:p-8 max-w-xl mx-auto text-center space-y-6">
        <div className="rounded-3xl bg-surface-container-lowest p-8 border border-outline-variant/60 shadow-card space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-3xl animate-spin">timelapse</span>
          </div>
          <h2 className="font-headline text-2xl font-black text-on-surface">
            Waiting for Trainer Approval
          </h2>
          <p className="font-body text-sm text-on-surface-variant">
            Your enrollment request for <strong>{contest?.title}</strong> has been submitted. As soon as the trainer accepts your request, this arena will unlock automatically!
          </p>
          <Link
            to="/contests"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container font-headline text-xs font-bold text-on-surface hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to Contests List
          </Link>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-[calc(100dvh-5rem)] p-3 pt-24 pb-6 sm:p-6 sm:pt-24 max-w-4xl mx-auto flex flex-col space-y-4">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-2 bg-surface-container-lowest p-3 sm:p-4 rounded-2xl border border-outline-variant/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            to="/contests"
            className="p-1.5 rounded-xl text-on-surface-variant hover:bg-surface-container"
            title="Leave Arena"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </Link>
          <div className="min-w-0">
            <p className="font-headline text-xs font-bold text-primary truncate">
              {contest?.title}
            </p>
            <p className="font-body text-[11px] text-on-surface-variant">
              Trainee: <strong>{authSession?.username || 'You'}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {myParticipant?.rank && (
            <span className="px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container font-headline text-xs font-black">
              Rank #{myParticipant.rank}
            </span>
          )}
          <span className="px-3 py-1 rounded-full bg-primary text-on-primary font-headline text-xs font-black shadow-soft">
            {myParticipant?.score?.toLocaleString() || 0} pts
          </span>
        </div>
      </div>

      {/* 1. LOBBY WAITING SCREEN */}
      {(contest?.status === 'waiting' || contest?.status === 'draft') && (
        <div className="my-auto text-center space-y-6 max-w-md mx-auto py-8">
          <div className="w-20 h-20 rounded-3xl bg-primary/15 text-primary flex items-center justify-center mx-auto shadow-card animate-bounce">
            <span className="material-symbols-outlined text-4xl">sports_esports</span>
          </div>

          <div className="space-y-2">
            <h2 className="font-headline text-3xl font-black text-on-surface">
              You&apos;re in the Arena!
            </h2>
            <p className="font-body text-sm text-on-surface-variant">
              Waiting for the trainer to launch the first question. Keep this window open and get ready to answer fast for maximum points!
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-headline font-black flex items-center justify-center">
                ✓
              </div>
              <div className="text-left">
                <p className="font-headline text-xs font-bold text-on-surface">Enrollment Approved</p>
                <p className="font-body text-[11px] text-on-surface-variant">
                  {contest?.approvedParticipantsCount || 1} Trainees Ready
                </p>
              </div>
            </div>

            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
          </div>
        </div>
      )}

      {/* 2. LIVE ACTIVE QUESTION ROUND */}
      {contest?.status === 'live' && currentQ && (
        <div className="my-auto space-y-4 sm:space-y-6 w-full">
          {/* Question Banner & Timer */}
          <div className="rounded-3xl bg-surface-container-lowest p-5 sm:p-8 border border-outline-variant/60 shadow-card text-center space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-headline text-xs font-extrabold">
                Question {currentIdx + 1} of {totalQ}
              </span>

              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center font-headline text-base font-black border-4 transition-all ${
                  timeRemaining <= 5
                    ? 'border-rose-500 text-rose-500 bg-rose-500/10 animate-ping'
                    : 'border-primary text-primary bg-primary/10'
                }`}
              >
                {timeRemaining}s
              </div>
            </div>

            <h2 className="font-headline text-xl sm:text-2xl font-black text-on-surface pt-1">
              {currentQ.prompt}
            </h2>

            {selectedOption !== null && (
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-primary/15 text-primary font-headline text-xs font-bold animate-pulse">
                <span className="material-symbols-outlined text-[16px]">lock</span>
                Answer Locked In! Waiting for round to end...
              </div>
            )}
          </div>

          {/* 4 Large Kahoot Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {currentQ.options.map((opt, idx) => {
              const style = KAHOOT_CHOICES[idx]
              const isSelected = selectedOption === idx
              const isOtherSelected = selectedOption !== null && !isSelected

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectAnswer(idx)}
                  disabled={selectedOption !== null || submittingAnswer}
                  type="button"
                  className={`p-6 sm:p-8 rounded-2xl font-headline font-extrabold text-base sm:text-lg flex items-center gap-4 transition-all transform active:scale-95 shadow-card text-left ${
                    style.bg
                  } ${
                    isSelected
                      ? 'ring-4 ring-white shadow-lift scale-[1.02]'
                      : isOtherSelected
                      ? 'opacity-40 grayscale-[40%]'
                      : 'hover:scale-[1.01]'
                  }`}
                >
                  <span className="w-10 h-10 rounded-xl bg-black/25 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-2xl">{style.icon}</span>
                  </span>
                  <span className="flex-1">{opt}</span>
                  {isSelected && (
                    <span className="material-symbols-outlined text-2xl animate-bounce">
                      check_circle
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 3. QUESTION ENDED & INSTANT ANSWER RESULT */}
      {contest?.status === 'question_ended' && (
        <div className="my-auto text-center space-y-6 max-w-md mx-auto py-4">
          {answerResult?.isCorrect ? (
            <div className="rounded-3xl bg-emerald-500/15 border border-emerald-500/40 p-8 shadow-card space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto text-3xl font-black shadow-soft">
                ✓
              </div>
              <h2 className="font-headline text-3xl font-black text-emerald-600 dark:text-emerald-400">
                CORRECT!
              </h2>
              <p className="font-headline text-xl font-black text-on-surface">
                +{answerResult.pointsAwarded || 500} Points
              </p>
              {myParticipant?.streak > 1 && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/20 text-rose-500 font-headline text-xs font-extrabold">
                  🔥 Streak Multiplier: {myParticipant.streak} In A Row!
                </span>
              )}
            </div>
          ) : (
            <div className="rounded-3xl bg-rose-500/15 border border-rose-500/40 p-8 shadow-card space-y-4">
              <div className="w-16 h-16 rounded-full bg-rose-500 text-white flex items-center justify-center mx-auto text-3xl font-black shadow-soft">
                ✕
              </div>
              <h2 className="font-headline text-3xl font-black text-rose-500">
                INCORRECT
              </h2>
              <p className="font-body text-xs text-on-surface-variant">
                Nice effort! Get ready for the next question to score points.
              </p>
            </div>
          )}

          {currentQ?.explanation && (
            <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/60 text-left">
              <p className="font-headline text-xs font-bold text-on-surface mb-1">
                Answer Explanation:
              </p>
              <p className="font-body text-xs text-on-surface-variant">{currentQ.explanation}</p>
            </div>
          )}
        </div>
      )}

      {/* 4. DYNAMIC LEADERBOARD (Intermission few seconds) */}
      {contest?.status === 'leaderboard' && (
        <div className="my-auto space-y-6 max-w-xl mx-auto w-full py-4">
          <div className="rounded-3xl bg-surface-container-lowest p-6 sm:p-8 border border-outline-variant/60 shadow-card text-center space-y-4">
            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-headline text-xs font-extrabold inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">leaderboard</span>
              Live Leaderboard
            </span>

            <h2 className="font-headline text-2xl font-black text-on-surface">
              Current Standings
            </h2>

            {/* Trainee Rank Banner */}
            <div className="p-4 rounded-2xl bg-primary text-on-primary shadow-soft flex items-center justify-between">
              <div className="text-left">
                <p className="font-body text-xs text-on-primary/80">Your Rank Position</p>
                <p className="font-headline text-xl font-black">
                  #{myParticipant?.rank || '-'} Place
                </p>
              </div>
              <p className="font-headline text-2xl font-black">
                {myParticipant?.score?.toLocaleString()} pts
              </p>
            </div>

            {/* Top 5 Board */}
            <div className="space-y-2 text-left pt-2">
              {(contest.leaderboard || []).slice(0, 5).map((p, idx) => (
                <div
                  key={p.userId}
                  className={`p-3 rounded-xl flex items-center justify-between gap-3 text-xs border ${
                    p.userId === authSession?.userId
                      ? 'bg-primary/15 border-primary text-primary font-extrabold'
                      : 'bg-surface-container border-outline-variant/40 text-on-surface font-semibold'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-center font-bold">
                      {idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                    </span>
                    <span>{p.name}</span>
                  </div>
                  <span className="font-headline font-black">{p.score.toLocaleString()} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. FINAL PODIUM / COMPLETED */}
      {contest?.status === 'completed' && (
        <div className="my-auto text-center space-y-6 max-w-md mx-auto py-6">
          <div className="rounded-3xl bg-surface-container-lowest p-8 border border-outline-variant/60 shadow-card space-y-6">
            <span className="px-4 py-1.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-headline text-xs font-extrabold inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">emoji_events</span>
              Quiz Completed!
            </span>

            <h2 className="font-headline text-3xl font-black text-on-surface">
              Great Game!
            </h2>

            <div className="p-6 rounded-2xl bg-surface-container space-y-3">
              <p className="font-body text-xs text-on-surface-variant font-semibold">
                Your Final Rank
              </p>
              <p className="font-headline text-4xl font-black text-primary">
                #{myParticipant?.rank || 1}
              </p>
              <p className="font-headline text-lg font-bold text-on-surface">
                Total Score: {myParticipant?.score?.toLocaleString()} pts
              </p>
            </div>

            <Link
              to="/contests"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-headline text-xs font-bold text-on-primary shadow-soft hover:opacity-90 transition-all"
            >
              Back to Contests
            </Link>
          </div>
        </div>
      )}
    </main>
  )
}
