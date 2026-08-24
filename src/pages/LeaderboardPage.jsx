import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { apiFetch } from '../services/api'

function LeaderboardPage() {
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadScoreboard = async () => {
      setIsLoading(true)
      setError('')

      try {
        const response = await apiFetch('/rooms/scoreboard/summary')
        if (!cancelled) {
          setRows(Array.isArray(response) ? response : [])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || 'Failed to load scoreboard')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadScoreboard()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="bg-surface min-h-screen p-8 lg:p-12 mt-16 md:mt-20">
      <PageHeader
        accent="butter"
        description="See how you compare across completed courses, points earned and assessment scores."
        eyebrow="Rankings"
        icon="leaderboard"
        title="Leaderboard"
      />

      <div className="h-6"></div>

      <section className="rounded-3xl bg-surface-container-lowest shadow-soft overflow-hidden">
        <div className="grid grid-cols-[5rem_minmax(12rem,1fr)_8rem_8rem_8rem_8rem] gap-4 px-6 py-4 bg-surface-container-low font-headline text-xs text-on-surface-variant font-bold">
          <span>Rank</span>
          <span>Student</span>
          <span>XP</span>
          <span>Courses</span>
          <span>Technical</span>
          <span>Grammar</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-on-surface-variant font-body">Loading leaderboard...</div>
        ) : error ? (
          <div className="p-8 text-error font-body">{error}</div>
        ) : rows.length ? (
          rows.map((row) => (
            <div
              className="rounded-2xl grid grid-cols-[5rem_minmax(12rem,1fr)_8rem_8rem_8rem_8rem] gap-4 px-6 py-5 border-t border-outline-variant/30 items-center"
              key={row.userId}
            >
              <span className="font-headline text-2xl font-bold text-primary">#{row.rank}</span>
              <div>
                <p className="font-headline text-sm font-bold text-on-background">
                  {row.username}
                </p>
                <p className="text-xs text-on-surface-variant">
                  Last clear: {row.lastCompletedAt ? new Date(row.lastCompletedAt).toLocaleDateString() : 'N/A'}
                </p>
              </div>
              <span className="font-headline font-bold text-on-background">{row.xp}</span>
              <span className="font-headline font-bold text-on-background">{row.completedRooms}</span>
              <span className="font-headline font-bold text-primary">{row.averageTechnicalScore}</span>
              <span className="font-headline font-bold text-secondary">{row.averageGrammarScore}</span>
            </div>
          ))
        ) : (
          <div className="p-8 text-on-surface-variant font-body">No completed courses yet.</div>
        )}
      </section>
    </main>
  )
}

export default LeaderboardPage
