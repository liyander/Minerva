import { API_BASE_URL, apiFetch, getAuthToken } from './api'

const json = (body) => ({ body: JSON.stringify(body) })

const query = (params = {}) => {
  const search = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== null),
  ).toString()
  return search ? `?${search}` : ''
}

/* ----------------------------------------------------------------- files --- */
export const fetchFileConfig = () => apiFetch('/files/config')
export const uploadFile = (payload) => apiFetch('/files', { method: 'POST', ...json(payload) })
export const deleteFile = (id) => apiFetch(`/files/${id}`, { method: 'DELETE' })
export const fetchStorageStats = () => apiFetch('/files/admin/stats')

/** Direct URL for an <img>/<video> src or a download link. */
export const fileUrl = (id, { download = false } = {}) =>
  `${API_BASE_URL}/files/${id}${download ? '?download=true' : ''}`

/**
 * The <video>/<a> element cannot send an Authorization header, so fetch the
 * bytes once and hand back a blob URL the element can use.
 */
export async function fetchFileBlobUrl(id) {
  const response = await fetch(fileUrl(id), {
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  })
  if (!response.ok) throw new Error('Could not load that file')
  return URL.createObjectURL(await response.blob())
}

/* ----------------------------------------------------------- assignments --- */
export const fetchAssignments = (params) => apiFetch(`/assignments${query(params)}`)
export const fetchAssignment = (id) => apiFetch(`/assignments/${id}`)
export const createAssignment = (payload) =>
  apiFetch('/assignments', { method: 'POST', ...json(payload) })
export const updateAssignment = (id, payload) =>
  apiFetch(`/assignments/${id}`, { method: 'PUT', ...json(payload) })
export const deleteAssignment = (id) => apiFetch(`/assignments/${id}`, { method: 'DELETE' })
export const saveRubric = (id, criteria) =>
  apiFetch(`/assignments/${id}/rubric`, { method: 'PUT', ...json({ criteria }) })
export const submitAssignment = (id, payload) =>
  apiFetch(`/assignments/${id}/submissions`, { method: 'POST', ...json(payload) })
export const fetchSubmissions = (id) => apiFetch(`/assignments/${id}/submissions`)
export const gradeSubmission = (submissionId, payload) =>
  apiFetch(`/assignments/submissions/${submissionId}/grade`, { method: 'PUT', ...json(payload) })
export const fetchMySubmissions = () => apiFetch('/assignments/submissions/me')

/* -------------------------------------------------------- question banks --- */
export const fetchQuestionBanks = (params) => apiFetch(`/question-banks${query(params)}`)
export const fetchQuestionBank = (id) => apiFetch(`/question-banks/${id}`)
export const createQuestionBank = (payload) =>
  apiFetch('/question-banks', { method: 'POST', ...json(payload) })
export const updateQuestionBank = (id, payload) =>
  apiFetch(`/question-banks/${id}`, { method: 'PUT', ...json(payload) })
export const deleteQuestionBank = (id) => apiFetch(`/question-banks/${id}`, { method: 'DELETE' })
export const saveBankItems = (id, items) =>
  apiFetch(`/question-banks/${id}/items`, { method: 'PUT', ...json({ items }) })
export const copyBankToAssessment = (bankId, assessmentId) =>
  apiFetch(`/question-banks/${bankId}/copy-to-assessment/${assessmentId}`, { method: 'POST' })

/* --------------------------------------------------------------- cohorts --- */
export const fetchCohorts = () => apiFetch('/cohorts')
export const createCohort = (payload) => apiFetch('/cohorts', { method: 'POST', ...json(payload) })
export const updateCohort = (id, payload) =>
  apiFetch(`/cohorts/${id}`, { method: 'PUT', ...json(payload) })
export const deleteCohort = (id) => apiFetch(`/cohorts/${id}`, { method: 'DELETE' })
export const fetchCohortMembers = (id) => apiFetch(`/cohorts/${id}/members`)
export const addCohortMembers = (id, userIds, memberRole) =>
  apiFetch(`/cohorts/${id}/members`, { method: 'POST', ...json({ userIds, memberRole }) })
export const removeCohortMember = (id, userId) =>
  apiFetch(`/cohorts/${id}/members/${userId}`, { method: 'DELETE' })
export const bulkEnrolCohort = (id, payload) =>
  apiFetch(`/cohorts/${id}/enrol`, { method: 'POST', ...json(payload) })
export const importUsers = (payload) =>
  apiFetch('/cohorts/import/users', { method: 'POST', ...json(payload) })

/* ------------------------------------------------------------ compliance --- */
export const fetchRequirements = () => apiFetch('/compliance/requirements')
export const createRequirement = (payload) =>
  apiFetch('/compliance/requirements', { method: 'POST', ...json(payload) })
export const updateRequirement = (id, payload) =>
  apiFetch(`/compliance/requirements/${id}`, { method: 'PUT', ...json(payload) })
export const deleteRequirement = (id) =>
  apiFetch(`/compliance/requirements/${id}`, { method: 'DELETE' })
export const fetchComplianceReport = (id) => apiFetch(`/compliance/report${query({ id })}`)
export const fetchMyRequirements = () => apiFetch('/compliance/me')

/* -------------------------------------------------------------- learning --- */
export const fetchPathGating = (pathId) => apiFetch(`/learning/paths/${pathId}/gating`)
export const saveModulePrerequisites = (moduleId, requires) =>
  apiFetch(`/learning/modules/${moduleId}/prerequisites`, { method: 'PUT', ...json({ requires }) })
export const saveLectureProgress = (itemId, payload) =>
  apiFetch(`/learning/lectures/${itemId}/progress`, { method: 'PUT', ...json(payload) })
export const fetchLectureProgress = () => apiFetch('/learning/lectures/progress')
export const searchPlatform = (q, limit) => apiFetch(`/learning/search${query({ q, limit })}`)
export const fetchSkillGap = (params) => apiFetch(`/learning/skill-gap${query(params)}`)

/* --------------------------------------------------------------- reports --- */
export const fetchExportList = () => apiFetch('/reports/exports')
export const fetchExportData = (key) => apiFetch(`/reports/exports/${key}?format=json`)
export const fetchTrainerDashboard = () => apiFetch('/reports/trainer/me')
export const fetchAuditLog = (params) => apiFetch(`/reports/audit${query(params)}`)
export const fetchAuditActions = () => apiFetch('/reports/audit/actions')
export const fetchMailStatus = () => apiFetch('/reports/mail/status')
export const runReminders = () => apiFetch('/reports/mail/reminders', { method: 'POST' })
export const runDigest = () => apiFetch('/reports/mail/digest', { method: 'POST' })

/** Streams a CSV export straight to the browser's downloads. */
export async function downloadExport(key, filename) {
  const response = await fetch(`${API_BASE_URL}/reports/exports/${key}`, {
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  })
  if (!response.ok) throw new Error('Export failed')

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || `${key}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------ auth --- */
export const requestPasswordReset = (email) =>
  apiFetch('/auth/forgot-password', { method: 'POST', ...json({ email }) })
export const resetPassword = (token, password) =>
  apiFetch('/auth/reset-password', { method: 'POST', ...json({ token, password }) })
export const changePassword = (currentPassword, newPassword) =>
  apiFetch('/auth/change-password', { method: 'POST', ...json({ currentPassword, newPassword }) })
