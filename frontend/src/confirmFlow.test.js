import { describe, expect, it, vi } from 'vitest'
import { CONFIRM_LISTEN, ECHO_SHARE, echoShare, listenForAnswer, micAction, resolveAnswer } from './confirmFlow.js'

describe('micAction — a mic tap never discards a pending visit', () => {
  it('answers (does not re-dictate) while a visit waits for confirmation', () => {
    for (const phase of ['review', 'speaking']) expect(micAction({ phase, pending: true })).toBe('answer')
  })
  it('stops when already listening, dictates only when nothing is pending', () => {
    expect(micAction({ phase: 'listening', pending: false })).toBe('stop')
    expect(micAction({ phase: 'confirming', pending: true })).toBe('stop')
    expect(micAction({ phase: 'idle', pending: false })).toBe('dictate')
    expect(micAction({ phase: 'saved', pending: false })).toBe('dictate')
  })
})

describe('listenForAnswer — longer window and one automatic retry', () => {
  it('waits ~9 s for an answer to start and retries once', () => {
    expect(CONFIRM_LISTEN.startTimeoutMs).toBeGreaterThanOrEqual(8000)
    expect(CONFIRM_LISTEN.startTimeoutMs).toBeLessThanOrEqual(10000)
    expect(CONFIRM_LISTEN.retries).toBe(1)
  })
  it('a pause (silence) is followed by one more listening window', async () => {
    const listenOnce = vi.fn().mockResolvedValueOnce('').mockResolvedValueOnce('हाँ')
    const onRetry = vi.fn()
    expect(await listenForAnswer(listenOnce, { onRetry })).toBe('हाँ')
    expect(listenOnce).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledOnce()
  })
  it('gives up quietly after the retry is silent too', async () => {
    const listenOnce = vi.fn().mockResolvedValue('  ')
    expect(await listenForAnswer(listenOnce)).toBe('')
    expect(listenOnce).toHaveBeenCalledTimes(2)
  })
})

describe('resolveAnswer', () => {
  const base = { fields: { beneficiary_id: 1, bp_unclear: true }, unclear: ['bp'] }
  const fakeApi = (intent, extracted) => ({
    intent: vi.fn().mockResolvedValue({ intent }),
    extract: vi.fn().mockResolvedValue(extracted),
  })

  it('treats the answer as the missing BP first when something was unclear', async () => {
    const corrected = { fields: { beneficiary_id: 1, bp_systolic: 150 }, changed: true }
    const api = fakeApi('unknown', corrected)
    expect(await resolveAnswer('बीपी 150 बाय 100', base, api)).toEqual({ action: 'corrected', analysis: corrected })
    expect(api.extract).toHaveBeenCalledWith('बीपी 150 बाय 100', base.fields) // merged into the same entry
  })
  it('"हाँ" saves as is when the correction adds nothing', async () => {
    expect(await resolveAnswer('हाँ', base, fakeApi('yes', { changed: false }))).toEqual({ action: 'save' })
  })
  it('"नहीं" keeps the visit for editing; silence and nonsense are reported, never saved', async () => {
    const clear = { fields: {}, unclear: [] }
    expect(await resolveAnswer('नहीं', clear, fakeApi('no', { changed: false }))).toEqual({ action: 'edit' })
    expect(await resolveAnswer('', clear, fakeApi('yes', null))).toEqual({ action: 'silence' })
    expect(await resolveAnswer('hmm', clear, fakeApi('unknown', { changed: false }))).toEqual({ action: 'nochange' })
  })
  it('a failing correction request falls back to yes / no', async () => {
    const api = {
      intent: vi.fn().mockResolvedValue({ intent: 'yes' }),
      extract: vi.fn().mockRejectedValue(new Error()),
    }
    expect(await resolveAnswer('हाँ', base, api)).toEqual({ action: 'save' })
  })
})

describe('a non-empty answer is never "didn\'t understand"', () => {
  const readBack = {
    summary_hi:
      'सुनीता साहू। 7 महीने की गर्भवती। बीपी 150 बटा 100। लक्षण: पैरों में सूजन। बच्चे की हलचल कम है। ' +
      'अगली विज़िट 4 दिसंबर। क्या यह सही है? हाँ या नहीं बोलिए।',
    summary_en: 'Sunita Sahu. 7 months pregnant. BP 150/100. Symptoms: swelling (feet). Baby movement reduced.',
    fields: { beneficiary_id: 1 },
    unclear: [],
  }
  const unchanged = {
    intent: vi.fn().mockResolvedValue({ intent: 'unknown' }),
    extract: vi.fn().mockResolvedValue({ changed: false }),
  }

  it('the phone mic picking up our own read-back is an echo (listen again), not an error', async () => {
    const echo = 'सुनीता साहू 7 महीने की गर्भवती बीपी 150 बटा 100 लक्षण पैरों में सूजन'
    expect(echoShare(echo, readBack.summary_hi)).toBeGreaterThanOrEqual(ECHO_SHARE)
    expect(await resolveAnswer(echo, readBack, unchanged)).toEqual({ action: 'echo' })
    expect(unchanged.extract).toHaveBeenCalledWith(echo, readBack.fields) // it was still run through extraction
  })
  it('short real answers are never mistaken for echo', () => {
    for (const short of ['हाँ', 'nahi', 'बीपी 150']) expect(echoShare(short, readBack.summary_hi)).toBe(0)
  })
  it('any other non-empty answer gives "nothing new — say yes", never "unknown"', async () => {
    for (const text of ['hmm', 'ठीक है देखते हैं', 'Sunita Sahu सात महीने BP 150 बाय 100', 'kuch nahi bas']) {
      const { action } = await resolveAnswer(text, readBack, unchanged)
      expect(['nochange', 'echo', 'edit']).toContain(action)
    }
  })
})
