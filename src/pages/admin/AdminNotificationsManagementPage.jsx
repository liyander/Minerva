import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../services/api'

const NOTIFICATIONS_UPDATED_EVENT = 'incognitrix:notifications-updated'
const NOTIFICATIONS_UPDATED_KEY = 'incognitrix_notifications_updated_at'

function AdminNotificationsManagementPage() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'info',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const broadcastNotificationsUpdated = () => {
    window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT))
    localStorage.setItem(NOTIFICATIONS_UPDATED_KEY, String(Date.now()))
  }

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const data = await apiFetch('/notifications/admin/all')
      setNotifications(data)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  // Handle form input change
  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!formData.title.trim() || !formData.message.trim()) {
      setError('Title and message are required')
      return
    }

    try {
      const method = editingId ? 'PUT' : 'POST'
      const url = editingId
        ? `/notifications/${editingId}`
        : '/notifications'

      await apiFetch(url, {
        method,
        body: JSON.stringify(formData),
      })

      setSuccess(editingId ? 'Notification updated successfully' : 'Notification created successfully')
      setFormData({ title: '', message: '', type: 'info' })
      setEditingId(null)
      setShowForm(false)
      broadcastNotificationsUpdated()
      await fetchNotifications()
    } catch (err) {
      setError(err.message)
    }
  }

  // Handle edit
  const handleEdit = (notification) => {
    setFormData({
      title: notification.title,
      message: notification.message,
      type: notification.type,
    })
    setEditingId(notification.id)
    setShowForm(true)
  }

  // Handle delete
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this notification?')) return

    try {
      await apiFetch(`/notifications/${id}`, { method: 'DELETE' })

      setSuccess('Notification deleted successfully')
      broadcastNotificationsUpdated()
      await fetchNotifications()
    } catch (err) {
      setError(err.message)
    }
  }

  // Handle toggle active status
  const handleToggleActive = async (id, currentStatus) => {
    try {
      await apiFetch(`/notifications/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !currentStatus }),
      })

      setSuccess('Notification status updated successfully')
      broadcastNotificationsUpdated()
      await fetchNotifications()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-6xl mx-auto">
        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10 mb-8">
          <button
            className="rounded-lg inline-flex items-center gap-2 mb-6 px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-primary transition-colors"
            onClick={() => navigate('/admin')}
            type="button"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to Admin Panel
          </button>
          <p className="font-headline text-xs text-primary font-bold">
            Content Management
          </p>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight mt-3">
            Notifications Manager
          </h1>
          <p className="text-sm text-on-surface-variant mt-4 max-w-2xl">
            Create and manage system notifications that will appear in the user panel for all operators.
          </p>
        </header>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-6 bg-error/10 shadow-soft p-4 rounded">
            <p className="text-error font-headline text-sm font-bold">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-6 bg-secondary/10 shadow-soft p-4 rounded">
            <p className="text-secondary font-headline text-sm font-bold">{success}</p>
          </div>
        )}

        {/* Create/Edit Form */}
        <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 mb-8">
          <button
            type="button"
            onClick={() => {
              setShowForm(!showForm)
              setEditingId(null)
              setFormData({ title: '', message: '', type: 'info' })
            }}
            className="rounded-full mb-6 bg-primary text-on-primary px-6 py-2.5 font-headline text-sm font-bold hover:opacity-90 transition-colors"
          >
            {showForm ? 'Cancel' : '+ CREATE NEW NOTIFICATION'}
          </button>

          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block font-headline text-xs font-bold text-on-surface-variant mb-2">
                  Notification Title
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="e.g., New Challenge Available"
                  className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                />
              </div>

              <div>
                <label className="block font-headline text-xs font-bold text-on-surface-variant mb-2">
                  Message
                </label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  placeholder="Notification message content..."
                  rows={4}
                  className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 focus:ring-0 font-body text-sm py-3 px-4 outline-none resize-none"
                />
              </div>

              <div>
                <label className="block font-headline text-xs font-bold text-on-surface-variant mb-2">
                  Notification Type
                </label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 focus:ring-0 font-body text-sm py-3 px-4 outline-none cursor-pointer"
                >
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
              </div>

              <button
                type="submit"
                className="rounded-full bg-primary text-on-primary px-6 py-3 font-headline text-sm font-bold hover:opacity-90 transition-colors"
              >
                {editingId ? 'Update notification' : 'Create notification'}
              </button>
            </form>
          )}
        </div>

        {/* Notifications List */}
        <div>
          <h2 className="font-headline text-2xl font-bold tracking-tight mb-6 text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">notifications_active</span>
            Active Notifications ({notifications.length})
          </h2>

          {loading ? (
            <div className="text-center py-12">
              <p className="text-on-surface-variant">Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-2xl bg-surface-container-lowest border-l-4 border-outline-variant/30 p-8 text-center">
              <span className="material-symbols-outlined text-6xl text-neutral-300 mb-4 block">
                notifications_none
              </span>
              <p className="font-headline text-lg font-bold text-on-background">No Notifications</p>
              <p className="text-sm text-on-surface-variant mt-2">
                Create your first notification to get started.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-2xl bg-surface-container-lowest border-l-4 p-6 ${
                    notification.is_active ? 'border-l-primary' : 'border-l-outline-variant/50 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-headline text-lg font-bold tracking-tight text-on-background">
                          {notification.title}
                        </h3>
                        <span
                          className={`px-3 py-1 text-xs font-headline font-bold rounded inline-block ${
                            notification.type === 'info'
                              ? 'bg-primary/10 text-primary'
                              : notification.type === 'success'
                                ? 'bg-secondary/10 text-secondary'
                                : notification.type === 'warning'
                                  ? 'bg-yellow-500/10 text-yellow-600'
                                  : 'bg-error/10 text-error'
                          }`}
                        >
                          {notification.type}
                        </span>
                      </div>
                      <p className="text-sm text-on-surface-variant mb-3">{notification.message}</p>
                      <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                        <span>Created: {new Date(notification.created_at).toLocaleDateString()}</span>
                        {notification.updated_at && notification.updated_at !== notification.created_at && (
                          <span>Updated: {new Date(notification.updated_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(notification.id, notification.is_active)}
                        className={`px-4 py-2 font-headline text-xs font-bold transition-colors ${
                          notification.is_active
                            ? 'bg-surface-container-high text-on-surface-variant hover:text-error'
                            : 'bg-secondary/10 text-secondary hover:bg-secondary/20'
                        }`}
                      >
                        {notification.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(notification)}
                        className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-primary transition-colors"
                      >
                        EDIT
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(notification.id)}
                        className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-error transition-colors"
                      >
                        DELETE
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default AdminNotificationsManagementPage
