// Browser speech: recognition (Web Speech API, hi-IN) and text-to-speech (speechSynthesis).
//
// Mobile engines behave differently from desktop Chrome, and every quirk below was seen on phones:
//  * Android Chrome repeats earlier results cumulatively ("Sunita", "Sunita Sahu", "Sunita Sahu सात…").
//  * Android / iOS often END the session at the first pause even with continuous = true,
//    and sometimes deliver only interim results (no isFinal) before onend.
//  * Some engines fire onerror ("network", "no-speech") right before onend.
//  * speechSynthesis on Android may never fire onend; and the phone's speaker is next to the
//    mic, so listening while the read-back is still playing records the app's own voice.
// listen() and speak() below handle all of these; nothing that was heard is ever discarded.

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
export const browserSttSupported = Boolean(Recognition)
export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
export const recorderSupported = typeof window !== 'undefined' && 'MediaRecorder' in window

/** BCP-47 tag for speech in the UI language. Indian English still copes with Hinglish words. */
export const speechLang = (uiLang) => (uiLang === 'en' ? 'en-IN' : 'hi-IN')

const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture'])
const QUIET_ERRORS = new Set(['aborted', 'no-speech']) // normal on silence / stop: not shown
export const END_SAFETY_MS = 1500 // after stop(), report what we have even if onend never fires
// Dictation: real ASHAs pause to think, so a visit note only ends after ~3.5 s of silence
// (or "बस" / "हो गया" / the Done button). The yes / no answer uses its own, shorter window.
export const DICTATION_SILENCE_MS = 3500
export const DICTATION_START_TIMEOUT_MS = 10000
export const DICTATION_MAX_RESTARTS = 20

/**
 * Text from a SpeechRecognitionResultList (or any array of {isFinal, 0: {transcript}}).
 * Final pieces are joined; a final piece that merely extends the previous one (Android's
 * cumulative results) replaces it instead of being appended. Interim text is kept too, so a
 * session that never produces a final result still yields what was said.
 */
export function collectTranscript(results) {
  const finals = []
  const interims = []
  for (let i = 0; i < results.length; i++) {
    const text = String(results[i]?.[0]?.transcript || '').trim()
    if (!text) continue
    if (!results[i].isFinal) { interims.push(text); continue }
    const prev = finals[finals.length - 1]
    if (prev && text.startsWith(prev)) finals[finals.length - 1] = text // cumulative repeat
    else if (!(prev && prev.startsWith(text))) finals.push(text)        // skip a shorter duplicate
  }
  const final = finals.join(' ')
  const interim = interims.filter((t) => !final.endsWith(t)).join(' ')
  return [final, interim].filter(Boolean).join(' ').trim()
}

/**
 * Start listening. Stops after `silenceMs` without new speech (or `startTimeoutMs` if nothing
 * is said). If the engine ends a session by itself while she is still mid-sentence (mobile),
 * it is restarted and the text so far is kept. onEnd(text) is called exactly once, always with
 * everything heard — final or interim — even after an error.
 */
export function listen({
  lang = 'hi-IN', onText, onEnd, onError, silenceMs = 2500, startTimeoutMs = 8000, maxRestarts = 3,
  RecognitionImpl = Recognition, now = () => Date.now(),
}) {
  const startedAt = now()
  let committed = '' // text from earlier sessions of this same listen() (after mobile restarts)
  let current = ''   // text of the running session
  let heardAt = 0
  let restarts = 0
  let stoppedByUs = false
  let ended = false
  let timer
  let rec
  const full = () => [committed, current].filter(Boolean).join(' ').trim()
  const finish = () => {
    if (ended) return
    ended = true
    clearTimeout(timer)
    onEnd?.(full())
  }
  const stopAfter = (ms) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      stoppedByUs = true
      try { rec.stop() } catch { finish() }
      setTimeout(finish, END_SAFETY_MS)
    }, ms)
  }
  const start = () => {
    rec = new RecognitionImpl()
    rec.lang = lang
    rec.interimResults = true
    rec.continuous = true
    rec.onresult = (event) => {
      current = collectTranscript(event.results)
      heardAt = now()
      onText?.(full())
      stopAfter(silenceMs)
    }
    rec.onerror = (event) => {
      if (FATAL_ERRORS.has(event.error)) stoppedByUs = true
      if (!QUIET_ERRORS.has(event.error)) onError?.(event.error)
    }
    rec.onend = () => {
      if (ended) return
      // The engine ended on its own (mobile does this at every pause, or after a few silent
      // seconds) but our own silence window hasn't run out: keep the text, listen on.
      const withinWindow = heardAt ? now() - heardAt < silenceMs : now() - startedAt < startTimeoutMs
      if (!stoppedByUs && withinWindow && restarts < maxRestarts) {
        restarts += 1
        committed = full()
        current = ''
        try { start(); return } catch { /* cannot restart: fall through and report */ }
      }
      finish()
    }
    rec.start()
  }
  start()
  stopAfter(startTimeoutMs)
  return {
    stop: () => {
      stoppedByUs = true
      try { rec.stop() } catch { /* already stopped */ }
      setTimeout(finish, END_SAFETY_MS) // never wait forever for onend
    },
  }
}

/** Record raw audio (for server-side Sarvam STT). Returns { stop(): Promise<Blob> }. */
export async function recordAudio() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  const chunks = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  recorder.start()
  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop())
          resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
        }
        recorder.stop()
      }),
  }
}

function voiceFor(synth, tag) {
  const voices = synth.getVoices()
  const base = tag.split('-')[0]
  return voices.find((v) => v.lang === tag) || voices.find((v) => v.lang?.startsWith(base))
}

export const ECHO_GAP_MS = 500 // pause after the read-back so its echo dies down before listening
const MAX_WAIT_FOR_QUIET_MS = 20000

/** Resolve once the synthesizer is really silent (Android may skip onend), plus a short gap. */
function untilQuiet(synth) {
  const started = Date.now()
  return new Promise((resolve) => {
    const tick = () => {
      if (!synth.speaking || Date.now() - started > MAX_WAIT_FOR_QUIET_MS) setTimeout(resolve, ECHO_GAP_MS)
      else setTimeout(tick, 200)
    }
    tick()
  })
}

/**
 * Speak text in `tag` (hi-IN or en-IN). Chrome cuts off long utterances, so we queue one
 * sentence at a time. Resolves only when speech has actually finished — so the mic never
 * starts listening while the phone is still talking.
 */
export function speak(text, tag = 'hi-IN', synth = ttsSupported ? window.speechSynthesis : null) {
  if (!synth || !text) return Promise.resolve()
  synth.cancel()
  const sentences = text.split(/(?<=[।?.!])\s+/).filter(Boolean)
  return new Promise((resolve) => {
    let index = 0
    let guard
    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      clearTimeout(guard)
      untilQuiet(synth).then(resolve)
    }
    const next = () => {
      clearTimeout(guard)
      if (finished) return
      if (index >= sentences.length) return done()
      const sentence = sentences[index++]
      const u = new SpeechSynthesisUtterance(sentence)
      u.lang = tag
      u.rate = 0.95
      const voice = voiceFor(synth, tag)
      if (voice) u.voice = voice
      u.onend = next
      u.onerror = done
      // Some engines never fire onend (no voice installed); never let the flow hang.
      guard = setTimeout(next, 3000 + sentence.length * 150)
      synth.speak(u)
    }
    next()
  })
}

export const stopSpeaking = () => ttsSupported && window.speechSynthesis.cancel()

if (ttsSupported) window.speechSynthesis.getVoices() // warm up the async voice list
