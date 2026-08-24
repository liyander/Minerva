import { apiFetch } from './api'

export const CTF_EVENTS_UPDATED_EVENT = 'incognitrix:ctf-events-updated'
export const CTF_EVENTS_UPDATED_KEY = 'incognitrix_ctf_events_updated_at'

export function broadcastCtfEventsUpdated() {
  window.dispatchEvent(new Event(CTF_EVENTS_UPDATED_EVENT))
  localStorage.setItem(CTF_EVENTS_UPDATED_KEY, String(Date.now()))
}

export async function fetchCtfEvents() {
  const response = await apiFetch('/ctf-events')
  return Array.isArray(response) ? response : []
}

export async function createCtfEvent(payload) {
  const response = await apiFetch('/ctf-events', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  broadcastCtfEventsUpdated()
  return response
}

export async function updateCtfEvent(eventId, payload) {
  const response = await apiFetch(`/ctf-events/${eventId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  broadcastCtfEventsUpdated()
  return response
}

export async function deleteCtfEvent(eventId) {
  const response = await apiFetch(`/ctf-events/${eventId}`, {
    method: 'DELETE',
  })
  broadcastCtfEventsUpdated()
  return response
}

export async function syncCtfTimeEvents() {
  const response = await apiFetch('/ctf-events/sync-ctftime', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  broadcastCtfEventsUpdated()
  return response
}

export async function setCtfRegistration(eventId, registered) {
  const response = await apiFetch(`/ctf-events/${eventId}/registration`, {
    method: 'POST',
    body: JSON.stringify({ registered }),
  })
  broadcastCtfEventsUpdated()
  return response
}

export async function triggerCtfNotifications() {
  const response = await apiFetch('/ctf-events/trigger-notifications', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return response
}

export function toDatetimeInputValue(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
