import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { getAuthSession, logoutUser } from '../../auth'
import { API_BASE_URL, apiFetch } from '../../services/api'

const defaultCatalog = {
  name: 'Minerva Developer API',
  version: '1.1.0',
  baseUrl: `${API_BASE_URL}/developer`,
  endpoints: [],
  authentication: {
    headers: ['x-api-key: <developer_api_key>', 'Authorization: Bearer <developer_api_key>'],
  },
}

function formatDateTime(value) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function StatCard({ label, sublabel, value, tone = 'primary' }) {
  const toneClass = tone === 'secondary' ? 'border-l-secondary text-secondary' : 'border-l-primary text-primary'
  return (
    <article className={`bg-surface-container-lowest border-l-4 ${toneClass} p-5 min-h-32`}>
      <p className="font-headline text-xs font-bold text-on-surface-variant">
        {label}
      </p>
      <p className="mt-3 font-headline text-4xl font-extrabold text-on-background">{value}</p>
      {sublabel ? <p className="mt-2 text-xs text-on-surface-variant">{sublabel}</p> : null}
    </article>
  )
}

function StatusPill({ children, active }) {
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 font-headline text-xs font-bold ${active ? 'bg-secondary/15 text-secondary' : 'bg-error/15 text-error'}`}>
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-secondary' : 'bg-error'}`}></span>
      {children}
    </span>
  )
}

function EndpointCard({ endpoint, selected, onSelect }) {
  return (
    <button
      className={`flex min-h-[150px] w-full flex-col text-left border p-4 transition-colors ${selected ? 'border-secondary bg-secondary/10' : 'border-outline-variant/40 bg-surface-container-high hover:border-primary'}`}
      onClick={() => onSelect(endpoint)}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-headline text-xs text-primary font-bold">{endpoint.group}</p>
          <p className="mt-2 font-mono text-sm font-bold text-on-background break-all leading-5">{endpoint.path}</p>
        </div>
        <span className="rounded-full shrink-0 bg-surface-container-lowest px-2 py-1 font-headline text-xs font-bold text-secondary">
          {endpoint.method}
        </span>
      </div>
      <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-on-surface-variant">{endpoint.description}</p>
    </button>
  )
}

