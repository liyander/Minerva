import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { fetchAdminUsers } from '../../services/training'
import {
  addCohortMembers,
  bulkEnrolCohort,
  createCohort,
  deleteCohort,
  fetchCohortMembers,
  fetchCohorts,
  importUsers,
  previewUserImport,
  removeCohortMember,
  updateCohort,
} from '../../services/platform'
import { apiFetch } from '../../services/api'

/**
 * Minimal CSV parser handling quoted fields and embedded commas/newlines —
 * enough for the header+rows shape an admin will paste or upload.
 */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (field || row.length) {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
      }
      if (char === '\r' && text[i + 1] === '\n') i += 1
    } else {
      field += char
    }
  }

  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }

  if (!rows.length) return []

  const header = rows[0].map((cell) =>
    cell
      .trim()
      .toLowerCase()
      .replace(/[^a-z]+(.)/g, (_match, letter) => letter.toUpperCase()),
  )

  return rows.slice(1).map((cells) => {
    const record = {}
    header.forEach((key, index) => {
      record[key] = (cells[index] || '').trim()
    })
    return record
  })
}

const SAMPLE_CSV = 'firstName,lastName,email,department,role\nAsha,Rao,asha@example.com,Engineering,trainee'

function AdminCohortsPage() {
  const navigate = useNavigate()
  const [cohorts, setCohorts] = useState([])
  const [activeCohort, setActiveCohort] = useState(null)
  const [members, setMembers] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [courses, setCourses] = useState([])
  const [paths, setPaths] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('members')

  const [form, setForm] = useState({
    name: '', code: '', department: '', description: '', startsOn: '', endsOn: '', ownerId: '',
  })
  const [showCreate, setShowCreate] = useState(false)
  const [memberQuery, setMemberQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [enrolTarget, setEnrolTarget] = useState('')

  const [csvText, setCsvText] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [importPreview, setImportPreview] = useState(null)
  const [autoApprove, setAutoApprove] = useState(true)

  const load = useCallback(async () => {
    setError('')
    try {
      const [cohortRows, userRows, courseRows, pathRows] = await Promise.all([
        fetchCohorts(),
        fetchAdminUsers({}),
        apiFetch('/rooms').catch(() => []),
        apiFetch('/career-paths').catch(() => []),
      ])
      setCohorts(cohortRows)
      setAllUsers(userRows)
      setCourses(Array.isArray(courseRows) ? courseRows : [])
      setPaths(Array.isArray(pathRows) ? pathRows : [])
    } catch (loadError) {
      setError(loadError?.message || 'Could not load cohorts.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCohort = async (cohort) => {
    setActiveCohort(cohort)
    setSelectedUsers([])
    setTab('members')
    try {
      setMembers(await fetchCohortMembers(cohort.id))
    } catch {
      setMembers([])
    }
  }

  const refreshMembers = async () => {
    if (!activeCohort) return
    setMembers(await fetchCohortMembers(activeCohort.id))
    await load()
  }

  const memberIds = useMemo(() => new Set(members.map((member) => member.id)), [members])

  const candidates = useMemo(() => {
    const search = memberQuery.trim().toLowerCase()
    return allUsers
      .filter((user) => !memberIds.has(user.id))
      .filter(
        (user) =>
          !search ||
          String(user.name || '').toLowerCase().includes(search) ||
          String(user.email || '').toLowerCase().includes(search),
      )
      .slice(0, 40)
  }, [allUsers, memberIds, memberQuery])

  const stats = useMemo(() => {
    const withScores = members.filter((member) => member.averageScore !== null)
    return {
      members: members.length,
      enrolments: members.reduce((sum, member) => sum + member.enrolments, 0),
      attempts: members.reduce((sum, member) => sum + member.attempts, 0),
      average: withScores.length
        ? Math.round(
            withScores.reduce((sum, member) => sum + member.averageScore, 0) / withScores.length,
          )
        : 0,
    }
  }, [members])

  const create = async (event) => {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('A cohort needs a name.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const { id } = await createCohort(form)
      setForm({ name: '', code: '', department: '', description: '', startsOn: '', endsOn: '', ownerId: '' })
      setShowCreate(false)
      await load()
      await openCohort({ id, name: form.name })
      setNotice('Cohort created.')
    } catch (createError) {
      setError(createError?.message || 'Could not create the cohort.')
    } finally {
      setBusy(false)
    }
  }

  const runImport = async () => {
    const rows = parseCsv(csvText)
    if (!rows.length) {
      setError('No rows found. Include a header line, then one row per person.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const result = await importUsers({
        rows,
        cohortId: activeCohort?.id,
        autoApprove,
      })
      setImportResult(result)
      setNotice(`Imported ${result.created} of ${result.total} rows.`)
      await refreshMembers()
    } catch (importError) {
      setError(importError?.message || 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  const previewImport = async () => {
    const rows = parseCsv(csvText)
    if (!rows.length) {
      setError('No rows found. Include a header line, then one row per person.')
      return
    }
    setBusy(true)
    setError('')
    try {
      setImportPreview(await previewUserImport({ rows }))
      setImportResult(null)
    } catch (previewError) {
      setError(previewError?.message || 'Could not validate the CSV.')
    } finally {
      setBusy(false)
    }
  }

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([`${SAMPLE_CSV}\n`], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'minerva-user-import-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const runBulkEnrol = async () => {
    if (!enrolTarget) return

    const [kind, id] = enrolTarget.split(':')
    setBusy(true)
    setError('')
    try {
      const result = await bulkEnrolCohort(activeCohort.id,
        kind === 'course' ? { roomId: id } : { careerPathId: id })
      setNotice(`Enrolled ${result.enrolled} of ${result.members} members.`)
      await refreshMembers()
    } catch (enrolError) {
      setError(enrolError?.message || 'Could not enrol the cohort.')
    } finally {
      setBusy(false)
    }
  }

  const fieldClass =
    'w-full rounded-xl bg-surface-container border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none'
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
          accent="mint"
          description="Group trainees into batches, import them from a spreadsheet, and enrol a whole cohort into a course or path in one action."
          eyebrow="Cohorts"
          icon="groups"
          title="Batches & teams"
        />

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

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-headline text-lg font-extrabold text-on-background">
              Cohorts ({cohorts.length})
            </h2>
            <button
              className={`${pill} bg-primary text-on-primary`}
              onClick={() => setShowCreate((value) => !value)}
              type="button"
            >
              {showCreate ? 'Cancel' : 'New cohort'}
            </button>
          </div>

          {showCreate ? (
            <form className="rounded-2xl bg-surface-container p-5 mb-4 space-y-4" onSubmit={create}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">Name</span>
                  <input
                    className={`${fieldClass} mt-1.5`}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Autumn 2026 intake"
                    value={form.name}
                  />
                </label>
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">Code</span>
                  <input
                    className={`${fieldClass} mt-1.5`}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="AUT-26"
                    value={form.code}
                  />
                </label>
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    Department
                  </span>
                  <input
                    className={`${fieldClass} mt-1.5`}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    value={form.department}
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">Starts</span>
                  <input className={`${fieldClass} mt-1.5`} onChange={(e) => setForm((f) => ({ ...f, startsOn: e.target.value }))} type="date" value={form.startsOn} />
                </label>
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">Ends</span>
                  <input className={`${fieldClass} mt-1.5`} min={form.startsOn || undefined} onChange={(e) => setForm((f) => ({ ...f, endsOn: e.target.value }))} type="date" value={form.endsOn} />
                </label>
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">Owner</span>
                  <select className={`${fieldClass} mt-1.5`} onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))} value={form.ownerId}>
                    <option value="">Current administrator</option>
                    {allUsers.filter((user) => ['trainer', 'admin'].includes(user.role)).map((user) => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">Description</span>
                <textarea className={`${fieldClass} mt-1.5`} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} value={form.description} />
              </label>
              <button className={`${pill} bg-primary text-on-primary`} disabled={busy} type="submit">
                Create cohort
              </button>
            </form>
          ) : null}

          {isLoading ? (
            <div className="py-8 text-center">
              <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            </div>
          ) : cohorts.length === 0 ? (
            <p className="font-body text-sm text-on-surface-variant py-6 text-center">
              No cohorts yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cohorts.map((cohort) => (
                <article
                  className={`rounded-2xl p-4 transition-colors ${
                    activeCohort?.id === cohort.id
                      ? 'bg-primary-container text-on-primary-container'
                      : 'bg-surface-container'
                  }`}
                  key={cohort.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button className="min-w-0 text-left" onClick={() => openCohort(cohort)} type="button">
                      <h3 className="font-headline text-sm font-extrabold truncate">{cohort.name}</h3>
                      <p className="font-body text-xs opacity-70 mt-1">
                        {cohort.code ? `${cohort.code} · ` : ''}
                        {cohort.memberCount} members
                        {cohort.department ? ` · ${cohort.department}` : ''}
                      </p>
                    </button>
                    <button
                      aria-label={`Delete ${cohort.name}`}
                      className="shrink-0 opacity-60 hover:opacity-100 hover:text-error transition-all"
                      onClick={async () => {
                        if (!window.confirm(`Delete "${cohort.name}"? Members are not deleted.`)) return
                        await deleteCohort(cohort.id)
                        if (activeCohort?.id === cohort.id) setActiveCohort(null)
                        await load()
                      }}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </div>
                  <button
                    className="mt-3 font-headline text-xs font-bold underline opacity-70 hover:opacity-100"
                    onClick={async () => {
                      await updateCohort(cohort.id, { isActive: !cohort.isActive })
                      await load()
                    }}
                    type="button"
                  >
                    {cohort.isActive ? 'Archive cohort' : 'Reactivate cohort'}
                  </button>
                  {!cohort.isActive ? (
                    <span className="mt-2 inline-block rounded-full bg-surface-container-high px-2 py-0.5 font-headline text-[11px] font-bold">
                      Inactive
                    </span>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        {activeCohort ? (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Members', value: stats.members, accent: 'bg-mint text-on-mint' },
                { label: 'Enrolments', value: stats.enrolments, accent: 'bg-sky text-on-sky' },
                { label: 'Attempts', value: stats.attempts, accent: 'bg-lavender text-on-lavender' },
                { label: 'Avg score', value: `${stats.average}%`, accent: 'bg-butter text-on-butter' },
              ].map((tile) => (
                <div className={`rounded-2xl px-5 py-4 ${tile.accent}`} key={tile.label}>
                  <p className="font-headline text-2xl font-extrabold leading-none">{tile.value}</p>
                  <p className="font-body text-xs opacity-80 mt-2">{tile.label}</p>
                </div>
              ))}
            </section>

            <div className="flex flex-wrap gap-2">
              {[
                { id: 'members', label: 'Members', icon: 'group' },
                { id: 'add', label: 'Add people', icon: 'person_add' },
                { id: 'import', label: 'Import CSV', icon: 'upload_file' },
                { id: 'enrol', label: 'Bulk enrol', icon: 'library_add' },
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

            <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
              <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">
                {activeCohort.name}
              </h2>

              {tab === 'members' ? (
                members.length === 0 ? (
                  <p className="font-body text-sm text-on-surface-variant py-6 text-center">
                    No members yet. Add people or import a CSV.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[38rem]">
                      <thead>
                        <tr className="text-left">
                          {['Member', 'Role', 'Enrolments', 'Attempts', 'Avg', 'Certs', ''].map((head) => (
                            <th
                              className="font-headline text-xs font-bold text-on-surface-variant pb-3 px-3"
                              key={head}
                            >
                              {head}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((member) => (
                          <tr className="border-t border-outline-variant" key={member.id}>
                            <td className="py-3 px-3">
                              <p className="font-headline text-sm font-bold text-on-surface">
                                {member.name}
                              </p>
                              <p className="font-body text-xs text-on-surface-variant">
                                {member.email}
                              </p>
                            </td>
                            <td className="py-3 px-3 font-body text-sm text-on-surface capitalize">
                              {member.memberRole}
                            </td>
                            <td className="py-3 px-3 font-body text-sm text-on-surface">
                              {member.enrolments}
                            </td>
                            <td className="py-3 px-3 font-body text-sm text-on-surface">
                              {member.attempts}
                            </td>
                            <td className="py-3 px-3 font-body text-sm text-on-surface">
                              {member.averageScore === null ? '—' : `${member.averageScore}%`}
                            </td>
                            <td className="py-3 px-3 font-body text-sm text-on-surface">
                              {member.certificates}
                            </td>
                            <td className="py-3 px-3">
                              <button
                                aria-label={`Remove ${member.name}`}
                                className="text-on-surface-variant hover:text-error transition-colors"
                                onClick={async () => {
                                  await removeCohortMember(activeCohort.id, member.id)
                                  await refreshMembers()
                                }}
                                type="button"
                              >
                                <span className="material-symbols-outlined text-base">
                                  person_remove
                                </span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}

              {tab === 'add' ? (
                <div className="space-y-4">
                  <input
                    className={fieldClass}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder="Search existing users by name or email"
                    value={memberQuery}
                  />

                  <div className="max-h-80 overflow-y-auto space-y-1">
                    {candidates.map((user) => (
                      <label
                        className="flex items-center gap-3 rounded-2xl px-4 py-2.5 hover:bg-surface-container cursor-pointer"
                        key={user.id}
                      >
                        <input
                          checked={selectedUsers.includes(user.id)}
                          className="h-4 w-4 rounded"
                          onChange={(e) =>
                            setSelectedUsers((current) =>
                              e.target.checked
                                ? [...current, user.id]
                                : current.filter((id) => id !== user.id),
                            )
                          }
                          type="checkbox"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-headline text-sm font-bold text-on-surface block truncate">
                            {user.name}
                          </span>
                          <span className="font-body text-xs text-on-surface-variant">
                            {user.email} · {user.role}
                          </span>
                        </span>
                      </label>
                    ))}
                    {candidates.length === 0 ? (
                      <p className="font-body text-sm text-on-surface-variant py-4 text-center">
                        No matching users outside this cohort.
                      </p>
                    ) : null}
                  </div>

                  <button
                    className={`${pill} bg-primary text-on-primary`}
                    disabled={busy || !selectedUsers.length}
                    onClick={async () => {
                      setBusy(true)
                      try {
                        const result = await addCohortMembers(activeCohort.id, selectedUsers)
                        setNotice(`Added ${result.added} member(s).`)
                        setSelectedUsers([])
                        await refreshMembers()
                      } catch (addError) {
                        setError(addError?.message || 'Could not add members.')
                      } finally {
                        setBusy(false)
                      }
                    }}
                    type="button"
                  >
                    Add {selectedUsers.length || ''} selected
                  </button>
                </div>
              ) : null}

              {tab === 'import' ? (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-surface-container p-4">
                    <p className="font-headline text-xs font-bold text-on-surface-variant mb-2">
                      Expected columns
                    </p>
                    <code className="font-body text-xs text-on-surface block whitespace-pre-wrap">
                      {SAMPLE_CSV}
                    </code>
                    <p className="font-body text-xs text-on-surface-variant mt-2">
                      Only <strong>firstName</strong> and <strong>email</strong> are required. Leave
                      the password column out and a temporary one is generated and shown once.
                    </p>
                    <button className="mt-3 font-headline text-xs font-bold text-primary hover:underline" onClick={downloadTemplate} type="button">
                      Download CSV template
                    </button>
                  </div>

                  <label className="block">
                    <span className="font-headline text-xs font-bold text-on-surface-variant">
                      Upload a .csv or paste the rows
                    </span>
                    <input
                      accept=".csv,text/csv"
                      className={`${fieldClass} mt-1.5 file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-1.5 file:font-headline file:text-xs file:font-bold file:text-on-primary`}
                      onChange={async (event) => {
                        const file = event.target.files?.[0]
                        if (file) {
                          setCsvText(await file.text())
                          setImportPreview(null)
                        }
                      }}
                      type="file"
                    />
                  </label>

                  <textarea
                    className={`${fieldClass} font-mono`}
                    onChange={(e) => {
                      setCsvText(e.target.value)
                      setImportPreview(null)
                    }}
                    placeholder={SAMPLE_CSV}
                    rows={8}
                    value={csvText}
                  />

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-3">
                      <input
                        checked={autoApprove}
                        className="h-4 w-4 rounded"
                        onChange={(e) => setAutoApprove(e.target.checked)}
                        type="checkbox"
                      />
                      <span className="font-body text-sm text-on-surface">
                        Approve imported accounts immediately
                      </span>
                    </label>
                    <button
                      className={`${pill} bg-primary text-on-primary`}
                      disabled={busy || !csvText.trim()}
                      onClick={previewImport}
                      type="button"
                    >
                      {busy ? 'Validating…' : `Validate ${parseCsv(csvText).length || ''} rows`}
                    </button>
                    {importPreview?.valid ? (
                      <button className={`${pill} bg-secondary text-on-secondary`} disabled={busy} onClick={runImport} type="button">
                        Import {importPreview.valid} valid rows
                      </button>
                    ) : null}
                  </div>

                  {importPreview ? (
                    <div className="rounded-2xl bg-surface-container p-4">
                      <p className="font-headline text-sm font-bold text-on-surface">
                        Preview: {importPreview.valid} valid, {importPreview.invalid} invalid
                      </p>
                      <div className="mt-3 max-h-52 overflow-y-auto space-y-1">
                        {importPreview.results.map((row) => (
                          <p className="font-body text-xs text-on-surface-variant" key={`${row.line}-${row.email}`}>
                            Line {row.line}: {row.name || row.email || 'Unnamed'} — {row.status}{row.reason ? ` (${row.reason})` : ''}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {importResult ? (
                    <div className="rounded-2xl bg-surface-container p-4">
                      <p className="font-headline text-sm font-bold text-on-surface mb-3">
                        Created {importResult.created} of {importResult.total}
                      </p>
                      <div className="max-h-64 overflow-y-auto space-y-1">
                        {importResult.results.map((row) => (
                          <div
                            className="flex flex-wrap items-center gap-2 font-body text-xs"
                            key={`${row.line}-${row.email}`}
                          >
                            <span
                              className={`rounded-full px-2 py-0.5 font-headline font-bold ${
                                row.status === 'created'
                                  ? 'bg-mint text-on-mint'
                                  : row.status === 'skipped'
                                    ? 'bg-butter text-on-butter'
                                    : 'bg-blush text-on-blush'
                              }`}
                            >
                              {row.status}
                            </span>
                            <span className="text-on-surface">
                              line {row.line} · {row.email}
                            </span>
                            {row.reason ? (
                              <span className="text-on-surface-variant">{row.reason}</span>
                            ) : null}
                            {row.temporaryPassword ? (
                              <span className="text-on-surface-variant">
                                password: <code className="font-mono">{row.temporaryPassword}</code>
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <p className="font-body text-xs text-on-surface-variant mt-3">
                        Temporary passwords are shown once. Copy them now if you need to send them on.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {tab === 'enrol' ? (
                <div className="space-y-4">
                  <p className="font-body text-sm text-on-surface-variant">
                    Enrols every trainee in this cohort. Anyone already enrolled is left as they are.
                  </p>

                  <label className="block max-w-lg">
                    <span className="font-headline text-xs font-bold text-on-surface-variant">
                      Course or learning path
                    </span>
                    <select
                      className={`${fieldClass} mt-1.5`}
                      onChange={(e) => setEnrolTarget(e.target.value)}
                      value={enrolTarget}
                    >
                      <option value="">Choose…</option>
                      {paths.length ? (
                        <optgroup label="Learning paths">
                          {paths.map((path) => (
                            <option key={path.id} value={`path:${path.id}`}>
                              {path.title}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {courses.length ? (
                        <optgroup label="Courses">
                          {courses.map((course) => (
                            <option key={course.id} value={`course:${course.id}`}>
                              {course.title}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                  </label>

                  <button
                    className={`${pill} bg-primary text-on-primary`}
                    disabled={busy || !enrolTarget}
                    onClick={runBulkEnrol}
                    type="button"
                  >
                    {busy ? 'Enrolling…' : 'Enrol the cohort'}
                  </button>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}

export default AdminCohortsPage
