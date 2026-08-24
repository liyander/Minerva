import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { apiFetch } from '../../services/api'

function StatTile({ accent, label, value }) {
  return (
    <div className={`rounded-2xl ${accent} px-5 py-4`}>
      <p className="font-headline text-3xl font-extrabold leading-none">{value}</p>
      <p className="font-body text-xs opacity-80 mt-2">{label}</p>
    </div>
  )
}

function AdminDatabasePage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [message, setMessage] = useState(null)
  const [showAllTables, setShowAllTables] = useState(false)
  const [confirmReseed, setConfirmReseed] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const response = await apiFetch('/database/status')
      setStatus(response)
      return response
    } catch (error) {
      setMessage({ tone: 'error', text: error?.message || 'Could not read the database status.' })
      setStatus(null)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const runAction = async (action, path, body) => {
    setBusyAction(action)
    setMessage(null)

    try {
      const response = await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      })

      const details = []
      if (response.created?.length) {
        details.push(`Created: ${response.created.join(', ')}`)
      }
      if (response.columnsAdded?.length) {
        details.push(`Columns added: ${response.columnsAdded.join(', ')}`)
      }
      if (response.featureErrors?.length) {
        details.push(`Warnings: ${response.featureErrors.join(' · ')}`)
      }
      if (response.report?.length) {
        details.push(
          response.report
            .map((step) =>
              step.skipped ? `${step.table}: skipped (${step.skipped})` : `${step.table}: +${step.inserted}`,
            )
            .join(' · '),
        )
      }

      setMessage({
        tone: response.featureErrors?.length ? 'warn' : 'success',
        text: response.message,
        details,
      })

      await loadStatus()
    } catch (error) {
      setMessage({ tone: 'error', text: error?.message || 'The action failed.' })
    } finally {
      setBusyAction('')
      setConfirmReseed(false)
    }
  }

  const missingCount = status?.missingTables?.length ?? 0
  const hasSchema = Boolean(status) && missingCount === 0
  const tables = status?.tables || []
  const visibleTables = showAllTables ? tables : tables.filter((table) => !table.exists || table.rows > 0)

  const toneClass = {
    success: 'bg-mint text-on-mint',
    warn: 'bg-butter text-on-butter',
    error: 'bg-blush text-on-blush',
  }

  const actionButton =
    'rounded-full px-6 py-3 font-headline text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24">
      <div className="mx-auto max-w-6xl space-y-6">
        <button
          className="inline-flex items-center gap-1 font-headline text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={() => navigate('/admin')}
          type="button"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to admin
        </button>

        <PageHeader
          accent="sky"
          description="Create every table the platform needs and load a set of starter courses, paths and resources so the site is usable straight away."
          eyebrow="Maintenance"
          icon="database"
          title="Database setup"
        />

        {isLoading ? (
          <div className="rounded-3xl bg-surface-container-lowest p-10 text-center shadow-soft">
            <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            <p className="font-body text-sm text-on-surface-variant mt-4">Checking the database…</p>
          </div>
        ) : null}

        {!isLoading && !status ? (
          <div className="rounded-3xl bg-blush p-6 text-on-blush">
            <p className="font-headline text-base font-extrabold">Could not reach the database</p>
            <p className="font-body text-sm opacity-80 mt-2">
              Check the connection details in <code>backend/.env</code> and that the MySQL server is
              running, then reload this page.
            </p>
          </div>
        ) : null}

        {status ? (
          <>
            {status.setupMode ? (
              <div className="rounded-3xl bg-butter p-5 text-on-butter">
                <p className="font-headline text-sm font-extrabold">First-run setup mode</p>
                <p className="font-body text-sm opacity-80 mt-1">
                  No administrator account exists yet, so this screen is open without sign-in. As
                  soon as an admin account is created it will require admin access.
                </p>
              </div>
            ) : null}

            <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
                <h2 className="font-headline text-lg font-extrabold text-on-background">
                  Connection
                </h2>
                <p className="font-body text-sm text-on-surface-variant">
                  <span className="font-bold text-on-surface">{status.database}</span> on{' '}
                  {status.host}
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatTile
                  accent="bg-mint text-on-mint"
                  label="Tables present"
                  value={`${status.existingTables}/${status.expectedTables}`}
                />
                <StatTile
                  accent={missingCount ? 'bg-blush text-on-blush' : 'bg-surface-container text-on-surface'}
                  label="Tables missing"
                  value={missingCount}
                />
                <StatTile
                  accent="bg-sky text-on-sky"
                  label="Core tables"
                  value={status.coreTables}
                />
                <StatTile
                  accent="bg-lavender text-on-lavender"
                  label="Feature tables"
                  value={status.featureTables}
                />
              </div>
            </section>

            <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
              <h2 className="font-headline text-lg font-extrabold text-on-background mb-2">
                Actions
              </h2>
              <p className="font-body text-sm text-on-surface-variant mb-5">
                Both actions are safe to run more than once. Creating tables never drops anything,
                and seeding skips any table that already holds rows.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-surface-container p-5">
                  <h3 className="font-headline text-base font-extrabold text-on-background">
                    1. Create tables
                  </h3>
                  <p className="font-body text-sm text-on-surface-variant mt-1 mb-4">
                    Creates the {status.expectedTables} tables the platform needs and adds any
                    columns missing from an older database.
                  </p>
                  <button
                    className={`${actionButton} bg-primary text-on-primary`}
                    disabled={Boolean(busyAction)}
                    onClick={() => runAction('migrate', '/database/migrate')}
                    type="button"
                  >
                    {busyAction === 'migrate' ? 'Creating…' : 'Create tables'}
                  </button>
                </div>

                <div className="rounded-2xl bg-surface-container p-5">
                  <h3 className="font-headline text-base font-extrabold text-on-background">
                    2. Load starter data
                  </h3>
                  <p className="font-body text-sm text-on-surface-variant mt-1 mb-4">
                    Adds the default accounts, five courses, three learning paths, categories,
                    resources, announcements and a few scheduled events.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className={`${actionButton} bg-primary text-on-primary`}
                      disabled={Boolean(busyAction) || !hasSchema}
                      onClick={() => runAction('seed', '/database/seed')}
                      title={hasSchema ? undefined : 'Create the tables first'}
                      type="button"
                    >
                      {busyAction === 'seed' ? 'Seeding…' : 'Load starter data'}
                    </button>
                    <button
                      className={`${actionButton} bg-surface-container-high text-on-surface`}
                      disabled={Boolean(busyAction) || !hasSchema}
                      onClick={() => setConfirmReseed(true)}
                      type="button"
                    >
                      Re-apply over existing
                    </button>
                  </div>
                  {!hasSchema ? (
                    <p className="font-body text-xs text-error mt-3">
                      Create the tables before seeding.
                    </p>
                  ) : null}
                </div>
              </div>

              {message ? (
                <div className={`mt-5 rounded-2xl p-4 ${toneClass[message.tone] || toneClass.success}`}>
                  <p className="font-headline text-sm font-extrabold">{message.text}</p>
                  {message.details?.length
                    ? message.details.map((line) => (
                        <p className="font-body text-xs opacity-80 mt-1 break-words" key={line}>
                          {line}
                        </p>
                      ))
                    : null}
                </div>
              ) : null}
            </section>

            <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="font-headline text-lg font-extrabold text-on-background">Tables</h2>
                <button
                  className="font-headline text-sm font-bold text-primary hover:opacity-80 transition-opacity"
                  onClick={() => setShowAllTables((value) => !value)}
                  type="button"
                >
                  {showAllTables ? 'Hide empty tables' : `Show all ${tables.length}`}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {visibleTables.map((table) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl bg-surface-container px-4 py-2.5"
                    key={table.name}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          table.exists ? 'bg-tertiary' : 'bg-error'
                        }`}
                      ></span>
                      <span className="font-body text-sm text-on-surface truncate">{table.name}</span>
                    </span>
                    <span className="font-headline text-xs font-bold text-on-surface-variant shrink-0">
                      {table.exists ? `${table.rows} rows` : 'missing'}
                    </span>
                  </div>
                ))}
              </div>

              {visibleTables.length === 0 ? (
                <p className="font-body text-sm text-on-surface-variant">
                  No tables to show yet.
                </p>
              ) : null}
            </section>
          </>
        ) : null}
      </div>

      {confirmReseed ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-3xl bg-surface-container-lowest p-6 shadow-lift">
            <h2 className="font-headline text-xl font-extrabold text-on-background">
              Re-apply starter data?
            </h2>
            <p className="font-body text-sm text-on-surface-variant mt-3 leading-relaxed">
              This writes the starter courses, paths and resources again even where content already
              exists. Records with the same id are updated in place; nothing is deleted, but edits
              you made to those specific starter items will be overwritten.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                className={`${actionButton} bg-surface-container-high text-on-surface`}
                onClick={() => setConfirmReseed(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={`${actionButton} bg-primary text-on-primary`}
                disabled={Boolean(busyAction)}
                onClick={() => runAction('seed', '/database/seed', { force: true })}
                type="button"
              >
                {busyAction === 'seed' ? 'Applying…' : 'Re-apply'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default AdminDatabasePage
