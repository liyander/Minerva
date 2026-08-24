const DEFAULT_API_BASE_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:4000/api`
    : 'http://localhost:4000/api'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL

function handleAuthExpiry() {
  try {
    localStorage.removeItem('incognitrix_auth_session')
  } catch {
    // ignore storage errors
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('incognitrix:auth-expired'))
  }
}

export function getAuthToken() {
  try {
    const raw = localStorage.getItem('incognitrix_auth_session')
    if (!raw) {
      return ''
    }

    const parsed = JSON.parse(raw)
    return parsed?.token || ''
  } catch {
    return ''
  }
}

export async function apiFetch(path, options = {}) {
  const { suppressAuthExpiry, ...fetchOptions } = options
  const method = (options.method || 'GET').toUpperCase()
  const isGet = method === 'GET'
  const requestPath = isGet
    ? `${path}${path.includes('?') ? '&' : '?'}_t=${Date.now()}`
    : path

  const headers = new Headers(options.headers || {})
  headers.set('Content-Type', 'application/json')

  const token = options.token || getAuthToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${requestPath}`, {
    ...fetchOptions,
    method,
    cache: 'no-store',
    headers,
  })

  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '')

  if (!response.ok) {
    const message = body?.message || response.statusText || 'Request failed'

    if (response.status === 401 && !suppressAuthExpiry) {
      handleAuthExpiry()
    }

    throw new Error(message)
  }

  return body
}
