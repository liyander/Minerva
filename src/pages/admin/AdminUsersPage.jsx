import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { ROLES, roleLabel } from '../../auth'
import {
  fetchAdminUsers,
  setUserActive,
  setUserApproval,
  setUserRole,
} from '../../services/training'

const STATUS_TONE = {
  pending: 'bg-butter text-on-butter',
  approved: 'bg-mint text-on-mint',
  rejected: 'bg-blush text-on-blush',
}

const FILTERS = [
  { id: 'pending', label: 'Awaiting approval', params: { status: 'pending' } },
  { id: 'trainers', label: 'Trainers', params: { role: ROLES.TRAINER } },
  { id: 'trainees', label: 'Trainees', params: { role: ROLES.TRAINEE } },
  { id: 'all', label: 'Everyone', params: {} },
]

function AdminUsersPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const params = FILTERS.find((item) => item.id === filter)?.params || {}
      setUsers(await fetchAdminUsers({ ...params, search: search.trim() || undefined }))
    } catch (loadError) {
      setError(loadError?.message || 'Could not load users.')
    } finally {
      setIsLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    void load()
  }, [load])

  const pendingCount = useMemo(
    () => users.filter((user) => user.approvalStatus === 'pending').length,
    [users],
  )

  const act = async (id, action) => {
    setBusyId(id)
    setError('')
    try {
      await action()
      await load()
    } catch (actionError) {
      setError(actionError?.message || 'That action failed.')
    } finally {
      setBusyId(null)
    }
  }

  const pill = 'rounded-full px-4 py-2 font-headline text-xs font-bold transition-opacity hover:opacity-90 disabled:opacity-50'

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
          accent="butter"
          description="Approve new trainer accounts, change roles and deactivate access."
          eyebrow="User management"
          icon="manage_accounts"
          title="People"
        />

        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                className={`rounded-full px-4 py-2 font-headline text-sm font-bold transition-colors ${
                  filter === item.id
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
                }`}
                key={item.id}
                onClick={() => setFilter(item.id)}
                type="button"
              >
                {item.label}
                {item.id === 'pending' && pendingCount && filter === 'pending' ? (
                  <span className="ml-2 rounded-full bg-on-primary/20 px-2 py-0.5 text-xs">
                    {pendingCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="relative min-w-[14rem]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant">
              search
            </span>
            <input
              aria-label="Search users"
              className="w-full rounded-full bg-surface-container-lowest pl-10 pr-4 py-2.5 font-body text-sm border border-transparent focus:border-primary focus:ring-0 outline-none"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email"
              value={search}
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-3xl bg-surface-container-lowest p-12 text-center shadow-soft">
            <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
        ) : null}

        {!isLoading && users.length === 0 ? (
          <div className="rounded-3xl bg-surface-container-lowest p-12 text-center shadow-soft">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/40">
              group_off
            </span>
            <p className="font-headline text-base font-extrabold text-on-background mt-4">
              {filter === 'pending' ? 'No accounts awaiting approval' : 'No users found'}
            </p>
          </div>
        ) : null}

        <div className="space-y-3">
          {users.map((user) => (
            <article
              className="rounded-3xl bg-surface-container-lowest p-5 shadow-soft flex flex-col lg:flex-row lg:items-center gap-4"
              key={user.id}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="h-11 w-11 shrink-0 rounded-full bg-secondary-container text-on-secondary-container inline-flex items-center justify-center font-headline font-bold">
                  {(user.name || user.username).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-headline text-base font-extrabold text-on-background truncate">
                      {user.name}
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-headline text-xs font-bold ${
                        STATUS_TONE[user.approvalStatus] || STATUS_TONE.approved
                      }`}
                    >
                      {user.approvalStatus}
                    </span>
                    {!user.isActive ? (
                      <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 font-headline text-xs font-bold text-on-surface-variant">
                        Deactivated
                      </span>
                    ) : null}
                  </div>
                  <p className="font-body text-xs text-on-surface-variant mt-1 truncate">
                    {user.email} · joined{' '}
                    {new Date(user.createdAt).toLocaleDateString([], {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <label className="sr-only" htmlFor={`role-${user.id}`}>
                  Role for {user.name}
                </label>
                <select
                  className="rounded-full bg-surface-container border border-transparent focus:border-primary focus:ring-0 font-headline text-xs font-bold py-2 pl-3 pr-8 outline-none"
                  disabled={busyId === user.id}
                  id={`role-${user.id}`}
                  onChange={(e) => act(user.id, () => setUserRole(user.id, e.target.value))}
                  value={user.role}
                >
                  {[ROLES.TRAINEE, ROLES.TRAINER, ROLES.ADMIN].map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>

                {user.approvalStatus !== 'approved' ? (
                  <button
                    className={`${pill} bg-mint text-on-mint`}
                    disabled={busyId === user.id}
                    onClick={() => act(user.id, () => setUserApproval(user.id, 'approved'))}
                    type="button"
                  >
                    Approve
                  </button>
                ) : null}

                {user.approvalStatus !== 'rejected' ? (
                  <button
                    className={`${pill} bg-blush text-on-blush`}
                    disabled={busyId === user.id}
                    onClick={() => {
                      const reason = window.prompt('Reason for rejecting (optional):') ?? ''
                      return act(user.id, () => setUserApproval(user.id, 'rejected', reason))
                    }}
                    type="button"
                  >
                    Reject
                  </button>
                ) : null}

                <button
                  className={`${pill} bg-surface-container-high text-on-surface`}
                  disabled={busyId === user.id}
                  onClick={() => act(user.id, () => setUserActive(user.id, !user.isActive))}
                  type="button"
                >
                  {user.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  )
}

export default AdminUsersPage
