import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createCtfEvent,
  deleteCtfEvent,
  fetchCtfEvents,
  syncCtfTimeEvents,
  toDatetimeInputValue,
  updateCtfEvent,
} from '../../services/ctfEvents'

const initialFormState = {
  name: '',
  registrationDeadline: '',
  liveTime: '',
  registrationLink: '',
  weight: '',
  isActive: true,
}

function AdminEventsManagementPage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState(initialFormState)
  const [syncing, setSyncing] = useState(false)
  const [syncSummary, setSyncSummary] = useState(null)

  const loadEvents = async ({ sync = false } = {}) => {
    let syncErrorMessage = ''
    try {
      setLoading(true)
      if (sync) {
        try {
          setSyncing(true)
          const summary = await syncCtfTimeEvents()
          setSyncSummary(summary)
        } catch (syncError) {
          setSyncSummary(null)
          syncErrorMessage = syncError.message || 'Failed to sync the events feed events'
          setError(syncErrorMessage)
        } finally {
          setSyncing(false)
        }
      }
      const data = await fetchCtfEvents()
      setEvents(data)
      if (!syncErrorMessage) {
        setError('')
      }
    } catch (err) {
      setError(err.message || 'Failed to load events')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadEvents({ sync: true })
  }, [])

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target
    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const resetForm = () => {
    setFormData(initialFormState)
    setEditingId(null)
    setShowForm(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!formData.name.trim() || !formData.registrationDeadline || !formData.liveTime || !formData.registrationLink.trim()) {
      setError('All fields are required')
      return
    }

    try {
      const payload = {
        name: formData.name,
        registrationDeadline: formData.registrationDeadline,
        liveTime: formData.liveTime,
        registrationLink: formData.registrationLink,
        weight: formData.weight,
        isActive: formData.isActive,
      }

      if (editingId) {
        await updateCtfEvent(editingId, payload)
        setSuccess('event updated successfully')
      } else {
        await createCtfEvent(payload)
        setSuccess('event created successfully')
      }

      resetForm()
      await loadEvents()
    } catch (err) {
      setError(err.message || 'Failed to save event')
    }
  }

  const handleEdit = (eventItem) => {
    setFormData({
      name: eventItem.name || '',
      registrationDeadline: toDatetimeInputValue(eventItem.registration_deadline),
      liveTime: toDatetimeInputValue(eventItem.live_time),
      registrationLink: eventItem.registration_link || '',
      weight: eventItem.weight ?? '',
      isActive: Boolean(eventItem.is_active),
    })
    setEditingId(eventItem.id)
    setShowForm(true)
  }

  const handleDelete = async (eventId) => {
    if (!window.confirm('Delete this event?')) {
      return
    }

    try {
      await deleteCtfEvent(eventId)
      setSuccess('event deleted successfully')
      await loadEvents()
    } catch (err) {
      setError(err.message || 'Failed to delete event')
    }
  }

  const handleSyncCtfTime = async () => {
    setError('')
    setSuccess('')
    try {
      setSyncing(true)
      const summary = await syncCtfTimeEvents()
      setSyncSummary(summary)
      setSuccess(`the events feed sync complete: ${summary.created || 0} created, ${summary.updated || 0} updated`)
      await loadEvents()
    } catch (err) {
      setError(err.message || 'Failed to sync the events feed events')
    } finally {
      setSyncing(false)
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
          <p className="font-headline text-xs text-secondary font-bold">
            Event Management
          </p>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight mt-3">
            Upcoming Event Manager
          </h1>
          <p className="text-sm text-on-surface-variant mt-4 max-w-2xl">
            Configure CTF name, registration deadline, live time, registration link, and weightage. Weighted upcoming the events feed events are imported automatically.
          </p>
        </header>

        {error ? (
          <div className="rounded-2xl mb-6 bg-error/10 shadow-soft p-4">
            <p className="text-error font-headline text-xs font-bold">{error}</p>
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl mb-6 bg-secondary/10 shadow-soft p-4">
            <p className="text-secondary font-headline text-xs font-bold">{success}</p>
          </div>
        ) : null}

        <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 mb-8">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <button
              className="rounded-full bg-primary text-on-primary px-6 py-2.5 font-headline text-sm font-bold hover:opacity-90 transition-colors"
              onClick={() => {
                if (showForm) {
                  resetForm()
                } else {
                  setShowForm(true)
                }
              }}
              type="button"
            >
              {showForm ? 'Cancel' : '+ Add Upcoming Event'}
            </button>
            <button
              className="rounded-lg bg-surface-container-high text-on-surface px-6 py-2.5 font-headline text-xs font-bold hover:text-secondary transition-colors disabled:opacity-60"
              disabled={syncing}
              onClick={handleSyncCtfTime}
              type="button"
            >
              {syncing ? 'Syncing the events feed...' : 'Sync the events feed'}
            </button>
          </div>

          {syncSummary ? (
            <p className="rounded-2xl mb-6 bg-secondary/10 shadow-soft p-4 text-secondary font-headline text-xs font-bold">
              the events feed weighted upcoming sync: {syncSummary.created || 0} created / {syncSummary.updated || 0} updated
            </p>
          ) : null}

          {showForm ? (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block font-headline text-xs font-bold text-on-surface-variant mb-2">
                    CTF Name
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="name"
                    onChange={handleInputChange}
                    placeholder="e.g., Global Event: Red Alert"
                    type="text"
                    value={formData.name}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold text-on-surface-variant mb-2">
                    Registration Link
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="registrationLink"
                    onChange={handleInputChange}
                    placeholder="https://..."
                    type="url"
                    value={formData.registrationLink}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold text-on-surface-variant mb-2">
                    Registration Deadline
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="registrationDeadline"
                    onChange={handleInputChange}
                    type="datetime-local"
                    value={formData.registrationDeadline}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold text-on-surface-variant mb-2">
                    CTF Live Time
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="liveTime"
                    onChange={handleInputChange}
                    type="datetime-local"
                    value={formData.liveTime}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold text-on-surface-variant mb-2">
                    Weightage
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    min="0"
                    name="weight"
                    onChange={handleInputChange}
                    placeholder="e.g., 25"
                    step="0.01"
                    type="number"
                    value={formData.weight}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4 pt-2 md:flex-row md:items-center md:justify-between">
                <label className="rounded-xl inline-flex items-center gap-3 text-sm text-on-surface-variant bg-surface-container-high px-4 py-3 w-fit">
                  <input
                    checked={formData.isActive}
                    className="h-4 w-4 accent-[#b6171e]"
                    name="isActive"
                    onChange={handleInputChange}
                    type="checkbox"
                  />
                  Event Active
                </label>

                <button
                  className="rounded-full w-full md:w-auto min-w-[220px] bg-primary text-on-primary px-6 py-3 font-headline text-sm font-bold hover:opacity-90 transition-colors"
                  type="submit"
                >
                  {editingId ? 'Update CTF Event' : 'Create CTF Event'}
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <div>
          <h2 className="font-headline text-2xl font-bold tracking-tight mb-6 text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">event_upcoming</span>
            Configured Events ({events.length})
          </h2>

          {loading ? (
            <div className="rounded-2xl bg-surface-container-lowest p-8 text-center">
              <p className="text-on-surface-variant">Loading events...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-2xl bg-surface-container-lowest p-10 text-center border-l-4 border-outline-variant/40">
              <p className="font-headline text-lg font-bold">No events configured</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {events.map((event) => {
                const deadlinePassed = new Date(event.registration_deadline).getTime() < Date.now()
                return (
                  <div className="rounded-2xl bg-surface-container-lowest shadow-soft/50 p-6" key={event.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <h3 className="font-headline text-lg font-bold">{event.name}</h3>
                        <p className="text-xs text-on-surface-variant">
                          Deadline: {new Date(event.registration_deadline).toLocaleString()}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          Live: {new Date(event.live_time).toLocaleString()}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          Registered Players: {event.registered_count || 0}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          Weightage: {Number(event.weight || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <span className={`px-2 py-1 text-xs font-headline font-bold ${event.is_active ? 'bg-secondary/15 text-secondary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                            {event.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <span className="rounded-full px-2 py-1 text-xs font-headline font-bold bg-surface-container-high text-on-surface-variant">
                            {event.source === 'ctftime' ? 'the events feed' : 'Manual'}
                          </span>
                          {event.event_format ? (
                            <span className="rounded-full px-2 py-1 text-xs font-headline font-bold bg-surface-container-high text-on-surface-variant">
                              {event.event_format}
                            </span>
                          ) : null}
                          {deadlinePassed ? (
                            <span className="rounded-lg px-2 py-1 text-xs font-headline font-bold bg-error/15 text-error">
                              Deadline Passed
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-primary transition-colors"
                          onClick={() => handleEdit(event)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-error transition-colors"
                          onClick={() => handleDelete(event.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default AdminEventsManagementPage
