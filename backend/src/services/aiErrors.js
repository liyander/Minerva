/**
 * The OpenAI SDK reports some provider failures as "no body" even when the
 * response carried a problem+json explanation — a 410 for a retired model looks
 * like an opaque outage. This turns whatever the provider sent into a message an
 * administrator can act on, and logs the detail rather than swallowing it.
 */
export function describeAiError(error, model) {
  const status = error?.status ?? error?.response?.status
  const detail =
    error?.error?.detail ||
    error?.error?.message ||
    error?.response?.data?.detail ||
    error?.message ||
    ''

  if (status === 410) {
    return {
      status: 503,
      message: `The configured AI model (${model || 'unknown'}) has been retired by the provider. Choose a different model in Admin → AI Control.`,
      detail,
      retired: true,
    }
  }

  if (status === 404) {
    return {
      status: 503,
      message: `The configured AI model (${model || 'unknown'}) is not available on this account. Choose a different model in Admin → AI Control.`,
      detail,
    }
  }

  if (status === 401 || status === 403) {
    return {
      status: 503,
      message: 'The AI provider rejected the API key. Check the credentials in Admin → AI Control.',
      detail,
    }
  }

  if (status === 429) {
    return {
      status: 503,
      message: 'The AI provider is rate limiting requests. Try again shortly.',
      detail,
    }
  }

  if (status === 504 || error?.name === 'AbortError' || /timeout/i.test(detail)) {
    return {
      status: 504,
      message: 'The AI provider timed out. Some larger models are slow to start; try again or pick a faster model.',
      detail,
    }
  }

  return {
    status: 503,
    message: 'The AI service is unavailable right now. Please try again.',
    detail,
  }
}

/** Logs the useful part of a provider failure, including any hidden body. */
export function logAiError(context, error, model) {
  const described = describeAiError(error, model)
  console.error(
    `[ai:${context}] model=${model || 'unknown'} status=${error?.status ?? 'n/a'} — ${described.detail || described.message}`,
  )
  return described
}
