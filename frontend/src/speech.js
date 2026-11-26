// Browser speech: recognition (Web Speech API, hi-IN) and text-to-speech (speechSynthesis).

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
export const browserSttSupported = Boolean(Recognition)
export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
export const recorderSupported = typeof window !== 'undefined' && 'MediaRecorder' in window

const ERROR_TEXT = {
  'not-allowed': 'माइक की अनुमति नहीं मिली / Microphone permission denied',
  'no-speech': 'कुछ सुनाई नहीं दिया / No speech heard',
  'audio-capture': 'माइक नहीं मिला / No microphone found',
  network: 'इंटरनेट नहीं है — आवाज़ पहचान के लिए नेट चाहिए / Speech service needs internet',
}
export const speechErrorText = (code) => ERROR_TEXT[code] || `आवाज़ पहचान में दिक्कत / Speech error: ${code}`

/**
 * Start listening. Stops on its own after `silenceMs` of quiet.
 * Returns a handle with stop(). onEnd(finalText) is always called exactly once.
 */
export function listen({ lang = 'hi-IN', onText, onEnd, onError, silenceMs = 2500, startTimeoutMs = 8000 }) {
  const rec = new Recognition()
  rec.lang = lang
  rec.interimResults = true
  rec.continuous = true
  let finalText = ''
  let latest = ''
  let timer
  let ended = false
  const stopAfter = (ms) => {
    clearTimeout(timer)
    timer = setTimeout(() => rec.stop(), ms)
  }

  rec.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (result.isFinal) finalText += result[0].transcript + ' '
      else interim += result[0].transcript
    }
    latest = (finalText + interim).trim()
    onText?.(latest)
    stopAfter(silenceMs)
  }
  rec.onerror = (event) => {
    if (event.error !== 'aborted') onError?.(event.error)
  }
  rec.onend = () => {
    clearTimeout(timer)
    if (ended) return
    ended = true
    onEnd?.((finalText.trim() || latest).trim())
  }
  rec.start()
  stopAfter(startTimeoutMs)
  return { stop: () => rec.stop() }
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

function hindiVoice() {
  const voices = window.speechSynthesis.getVoices()
  return voices.find((v) => v.lang === 'hi-IN') || voices.find((v) => v.lang?.startsWith('hi'))
}

/**
 * Speak Hindi text. Chrome cuts off long utterances, so we queue one sentence at a time.
 * Resolves when finished (or immediately if TTS is unavailable).
 */
export function speak(text) {
  if (!ttsSupported || !text) return Promise.resolve()
  const synth = window.speechSynthesis
  synth.cancel()
  const sentences = text.split(/(?<=[।?.!])\s+/).filter(Boolean)
  return new Promise((resolve) => {
    let index = 0
    let guard
    const done = () => { clearTimeout(guard); resolve() }
    const next = () => {
      clearTimeout(guard)
      if (index >= sentences.length) return done()
      const sentence = sentences[index++]
      const u = new SpeechSynthesisUtterance(sentence)
      u.lang = 'hi-IN'
      u.rate = 0.95
      const voice = hindiVoice()
      if (voice) u.voice = voice
      u.onend = next
      u.onerror = done
      // Some browsers never fire onend (no voice installed); never let the flow hang.
      guard = setTimeout(next, 3000 + sentence.length * 150)
      synth.speak(u)
    }
    next()
  })
}

export const stopSpeaking = () => ttsSupported && window.speechSynthesis.cancel()

if (ttsSupported) window.speechSynthesis.getVoices() // warm up the async voice list
