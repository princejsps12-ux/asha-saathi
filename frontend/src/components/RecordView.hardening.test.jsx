// @vitest-environment jsdom
// Real-world failure modes: unsupported browser, mic denied, network drop mid-speech, offline
// save / extraction, and a woman who is not on the list yet.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api.js'
import { loadDraft } from '../pendingVisit.js'
import { queuedVisits } from '../syncQueue.js'
import RecordView from './RecordView.jsx'

const engine = vi.hoisted(() => ({ supported: true, script: [] }))

vi.mock('../speech.js', () => ({
  DICTATION_SILENCE_MS: 3500,
  DICTATION_START_TIMEOUT_MS: 10000,
  DICTATION_MAX_RESTARTS: 20,
  get browserSttSupported() { return engine.supported },
  recorderSupported: false,
  speechLang: (lang) => (lang === 'en' ? 'en-IN' : 'hi-IN'),
  speak: vi.fn(() => Promise.resolve()),
  stopSpeaking: vi.fn(),
  recordAudio: vi.fn(),
  // Each script item: { shown, error, final } — words shown, an engine error, then the final text.
  listen: vi.fn((opts) => {
    const item = engine.script.length ? engine.script.shift() : {}
    let ended = false
    const end = (value) => { if (!ended) { ended = true; opts.onEnd(value) } }
    setTimeout(() => {
      if (item.shown) opts.onText?.(item.shown)
      if (item.error) opts.onError?.(item.error)
      end(item.final ?? '')
    }, 0)
    return { stop: () => end('') }
  }),
}))

vi.mock('../api.js', () => {
  class ApiError extends Error {
    constructor(key, status = 0) { super(key); this.key = key; this.status = status }
  }
  return {
    ApiError,
    api: { extract: vi.fn(), evaluate: vi.fn(), intent: vi.fn(), saveVisit: vi.fn(), addBeneficiary: vi.fn() },
    toUiError: (e) => ({ k: e?.key || 'err_server' }),
  }
})

const NOTE = 'सुनीता साहू सात महीने BP 150 बाय 100'
const FIELDS = {
  beneficiary_id: 1, beneficiary_name: 'सुनीता साहू', beneficiary_name_en: 'Sunita Sahu', beneficiary_name_heard: null,
  beneficiary_suggestions: [], pregnancy_month: 7, bp_systolic: 150, bp_diastolic: 100, bp_unclear: false,
  bp_heard: null, hb: null, weight_kg: null, temperature_f: null, symptoms: [], fetal_movement: null,
  ifa_taking: null, ifa_tablets: null, td_dose: null, vaccine_given: null, next_visit_date: null,
}
const analysisOf = (fields, extra = {}) => ({
  fields, alerts: [], risk: 'normal', summary_hi: 'सारांश', summary_en: 'Summary', gloss_en: 'Gloss',
  engine: 'rules', engine_note: null, unclear: [], suggestions: [], changed: true, ...extra,
})
const props = {
  status: { stt: 'browser', today: '2026-11-27' },
  people: [{ id: 1, name_hi: 'सुनीता साहू', name_en: 'Sunita Sahu', village: 'कुरुद', village_en: 'Kurud' }],
  symptomLabels: {},
  samples: [{ id: 's', label_hi: 'नमूना', label_en: 'Sample', text: NOTE }],
  preset: null,
}
const offline = async () => { const { ApiError } = await import('../api.js'); return new ApiError('err_unreachable') }
const mic = () => document.querySelector('.mic')

beforeEach(() => {
  engine.supported = true
  engine.script.length = 0
  vi.clearAllMocks()
  localStorage.clear()
  api.extract.mockResolvedValue(analysisOf(FIELDS))
  api.evaluate.mockImplementation(async (fields) => analysisOf({ ...FIELDS, ...fields }))
  api.intent.mockResolvedValue({ intent: 'unknown' })
  api.saveVisit.mockImplementation(async (_t, fields) => ({ analysis: analysisOf(fields) }))
})
afterEach(cleanup)

describe('2. browser without speech recognition (Firefox, some iOS)', () => {
  it('says so in both languages and offers typing and Try sample', async () => {
    engine.supported = false
    render(<RecordView {...props} />)
    expect(screen.getByText('इस ब्राउज़र में आवाज़ नहीं चलती - Chrome खोलें')).toBeTruthy()
    expect(screen.getByText('Voice not supported here - use Chrome')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Try sample/ })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: /लिखकर दर्ज करें/ }), { target: { value: NOTE } })
    fireEvent.click(screen.getByRole('button', { name: /जानकारी निकालें/ }))
    await waitFor(() => expect(api.extract).toHaveBeenCalledWith(NOTE))
    expect(screen.getByRole('button', { name: /हाँ ✓/ })).toBeTruthy() // Yes/No buttons replace voice confirm
  })
})

