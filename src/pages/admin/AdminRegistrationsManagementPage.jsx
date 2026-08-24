import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../services/api'

function isPermanentAdmin(user) {
  return String(user?.username || '').trim().toLowerCase() === 'admin01'
}

function AdminRegistrationsManagementPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [isBulkWorking, setIsBulkWorking] = useState(false)
  const [isAdminWorking, setIsAdminWorking] = useState(false)
  const [actionModal, setActionModal] = useState(null)
  const [adminSuccessModal, setAdminSuccessModal] = useState(null)
  const [duplicateAdminModal, setDuplicateAdminModal] = useState(null)
  const [adminForm, setAdminForm] = useState({
    username: '',
    registrationNumber: '',
    email: '',
    password: '',
  })

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const data = await apiFetch('/users/admin/registrations')
      setUsers(Array.isArray(data) ? data : [])
      setError('')
    } catch (fetchError) {
      setError(fetchError?.message || 'Failed to load registrations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchUsers()
  }, [fetchUsers])

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = users.filter((user) => {
      if (!query) return true
      const registration = String(user.registration_number || '').toLowerCase()
      const username = String(user.username || '').toLowerCase()
      const email = String(user.email || '').toLowerCase()
      const role = String(user.role || '').toLowerCase()
      return registration.includes(query) || username.includes(query) || email.includes(query) || role.includes(query)
    })

    return [...filtered].sort((a, b) => {
      const aReg = String(a.registration_number || '')
      const bReg = String(b.registration_number || '')
      return aReg.localeCompare(bReg, undefined, { numeric: true, sensitivity: 'base' })
    })
  }, [search, users])

  const totalUsers = visibleUsers.length
  const activeUsers = visibleUsers.filter((user) => Boolean(user.is_active)).length
  const disabledUsers = totalUsers - activeUsers
  const adminUsers = visibleUsers.filter((user) => user.role === 'admin').length
  const developerUsers = visibleUsers.filter((user) => user.role === 'developer').length
  const operatorUsers = totalUsers - adminUsers - developerUsers
  const selectedVisibleIds = visibleUsers.map((user) => user.id)
  const selectedPromotableIds = selectedUserIds.filter((id) => {
    const user = users.find((entry) => entry.id === id)
    return user && user.role !== 'admin'
  })
  const selectedRevokableIds = selectedUserIds.filter((id) => {
    const user = users.find((entry) => entry.id === id)
    return user && user.role === 'admin' && !isPermanentAdmin(user)
  })
  const allVisibleSelected =
    selectedVisibleIds.length > 0 && selectedVisibleIds.every((id) => selectedUserIds.includes(id))

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    )
  }

  const toggleVisibleSelection = () => {
    setSelectedUserIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !selectedVisibleIds.includes(id))
      }

      return [...new Set([...current, ...selectedVisibleIds])]
    })
  }

  const runBulkReset = async () => {
    setIsBulkWorking(true)
    setError('')
    setSuccess('')
    try {
      const result = await apiFetch('/users/admin/registrations/bulk-reset', {
        method: 'POST',
        body: JSON.stringify({ userIds: selectedUserIds }),
      })
      setSuccess(`Reset ${result?.reset || 0} user(s). ${result?.skipped ? `${result.skipped} skipped.` : ''}`)
      setSelectedUserIds([])
      await fetchUsers()
    } catch (resetError) {
      setError(resetError?.message || 'Failed to reset selected users')
    } finally {
      setIsBulkWorking(false)
    }
  }

  const runBulkDelete = async () => {
    setIsBulkWorking(true)
    setError('')
    setSuccess('')
    try {
      const result = await apiFetch('/users/admin/registrations/bulk-delete', {
        method: 'DELETE',
        body: JSON.stringify({ userIds: selectedUserIds }),
      })
      setSuccess(`Deleted ${result?.deleted || 0} user(s). ${result?.skipped ? `${result.skipped} skipped.` : ''}`)
      setSelectedUserIds([])
      await fetchUsers()
    } catch (deleteError) {
      setError(deleteError?.message || 'Failed to delete selected users')
    } finally {
      setIsBulkWorking(false)
    }
  }

  const runSingleReset = async (user) => {
    setIsBulkWorking(true)
    setError('')
    setSuccess('')
    try {
      await apiFetch(`/users/admin/registrations/${user.id}/reset`, { method: 'POST' })
      setSuccess('User activity reset successfully.')
      await fetchUsers()
    } catch (resetError) {
      setError(resetError?.message || 'Failed to reset user')
    } finally {
      setIsBulkWorking(false)
    }
  }

  const runSingleDelete = async (user) => {
    setIsBulkWorking(true)
    setError('')
    setSuccess('')
    try {
      await apiFetch(`/users/admin/registrations/${user.id}`, { method: 'DELETE' })
      setSuccess('User deleted successfully.')
      setSelectedUserIds((current) => current.filter((id) => id !== user.id))
      await fetchUsers()
    } catch (deleteError) {
      setError(deleteError?.message || 'Failed to delete user')
    } finally {
      setIsBulkWorking(false)
    }
  }

  const updateAdminForm = (field, value) => {
    setAdminForm((current) => ({ ...current, [field]: value }))
  }

  const findDuplicateAdminTarget = () => {
    const username = adminForm.username.trim().toLowerCase()
    const email = adminForm.email.trim().toLowerCase()
    const registrationNumber = adminForm.registrationNumber.trim().toLowerCase()

    return users.find((user) => {
      const userUsername = String(user.username || '').toLowerCase()
      const userEmail = String(user.email || '').toLowerCase()
      const userRegistration = String(user.registration_number || '').toLowerCase()

      return (
        (username && userUsername === username) ||
        (email && userEmail === email) ||
        (registrationNumber && userRegistration === registrationNumber)
      )
    })
  }

  const createAdmin = async (event) => {
    event.preventDefault()
    setIsAdminWorking(true)
    setError('')
    setSuccess('')
    try {
      const created = await apiFetch('/users/admin/admins', {
        method: 'POST',
        body: JSON.stringify(adminForm),
      })
      setSuccess(`Admin account created for ${created?.username || adminForm.username}.`)
      setUsers((current) => {
        if (!created?.id || current.some((user) => user.id === created.id)) {
          return current
        }

        return [created, ...current]
      })
      setSearch('')
      setAdminSuccessModal({
        email: created?.email || adminForm.email || 'N/A',
        registrationNumber: created?.registration_number || adminForm.registrationNumber || 'N/A',
        username: created?.username || adminForm.username,
      })
      setAdminForm({
        username: '',
        registrationNumber: '',
        email: '',
        password: '',
      })
      await fetchUsers()
    } catch (createError) {
      const duplicateTarget = findDuplicateAdminTarget()
      if (/already exists/i.test(createError?.message || '') && duplicateTarget) {
        const searchToken =
          duplicateTarget.email ||
          duplicateTarget.registration_number ||
          duplicateTarget.username ||
          adminForm.email ||
          adminForm.username

        setSearch(searchToken)
        setSelectedUserIds([duplicateTarget.id])
        setDuplicateAdminModal({
          email: duplicateTarget.email || 'N/A',
          id: duplicateTarget.id,
          isAdmin: duplicateTarget.role === 'admin',
          registrationNumber: duplicateTarget.registration_number || 'N/A',
          username: duplicateTarget.username || 'Existing user',
        })
        setError('')
      } else {
        setError(createError?.message || 'Failed to create admin account')
      }
    } finally {
      setIsAdminWorking(false)
    }
  }

  const promoteSelectedAdmins = async () => {
    if (!selectedPromotableIds.length) return
    setIsAdminWorking(true)
    setError('')
    setSuccess('')
    try {
      const result = await apiFetch('/users/admin/registrations/bulk-promote-admin', {
        method: 'POST',
        body: JSON.stringify({ userIds: selectedPromotableIds }),
      })
      setSuccess(`Promoted ${result?.promoted || 0} user(s) to admin. ${result?.skipped ? `${result.skipped} skipped.` : ''}`)
      setSelectedUserIds([])
      await fetchUsers()
    } catch (promoteError) {
      setError(promoteError?.message || 'Failed to promote selected users')
    } finally {
      setIsAdminWorking(false)
    }
  }

  const promoteSingleAdmin = async (user) => {
    setIsAdminWorking(true)
    setError('')
    setSuccess('')
    try {
      const result = await apiFetch(`/users/admin/registrations/${user.id}/promote-admin`, { method: 'POST' })
      setSuccess(result?.promoted ? `${user.username || 'User'} promoted to admin.` : `${user.username || 'User'} is already an admin.`)
      await fetchUsers()
    } catch (promoteError) {
      setError(promoteError?.message || 'Failed to promote user')
    } finally {
      setIsAdminWorking(false)
    }
  }

  const revokeSelectedAdmins = async () => {
    if (!selectedRevokableIds.length) return
    setIsAdminWorking(true)
    setError('')
    setSuccess('')
    try {
      const result = await apiFetch('/users/admin/registrations/bulk-revoke-admin', {
        method: 'POST',
        body: JSON.stringify({ userIds: selectedRevokableIds }),
      })
      setSuccess(`Revoked admin privilege from ${result?.revoked || 0} user(s). ${result?.skipped ? `${result.skipped} skipped.` : ''}`)
      setSelectedUserIds([])
      await fetchUsers()
    } catch (revokeError) {
      setError(revokeError?.message || 'Failed to revoke selected admins')
    } finally {
      setIsAdminWorking(false)
    }
  }

  const revokeSingleAdmin = async (user) => {
    setIsAdminWorking(true)
    setError('')
    setSuccess('')
    try {
      const result = await apiFetch(`/users/admin/registrations/${user.id}/revoke-admin`, { method: 'POST' })
      setSuccess(result?.revoked ? `Admin privilege revoked from ${user.username || 'user'}.` : `${user.username || 'User'} is already an operator.`)
      await fetchUsers()
    } catch (revokeError) {
      setError(revokeError?.message || 'Failed to revoke admin privilege')
    } finally {
      setIsAdminWorking(false)
    }
  }

  const openBulkResetModal = () => {
    if (!selectedUserIds.length || isBulkWorking) return

    setActionModal({
      tone: 'warning',
      title: 'Reset Selected Users',
      eyebrow: 'Activity Reset',
      description:
        'This clears course progress, notes, certificates, event registrations, reminder logs, and theoretical attempts. Login and profile details remain.',
      target: `${selectedUserIds.length} selected user(s)`,
      confirmLabel: 'Reset Users',
      onConfirm: runBulkReset,
    })
  }

  const openBulkDeleteModal = () => {
    if (!selectedUserIds.length || isBulkWorking) return

    setActionModal({
      tone: 'danger',
      title: 'Delete Selected Users',
      eyebrow: 'Permanent Deletion',
      description:
        'This permanently removes selected accounts and all cascaded user data. This operation cannot be undone.',
      target: `${selectedUserIds.length} selected user(s)`,
      confirmLabel: 'Delete Users',
      onConfirm: runBulkDelete,
    })
  }

  const openSingleResetModal = (user) => {
    setActionModal({
      tone: 'warning',
      title: 'Reset User Activity',
      eyebrow: 'Activity Reset',
      description:
        'This clears learning activity for this user while keeping the account, role, email, and profile data.',
      target: user.username || user.registration_number || 'Selected user',
      confirmLabel: 'Reset User',
      onConfirm: () => runSingleReset(user),
    })
  }

  const openSingleDeleteModal = (user) => {
    setActionModal({
      tone: 'danger',
      title: 'Delete User Account',
      eyebrow: 'Permanent Deletion',
      description:
        'This permanently removes the account and related user data. This operation cannot be undone.',
      target: user.username || user.registration_number || 'Selected user',
      confirmLabel: 'Delete User',
      onConfirm: () => runSingleDelete(user),
    })
  }

  const confirmModalAction = async () => {
    if (!actionModal?.onConfirm || isBulkWorking) return
    await actionModal.onConfirm()
    setActionModal(null)
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-12 py-12">
      <section className="max-w-6xl mx-auto">
        <div className="mb-6">
          <button
            className="rounded-xl px-5 py-3 bg-surface-container-high text-on-surface font-headline text-xs font-bold"
            onClick={() => navigate('/admin')}
            type="button"
          >
            Back
          </button>
        </div>

        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-12 mb-10">
          <p className="font-headline text-xs text-primary font-bold">
            Account Governance
          </p>
          <h1 className="font-headline text-5xl md:text-6xl font-extrabold tracking-tight mt-3 leading-none">
            Registration Numbers
          </h1>
          <p className="text-base text-on-surface-variant mt-5 max-w-3xl">
            Click a registration number to open the full player profile.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
            <div className="rounded-2xl bg-surface-container-high p-4 ">
              <p className="text-xs text-on-surface-variant font-bold">Total</p>
              <p className="text-2xl font-headline font-extrabold mt-1">{totalUsers}</p>
            </div>
            <div className="rounded-2xl bg-surface-container-high p-4 ">
              <p className="text-xs text-on-surface-variant font-bold">Active</p>
              <p className="text-2xl font-headline font-extrabold mt-1">{activeUsers}</p>
            </div>
            <div className="rounded-2xl bg-surface-container-high p-4 ">
              <p className="text-xs text-on-surface-variant font-bold">Disabled</p>
              <p className="text-2xl font-headline font-extrabold mt-1">{disabledUsers}</p>
            </div>
            <div className="rounded-2xl bg-surface-container-high p-4 ">
              <p className="text-xs text-on-surface-variant font-bold">Admins</p>
              <p className="text-2xl font-headline font-extrabold mt-1">{adminUsers}</p>
            </div>
            <div className="rounded-2xl bg-surface-container-high p-4 ">
              <p className="text-xs text-on-surface-variant font-bold">Developers</p>
              <p className="text-2xl font-headline font-extrabold mt-1">{developerUsers}</p>
            </div>
            <div className="rounded-2xl bg-surface-container-high p-4 ">
              <p className="text-xs text-on-surface-variant font-bold">Students</p>
              <p className="text-2xl font-headline font-extrabold mt-1">{operatorUsers}</p>
            </div>
          </div>

          <div className="mt-8 max-w-2xl">
            <label className="block">
              <span className="font-headline text-xs text-on-surface-variant font-bold">Search users</span>
              <input
                className="rounded-2xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-4 px-5 text-base outline-none"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type username, email, registration number, or role"
                type="text"
                value={search}
              />
            </label>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
          <form
            className="rounded-2xl bg-surface-container-lowest shadow-soft p-6"
            onSubmit={(event) => {
              void createAdmin(event)
            }}
          >
            <p className="font-headline text-xs text-primary font-bold">
              Direct Admin
            </p>
            <h2 className="mt-2 font-headline text-2xl font-extrabold tracking-tight">
              Add Admin Account
            </h2>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="font-headline text-xs text-on-surface-variant font-bold">Username</span>
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 text-sm outline-none"
                  onChange={(event) => updateAdminForm('username', event.target.value)}
                  placeholder="admin_username"
                  required
                  type="text"
                  value={adminForm.username}
                />
              </label>
              <label className="block">
                <span className="font-headline text-xs text-on-surface-variant font-bold">Password</span>
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 text-sm outline-none"
                  minLength={8}
                  onChange={(event) => updateAdminForm('password', event.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                  type="password"
                  value={adminForm.password}
                />
              </label>
              <label className="block">
                <span className="font-headline text-xs text-on-surface-variant font-bold">Email</span>
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 text-sm outline-none"
                  onChange={(event) => updateAdminForm('email', event.target.value)}
                  placeholder="admin@example.com"
                  type="email"
                  value={adminForm.email}
                />
              </label>
              <label className="block">
                <span className="font-headline text-xs text-on-surface-variant font-bold">Registration Number</span>
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 text-sm outline-none"
                  onChange={(event) => updateAdminForm('registrationNumber', event.target.value)}
                  placeholder="Optional"
                  type="text"
                  value={adminForm.registrationNumber}
                />
              </label>
            </div>
            <button
              className="rounded-full mt-5 px-5 py-3 bg-primary text-on-primary font-headline text-sm font-bold disabled:opacity-50"
              disabled={isAdminWorking}
              type="submit"
            >
              {isAdminWorking ? 'Creating...' : 'Create Admin'}
            </button>
          </form>

          <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6">
            <p className="font-headline text-xs text-secondary font-bold">
              From Users
            </p>
            <h2 className="mt-2 font-headline text-2xl font-extrabold tracking-tight">
              Manage Admin Privilege
            </h2>
            <p className="mt-4 text-sm text-on-surface-variant leading-relaxed">
              Select users from the list below, then promote operators or revoke admin privilege without changing profile data.
            </p>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface-container-high p-4">
                <p className="font-headline text-xs text-on-surface-variant font-bold">
                  Promotable
                </p>
                <p className="mt-1 font-headline text-3xl font-extrabold">{selectedPromotableIds.length}</p>
              </div>
              <div className="rounded-2xl bg-surface-container-high p-4">
                <p className="font-headline text-xs text-on-surface-variant font-bold">
                  Revocable Admins
                </p>
                <p className="mt-1 font-headline text-3xl font-extrabold">{selectedRevokableIds.length}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button
                className="rounded-full px-5 py-3 bg-secondary text-on-secondary font-headline text-sm font-bold disabled:opacity-50"
                disabled={!selectedPromotableIds.length || isAdminWorking}
                onClick={() => {
                  void promoteSelectedAdmins()
                }}
                type="button"
              >
                {isAdminWorking ? 'Working...' : 'Promote Selected'}
              </button>
              <button
                className="rounded-xl px-5 py-3 bg-surface-container-high text-on-surface font-headline text-xs font-bold disabled:opacity-50"
                disabled={!selectedRevokableIds.length || isAdminWorking}
                onClick={() => {
                  void revokeSelectedAdmins()
                }}
                type="button"
              >
                {isAdminWorking ? 'Working...' : 'Revoke Selected'}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl mb-6 bg-surface-container-lowest border border-outline-variant/40 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <label className="inline-flex items-center gap-3">
            <input
              checked={allVisibleSelected}
              className="h-4 w-4 accent-[#b6171e]"
              onChange={toggleVisibleSelection}
              type="checkbox"
            />
            <span className="font-headline text-xs text-on-surface-variant font-bold">
              Select visible users
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-headline text-xs text-on-surface-variant font-bold">
              {selectedUserIds.length} selected
            </span>
            <button
              className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold disabled:opacity-50"
              disabled={!selectedUserIds.length || isBulkWorking}
              onClick={openBulkResetModal}
              type="button"
            >
              Reset Selected
            </button>
            <button
              className="rounded-lg px-4 py-2 bg-error text-on-error font-headline text-xs font-bold disabled:opacity-50"
              disabled={!selectedUserIds.length || isBulkWorking}
              onClick={openBulkDeleteModal}
              type="button"
            >
              Delete Selected
            </button>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl mb-6 bg-error/10 shadow-soft p-4">
            <p className="text-error font-headline text-sm font-bold">{error}</p>
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl mb-6 bg-secondary/10 shadow-soft p-4">
            <p className="text-secondary font-headline text-sm font-bold">{success}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="text-center py-16 text-on-surface-variant text-base">Loading registration numbers...</div>
        ) : (
          <div className="space-y-4">
            {visibleUsers.map((user) => (
              <article key={user.id} className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 md:p-7">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <input
                      checked={selectedUserIds.includes(user.id)}
                      className="mt-2 h-4 w-4 accent-[#b6171e] shrink-0"
                      onChange={() => toggleUserSelection(user.id)}
                      type="checkbox"
                      aria-label={`Select ${user.username || user.registration_number || 'user'}`}
                    />
                    <div className="space-y-3 min-w-0">
                      <button
                        className="text-left text-primary hover:underline font-headline text-xl md:text-2xl font-extrabold tracking-wide"
                        onClick={() => navigate(`/admin/registrations/${user.id}`)}
                        type="button"
                      >
                        {user.registration_number || user.username || 'N/A'}
                      </button>
                      <p className="text-sm text-on-surface-variant">
                        Username: {user.username || 'N/A'}
                      </p>
                      <p className="text-sm text-on-surface-variant break-all">
                        Email: {user.email || 'N/A'}
                      </p>
                      <p className="text-sm text-on-surface-variant">
                        Role: <span className="font-bold">{user.role || 'operator'}</span>
                      </p>
                      <p className="text-sm text-on-surface-variant">
                        Completed skills:{' '}
                        <span className="font-bold text-on-surface">
                          {Number(user.completed_rooms || 0)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col md:items-end gap-3">
                    <div className="flex flex-wrap justify-start md:justify-end gap-2">
                      <span className={`px-3 py-1 text-xs font-bold ${user.is_active ? 'bg-secondary/15 text-secondary' : 'bg-error/15 text-error'}`}>
                        {user.is_active ? 'Active' : 'Disabled'}
                      </span>
                      <span className={`px-3 py-1 text-xs font-bold ${user.role === 'admin' ? 'bg-primary/15 text-primary' : user.role === 'developer' ? 'bg-secondary/15 text-secondary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                        {user.role === 'admin' ? 'Admin' : user.role === 'developer' ? 'Developer' : 'Student'}
                      </span>
                      {isPermanentAdmin(user) ? (
                        <span className="rounded-lg px-3 py-1 text-xs font-bold bg-secondary/15 text-secondary">
                          Permanent
                        </span>
                      ) : null}
                    </div>
                    <button
                      className="rounded-full px-4 py-2 bg-primary text-on-primary font-headline text-sm font-bold"
                      onClick={() => navigate(`/admin/registrations/${user.id}`)}
                      type="button"
                    >
                      Open Profile
                    </button>
                    <div className="flex flex-wrap justify-start md:justify-end gap-2">
                      {user.role !== 'admin' ? (
                        <button
                          className="rounded-full px-3 py-2 bg-secondary text-on-secondary font-headline text-sm font-bold disabled:opacity-50"
                          disabled={isAdminWorking}
                          onClick={() => {
                            void promoteSingleAdmin(user)
                          }}
                          type="button"
                        >
                          Make Admin
                        </button>
                      ) : (
                        <button
                          className="rounded-lg px-3 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold disabled:opacity-50"
                          disabled={isAdminWorking || isPermanentAdmin(user)}
                          onClick={() => {
                            void revokeSingleAdmin(user)
                          }}
                          type="button"
                        >
                          {isPermanentAdmin(user) ? 'Permanent Admin' : 'Revoke Admin'}
                        </button>
                      )}
                      <button
                        className="rounded-lg px-3 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold disabled:opacity-50"
                        disabled={isBulkWorking}
                        onClick={() => {
                          openSingleResetModal(user)
                        }}
                        type="button"
                      >
                        Reset
                      </button>
                      <button
                        className="rounded-lg px-3 py-2 bg-error text-on-error font-headline text-xs font-bold disabled:opacity-50"
                        disabled={isBulkWorking || isPermanentAdmin(user)}
                        onClick={() => {
                          openSingleDeleteModal(user)
                        }}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {!visibleUsers.length ? (
              <div className="rounded-2xl bg-surface-container-lowest p-8 text-base text-on-surface-variant">
                <p>No users match your search.</p>
                {search ? (
                  <button
                    className="rounded-lg mt-4 px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold"
                    onClick={() => setSearch('')}
                    type="button"
                  >
                    Clear Search
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </section>
      {actionModal ? (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-lg bg-surface-container-lowest border border-outline-variant shadow-2xl">
            <div className={`h-1 ${actionModal.tone === 'danger' ? 'bg-error' : 'bg-primary'}`}></div>
            <div className="p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={`font-headline text-xs font-bold ${actionModal.tone === 'danger' ? 'text-error' : 'text-primary'}`}>
                    {actionModal.eyebrow}
                  </p>
                  <h2 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                    {actionModal.title}
                  </h2>
                </div>
                <button
                  className="rounded-xl inline-flex h-10 w-10 items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                  onClick={() => setActionModal(null)}
                  type="button"
                  aria-label="Close action modal"
                  disabled={isBulkWorking}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="rounded-2xl mt-6 bg-surface-container-high p-4 ">
                <p className="font-headline text-xs text-on-surface-variant font-bold">
                  Target
                </p>
                <p className="mt-1 font-headline text-lg font-bold text-on-background break-words">
                  {actionModal.target}
                </p>
              </div>

              <p className="mt-5 text-sm leading-relaxed text-on-surface-variant">
                {actionModal.description}
              </p>

              <div className="mt-7 flex flex-col sm:flex-row sm:justify-end gap-3">
                <button
                  className="rounded-xl px-5 py-3 bg-surface-container-high text-on-surface font-headline text-xs font-bold disabled:opacity-50"
                  onClick={() => setActionModal(null)}
                  type="button"
                  disabled={isBulkWorking}
                >
                  Cancel
                </button>
                <button
                  className={`px-5 py-3 font-headline text-xs font-bold disabled:opacity-50 ${
                    actionModal.tone === 'danger'
                      ? 'bg-error text-on-error'
                      : 'bg-primary text-on-primary'
                  }`}
                  onClick={() => {
                    void confirmModalAction()
                  }}
                  type="button"
                  disabled={isBulkWorking}
                >
                  {isBulkWorking ? 'Processing...' : actionModal.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {adminSuccessModal ? (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant shadow-2xl">
            <div className="rounded-xl h-1 bg-secondary"></div>
            <div className="p-7">
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-secondary text-4xl">verified_user</span>
                <div>
                  <p className="font-headline text-xs font-bold text-secondary">
                    Admin Added
                  </p>
                  <h2 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                    Admin Created Successfully
                  </h2>
                </div>
              </div>

              <div className="rounded-2xl mt-6 bg-surface-container-high p-4  space-y-2">
                <p className="text-sm text-on-surface-variant">
                  Username: <span className="font-bold text-on-surface">{adminSuccessModal.username}</span>
                </p>
                <p className="text-sm text-on-surface-variant break-all">
                  Email: <span className="font-bold text-on-surface">{adminSuccessModal.email}</span>
                </p>
                <p className="text-sm text-on-surface-variant">
                  Registration: <span className="font-bold text-on-surface">{adminSuccessModal.registrationNumber}</span>
                </p>
              </div>

              <button
                className="rounded-full mt-7 w-full px-5 py-3 bg-secondary text-on-secondary font-headline text-sm font-bold"
                onClick={() => setAdminSuccessModal(null)}
                type="button"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {duplicateAdminModal ? (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant shadow-2xl">
            <div className="rounded-xl h-1 bg-primary"></div>
            <div className="p-7">
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-primary text-4xl">manage_accounts</span>
                <div>
                  <p className="font-headline text-xs font-bold text-primary">
                    Existing Account
                  </p>
                  <h2 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                    User Already Exists
                  </h2>
                </div>
              </div>

              <p className="mt-5 text-sm leading-relaxed text-on-surface-variant">
                I found a matching account and selected it in the user list. Use the existing account instead of creating a duplicate.
              </p>

              <div className="rounded-2xl mt-5 bg-surface-container-high p-4  space-y-2">
                <p className="text-sm text-on-surface-variant">
                  Username: <span className="font-bold text-on-surface">{duplicateAdminModal.username}</span>
                </p>
                <p className="text-sm text-on-surface-variant break-all">
                  Email: <span className="font-bold text-on-surface">{duplicateAdminModal.email}</span>
                </p>
                <p className="text-sm text-on-surface-variant">
                  Registration: <span className="font-bold text-on-surface">{duplicateAdminModal.registrationNumber}</span>
                </p>
              </div>

              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <button
                  className="rounded-xl px-5 py-3 bg-surface-container-high text-on-surface font-headline text-xs font-bold"
                  onClick={() => setDuplicateAdminModal(null)}
                  type="button"
                >
                  View Selected
                </button>
                {!duplicateAdminModal.isAdmin ? (
                  <button
                    className="rounded-full px-5 py-3 bg-primary text-on-primary font-headline text-sm font-bold disabled:opacity-50"
                    disabled={isAdminWorking}
                    onClick={() => {
                      const user = users.find((entry) => entry.id === duplicateAdminModal.id)
                      if (user) {
                        void promoteSingleAdmin(user)
                      }
                      setDuplicateAdminModal(null)
                    }}
                    type="button"
                  >
                    Promote Existing User
                  </button>
                ) : (
                  <button
                    className="rounded-full px-5 py-3 bg-secondary text-on-secondary font-headline text-sm font-bold"
                    onClick={() => setDuplicateAdminModal(null)}
                    type="button"
                  >
                    Already Admin
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default AdminRegistrationsManagementPage
