import { apiFetch } from './api'

export async function sendChatbotMessage(message, history = [], context = {}) {
  return apiFetch('/chatbot/message', {
    method: 'POST',
    body: JSON.stringify({
      message,
      history,
      context,
    }),
  })
}
