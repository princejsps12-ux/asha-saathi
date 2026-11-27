// Thin fetch wrapper. Every failure becomes an ApiError carrying an i18n key, so the UI
// always shows a friendly bilingual message instead of a raw status code or stack trace.

export class ApiError extends Error {
  constructor(key, status = 0, detail = '') {
    super(detail || key)
    this.key = key
    this.status = status
  }
}

function keyForStatus(status) {
  if (status === 404) return 'err_notFound'
  if (status === 400 || status === 422) return 'err_invalid'
  if (status === 413) return 'err_tooLarge'
  if (status === 502 || status === 503) return 'err_sttService'
  return 'err_server'
}

// A free-tier server that went to sleep can take ~50 s to wake and may answer 502/503/504
// meanwhile. Wait long enough for that, and retry once on a network error or those statuses.
export const REQUEST_TIMEOUT_MS = 75000
export const RETRY_DELAY_MS = 1500
const RETRYABLE_STATUS = new Set([502, 503, 504])
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function request(path, options = {}, { retries = 1, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res
    try {
      res = await fetch(path, {
        headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
        ...options,
        signal: controller.signal,
      })
    } catch {
      clearTimeout(timer)
      if (attempt < retries) {
        await wait(RETRY_DELAY_MS)
        continue
      }
      throw new ApiError('err_unreachable')
    }
    clearTimeout(timer)
    if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
      await wait(RETRY_DELAY_MS)
      continue
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(keyForStatus(res.status), res.status, data.detail)
    return data
  }
}

/** Any thrown value -> { k, vars } for <ErrorNote>. Unknown errors get the generic message. */
export const toUiError = (err) => ({ k: err instanceof ApiError ? err.key : 'err_server' })

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) })

export const api = {
  status: () => request('/api/status'),
  samples: () => request('/api/samples'),
  symptoms: () => request('/api/symptoms'),
  beneficiaries: () => request('/api/beneficiaries'),
  beneficiary: (id) => request(`/api/beneficiaries/${id}`),
  due: () => request('/api/due'),
  highRisk: () => request('/api/high-risk'),
  // `base`: the current entry, when the transcript is a spoken correction ("BP 150 by 100")
  extract: (transcript, base = null) => post('/api/extract', base ? { transcript, base } : { transcript }),
  evaluate: (fields) => post('/api/evaluate', { fields }),
  addBeneficiary: (name, village = '') => post('/api/beneficiaries', { name, village }),
  intent: (text) => post('/api/intent', { text }),
  saveVisit: (transcript, fields) => post('/api/visits', { transcript, fields }),
  resetDemo: () => post('/api/demo/reset', {}),
  stt: (blob) => {
    const form = new FormData()
    form.append('audio', blob, 'visit.webm')
    // 503 here means "no Sarvam key", not "server asleep": don't retry
    return request('/api/stt', { method: 'POST', body: form }, { retries: 0 })
  },
}
