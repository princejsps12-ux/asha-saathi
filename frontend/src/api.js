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

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(path, {
      headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch {
    throw new ApiError('err_unreachable')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(keyForStatus(res.status), res.status, data.detail)
  return data
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
  extract: (transcript) => post('/api/extract', { transcript }),
  evaluate: (fields) => post('/api/evaluate', { fields }),
  intent: (text) => post('/api/intent', { text }),
  saveVisit: (transcript, fields) => post('/api/visits', { transcript, fields }),
  resetDemo: () => post('/api/demo/reset', {}),
  stt: (blob) => {
    const form = new FormData()
    form.append('audio', blob, 'visit.webm')
    return request('/api/stt', { method: 'POST', body: form })
  },
}
