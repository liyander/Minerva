import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../services/api'

function primaryContainerName(container) {
  return String(container?.names || '').split(',')[0].trim()
}

function AdminRunningEnvironmentsPage() {
  const navigate = useNavigate()
  const [containers, setContainers] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const loadContainers = async () => {
    setLoading(true)
    setMessage('')
    try {
      const response = await apiFetch('/rooms/docker-config/containers')
      setContainers(Array.isArray(response?.containers) ? response.containers : [])
    } catch (error) {
      setContainers([])
      setMessage(error?.message || 'Unable to load running machines.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadContainers()
    const intervalId = window.setInterval(loadContainers, 10000)
    return () => window.clearInterval(intervalId)
  }, [])

  const stopContainer = async (container) => {
    const name = primaryContainerName(container)
    if (!name) return
    setMessage('')
    try {
      await apiFetch(`/rooms/docker-config/containers/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
      await loadContainers()
    } catch (error) {
      setMessage(error?.message || 'Unable to stop machine.')
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-7xl mx-auto space-y-8">
        <button
          className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold"
          onClick={() => navigate('/admin')}
          type="button"
        >
          Back
        </button>

        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10">
          <p className="font-headline text-xs text-secondary font-bold">
            Live Lab Runtime
          </p>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight mt-3">
            Running Machines
          </h1>
          <p className="text-sm text-on-surface-variant mt-4 max-w-3xl">
            Monitor active Minerva Docker machines spawned by practical labs and stop stale sessions.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-soft">
            <p className="font-headline text-xs text-on-surface-variant font-bold">
              Active Machines
            </p>
            <p className="mt-2 font-headline text-4xl font-extrabold text-secondary">{containers.length}</p>
          </div>
          <div className="rounded-2xl bg-surface-container-lowest p-5 md:col-span-2 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div>
              <p className="font-headline text-lg font-extrabold">Runtime Feed</p>
              <p className="text-sm text-on-surface-variant">
                Auto-refreshes every 10 seconds while this page is open.
              </p>
            </div>
            <button
              className="rounded-full bg-secondary text-on-secondary px-5 py-3 font-headline text-sm font-bold disabled:opacity-60"
              disabled={loading}
              onClick={() => {
                void loadContainers()
              }}
              type="button"
            >
              {loading ? 'Refreshing...' : 'Refresh Now'}
            </button>
          </div>
        </section>

        {message ? (
          <p className="rounded-xl bg-error/10 shadow-soft px-4 py-3 text-sm text-error">
            {message}
          </p>
        ) : null}

        <section className="rounded-2xl bg-surface-container-lowest p-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="py-3 pr-4 font-headline text-xs text-on-surface-variant">Environment</th>
                  <th className="py-3 pr-4 font-headline text-xs text-on-surface-variant">Image</th>
                  <th className="py-3 pr-4 font-headline text-xs text-on-surface-variant">Ports</th>
                  <th className="py-3 pr-4 font-headline text-xs text-on-surface-variant">Status</th>
                  <th className="py-3 pr-4 font-headline text-xs text-on-surface-variant">Created</th>
                  <th className="py-3 text-right font-headline text-xs text-on-surface-variant">Action</th>
                </tr>
              </thead>
              <tbody>
                {containers.map((container) => (
                  <tr className="border-b border-outline-variant/30" key={container.id || container.names}>
                    <td className="py-4 pr-4">
                      <p className="font-headline text-sm font-bold text-on-background break-all">{container.names}</p>
                      <p className="mt-1 text-[11px] text-on-surface-variant break-all">{container.id}</p>
                    </td>
                    <td className="py-4 pr-4 text-sm text-on-surface-variant break-all">{container.image}</td>
                    <td className="py-4 pr-4 text-sm text-on-surface-variant break-all">{container.ports || 'No published ports'}</td>
                    <td className="py-4 pr-4 text-sm text-on-surface-variant">{container.status || 'Running'}</td>
                    <td className="py-4 pr-4 text-sm text-on-surface-variant">
                      {container.createdAt ? new Date(container.createdAt).toLocaleString() : 'Unknown'}
                    </td>
                    <td className="py-4 text-right">
                      <button
                        className="rounded-lg bg-error text-on-error px-4 py-2 font-headline text-xs font-bold"
                        onClick={() => {
                          void stopContainer(container)
                        }}
                        type="button"
                      >
                        Stop
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!containers.length && !loading ? (
            <div className="rounded-2xl mt-6 bg-surface-container-high p-6 text-sm text-on-surface-variant">
              No active Minerva machines are running.
            </div>
          ) : null}
        </section>
      </section>
    </main>
  )
}

export default AdminRunningEnvironmentsPage
