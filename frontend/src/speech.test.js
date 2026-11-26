// Fake speech engines that reproduce real mobile behaviour (Android Chrome, iOS Safari/Chrome).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { END_SAFETY_MS, collectTranscript, listen, speak } from './speech.js'

const PHONE_TEXT = 'Sunita Sahu सात महीने BP 150 बाय 100 पैरों में सूजन है, बेबी मूवमेंट कम है, अगले हफ्ते फिर आऊंगी'
/** onEnd must fire exactly once, with exactly this text. */
const calledOnceWith = (fn, text) => { expect(fn).toHaveBeenCalledTimes(1); expect(fn).toHaveBeenCalledWith(text) }
const res = (transcript, isFinal) => Object.assign([{ transcript }], { isFinal })

/** A SpeechRecognition stand-in the test drives by hand. */
function fakeEngine() {
  const sessions = []
  class FakeRecognition {
    constructor() { sessions.push(this); this.stopped = false }
    start() {}
    stop() { this.stopped = true }
    say(...results) { this.onresult?.({ results }) }
    end() { this.onend?.() }
    error(code) { this.onerror?.({ error: code }) }
  }
  return { FakeRecognition, sessions, latest: () => sessions[sessions.length - 1] }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('collectTranscript', () => {
  it('keeps interim text when the engine never marks a result final (iOS)', () => {
    expect(collectTranscript([res(PHONE_TEXT, false)])).toBe(PHONE_TEXT)
  })
  it('collapses Android cumulative repeats instead of duplicating words', () => {
    const results = [res('Sunita Sahu', true), res('Sunita Sahu सात महीने', true), res(PHONE_TEXT, true)]
    expect(collectTranscript(results)).toBe(PHONE_TEXT)
  })
  it('joins separate final pieces plus the trailing interim', () => {
    expect(collectTranscript([res('Sunita Sahu', true), res('सात महीने', true), res('BP 150', false)]))
      .toBe('Sunita Sahu सात महीने BP 150')
  })
})

describe('listen on mobile', () => {
  it('only interim results, then onend: the text is still delivered', () => {
    const engine = fakeEngine()
    const onEnd = vi.fn()
    listen({ onEnd, RecognitionImpl: engine.FakeRecognition, now: () => Date.now() })
    engine.latest().say(res(PHONE_TEXT, false))
    vi.advanceTimersByTime(3000) // silence -> we stop
    engine.latest().end()
    calledOnceWith(onEnd, PHONE_TEXT)
  })

  it('an error (network) right before onend does not discard the text', () => {
    const engine = fakeEngine()
    const onEnd = vi.fn()
    const onError = vi.fn()
    listen({ onEnd, onError, RecognitionImpl: engine.FakeRecognition, silenceMs: 2500 })
    engine.latest().say(res(PHONE_TEXT, false))
    vi.advanceTimersByTime(2600)
    engine.latest().error('network')
    engine.latest().end()
    expect(onError).toHaveBeenCalledWith('network')
    calledOnceWith(onEnd, PHONE_TEXT)
  })

  it('engine ends by itself mid-sentence (Android): restarts and keeps both halves', () => {
    const engine = fakeEngine()
    const onEnd = vi.fn()
    listen({ onEnd, RecognitionImpl: engine.FakeRecognition, silenceMs: 2500 })
    engine.latest().say(res('Sunita Sahu सात महीने', true))
    vi.advanceTimersByTime(400)
    engine.latest().end() // Android ended at the first pause
    expect(engine.sessions).toHaveLength(2)
    expect(onEnd).not.toHaveBeenCalled()
    engine.latest().say(res('BP 150 बाय 100 पैरों में सूजन है, बेबी मूवमेंट कम है, अगले हफ्ते फिर आऊंगी', true))
    vi.advanceTimersByTime(2600)
    engine.latest().end()
    calledOnceWith(onEnd, PHONE_TEXT)
  })

  it('stop() reports what was heard even if the engine never fires onend', () => {
    const engine = fakeEngine()
    const onEnd = vi.fn()
    const handle = listen({ onEnd, RecognitionImpl: engine.FakeRecognition })
    engine.latest().say(res(PHONE_TEXT, false))
    handle.stop()
    vi.advanceTimersByTime(END_SAFETY_MS + 10)
    calledOnceWith(onEnd, PHONE_TEXT)
  })

  it('nothing said: ends after the start timeout with empty text', () => {
    const engine = fakeEngine()
    const onEnd = vi.fn()
    listen({ onEnd, RecognitionImpl: engine.FakeRecognition, startTimeoutMs: 9000 })
    vi.advanceTimersByTime(9000)
    engine.latest().end()
    calledOnceWith(onEnd, '')
  })
})

describe('speak waits until the phone has really stopped talking', () => {
  it('does not resolve while speechSynthesis is still speaking (Android may skip onend)', async () => {
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
    const synth = { speaking: true, cancel: vi.fn(), getVoices: () => [], speak: vi.fn() }
    let done = false
    speak('पहला वाक्य।', 'hi-IN', synth).then(() => { done = true })
    vi.advanceTimersByTime(10000) // onend never fired; guard moved on, but audio still playing
    await Promise.resolve()
    expect(done).toBe(false)
    synth.speaking = false
    await vi.advanceTimersByTimeAsync(1000)
    expect(done).toBe(true)
  })
})
