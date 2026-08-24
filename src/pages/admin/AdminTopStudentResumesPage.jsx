import { useEffect, useState } from 'react'
import { API_BASE_URL, apiFetch, getAuthToken } from '../../services/api'

function formatDate(value) {
  if (!value) {
    return 'Not uploaded'
  }

  return new Date(value).toLocaleString()
}

function formatSize(bytes) {
  const size = Number(bytes || 0)
  if (!size) {
    return '0 KB'
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function AdminTopStudentResumesPage() {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloadingUserId, setDownloadingUserId] = useState(null)

  const loadResumes = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch('/resumes/admin')
      setPlayers(Array.isArray(data?.players) ? data.players : [])
    } catch (loadError) {
      setError(loadError?.message || 'Failed to load top player resumes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadResumes()
  }, [])

  const downloadResume = async (player) => {
    if (!player?.resume) {
      return
    }

    setDownloadingUserId(player.userId)
    setError('')

    try {
      const token = getAuthToken()
      const response = await fetch(`${API_BASE_URL}/resumes/admin/${player.userId}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.message || 'Resume download failed')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = player.resume.fileName || `${player.username}-resume`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (downloadError) {
      setError(downloadError?.message || 'Resume download failed')
    } finally {
      setDownloadingUserId(null)
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-6xl mx-auto">
        <div className="mb-6">
          <a
            className="rounded-lg inline-flex items-center gap-2 bg-surface-container-highest px-4 py-2 font-headline text-xs font-bold hover:bg-surface-container-high"
            href="/admin"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back
          </a>
        </div>

        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10">
          <p className="font-headline text-xs text-secondary font-bold">
            Placement Vault
          </p>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight mt-3">
            Top 10 Player Resumes
          </h1>
          <p className="text-sm text-on-surface-variant mt-4 max-w-2xl">
            Download resumes uploaded by the current scoreboard top 10. Eligibility is recalculated from live XP, completed rooms, and technical score ordering.
          </p>
        </header>

        {error ? (
          <div className="rounded-2xl mt-6 bg-error/10 shadow-soft p-4">
            <p className="text-error font-headline text-sm font-bold">{error}</p>
          </div>
        ) : null}

        <section className="mt-8 bg-surface-container-lowest border border-outline-variant/40">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5 border-b border-outline-variant/40">
            <div>
              <h2 className="font-headline text-xl font-bold tracking-tight">
                Current Scoreboard Cohort
              </h2>
              <p className="text-sm text-on-surface-variant mt-1">
                {players.filter((player) => player.resume).length} of {players.length} eligible players have uploaded resumes.
              </p>
            </div>
            <button
              className="rounded-full bg-secondary text-on-secondary px-5 py-3 font-headline text-sm font-bold"
              onClick={loadResumes}
              type="button"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-10 text-center text-on-surface-variant">Loading resume vault...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-surface-container-highest">
                  <tr>
                    {['Rank', 'Player', 'Score', 'Resume', 'Uploaded', 'Action'].map((heading) => (
                      <th
                        className="px-5 py-4 font-headline text-xs text-on-surface-variant"
                        key={heading}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <tr className="border-t border-outline-variant/30" key={player.userId}>
                      <td className="px-5 py-5">
                        <span className="font-headline text-2xl font-extrabold text-secondary">#{player.rank}</span>
                      </td>
                      <td className="px-5 py-5">
                        <p className="font-headline text-sm font-bold text-on-background">
                          {player.username}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-1">
                          {player.registrationNumber || 'No registration'} · {player.email || 'No email'}
                        </p>
                      </td>
                      <td className="px-5 py-5">
                        <p className="font-headline text-lg font-bold text-primary">{player.xp} XP</p>
                        <p className="text-xs text-on-surface-variant">
                          {player.completedRooms} rooms · {player.averageTechnicalScore}% technical
                        </p>
                      </td>
                      <td className="px-5 py-5">
                        {player.resume ? (
                          <>
                            <p className="font-headline text-sm font-bold break-all">{player.resume.fileName}</p>
                            <p className="text-xs text-on-surface-variant mt-1">{formatSize(player.resume.fileSize)}</p>
                          </>
                        ) : (
                          <span className="font-headline text-xs font-bold text-on-surface-variant">
                            Pending upload
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-5 text-sm text-on-surface-variant">
                        {formatDate(player.resume?.updatedAt || player.resume?.uploadedAt)}
                      </td>
                      <td className="px-5 py-5">
                        <button
                          className="rounded-full bg-primary text-on-primary px-5 py-3 font-headline text-sm font-bold disabled:opacity-50"
                          disabled={!player.resume || downloadingUserId === player.userId}
                          onClick={() => downloadResume(player)}
                          type="button"
                        >
                          {downloadingUserId === player.userId ? 'Downloading...' : 'Download'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}

export default AdminTopStudentResumesPage
