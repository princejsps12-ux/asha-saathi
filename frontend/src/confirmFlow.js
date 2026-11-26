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

const tokens = (text) => String(text || '').toLowerCase().normalize('NFC')
  .replace(/[\u0901]/g, '\u0902')            // chandrabindu -> anusvara (हाँ / हां)
  .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').split(' ').filter((t) => t.length > 1)

/** Share of the answer's words that also occur in our own read-back (0..1). */
export function echoShare(answer, readBack) {
  const said = tokens(answer)
  if (said.length < 3) return 0 // "haan", "nahi", "bp 150 by 100" are never treated as echo
  const ours = new Set(tokens(readBack))
  return said.filter((t) => ours.has(t)).length / said.length
}
export const ECHO_SHARE = 0.6 // >= 60% of the words are the app's own read-back -> mic heard the speaker

/**
 * Turn a spoken answer into an action for the pending visit. A non-empty answer is ALWAYS
 * run through extraction — it is never answered with "didn't understand".
 *  { action: 'save' }                — "हाँ / yes"
 *  { action: 'corrected', analysis } — new information, e.g. "बीपी 150 बाय 100", merged in
 *  { action: 'edit' }                — "नहीं / no": keep the visit, let her fix it
 *  { action: 'echo' }                — the mic picked up the app's own read-back: listen again
 *  { action: 'nochange' }            — understood, nothing new: ask her to say / tap yes
 *  { action: 'silence' }             — nothing heard
 * When something was unclear, the answer is first tried as the missing detail.
 */
export async function resolveAnswer(answer, result, api) {
  if (!String(answer || '').trim()) return { action: 'silence' }
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
  if (intent === 'no') return { action: 'edit' }
  const readBack = `${result.summary_hi || ''} ${result.summary_en || ''}`
  return { action: echoShare(answer, readBack) >= ECHO_SHARE ? 'echo' : 'nochange' }
}
