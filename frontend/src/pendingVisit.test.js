import { describe, expect, it } from 'vitest'
import {
  PENDING_KEY, PENDING_MAX_AGE_MS, clearDraft, clearPending, loadDraft, loadPending, saveDraft, savePending,
} from './pendingVisit.js'

const memoryStorage = () => {
  const data = {}
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => { data[k] = v },
    removeItem: (k) => { delete data[k] },
    data,
  }
}
const blocked = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('QuotaExceeded') },
  removeItem: () => { throw new Error('SecurityError') },
}
const analysis = { fields: { beneficiary_id: 1, bp_heard: '15/100', bp_unclear: true }, alerts: [], unclear: ['bp'] }

describe('pending visit storage (survives a page refresh)', () => {
  it('round-trips the transcript and every extracted field', () => {
    const storage = memoryStorage()
    savePending({ transcript: 'सुनीता साहू 7 महीने', analysis }, storage, 1000)
    expect(loadPending(storage, 2000)).toEqual({ transcript: 'सुनीता साहू 7 महीने', analysis })
  })
  it('discards a visit older than a day, and corrupt or malformed data', () => {
    const storage = memoryStorage()
    savePending({ transcript: 'x', analysis }, storage, 0)
    expect(loadPending(storage, PENDING_MAX_AGE_MS + 1)).toBeNull()
    expect(storage.data[PENDING_KEY]).toBeUndefined()
    storage.setItem(PENDING_KEY, '{not json')
    expect(loadPending(storage)).toBeNull()
    storage.setItem(PENDING_KEY, JSON.stringify({ analysis: { nope: 1 }, savedAt: Date.now() }))
    expect(loadPending(storage)).toBeNull()
  })
  it('clears, and never throws when storage is blocked (private mode)', () => {
    const storage = memoryStorage()
    savePending({ transcript: 'x', analysis }, storage)
    clearPending(storage)
    expect(loadPending(storage)).toBeNull()
    expect(() => savePending({ transcript: 'x', analysis }, blocked)).not.toThrow()
    expect(loadPending(blocked)).toBeNull()
    expect(() => clearPending(blocked)).not.toThrow()
  })
})

describe('draft transcript (words that could not be extracted offline)', () => {
  it('is kept across a refresh and cleared after use', () => {
    const storage = memoryStorage()
    saveDraft('सुनीता साहू सात महीने', storage)
    expect(loadDraft(storage)).toBe('सुनीता साहू सात महीने')
    clearDraft(storage)
    expect(loadDraft(storage)).toBe('')
    expect(loadDraft(blocked)).toBe('')
  })
})
