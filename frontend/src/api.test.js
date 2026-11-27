import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, RETRY_DELAY_MS, api } from './api.js'

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const fail = (status) => ({ ok: false, status, json: async () => ({ detail: `HTTP ${status}` }) })

beforeEach(() => {
  vi.useFakeTimers()
  globalThis.fetch = vi.fn()
})
afterEach(() => vi.useRealTimers())

describe('API requests survive a sleeping free-tier server', () => {
  it('retries once after a 503 (Render waking up) and returns the result', async () => {
    fetch.mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok({ fields: { pregnancy_month: 7 } }))
    const pending = api.extract('Sunita Sahu सात महीने BP 150 बाय 100')
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)
    await expect(pending).resolves.toEqual({ fields: { pregnancy_month: 7 } })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('retries once after a network error', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok({ ok: true }))
    const pending = api.status()
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)
    await expect(pending).resolves.toEqual({ ok: true })
  })
  it('gives a friendly error after the retry also fails, and never retries real client errors', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const pending = api.status().catch((e) => e)
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)
    const error = await pending
    expect(error).toBeInstanceOf(ApiError)
    expect(error.key).toBe('err_unreachable')
    fetch.mockReset().mockResolvedValue(fail(422))
    await expect(api.evaluate({})).rejects.toMatchObject({ key: 'err_invalid' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not retry speech upload: 503 there means "no Sarvam key"', async () => {
    fetch.mockResolvedValue(fail(503))
    await expect(api.stt(new Blob(['x']))).rejects.toMatchObject({ key: 'err_sttService' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
