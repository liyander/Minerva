import { API_BASE_URL, apiFetch } from './services/api'

const AUTH_KEY = 'incognitrix_auth_session'

export const ROLES = {
  TRAINEE: 'trainee',
  TRAINER: 'trainer',
  ADMIN: 'admin',
  DEVELOPER: 'developer',
}

// 'operator' is the legacy stored value for a trainee.
const ROLE_ALIASES = { operator: ROLES.TRAINEE, student: ROLES.TRAINEE, instructor: ROLES.TRAINER }

export function normaliseRole(role) {
  const value = String(role || '').trim().toLowerCase()
  return ROLE_ALIASES[value] || value || ROLES.TRAINEE
}

export function roleLabel(role) {
  return (
    {
      [ROLES.TRAINEE]: 'Trainee',
      [ROLES.TRAINER]: 'Trainer',
      [ROLES.ADMIN]: 'Admin',
      [ROLES.DEVELOPER]: 'Developer',
    }[normaliseRole(role)] || 'Trainee'
  )
}

export function hasRole(session, ...roles) {
  const actual = normaliseRole(session?.role)
  return roles.map(normaliseRole).includes(actual)
}

export const TEMP_USERS = [
  {
    username: 'operator01',
    password: 'RedTeam@123',
    role: 'operator',
  },
  {
    username: 'admin01',
    password: 'AdminControl@123',
    role: 'admin',
  },
]

export async function loginUser(username, password) {
  const identifier = (username || '').trim()
  const response = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })

  const session = {
    username: response.user.username,
    email: response.user.email || '',
    registrationNumber: response.user.registrationNumber || '',
    role: normaliseRole(response.user.role),
    token: response.token,
    loggedInAt: Date.now(),
  }

  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(session))
  } catch {
    return null
  }

  return session
}

export async function signupUser({ firstName, lastName, email, password, role }) {
  const response = await apiFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ firstName, lastName, email, password, role }),
  })

  // Trainers are held for admin approval and receive no token.
  if (response.pendingApproval) {
    return { pendingApproval: true, message: response.message }
  }

  const session = {
    username: response.user.username,
    email: response.user.email || '',
    firstName: response.user.firstName || '',
    lastName: response.user.lastName || '',
    registrationNumber: '',
    role: normaliseRole(response.user.role),
    token: response.token,
    loggedInAt: Date.now(),
  }

  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(session))
  } catch {
    return null
  }

  return session
}

export async function registerUser({ registrationNumber, email, password }) {
  const response = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ registrationNumber, email, password }),
  })

  const session = {
    username: response.user.username,
    email: response.user.email || '',
    registrationNumber: response.user.registrationNumber || '',
    role: normaliseRole(response.user.role),
    token: response.token,
    loggedInAt: Date.now(),
  }

  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(session))
  } catch {
    return null
  }

  return session
}

export function logoutUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    const token = raw ? JSON.parse(raw)?.token : ''
    if (token && typeof fetch === 'function') {
      void fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // best-effort logout presence update
  }

  try {
    localStorage.removeItem(AUTH_KEY)
  } catch {
    // no-op for environments where storage is unavailable
  }
}

export function isAuthenticatedUser() {
  return Boolean(getAuthSession())
}

export function getAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw)
    if (!parsed?.username || !parsed?.role) {
      return null
    }

    // Sessions stored before the role rename still carry 'operator'.
    return { ...parsed, role: normaliseRole(parsed.role) }
  } catch {
    return null
  }
}
