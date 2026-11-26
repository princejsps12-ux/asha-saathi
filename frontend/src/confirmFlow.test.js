import { describe, expect, it, vi } from 'vitest'
import { CONFIRM_LISTEN, listenForAnswer, micAction, resolveAnswer } from './confirmFlow.js'

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
    expect(await resolveAnswer('hmm', clear, fakeApi('unknown', { changed: false }))).toEqual({ action: 'unknown' })
  })
  it('a failing correction request falls back to yes / no', async () => {
    const api = { intent: vi.fn().mockResolvedValue({ intent: 'yes' }), extract: vi.fn().mockRejectedValue(new Error()) }
    expect(await resolveAnswer('हाँ', base, api)).toEqual({ action: 'save' })
  })
})