function EndpointReference({ endpoint }) {
  if (!endpoint) {
    return (
      <div className="rounded-2xl bg-surface-container-high p-4 text-sm text-on-surface-variant">
        Select an endpoint to inspect its documentation.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface-container-high p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-headline text-xs text-primary font-bold">
              {endpoint.group}
            </p>
            <p className="mt-2 break-all font-mono text-sm font-bold text-on-background">{endpoint.path}</p>
          </div>
          <span className="rounded-lg w-fit bg-surface-container-lowest px-3 py-2 font-headline text-xs font-bold text-secondary">
            {endpoint.method}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">{endpoint.description}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-container-high p-4">
          <p className="font-headline text-xs text-on-surface-variant font-bold">
            Authentication
          </p>
          <p className="mt-2 text-sm text-on-background">{endpoint.authentication}</p>
        </div>
        <div className="rounded-2xl bg-surface-container-high p-4">
          <p className="font-headline text-xs text-on-surface-variant font-bold">
            Returns
          </p>
          <p className="mt-2 text-sm text-on-background">{endpoint.returns || 'JSON response body.'}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-surface-container-high p-4">
        <p className="font-headline text-xs text-on-surface-variant font-bold">
          Parameters
        </p>
        <div className="mt-3 space-y-2">
          {(endpoint.parameters || []).map((parameter) => (
            <div className="grid grid-cols-1 gap-1 border-b border-outline-variant/20 pb-2 text-sm md:grid-cols-[130px_80px_1fr]" key={`${parameter.in}-${parameter.name}`}>
              <span className="font-mono text-secondary">{parameter.name}</span>
              <span className="text-on-surface-variant">{parameter.in}</span>
              <span className="text-on-background">{parameter.description}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-surface-container-high p-4">
        <p className="font-headline text-xs text-on-surface-variant font-bold">
          Example Response
        </p>
        <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap bg-black p-3 font-mono text-xs text-cyan-100">
          {JSON.stringify(endpoint.example || { ok: true }, null, 2)}
        </pre>
      </div>

      {endpoint.notes?.length ? (
        <div className="rounded-2xl bg-surface-container-high p-4">
          <p className="font-headline text-xs text-on-surface-variant font-bold">
            Notes
          </p>
          <ul className="mt-3 space-y-2 text-sm text-on-surface-variant">
            {endpoint.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function DeveloperDashboardPage() {
  const navigate = useNavigate()
  const session = getAuthSession()
  const [overview, setOverview] = useState(null)
  const [activeUsers, setActiveUsers] = useState([])
  const [docker, setDocker] = useState([])
  const [apiKeys, setApiKeys] = useState([])
  const [catalog, setCatalog] = useState(defaultCatalog)
  const [docs, setDocs] = useState('')
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState(null)
  const [testerKey, setTesterKey] = useState('')
  const [testerMethod, setTesterMethod] = useState('GET')
  const [testerPath, setTesterPath] = useState('/api/developer/data/all')
  const [testerBody, setTesterBody] = useState('')
  const [testerResult, setTesterResult] = useState('')
  const [activeDocTab, setActiveDocTab] = useState('reference')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false)
  const statusRefreshInFlight = useRef(false)

  const canAccess = session?.role === 'developer' || session?.role === 'admin'

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true)
      const [catalogData, overviewData, usersData, dockerData, keysData, docsData] = await Promise.all([
        apiFetch('/developer/catalog'),
        apiFetch('/developer/overview'),
        apiFetch('/developer/active-users'),
        apiFetch('/developer/docker'),
        apiFetch('/developer/api-keys'),
        apiFetch('/developer/docs'),
      ])
      setCatalog({ ...defaultCatalog, ...catalogData })
      setOverview(overviewData)
      setActiveUsers(Array.isArray(usersData?.items) ? usersData.items : [])
      setDocker(Array.isArray(dockerData?.items) ? dockerData.items : [])
      setApiKeys(Array.isArray(keysData?.items) ? keysData.items : [])
      setDocs(docsData?.markdown || '')
      setError('')
    } catch (loadError) {
      setError(loadError?.message || 'Failed to load developer dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    if (statusRefreshInFlight.current) return
    statusRefreshInFlight.current = true
    try {
      const [overviewData, usersData, dockerData] = await Promise.all([
        apiFetch('/developer/overview'),
        apiFetch('/developer/active-users'),
        apiFetch('/developer/docker'),
      ])
      setOverview(overviewData)
      setActiveUsers(Array.isArray(usersData?.items) ? usersData.items : [])
      setDocker(Array.isArray(dockerData?.items) ? dockerData.items : [])
    } catch (refreshError) {
      if (/invalid or expired token|unauthorized/i.test(refreshError?.message || '')) {
        setError(refreshError?.message || 'Failed to refresh developer status')
      }
    } finally {
      statusRefreshInFlight.current = false
    }
  }, [])

  useEffect(() => {
    if (canAccess) {
      void loadDashboard()
    }
  }, [canAccess, loadDashboard])

  useEffect(() => {
    if (!canAccess) return undefined
    const interval = window.setInterval(() => {
      void refreshStatus()
    }, 1000)
    return () => window.clearInterval(interval)
  }, [canAccess, refreshStatus])

  const runningDocker = useMemo(
    () => docker.filter((item) => String(item.status || '').toLowerCase() === 'running'),
    [docker],
  )
  const activeNow = useMemo(() => activeUsers.filter((user) => user.active), [activeUsers])
  const selectedEndpoint = useMemo(
    () => catalog.endpoints.find((endpoint) => endpoint.path === testerPath) || catalog.endpoints[0],
    [catalog.endpoints, testerPath],
  )

  const createApiKey = async (event) => {
    event.preventDefault()
    setWorking(true)
    setError('')
    setSuccess('')
    try {
      const created = await apiFetch('/developer/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName || 'Developer Key' }),
      })
      setGeneratedKey(created)
      setTesterKey(created.key || '')
      setNewKeyName('')
      setSuccess('Developer API key created. Store it now because it is shown only once.')
      await loadDashboard()
    } catch (createError) {
      setError(createError?.message || 'Failed to create API key')
    } finally {
      setWorking(false)
    }
  }

  const revokeApiKey = async (keyId) => {
    setWorking(true)
    setError('')
    setSuccess('')
    try {
      await apiFetch(`/developer/api-keys/${keyId}`, { method: 'DELETE' })
      setSuccess('API key revoked.')
      await loadDashboard()
    } catch (revokeError) {
      setError(revokeError?.message || 'Failed to revoke API key')
    } finally {
      setWorking(false)
    }
  }

  const saveDocs = async () => {
    setWorking(true)
    setError('')
    setSuccess('')
    try {
      await apiFetch('/developer/docs', {
        method: 'PUT',
        body: JSON.stringify({ markdown: docs }),
      })
      setSuccess('Developer documentation saved.')
    } catch (docsError) {
      setError(docsError?.message || 'Failed to save documentation')
    } finally {
      setWorking(false)
    }
  }

  const runTester = async (event) => {
    event.preventDefault()
    setWorking(true)
    setError('')
    setTesterResult('')
    try {
      const result = await apiFetch('/developer/test-request', {
        method: 'POST',
        suppressAuthExpiry: true,
        body: JSON.stringify({
          apiKey: testerKey,
          method: testerMethod,
          path: testerPath,
          body: testerBody,
        }),
      })
      setTesterResult(JSON.stringify(result, null, 2))
    } catch (testerError) {
      setTesterResult(JSON.stringify({ error: testerError?.message || 'Request failed' }, null, 2))
      setError(testerError?.message || 'API tester request failed')
    } finally {
      setWorking(false)
    }
  }

  const confirmLogout = () => {
    logoutUser()
    navigate('/login')
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!canAccess) {
    return <Navigate to="/" replace />
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10 pb-32">
      <section className="max-w-[1500px] mx-auto space-y-8">
        <div className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
          <header className="rounded-xl min-w-0 bg-surface-container-lowest shadow-soft p-7 md:p-9">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-headline text-xs text-primary font-bold">
                  Developer Operations
                </p>
                <h1 className="font-headline text-4xl md:text-6xl font-extrabold tracking-tight mt-3">
                  Monitoring
                </h1>
                <p className="mt-4 max-w-3xl text-sm text-on-surface-variant">
                  Live platform health, operator activity, Docker runtime state, API keys, endpoint documentation, and an API testing console.
                </p>
              </div>
              <div className="flex gap-3">
                {session.role === 'admin' ? (
                  <button
                    className="rounded-xl bg-surface-container-high px-5 py-3 font-headline text-xs font-bold"
                    onClick={() => navigate('/admin')}
                    type="button"
                  >
                    Admin
                  </button>
                ) : null}
                <button
                  className="rounded-full bg-primary px-5 py-3 font-headline text-sm font-bold text-on-primary"
                  onClick={() => setConfirmLogoutOpen(true)}
                  type="button"
                >
                  Logout
                </button>
              </div>
            </div>
          </header>

          <aside className="rounded-2xl min-w-0 bg-surface-container-lowest shadow-soft p-6">
            <p className="font-headline text-xs text-secondary font-bold">API Base URL</p>
            <p className="mt-3 break-all font-mono text-sm text-on-background">{catalog.baseUrl}</p>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface-variant">Panel Session</span>
                <StatusPill active>{session.role}</StatusPill>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface-variant">Data API Keys</span>
                <StatusPill active={apiKeys.some((key) => !key.revokedAt)}>
                  {apiKeys.filter((key) => !key.revokedAt).length} active
                </StatusPill>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface-variant">Running Docker</span>
                <StatusPill active={runningDocker.length > 0}>{runningDocker.length}</StatusPill>
              </div>
            </div>
          </aside>
        </div>

        {error ? (
          <div className="rounded-2xl bg-error/10 shadow-soft p-4">
            <p className="font-headline text-sm font-bold text-error">{error}</p>
          </div>
        ) : null}
        {success ? (
          <div className="rounded-2xl bg-secondary/10 shadow-soft p-4">
            <p className="font-headline text-sm font-bold text-secondary">{success}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="py-16 text-center text-on-surface-variant">Loading developer telemetry...</div>
        ) : (
          <>
            <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
              <StatCard label="Active Now" sublabel="Students seen in the last 30 seconds" value={activeNow.length} />
              <StatCard label="Total Users" sublabel={`${overview?.users?.operators ?? 0} operators`} value={overview?.users?.total ?? 0} tone="secondary" />
              <StatCard label="Developers" sublabel="Developer-role accounts" value={overview?.users?.developers ?? 0} />
              <StatCard label="Courses In Progress" sublabel="Open learning sessions" value={overview?.rooms?.inProgress ?? 0} tone="secondary" />
              <StatCard label="Docker Alive" sublabel="Running containers only" value={runningDocker.length} />
              <StatCard label="Practical Courses" sublabel={`${overview?.rooms?.theoretical ?? 0} theoretical`} value={overview?.rooms?.practical ?? 0} tone="secondary" />
            </section>

            <section className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] gap-6">
              <div className="rounded-2xl min-w-0 bg-surface-container-lowest p-6 shadow-soft">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-headline text-xs text-primary font-bold">Monitoring System</p>
                    <h2 className="font-headline text-2xl font-extrabold">Current Active Users</h2>
                  </div>
                  <button
                    className="rounded-lg bg-surface-container-high px-4 py-2 font-headline text-xs font-bold"
                    onClick={() => void loadDashboard()}
                    type="button"
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-outline-variant/30">
                        <th className="py-3 pr-4 font-headline text-xs">Status</th>
                        <th className="py-3 pr-4 font-headline text-xs">User</th>
                        <th className="py-3 pr-4 font-headline text-xs">Solving</th>
                        <th className="py-3 pr-4 font-headline text-xs">Docker</th>
                        <th className="py-3 pr-4 font-headline text-xs">Last Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeNow.map((user) => (
                        <tr className="border-b border-outline-variant/10" key={user.id}>
                          <td className="py-4 pr-4">
                            <StatusPill active={user.active}>{user.active ? 'online' : 'idle'}</StatusPill>
                          </td>
                          <td className="py-4 pr-4">
                            <p className="font-headline font-bold">{user.username}</p>
                            <p className="text-xs text-on-surface-variant">{user.registrationNumber || user.email || user.role}</p>
                          </td>
                          <td className="py-4 pr-4 text-on-surface-variant">
                            {user.currentRoom?.title || 'No active skill'}
                          </td>
                          <td className="py-4 pr-4 text-on-surface-variant">
                            {user.docker?.containerName || user.docker?.status || 'None'}
                          </td>
                          <td className="py-4 pr-4 text-on-surface-variant">{formatDateTime(user.lastSeenAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!activeNow.length ? (
                    <p className="rounded-2xl mt-4 bg-surface-container-high p-4 text-sm text-on-surface-variant">
                      No users are currently active on the platform.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl min-w-0 bg-surface-container-lowest p-6 shadow-soft">
                <p className="font-headline text-xs text-secondary font-bold">Container Runtime</p>
                <h2 className="font-headline text-2xl font-extrabold">Running environments</h2>
                <div className="mt-5 space-y-3 max-h-[500px] overflow-y-auto pr-2">
                  {runningDocker.map((machine) => (
                    <article className="rounded-2xl bg-surface-container-high p-4" key={machine.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-headline text-sm font-bold">{machine.roomTitle || machine.roomId}</p>
                          <p className="mt-1 text-xs text-on-surface-variant">{machine.username || 'Unknown user'}</p>
                        </div>
                        <StatusPill active={machine.status === 'running'}>{machine.status}</StatusPill>
                      </div>
                      <p className="mt-3 break-all text-xs text-on-surface-variant">{machine.containerName}</p>
                      <p className="mt-2 text-xs text-on-surface-variant">Updated: {formatDateTime(machine.updatedAt)}</p>
                    </article>
                  ))}
                  {!runningDocker.length ? <p className="text-sm text-on-surface-variant">No alive Docker instances right now.</p> : null}
                </div>
              </div>
            </section>

            <section className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-6">
              <div className="rounded-2xl min-w-0 bg-surface-container-lowest p-6 shadow-soft">
                <p className="font-headline text-xs text-primary font-bold">Key Vault</p>
                <h2 className="font-headline text-2xl font-extrabold">Developer API Keys</h2>
                <p className="mt-2 text-sm text-on-surface-variant">
                  Exported data endpoints require a developer API key. Login tokens can manage keys, but cannot call `/data` endpoints directly.
                </p>
                <form className="mt-5 flex min-w-0 flex-col sm:flex-row gap-3" onSubmit={createApiKey}>
                  <input
                    className="rounded-xl min-w-0 flex-1 bg-surface-container-highest  px-4 py-3 outline-none"
                    onChange={(event) => setNewKeyName(event.target.value)}
                    placeholder="Key name, e.g. SIEM collector"
                    type="text"
                    value={newKeyName}
                  />
                  <button
                    className="rounded-full bg-primary px-5 py-3 font-headline text-sm font-bold text-on-primary disabled:opacity-50"
                    disabled={working}
                    type="submit"
                  >
                    Create Key
                  </button>
                </form>
                {generatedKey ? (
                  <div className="rounded-2xl mt-5 bg-secondary/10 shadow-soft p-4">
                    <p className="font-headline text-xs text-secondary font-bold">
                      Copy this key now
                    </p>
                    <p className="mt-2 break-all font-mono text-sm text-on-background">{generatedKey.key}</p>
                  </div>
                ) : null}
                <div className="mt-5 space-y-3">
                  {apiKeys.map((key) => (
                    <article className="rounded-2xl min-w-0 bg-surface-container-high p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" key={key.id}>
                      <div className="min-w-0">
                        <p className="font-headline text-sm font-bold">{key.name}</p>
                        <p className="mt-1 font-mono text-xs text-on-surface-variant">{key.key}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">Last used: {formatDateTime(key.lastUsedAt)}</p>
                      </div>
                      <button
                        className="rounded-lg bg-error px-4 py-2 font-headline text-xs font-bold text-on-error disabled:opacity-50"
                        disabled={working || Boolean(key.revokedAt)}
                        onClick={() => void revokeApiKey(key.id)}
                        type="button"
                      >
                        {key.revokedAt ? 'Revoked' : 'Revoke'}
                      </button>
                    </article>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl min-w-0 bg-surface-container-lowest p-6 shadow-soft">
                <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-headline text-xs text-secondary font-bold">Swagger-Style API Tester</p>
                    <h2 className="font-headline text-2xl font-extrabold">Try Endpoint</h2>
                  </div>
                  <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-on-surface-variant lg:max-w-[420px]">{catalog.baseUrl}</span>
                </div>
                <form className="mt-5 space-y-4" onSubmit={runTester}>
                  <label className="block">
                    <span className="font-headline text-xs text-on-surface-variant font-bold">Developer API Key</span>
                    <input
                      className="rounded-xl mt-2 w-full bg-surface-container-highest  px-4 py-3 outline-none"
                      onChange={(event) => setTesterKey(event.target.value)}
                      placeholder="icx_dev_..."
                      type="password"
                      value={testerKey}
                    />
                  </label>
                  <div className="grid min-w-0 grid-cols-1 md:grid-cols-[150px_minmax(0,1fr)] gap-3">
                    <select
                      className="rounded-xl bg-surface-container-highest  px-4 py-3 outline-none"
                      onChange={(event) => setTesterMethod(event.target.value)}
                      value={testerMethod}
                    >
                      <option value="GET">GET</option>
                    </select>
                    <input
                      className="rounded-xl min-w-0 bg-surface-container-highest  px-4 py-3 font-mono text-sm outline-none"
                      onChange={(event) => setTesterPath(event.target.value)}
                      value={testerPath}
                    />
                  </div>
                  <textarea
                    className="rounded-2xl min-h-20 w-full bg-surface-container-highest  p-4 font-mono text-sm outline-none"
                    onChange={(event) => setTesterBody(event.target.value)}
                    placeholder="Optional JSON body for future POST/PATCH endpoints"
                    value={testerBody}
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-on-surface-variant">
                      Selected: {selectedEndpoint?.description || 'Custom developer data endpoint'}
                    </p>
                    <button
                      className="rounded-full bg-secondary px-5 py-3 font-headline text-sm font-bold text-on-secondary disabled:opacity-50"
                      disabled={working}
                      type="submit"
                    >
                      Execute
                    </button>
                  </div>
                </form>
                <pre className="mt-5 max-h-[420px] max-w-full overflow-auto whitespace-pre bg-black text-cyan-100 p-4 text-xs leading-relaxed">
                  {testerResult || 'Execute an endpoint to inspect status, request metadata, and JSON response.'}
                </pre>
              </div>
            </section>

            <section className="grid min-w-0 grid-cols-1 items-start xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-6">
              <div className="rounded-2xl min-w-0 bg-surface-container-lowest p-6 shadow-soft">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-headline text-xs text-primary font-bold">Documentation</p>
                    <h2 className="font-headline text-2xl font-extrabold">Developer Docs</h2>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className={`px-3 py-2 font-headline text-xs font-bold ${activeDocTab === 'reference' ? 'bg-primary text-on-primary' : 'bg-surface-container-high'}`}
                      onClick={() => setActiveDocTab('reference')}
                      type="button"
                    >
                      Reference
                    </button>
                    <button
                      className={`px-3 py-2 font-headline text-xs font-bold ${activeDocTab === 'notes' ? 'bg-primary text-on-primary' : 'bg-surface-container-high'}`}
                      onClick={() => setActiveDocTab('notes')}
                      type="button"
                    >
                      Notes
                    </button>
                  </div>
                </div>

                {activeDocTab === 'reference' ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-2xl bg-surface-container-high p-4">
                      <p className="font-headline text-xs text-on-surface-variant font-bold">Authentication</p>
                      <pre className="mt-3 whitespace-pre-wrap font-mono text-xs text-on-background">
{`x-api-key: <developer_api_key>
Authorization: Bearer <developer_api_key>`}
                      </pre>
                    </div>
                    <div className="rounded-2xl bg-surface-container-high p-4">
                      <p className="font-headline text-xs text-on-surface-variant font-bold">Curl Example</p>
                      <pre className="mt-3 whitespace-pre-wrap break-all font-mono text-xs text-on-background">
{`curl ${catalog.baseUrl}/data/all \\
  -H "x-api-key: <developer_api_key>"`}
                      </pre>
                    </div>
                    <p className="text-sm leading-relaxed text-on-surface-variant">
                      Data endpoints are intentionally API-key-only. Use this panel to create a key, then test the key in the API tester or from an external script.
                    </p>
                    <EndpointReference endpoint={selectedEndpoint} />
                  </div>
                ) : (
                  <div className="mt-5">
                    <textarea
                      className="rounded-2xl min-h-[300px] w-full bg-surface-container-highest  p-4 font-mono text-sm outline-none"
                      onChange={(event) => setDocs(event.target.value)}
                      value={docs}
                    />
                    <button
                      className="rounded-full mt-3 bg-primary px-5 py-3 font-headline text-sm font-bold text-on-primary disabled:opacity-50"
                      disabled={working}
                      onClick={() => void saveDocs()}
                      type="button"
                    >
                      Save Docs
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl min-w-0 bg-surface-container-lowest p-6 shadow-soft">
                <p className="font-headline text-xs text-secondary font-bold">Endpoint Catalog</p>
                <h2 className="font-headline text-2xl font-extrabold">Available Data Endpoints</h2>
                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {catalog.endpoints.map((endpoint) => (
                    <EndpointCard
                      endpoint={endpoint}
                      key={endpoint.path}
                      onSelect={(nextEndpoint) => {
                        setTesterMethod(nextEndpoint.method)
                        setTesterPath(nextEndpoint.path)
                      }}
                      selected={testerPath === endpoint.path}
                    />
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </section>

      {confirmLogoutOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <section className="w-full max-w-md border border-outline-variant bg-surface-container-lowest shadow-2xl">
            <div className="shadow-soft p-6">
              <p className="font-headline text-xs font-bold text-primary">
                Session Control
              </p>
              <h2 className="mt-3 font-headline text-3xl font-extrabold text-on-background">
                Confirm Logout
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                Are you sure you want to end this developer session? Unsaved documentation edits or copied API keys may be lost.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  className="rounded-xl bg-surface-container-high px-5 py-3 font-headline text-xs font-bold text-on-background"
                  onClick={() => setConfirmLogoutOpen(false)}
                  type="button"
                >
                  Stay Logged In
                </button>
                <button
                  className="rounded-full bg-primary px-5 py-3 font-headline text-sm font-bold text-on-primary"
                  onClick={confirmLogout}
                  type="button"
                >
                  Logout
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default DeveloperDashboardPage
