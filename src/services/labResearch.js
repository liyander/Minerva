import { apiFetch } from './api'

// Admin
export function fetchAdminLabProjects() {
  return apiFetch('/lab-research/admin/projects')
}

export function createLabProject(payload) {
  return apiFetch('/lab-research/admin/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateLabProject(projectId, payload) {
  return apiFetch(`/lab-research/admin/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteLabProject(projectId) {
  return apiFetch(`/lab-research/admin/projects/${projectId}`, {
    method: 'DELETE',
  })
}

export function fetchLabProjectCompletions(projectId) {
  return apiFetch(`/lab-research/admin/projects/${projectId}/completions`)
}

// Player
export function fetchLabProjects() {
  return apiFetch('/lab-research/projects')
}

export function fetchLabProject(projectId) {
  return apiFetch(`/lab-research/projects/${projectId}`)
}

export function startLabQuiz(projectId, { restart = false } = {}) {
  return apiFetch(`/lab-research/projects/${projectId}/quiz`, {
    method: 'POST',
    body: JSON.stringify({ restart }),
  })
}

export function fetchLabQuizAttempt(attemptId) {
  return apiFetch(`/lab-research/quiz/${attemptId}`)
}

export function terminateLabQuiz(attemptId, reason) {
  return apiFetch(`/lab-research/quiz/${attemptId}/terminate`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function answerLabQuizQuestion(attemptId, questionId, answer) {
  return apiFetch(`/lab-research/quiz/${attemptId}/questions/${questionId}/answer`, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  })
}

export function fetchLabCodeChallenge(projectId, { regenerate = false } = {}) {
  return apiFetch(`/lab-research/projects/${projectId}/code`, {
    method: 'POST',
    body: JSON.stringify({ regenerate }),
  })
}

export function submitLabCode(challengeId, code, browserResults = null, screenshot = null) {
  const payload = { code }
  if (browserResults) payload.browserResults = browserResults
  if (screenshot) payload.screenshot = screenshot
  return apiFetch(`/lab-research/code/${challengeId}/submit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchLabPlayerDetail(projectId, userId) {
  return apiFetch(`/lab-research/admin/projects/${projectId}/players/${userId}`)
}

export function resetLabPlayerProgress(projectId, userId, scope) {
  return apiFetch(`/lab-research/admin/projects/${projectId}/players/${userId}/reset`, {
    method: 'POST',
    body: JSON.stringify({ scope }),
  })
}

export function fetchLabSubmission(submissionId) {
  return apiFetch(`/lab-research/admin/submissions/${submissionId}`)
}
