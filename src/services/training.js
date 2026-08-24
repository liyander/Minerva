import { apiFetch } from './api'

const json = (body) => ({ body: JSON.stringify(body) })

/* ------------------------------------------------------------- profiles --- */
export const fetchMyProfile = () => apiFetch('/profiles/me')
export const updateMyProfile = (payload) =>
  apiFetch('/profiles/me', { method: 'PUT', ...json(payload) })
export const fetchProfile = (userId) => apiFetch(`/profiles/${userId}`)

export const addProfileEntry = (section, payload) =>
  apiFetch(`/profiles/me/${section}`, { method: 'POST', ...json(payload) })
export const updateProfileEntry = (section, id, payload) =>
  apiFetch(`/profiles/me/${section}/${id}`, { method: 'PUT', ...json(payload) })
export const deleteProfileEntry = (section, id) =>
  apiFetch(`/profiles/me/${section}/${id}`, { method: 'DELETE' })

/* ---------------------------------------------------------- assessments --- */
export const fetchAssessments = (params = {}) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  ).toString()
  return apiFetch(`/assessments${query ? `?${query}` : ''}`)
}
export const fetchAssessment = (id) => apiFetch(`/assessments/${id}`)
export const fetchAssessmentSubjects = () => apiFetch('/assessments/subjects')
export const createAssessment = (payload) =>
  apiFetch('/assessments', { method: 'POST', ...json(payload) })
export const updateAssessment = (id, payload) =>
  apiFetch(`/assessments/${id}`, { method: 'PUT', ...json(payload) })
export const deleteAssessment = (id) => apiFetch(`/assessments/${id}`, { method: 'DELETE' })
export const saveAssessmentQuestions = (id, questions) =>
  apiFetch(`/assessments/${id}/questions`, { method: 'PUT', ...json({ questions }) })
export const submitAssessment = (id, answers, paper) =>
  apiFetch(`/assessments/${id}/attempts`, { method: 'POST', ...json({ answers, paper }) })
export const fetchMyAttempts = () => apiFetch('/assessments/attempts/me')
export const fetchAssessmentResults = (id) => apiFetch(`/assessments/${id}/results`)

/* ---------------------------------------------------------- enrolments ---- */
export const fetchMyEnrollments = () => apiFetch('/training/enrollments/me')
export const enroll = (payload) => apiFetch('/training/enrollments', { method: 'POST', ...json(payload) })
export const unenroll = (id) => apiFetch(`/training/enrollments/${id}`, { method: 'DELETE' })

/* ------------------------------------------------------------- feedback --- */
export const fetchCourseFeedback = (roomId) => apiFetch(`/training/feedback/course/${roomId}`)
export const submitFeedback = (payload) =>
  apiFetch('/training/feedback', { method: 'POST', ...json(payload) })

/* -------------------------------------------------------------- library --- */
export const fetchLibrary = (params = {}) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  ).toString()
  return apiFetch(`/training/library${query ? `?${query}` : ''}`)
}
export const fetchLibraryFile = (id) => apiFetch(`/training/library/${id}/file`)
export const createLibraryItem = (payload) =>
  apiFetch('/training/library', { method: 'POST', ...json(payload) })
export const updateLibraryItem = (id, payload) =>
  apiFetch(`/training/library/${id}`, { method: 'PUT', ...json(payload) })
export const deleteLibraryItem = (id) => apiFetch(`/training/library/${id}`, { method: 'DELETE' })

/* --------------------------------------------------------- competencies --- */
export const fetchMyCompetencies = () => apiFetch('/training/competencies/me')
export const saveCompetency = (payload) =>
  apiFetch('/training/competencies/me', { method: 'PUT', ...json(payload) })
export const deleteCompetency = (id) =>
  apiFetch(`/training/competencies/me/${id}`, { method: 'DELETE' })
export const matchTrainers = (subject) =>
  apiFetch(`/training/competencies/match?subject=${encodeURIComponent(subject)}`)
export const verifyCompetency = (id, isVerified) =>
  apiFetch(`/training/competencies/${id}/verify`, { method: 'PUT', ...json({ isVerified }) })
export const fetchTrainers = () => apiFetch('/training/trainers')

/* ------------------------------------------------------------- homepage --- */
export const fetchHomepagePosts = (category) =>
  apiFetch(`/training/homepage${category ? `?category=${encodeURIComponent(category)}` : ''}`)
export const createHomepagePost = (payload) =>
  apiFetch('/training/homepage', { method: 'POST', ...json(payload) })
export const updateHomepagePost = (id, payload) =>
  apiFetch(`/training/homepage/${id}`, { method: 'PUT', ...json(payload) })
export const deleteHomepagePost = (id) =>
  apiFetch(`/training/homepage/${id}`, { method: 'DELETE' })

/* ---------------------------------------------------------------- admin --- */
export const fetchAdminUsers = (params = {}) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  ).toString()
  return apiFetch(`/admin/users${query ? `?${query}` : ''}`)
}
export const fetchPendingCount = () => apiFetch('/admin/users/pending-count')
export const setUserApproval = (id, status, reason) =>
  apiFetch(`/admin/users/${id}/approval`, { method: 'PUT', ...json({ status, reason }) })
export const setUserRole = (id, role) =>
  apiFetch(`/admin/users/${id}/role`, { method: 'PUT', ...json({ role }) })
export const setUserActive = (id, isActive) =>
  apiFetch(`/admin/users/${id}/active`, { method: 'PUT', ...json({ isActive }) })
export const fetchAdminDashboard = () => apiFetch('/admin/dashboard')
export const fetchParticipation = () => apiFetch('/admin/participation')
