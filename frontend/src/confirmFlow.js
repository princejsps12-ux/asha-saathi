// Decisions for the confirm step, kept free of React so they are unit-tested.

// Listening window for the yes / no answer. People pause before answering, so we wait ~9 s
// for speech to start and, if nothing is heard, listen once more before stopping.
export const CONFIRM_LISTEN = { startTimeoutMs: 9000, silenceMs: 2000, retries: 1 }

/**
 * What a mic tap means right now:
 *  'stop'    — already listening: finish and use what was heard
 *  'answer'  — a visit is waiting for confirmation: listen ONLY for yes / no / a correction,
 *              keeping every extracted field (never start a new dictation over it)
 *  'dictate' — nothing pending: start dictating a new visit
 */
export function micAction({ phase, pending }) {
  if (phase === 'listening' || phase === 'confirming') return 'stop'
  if (pending) return 'answer'
  return 'dictate'
}

/** Listen for an answer; if nothing is heard, listen again `retries` more times. '' = silence. */
export async function listenForAnswer(listenOnce, { retries = CONFIRM_LISTEN.retries, onRetry } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) onRetry?.(attempt)
    const text = String((await listenOnce()) || '').trim()
    if (text) return text
  }
  return ''
}

/**
 * Turn a spoken answer into an action for the pending visit.
 *  { action: 'save' }                    — "हाँ / yes"
 *  { action: 'corrected', analysis }     — a correction such as "बीपी 150 बाय 100", merged in
 *  { action: 'edit' }                    — "नहीं / no": keep the visit, let her fix it
 *  { action: 'unknown' } / { action: 'silence' }
 * When something was unclear, the answer is first tried as the missing detail.
 */
export async function resolveAnswer(answer, result, api) {
  if (!answer) return { action: 'silence' }
  const asking = result.unclear?.length > 0
  const correction = async () => {
    try {
      const next = await api.extract(answer, result.fields)
      return next?.changed ? next : null
    } catch {
      return null // a failed correction falls back to yes / no handling
    }
  }
  if (asking) {
    const next = await correction()
    if (next) return { action: 'corrected', analysis: next }
  }
  const { intent } = await api.intent(answer).catch(() => ({ intent: 'unknown' }))
  if (intent === 'yes') return { action: 'save' }
  if (!asking) { // "nahi, BP 150 by 100" or any other spoken fix also counts
    const next = await correction()
    if (next) return { action: 'corrected', analysis: next }
  }
  return { action: intent === 'no' ? 'edit' : 'unknown' }
}
