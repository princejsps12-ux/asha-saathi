// Thin fetch wrapper: every error becomes an Error with a readable (bilingual) message.
async function request(path, options = {}) {
  let res
  try {
    res = await fetch(path, {
      headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch {
    throw new Error('सर्वर से कनेक्ट नहीं हो पाया / Cannot reach server')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((d) => d.msg).join(', ') : data.detail
    throw new Error(detail || `Error ${res.status}`)
  }
  return data
}

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
