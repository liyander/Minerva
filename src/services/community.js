import { apiFetch, API_BASE_URL, getAuthToken } from './api'

const json = (body) => ({ body: JSON.stringify(body) })

/* ------------------------------------------------------------ channels --- */
export const fetchChannels = (classroomId) =>
  apiFetch(`/community/channels${classroomId ? `?classroomId=${classroomId}` : ''}`)
export const createChannel = (payload) =>
  apiFetch('/community/channels', { method: 'POST', ...json(payload) })
export const deleteChannel = (id) => apiFetch(`/community/channels/${id}`, { method: 'DELETE' })

/* ------------------------------------------------------------ messages --- */
export const fetchMessages = (channelId, before) =>
  apiFetch(`/community/channels/${channelId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`)
export const fetchThread = (messageId) => apiFetch(`/community/messages/${messageId}/thread`)
export const fetchMessageAttachment = (messageId) =>
  apiFetch(`/community/messages/${messageId}/attachment`)
export const searchMentionableUsers = (channelId, q = '') =>
  apiFetch(`/community/channels/${channelId}/mentionable-users?q=${encodeURIComponent(q)}`)
export const postMessage = (channelId, payload) =>
  apiFetch(`/community/channels/${channelId}/messages`, { method: 'POST', ...json(payload) })
export const editMessage = (id, body) =>
  apiFetch(`/community/messages/${id}`, { method: 'PATCH', ...json({ body }) })
export const deleteMessage = (id) => apiFetch(`/community/messages/${id}`, { method: 'DELETE' })
export const toggleReaction = (id, emoji) =>
  apiFetch(`/community/messages/${id}/reactions`, { method: 'POST', ...json({ emoji }) })

/* ---------------------------------------------------------- classrooms --- */
export const fetchClassrooms = () => apiFetch('/community/classrooms')
export const createClassroom = (payload) =>
  apiFetch('/community/classrooms', { method: 'POST', ...json(payload) })
export const fetchClassroom = (id) => apiFetch(`/community/classrooms/${id}`)
export const updateClassroom = (id, payload) =>
  apiFetch(`/community/classrooms/${id}`, { method: 'PATCH', ...json(payload) })
export const deleteClassroom = (id) => apiFetch(`/community/classrooms/${id}`, { method: 'DELETE' })
export const addClassroomMember = (classroomId, payload) =>
  apiFetch(`/community/classrooms/${classroomId}/members`, { method: 'POST', ...json(payload) })
export const removeClassroomMember = (classroomId, userId) =>
  apiFetch(`/community/classrooms/${classroomId}/members/${userId}`, { method: 'DELETE' })
export const searchUsers = (q) => apiFetch(`/community/users/search?q=${encodeURIComponent(q)}`)

/* ---------------------------------------------------------- discussions --- */
export const fetchLabels = () => apiFetch('/community/labels')
export const createLabel = (payload) =>
  apiFetch('/community/labels', { method: 'POST', ...json(payload) })
export const fetchDiscussions = (params = {}) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  ).toString()
  return apiFetch(`/community/discussions${query ? `?${query}` : ''}`)
}
export const createDiscussion = (payload) =>
  apiFetch('/community/discussions', { method: 'POST', ...json(payload) })
export const fetchDiscussion = (id) => apiFetch(`/community/discussions/${id}`)
export const updateDiscussion = (id, payload) =>
  apiFetch(`/community/discussions/${id}`, { method: 'PATCH', ...json(payload) })
export const postDiscussionComment = (id, payload) =>
  apiFetch(`/community/discussions/${id}/comments`, { method: 'POST', ...json(payload) })

/* ---------------------------------------------------------- assignments --- */
export const fetchAssignments = (classroomId) =>
  apiFetch(`/community/assignments?classroomId=${classroomId}`)
export const createAssignment = (payload) =>
  apiFetch('/community/assignments', { method: 'POST', ...json(payload) })
export const fetchAssignment = (id) => apiFetch(`/community/assignments/${id}`)
export const fetchAssignmentAttachment = (assignmentId, attachmentId) =>
  apiFetch(`/community/assignments/${assignmentId}/attachments/${attachmentId}`)
export const updateAssignment = (id, payload) =>
  apiFetch(`/community/assignments/${id}`, { method: 'PATCH', ...json(payload) })
export const deleteAssignment = (id) => apiFetch(`/community/assignments/${id}`, { method: 'DELETE' })
export const submitAssignment = (id, payload) =>
  apiFetch(`/community/assignments/${id}/submissions`, { method: 'POST', ...json(payload) })
export const gradeSubmission = (id, payload) =>
  apiFetch(`/community/submissions/${id}`, { method: 'PATCH', ...json(payload) })
export const fetchSubmissionFile = (id) => apiFetch(`/community/submissions/${id}/file`)

/* -------------------------------------------------------------- socket --- */
export function connectCommunitySocket({ onMessage, onOpen, onClose } = {}) {
  const wsBase = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '')

  // Channels currently joined (or waiting to be joined once the socket is
  // open) are tracked here so a reconnect can silently re-subscribe to
  // everything the caller had joined before the drop.
  const joinedChannels = new Set()
  let socket = null
  let isOpen = false
  let manuallyClosed = false
  let reconnectAttempt = 0
  let reconnectTimer = null

  const sendJoinLeave = (type, channelId) => {
    if (isOpen) {
      socket.send(JSON.stringify({ type, channelId }))
    }
  }

  const connect = () => {
    const token = getAuthToken()
    socket = new WebSocket(`${wsBase}/api/community/ws?token=${encodeURIComponent(token)}`)

    socket.addEventListener('open', () => {
      isOpen = true
      reconnectAttempt = 0
      for (const channelId of joinedChannels) {
        sendJoinLeave('join', channelId)
      }
      onOpen?.()
    })

    socket.addEventListener('close', () => {
      isOpen = false
      onClose?.()
      if (manuallyClosed) return

      // Reconnect with capped backoff so a dropped connection (server
      // restart, brief network blip) doesn't leave chat silently stale.
      const delay = Math.min(1000 * 2 ** reconnectAttempt, 15000)
      reconnectAttempt += 1
      reconnectTimer = window.setTimeout(connect, delay)
    })

    socket.addEventListener('message', (event) => {
      try {
        onMessage?.(JSON.parse(event.data))
      } catch {
        // ignore malformed frames
      }
    })
  }

  connect()

  return {
    join(channelId) {
      joinedChannels.add(channelId)
      sendJoinLeave('join', channelId)
    },
    leave(channelId) {
      joinedChannels.delete(channelId)
      sendJoinLeave('leave', channelId)
    },
    close() {
      manuallyClosed = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      socket?.close()
    },
  }
}
