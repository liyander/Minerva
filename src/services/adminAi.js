import { apiFetch } from './api'

export function fetchAdminAiInsights() {
  return apiFetch('/admin-ai/insights')
}

export function fetchAdminAiSessions(limit = 30) {
  return apiFetch(`/admin-ai/sessions?limit=${encodeURIComponent(limit)}`)
}

export function createAdminAiSession(title = 'New Session') {
  return apiFetch('/admin-ai/sessions', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export function deleteAdminAiSession(sessionId) {
  return apiFetch(`/admin-ai/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}

export function fetchAdminAiHistory(sessionId, limit = 60) {
  const query = new URLSearchParams({ limit: String(limit) })
  if (sessionId) {
    query.set('sessionId', String(sessionId))
  }

  return apiFetch(`/admin-ai/history?${query.toString()}`)
}

export function sendAdminAiMessage(message, history = [], sessionId = null) {
  return apiFetch('/admin-ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history, sessionId }),
  })
}
