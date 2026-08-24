import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import {
  CTF_EVENTS_UPDATED_EVENT,
  CTF_EVENTS_UPDATED_KEY,
  fetchCtfEvents,
  setCtfRegistration,
  triggerCtfNotifications,
} from '../services/ctfEvents'

const NOTIFICATIONS_UPDATED_EVENT = 'incognitrix:notifications-updated'
const NOTIFICATIONS_UPDATED_KEY = 'incognitrix_notifications_updated_at'

function formatDateTime(value) {
  if (!value) {
    return 'N/A'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'N/A'
  }

  return date.toLocaleString()
}

function EventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)

  const loadEvents = async () => {
    try {
      setLoading(true)
      const data = await fetchCtfEvents()
      setEvents(data)
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load upcoming events')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadEvents()
  }, [])

  useEffect(() => {
    const syncEvents = () => {
      void loadEvents()
    }

    const onStorage = (event) => {
      if (event.key === CTF_EVENTS_UPDATED_KEY) {
        syncEvents()
      }
    }

    window.addEventListener(CTF_EVENTS_UPDATED_EVENT, syncEvents)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(CTF_EVENTS_UPDATED_EVENT, syncEvents)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    const runAutoNotifications = async () => {
      try {
        const result = await triggerCtfNotifications()
        if ((result?.created || 0) > 0) {
          window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT))
          localStorage.setItem(NOTIFICATIONS_UPDATED_KEY, String(Date.now()))
        }
      } catch {
        // Intentionally non-blocking for page rendering.
      }
    }

    void runAutoNotifications()
  }, [])

  const upcomingEvents = useMemo(() => {
    const now = Date.now()
    return (events || [])
      .filter((event) => new Date(event.registration_deadline).getTime() >= now)
      .sort((a, b) => new Date(a.live_time).getTime() - new Date(b.live_time).getTime())
  }, [events])

  const handleRegistrationToggle = async (eventId, nextState) => {
    try {
      setSavingId(eventId)
      await setCtfRegistration(eventId, nextState)
      setEvents((current) =>
        current.map((event) =>
          event.id === eventId
            ? { ...event, is_registered: nextState }
            : event,
        ),
      )
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to update registration state')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 pt-24 pb-10">
      <section className="max-w-6xl mx-auto">
        <PageHeader
          accent="lavender"
          description="Live sessions, workshops and deadlines. Register your interest and we will remind you before each one starts."
          eyebrow="Calendar"
          icon="event_upcoming"
          title="Upcoming events"
        />

        <div className="h-8"></div>

        {error ? (
          <div className="rounded-2xl mb-6 bg-error/10 shadow-soft p-4">
            <p className="text-error font-headline text-xs font-bold">{error}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl bg-surface-container-lowest p-8 text-center">
            <p className="text-on-surface-variant">Loading upcoming events…</p>
          </div>
        ) : upcomingEvents.length === 0 ? (
          <div className="rounded-2xl bg-surface-container-lowest p-10 text-center border-l-4 border-outline-variant/40">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant">event_busy</span>
            <p className="mt-3 font-headline text-lg font-bold">No open event registrations</p>
            <p className="text-sm text-on-surface-variant mt-2">
              Events whose registration deadline has passed are automatically hidden.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {upcomingEvents.map((event) => (
              <article
                className="rounded-2xl bg-surface-container-lowest shadow-soft/60 p-6 flex flex-col gap-5"
                key={event.id}
              >
                <div>
                  <p className="font-headline text-xs font-bold text-secondary">
                    Next CTF
                  </p>
                  <h2 className="font-headline text-2xl font-extrabold tracking-tight mt-2">{event.name}</h2>
                </div>

                <div className="space-y-2 text-sm text-on-surface-variant">
                  <p>
                    <span className="font-headline text-xs font-bold text-on-background">Registration Deadline: </span>
                    {formatDateTime(event.registration_deadline)}
                  </p>
                  <p>
                    <span className="font-headline text-xs font-bold text-on-background">Live Time: </span>
                    {formatDateTime(event.live_time)}
                  </p>
                  <p>
                    <span className="font-headline text-xs font-bold text-on-background">Weightage: </span>
                    {Number(event.weight || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                  {event.event_format ? (
                    <p>
                      <span className="font-headline text-xs font-bold text-on-background">Format: </span>
                      {event.event_format}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-3 mt-auto">
                  <button
                    className={`px-5 py-2.5 font-headline text-xs font-bold transition-colors ${
                      event.is_registered
                        ? 'bg-secondary/15 text-secondary hover:bg-secondary/25'
                        : 'bg-primary text-on-primary hover:opacity-90'
                    }`}
                    disabled={savingId === event.id}
                    onClick={() => handleRegistrationToggle(event.id, !event.is_registered)}
                    type="button"
                  >
                    {savingId === event.id
                      ? 'Saving...'
                      : event.is_registered
                        ? 'Registered'
                        : 'Mark as Registered'}
                  </button>

                  <a
                    className="rounded-lg px-5 py-2.5 bg-surface-container-high text-on-surface font-headline text-xs font-bold hover:text-primary transition-colors"
                    href={event.registration_link}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Open Registration
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default EventsPage
