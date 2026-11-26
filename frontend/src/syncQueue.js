// Offline save queue. A visit she confirmed must never be lost because the network dropped:
// it is kept on the phone (localStorage) and sent to the server when the connection returns.

import { ApiError } from './api.js'

export const QUEUE_KEY = 'asha.syncQueue.v1'

function read(storage) {
  try {
    const items = JSON.parse(storage?.getItem(QUEUE_KEY) || '[]')
    return Array.isArray(items) ? items.filter((it) => it && typeof it.fields === 'object') : []
  } catch {
    return []
  }
}

function write(items, storage) {
  try { storage?.setItem(QUEUE_KEY, JSON.stringify(items)) } catch { /* storage full / blocked */ }
}

export const queuedVisits = (storage = globalThis.localStorage) => read(storage)

/** Keep a confirmed visit on the phone until it can be sent. Returns the queue length. */
export function enqueueVisit({ transcript, fields }, storage = globalThis.localStorage, now = Date.now()) {
  const items = read(storage)
  items.push({ id: `${now}-${items.length}`, transcript: transcript || '', fields, queuedAt: now })
  write(items, storage)
  return items.length
}

/**
 * Send queued visits in order. Stops at the first network failure (still offline) and keeps
 * the rest; a visit the server rejects (e.g. its woman was deleted) is kept but marked, so it is
 * neither lost nor retried forever. Returns { sent, left }.
 */
export async function flushQueue(save, storage = globalThis.localStorage) {
  const items = read(storage)
  let sent = 0
  for (const item of items) {
    if (item.failed) continue
    try {
      await save(item.transcript, item.fields)
      sent += 1
      write(read(storage).filter((it) => it.id !== item.id), storage)
    } catch (err) {
      if (!(err instanceof ApiError) || err.key === 'err_unreachable' || err.status >= 500) break // offline
      write(read(storage).map((it) => (it.id === item.id ? { ...it, failed: true } : it)), storage)
    }
  }
  return { sent, left: read(storage).length }
}
