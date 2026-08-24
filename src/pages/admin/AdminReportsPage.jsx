import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import {
  downloadExport,
  fetchAuditActions,
  fetchAuditLog,
  fetchExportData,
  fetchExportList,
  fetchMailStatus,
  fetchStorageStats,
  runDigest,
  runReminders,
} from '../../services/platform'

const EXPORT_META = {
  users: { label: 'Users', icon: 'group', blurb: 'Every account with role, approval and last sign-in.' },
  enrolments: { label: 'Enrolments', icon: 'how_to_reg', blurb: 'Who is enrolled in what, and when they finished.' },
  assessmentResults: { label: 'Assessment results', icon: 'quiz', blurb: 'Every submitted attempt with score and outcome.' },
  submissions: { label: 'Assignment submissions', icon: 'assignment', blurb: 'Submissions with marks, lateness and grading dates.' },
  certificates: { label: 'Certificates', icon: 'workspace_premium', blurb: 'Issued certificates with recipient and date.' },
  participation: { label: 'Participation', icon: 'insights', blurb: 'Per-trainee activity roll-up across the platform.' },
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function AdminReportsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('exports')
  const [exports, setExports] = useState([])
  const [audit, setAudit] = useState([])
  const [actions, setActions] = useState([])
  const [actionFilter, setActionFilter] = useState('')
  const [mail, setMail] = useState(null)
  const [storage, setStorage] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [exportRows, auditRows, actionRows, mailRow, storageRow] = await Promise.all([
        fetchExportList(),
        fetchAuditLog({ limit: 100 }),
        fetchAuditActions().catch(() => []),
        fetchMailStatus().catch(() => null),
        fetchStorageStats().catch(() => null),
      ])
      setExports(exportRows)
      setAudit(auditRows)
      setActions(actionRows)
      setMail(mailRow)
      setStorage(storageRow)
    } catch (loadError) {
      setError(loadError?.message || 'Could not load reports.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (tab !== 'audit') return
    fetchAuditLog({ limit: 100, action: actionFilter || undefined })
      .then(setAudit)
      .catch(() => setAudit([]))
  }, [tab, actionFilter])

  const download = async (key) => {
    setBusy(key)
    setError('')
    try {
      await downloadExport(key, EXPORT_META[key]?.filename)
      setNotice(`${EXPORT_META[key]?.label || key} downloaded.`)
    } catch (downloadError) {
      setError(downloadError?.message || 'Download failed.')
    } finally {
      setBusy('')
    }
  }

  /**
   * PDF is produced by opening a print-ready window: no extra dependency, and
   * the browser's own dialog handles paper size and "save as PDF".
   */
  const printPdf = async (key) => {
    setBusy(`pdf-${key}`)
    setError('')
    try {
      const data = await fetchExportData(key)
      const meta = EXPORT_META[key] || { label: key }

      const html = `<!doctype html><html><head><meta charset="utf-8">
        <title>${meta.label} — Minerva</title>
        <style>
          body{font-family:Inter,Arial,sans-serif;margin:32px;color:#1b2233}
          h1{font-size:20px;margin:0 0 4px}
          p.meta{font-size:12px;color:#6b7488;margin:0 0 20px}
          table{width:100%;border-collapse:collapse;font-size:11px}
          th{text-align:left;background:#f1f3f8;padding:8px;border-bottom:2px solid #e3e7ef}
          td{padding:7px 8px;border-bottom:1px solid #eef0f6}
          tr:nth-child(even) td{background:#fbfbfe}
          @media print{@page{margin:14mm}}
        </style></head><body>
        <h1>${meta.label}</h1>
        <p class="meta">Minerva Academy · ${data.rows.length} rows · generated ${new Date().toLocaleString()}</p>
        <table><thead><tr>${data.columns
          .map((column) => `<th>${column.label}</th>`)
          .join('')}</tr></thead><tbody>
        ${data.rows
          .map(
            (row) =>
              `<tr>${data.columns
                .map((column) => `<td>${row[column.key] ?? ''}</td>`)
                .join('')}</tr>`,
          )
          .join('')}
        </tbody></table></body></html>`

      const win = window.open('', '_blank')
      if (!win) {
        setError('Allow pop-ups to produce a PDF.')
        return
      }
      win.document.write(html)
      win.document.close()
      win.focus()
      window.setTimeout(() => win.print(), 400)
    } catch (printError) {
      setError(printError?.message || 'Could not build the PDF.')
    } finally {
      setBusy('')
    }
  }

  const pill = 'rounded-full px-5 py-2.5 font-headline text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-60'

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
          accent="lavender"
          description="Download the data behind the dashboards, review who changed what, and run the notification jobs."
          eyebrow="Reports"
          icon="download"
          title="Exports & audit"
        />

        <div className="flex flex-wrap gap-2">
          {[
            { id: 'exports', label: 'Exports', icon: 'download' },
            { id: 'audit', label: 'Audit log', icon: 'history' },
            { id: 'system', label: 'Mail & storage', icon: 'settings_suggest' },
          ].map((item) => (
            <button
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 font-headline text-sm font-bold transition-colors ${
                tab === item.id
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
              }`}
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              <span className="material-symbols-outlined text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-2xl bg-mint p-4 flex items-center justify-between gap-3">
            <p className="font-body text-sm text-on-mint">{notice}</p>
            <button
              className="font-headline text-xs font-bold text-on-mint"
              onClick={() => setNotice('')}
              type="button"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {tab === 'exports' ? (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exports.map((item) => {
              const meta = EXPORT_META[item.key] || { label: item.key, icon: 'table_view', blurb: '' }
              return (
                <article className="rounded-3xl bg-surface-container-lowest p-5 shadow-soft" key={item.key}>
                  <div className="flex items-start gap-3">
                    <span className="h-11 w-11 shrink-0 rounded-2xl bg-sky text-on-sky inline-flex items-center justify-center">
                      <span className="material-symbols-outlined">{meta.icon}</span>
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-headline text-base font-extrabold text-on-background">
                        {meta.label}
                      </h3>
                      <p className="font-body text-sm text-on-surface-variant mt-1">{meta.blurb}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    <button
                      className={`${pill} bg-primary text-on-primary`}
                      disabled={busy === item.key}
                      onClick={() => download(item.key)}
                      type="button"
                    >
                      {busy === item.key ? 'Preparing…' : 'CSV'}
                    </button>
                    <button
                      className={`${pill} bg-surface-container-high text-on-surface`}
                      disabled={busy === `pdf-${item.key}`}
                      onClick={() => printPdf(item.key)}
                      type="button"
                    >
                      {busy === `pdf-${item.key}` ? 'Building…' : 'PDF'}
                    </button>
                    <button
                      className={`${pill} bg-surface-container-high text-on-surface`}
                      onClick={async () => {
                        setBusy(`preview-${item.key}`)
                        try {
                          setPreview(await fetchExportData(item.key))
                        } finally {
                          setBusy('')
                        }
                      }}
                      type="button"
                    >
                      Preview
                    </button>
                  </div>
                </article>
              )
            })}

            {preview ? (
              <div className="md:col-span-2 rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="font-headline text-base font-extrabold text-on-background">
                    {EXPORT_META[preview.key]?.label || preview.key} · {preview.rows.length} rows
                  </h3>
                  <button
                    className="font-headline text-xs font-bold text-primary"
                    onClick={() => setPreview(null)}
                    type="button"
                  >
                    Close
                  </button>
                </div>

                <div className="overflow-x-auto max-h-96">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left">
                        {preview.columns.map((column) => (
                          <th
                            className="font-headline text-xs font-bold text-on-surface-variant pb-3 px-3 whitespace-nowrap"
                            key={column.key}
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 50).map((row, index) => (
                        <tr className="border-t border-outline-variant" key={index}>
                          {preview.columns.map((column) => (
                            <td
                              className="py-2.5 px-3 font-body text-xs text-on-surface whitespace-nowrap"
                              key={column.key}
                            >
                              {String(row[column.key] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 50 ? (
                  <p className="font-body text-xs text-on-surface-variant mt-3">
                    Showing the first 50 rows. The CSV contains all {preview.rows.length}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === 'audit' ? (
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-headline text-lg font-extrabold text-on-background">
                Recent activity
              </h2>
              <select
                aria-label="Filter by action"
                className="rounded-full bg-surface-container border border-transparent focus:border-primary focus:ring-0 font-headline text-xs font-bold py-2 pl-3 pr-8 outline-none"
                onChange={(e) => setActionFilter(e.target.value)}
                value={actionFilter}
              >
                <option value="">All actions</option>
                {actions.map((row) => (
                  <option key={row.action} value={row.action}>
                    {row.action} ({row.count})
                  </option>
                ))}
              </select>
            </div>

            {audit.length === 0 ? (
              <p className="font-body text-sm text-on-surface-variant py-6 text-center">
                Nothing recorded yet.
              </p>
            ) : (
              <div className="space-y-1">
                {audit.map((entry) => (
                  <div
                    className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-surface-container px-4 py-3"
                    key={entry.id}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-secondary-container text-on-secondary-container px-2.5 py-0.5 font-headline text-xs font-bold">
                          {entry.action}
                        </span>
                        <span className="font-headline text-sm font-bold text-on-surface">
                          {entry.actor || 'system'}
                        </span>
                      </div>
                      <p className="font-body text-sm text-on-surface-variant mt-1">
                        {entry.summary}
                      </p>
                    </div>
                    <span className="font-body text-xs text-on-surface-variant shrink-0">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {tab === 'system' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
              <h2 className="font-headline text-lg font-extrabold text-on-background mb-1">Email</h2>
              <p className="font-body text-xs text-on-surface-variant mb-4">
                {mail?.configured
                  ? `Sending through ${mail.host}`
                  : 'No SMTP host configured — emails are logged instead of sent.'}
              </p>

              {mail?.last30Days?.length ? (
                <div className="flex flex-wrap gap-2 mb-4">
                  {mail.last30Days.map((row) => (
                    <span
                      className={`rounded-full px-3 py-1 font-headline text-xs font-bold ${
                        row.status === 'sent'
                          ? 'bg-mint text-on-mint'
                          : row.status === 'failed'
                            ? 'bg-blush text-on-blush'
                            : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                      key={row.status}
                    >
                      {row.count} {row.status}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  className={`${pill} bg-primary text-on-primary`}
                  disabled={busy === 'reminders'}
                  onClick={async () => {
                    setBusy('reminders')
                    try {
                      const result = await runReminders()
                      setNotice(
                        `Deadline reminders: ${result.sent} sent, ${result.skipped} skipped of ${result.recipients} recipients.`,
                      )
                      await load()
                    } catch (jobError) {
                      setError(jobError?.message || 'The job failed.')
                    } finally {
                      setBusy('')
                    }
                  }}
                  type="button"
                >
                  {busy === 'reminders' ? 'Running…' : 'Run deadline reminders'}
                </button>
                <button
                  className={`${pill} bg-surface-container-high text-on-surface`}
                  disabled={busy === 'digest'}
                  onClick={async () => {
                    setBusy('digest')
                    try {
                      const result = await runDigest()
                      setNotice(`Weekly digest: ${result.sent} sent, ${result.skipped} skipped.`)
                      await load()
                    } catch (jobError) {
                      setError(jobError?.message || 'The job failed.')
                    } finally {
                      setBusy('')
                    }
                  }}
                  type="button"
                >
                  {busy === 'digest' ? 'Running…' : 'Send weekly digest'}
                </button>
              </div>

              <p className="font-body text-xs text-on-surface-variant mt-3">
                Both run automatically every six hours; these buttons trigger them now. Repeat runs
                never send the same message twice.
              </p>
            </section>

            <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
              <h2 className="font-headline text-lg font-extrabold text-on-background mb-1">
                File storage
              </h2>
              <p className="font-body text-xs text-on-surface-variant mb-4">
                Driver: <strong>{storage?.driver || 'unknown'}</strong>
                {storage?.bucket ? ` · bucket ${storage.bucket}` : ''} · limit{' '}
                {formatBytes(storage?.maxBytes || 0)} per file
              </p>

              {storage?.byPurpose?.length ? (
                <div className="space-y-2">
                  {storage.byPurpose.map((row) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container px-4 py-3"
                      key={row.purpose}
                    >
                      <span className="font-headline text-sm font-bold text-on-surface capitalize">
                        {row.purpose.replace(/-/g, ' ')}
                      </span>
                      <span className="font-body text-xs text-on-surface-variant">
                        {row.files} files · {formatBytes(row.bytes)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-body text-sm text-on-surface-variant">Nothing stored yet.</p>
              )}

              {storage?.driver === 'local' ? (
                <p className="font-body text-xs text-on-surface-variant mt-4">
                  Local disk suits a single server. Set STORAGE_DRIVER=s3 with bucket credentials to
                  move media to object storage.
                </p>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </main>
  )
}

export default AdminReportsPage