describe('3. mic denied / network error mid-speech', () => {
  it('mic denied: friendly guidance and the type-in box opens', async () => {
    engine.script.push({ error: 'not-allowed', final: '' })
    render(<RecordView {...props} />)
    fireEvent.click(mic())
    await waitFor(() => expect(screen.getByText(/पता-बार में 🔒/)).toBeTruthy())
    expect(screen.getByText(/allow the microphone/)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /लिखकर दर्ज करें/ })).toBeTruthy()
  })

  it('network drops mid-speech: the words already heard are kept and extracted', async () => {
    engine.script.push({ shown: NOTE, error: 'network', final: '' }, {}, {})
    render(<RecordView {...props} />)
    fireEvent.click(mic())
    await waitFor(() => expect(api.extract).toHaveBeenCalledWith(NOTE))
    expect(screen.getByText(NOTE)).toBeTruthy()
  })
})

describe('1. offline: nothing is lost', () => {
  it('confirmed visit while offline is saved on the phone and queued for sync', async () => {
    api.saveVisit.mockRejectedValue(await offline())
    const onQueued = vi.fn()
    engine.script.push({ shown: NOTE, final: NOTE }, {}, {})
    render(<RecordView {...props} onQueued={onQueued} />)
    fireEvent.click(mic())
    fireEvent.click(await screen.findByRole('button', { name: /हाँ ✓/ }))
    await waitFor(() => expect(screen.getByText(/फ़ोन में सेव/)).toBeTruthy())
    expect(queuedVisits()).toHaveLength(1)
    expect(queuedVisits()[0]).toMatchObject({ transcript: NOTE, fields: { bp_systolic: 150 } })
    expect(onQueued).toHaveBeenCalledWith(1)
  })

  it('extraction while offline keeps the words as a draft that survives a refresh', async () => {
    api.extract.mockRejectedValueOnce(await offline())
    engine.script.push({ shown: NOTE, final: NOTE })
    const first = render(<RecordView {...props} />)
    fireEvent.click(mic())
    await waitFor(() => expect(screen.getByText(/आपकी बात फ़ोन में रखी है/)).toBeTruthy())
    expect(loadDraft()).toBe(NOTE)
    first.unmount() // refresh
    render(<RecordView {...props} />)
    expect(screen.getByText(NOTE)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /दोबारा कोशिश करें/ }))
    await waitFor(() => expect(api.extract).toHaveBeenLastCalledWith(NOTE))
    await waitFor(() => expect(loadDraft()).toBe(''))
  })
})

describe('4. a woman who is not on the list', () => {
  const unknown = { ...FIELDS, beneficiary_id: null, beneficiary_name: null, beneficiary_name_en: null,
    beneficiary_name_heard: 'Anita Devi' }

  it('asks "नई लाभार्थी जोड़ें?" with her spoken name, adds her and links the visit', async () => {
    api.extract.mockResolvedValue(analysisOf(unknown))
    api.addBeneficiary.mockResolvedValue({ id: 42, name_hi: 'Anita Devi', name_en: 'Anita Devi', created: true })
    const onPeopleChanged = vi.fn()
    engine.script.push({ shown: 'Anita Devi 6 mahine', final: 'Anita Devi 6 mahine' }, {}, {})
    render(<RecordView {...props} onPeopleChanged={onPeopleChanged} />)
    fireEvent.click(mic())
    expect(await screen.findByText('नई लाभार्थी जोड़ें?')).toBeTruthy()
    expect(screen.getByDisplayValue('Anita Devi')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /हाँ, जोड़ें/ }))
    await waitFor(() => expect(api.addBeneficiary).toHaveBeenCalledWith('Anita Devi', ''))
    await waitFor(() => expect(api.evaluate).toHaveBeenCalledWith(expect.objectContaining({ beneficiary_id: 42 })))
    expect(onPeopleChanged).toHaveBeenCalled()
  })

  it('a close-but-unsure name is offered as "क्या आपका मतलब:", never chosen automatically', async () => {
    api.extract.mockResolvedValue(analysisOf({ ...unknown, beneficiary_name_heard: 'Sunitha Sahni' }, {
      suggestions: [{ id: 1, name_hi: 'सुनीता साहू', name_en: 'Sunita Sahu', village: 'कुरुद', village_en: 'Kurud' }],
    }))
    engine.script.push({ shown: 'Sunitha Sahni', final: 'Sunitha Sahni' }, {}, {})
    render(<RecordView {...props} />)
    fireEvent.click(mic())
    expect(await screen.findByText('क्या आपका मतलब:')).toBeTruthy()
    expect(api.evaluate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /सुनीता साहू · कुरुद/ }))
    await waitFor(() => expect(api.evaluate).toHaveBeenCalledWith(expect.objectContaining({ beneficiary_id: 1 })))
  })
})
