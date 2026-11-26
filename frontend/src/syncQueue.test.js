import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './api.js'
import { QUEUE_KEY, enqueueVisit, flushQueue, queuedVisits } from './syncQueue.js'

const memoryStorage = () => {
  const data = {}
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v }, removeItem: (k) => { delete data[k] }, data }
}
const visit = (n) => ({ transcript: `visit ${n}`, fields: { beneficiary_id: n } })

describe('offline save queue', () => {
  it('keeps visits saved while offline, in order', () => {
    const storage = memoryStorage()
    expect(enqueueVisit(visit(1), storage, 1)).toBe(1)
    expect(enqueueVisit(visit(2), storage, 2)).toBe(2)
    expect(queuedVisits(storage).map((v) => v.transcript)).toEqual(['visit 1', 'visit 2'])
  })
  it('sends everything when the network is back and empties the queue', async () => {
    const storage = memoryStorage()
    enqueueVisit(visit(1), storage); enqueueVisit(visit(2), storage)
    const save = vi.fn().mockResolvedValue({})
    expect(await flushQueue(save, storage)).toEqual({ sent: 2, left: 0 })
    expect(save.mock.calls.map(([t]) => t)).toEqual(['visit 1', 'visit 2'])
  })
  it('still offline: stops at the first failure and loses nothing', async () => {
    const storage = memoryStorage()
    enqueueVisit(visit(1), storage); enqueueVisit(visit(2), storage)
    const save = vi.fn().mockRejectedValue(new ApiError('err_unreachable'))
    expect(await flushQueue(save, storage)).toEqual({ sent: 0, left: 2 })
    expect(save).toHaveBeenCalledTimes(1)
  })
  it('a visit the server rejects is kept (marked), never silently dropped or retried forever', async () => {
    const storage = memoryStorage()
    enqueueVisit(visit(1), storage); enqueueVisit(visit(2), storage)
    const save = vi.fn().mockRejectedValueOnce(new ApiError('err_notFound', 404)).mockResolvedValue({})
    expect(await flushQueue(save, storage)).toEqual({ sent: 1, left: 1 })
    expect(queuedVisits(storage)[0]).toMatchObject({ transcript: 'visit 1', failed: true })
    await flushQueue(save, storage)
    expect(save).toHaveBeenCalledTimes(2) // the rejected one is not retried
  })
  it('corrupt or blocked storage never throws', async () => {
    const storage = memoryStorage()
    storage.setItem(QUEUE_KEY, '{oops')
    expect(queuedVisits(storage)).toEqual([])
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(() => enqueueVisit(visit(1), blocked)).not.toThrow()
    expect(await flushQueue(vi.fn(), blocked)).toEqual({ sent: 0, left: 0 })
  })
})
