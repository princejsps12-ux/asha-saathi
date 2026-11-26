// Ending a dictation by voice. Saying "बस" ("that's it") or "हो गया" ("done") finishes the
// visit note without waiting for the silence timeout.
//
// "हो गया" is also ordinary Hindi ("टीका हो गया" = the vaccine is done), so it only counts as
// a command when it is said ON ITS OWN after a pause. "बस" / "bas" / "done" also count at the
// end of a phrase ("…फिर आऊंगी, बस"). The command words are removed before extraction.

export const PAUSE_MS = 1200 // a gap this long starts a new spoken phrase

// Only as a whole phrase on its own (also ordinary Hindi inside a sentence):
const ALONE_ONLY = ['हो गया', 'हो गई', 'हो गयी', 'ho gaya', 'ho gayi', 'ho gaya hai', 'हो गया है']
// Also at the end of a longer phrase ("…फिर आऊंगी बस"):
const AT_PHRASE_END = ['बस', 'bas', 'done', 'बस हो गया', 'bas ho gaya', 'हो गया बस', 'ho gaya bas', 'बस इतना',
  'बस इतना ही', "that's all", 'thats all']

const clean = (text) => String(text || '').toLowerCase().replace(/[।.!?,]+/g, ' ').replace(/\s+/g, ' ').trim()

/** If `phrase` (what was said since the last pause) is an end command, that command; else null. */
export function endCommandIn(phrase) {
  const said = clean(phrase)
  if (!said) return null
  if (ALONE_ONLY.includes(said)) return said
  const atEnd = AT_PHRASE_END.filter((cmd) => said === cmd || said.endsWith(` ${cmd}`))
  return atEnd.sort((a, b) => b.length - a.length)[0] || null
}

/** Remove a trailing end command (and its punctuation) from the full transcript. */
export function stripEndCommand(text, command) {
  if (!command) return String(text || '').trim()
  const words = command.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
  return String(text || '').replace(new RegExp(`[\\s,।.]*${words}[\\s।.!?,]*$`, 'i'), '').trim()
}

/**
 * Watches the live transcript. update(fullText) returns the end command once she has said one
 * as its own phrase (after a pause) or at the end of a phrase; otherwise null.
 */
export function createEndDetector(now = () => Date.now()) {
  let lastText = ''
  let lastChangeAt = now()
  let phraseStart = '' // transcript as it was when the current phrase began
  return {
    update(fullText) {
      const text = String(fullText || '')
      if (text === lastText) return null
      if (now() - lastChangeAt >= PAUSE_MS) phraseStart = lastText // a pause: a new phrase begins
      lastText = text
      lastChangeAt = now()
      const phrase = text.startsWith(phraseStart) ? text.slice(phraseStart.length) : text
      return endCommandIn(phrase)
    },
  }
}
