// A visit that was extracted but not yet confirmed is precious: the ASHA spoke it once and
// should never have to speak it again. It is kept in localStorage so a page refresh, a
// closed tab or a phone call in between does not lose it. Only "New visit" or a successful
// save clears it.

export const PENDING_KEY = 'asha.pendingVisit.v1'
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000 // a pending visit older than a day is stale

/** Save the visit waiting for confirmation. Never throws (private mode / full storage). */
export function savePending({ transcript, analysis }, storage = globalThis.localStorage, now = Date.now()) {
  try {
    storage?.setItem(PENDING_KEY, JSON.stringify({ transcript: transcript || '', analysis, savedAt: now }))
  } catch { /* storage unavailable: the visit still lives in memory for this session */ }
}

/** The saved pending visit, or null if none, unreadable, malformed or older than a day. */
export function loadPending(storage = globalThis.localStorage, now = Date.now()) {
  let raw = null
  try { raw = storage?.getItem(PENDING_KEY) } catch { return null }
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    const valid = data && typeof data.analysis?.fields === 'object' && Array.isArray(data.analysis?.alerts)
    if (valid && now - Number(data.savedAt) <= PENDING_MAX_AGE_MS) {
      return { transcript: String(data.transcript || ''), analysis: data.analysis }
    }
  } catch { /* corrupt JSON: fall through and discard */ }
  clearPending(storage)
  return null
}

export function clearPending(storage = globalThis.localStorage) {
  try { storage?.removeItem(PENDING_KEY) } catch { /* nothing to clear */ }
}

// A transcript that could not be extracted (no network): kept so a refresh doesn't lose it,
// and re-sent for extraction when the connection returns.
export const DRAFT_KEY = 'asha.draftTranscript.v1'

export function saveDraft(transcript, storage = globalThis.localStorage) {
  try { storage?.setItem(DRAFT_KEY, String(transcript || '')) } catch { /* blocked storage */ }
}

export function loadDraft(storage = globalThis.localStorage) {
  try { return storage?.getItem(DRAFT_KEY) || '' } catch { return '' }
}

export function clearDraft(storage = globalThis.localStorage) {
  try { storage?.removeItem(DRAFT_KEY) } catch { /* nothing to clear */ }
}
