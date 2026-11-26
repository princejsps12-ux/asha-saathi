// @vitest-environment jsdom
// Component tests for the confirm step, with speech recognition scripted and the API mocked.
// They reproduce the real-mic bug: a pause after the read-back used to end listening, and
// the next mic tap wiped the whole visit.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api.js'
import { loadPending } from '../pendingVisit.js'
import { listen, speak } from '../speech.js'
import RecordView from './RecordView.jsx'

// Each listen() call takes the next scripted utterance; '' means she paused and said nothing.
const script = vi.hoisted(() => [])

vi.mock('../speech.js', () => ({
  browserSttSupported: true,
  recorderSupported: false,
  speechLang: (lang) => (lang === 'en' ? 'en-IN' : 'hi-IN'),
  speak: vi.fn(() => Promise.resolve()),
  stopSpeaking: vi.fn(),
  recordAudio: vi.fn(),
  listen: vi.fn((opts) => {
    const text = script.length ? script.shift() : ''
    let ended = false
    const end = (value) => { if (!ended) { ended = true; opts.onEnd(value) } }
    setTimeout(() => { if (text) opts.onText?.(text); end(text) }, 0)
    return { stop: () => end('') }
  }),
}))

vi.mock('../api.js', () => ({
  api: { extract: vi.fn(), evaluate: vi.fn(), intent: vi.fn(), saveVisit: vi.fn() },
  toUiError: () => ({ k: 'err_server' }),
}))

const DICTATION = 'सुनीता साहू 7 महीने बीपी 15 बाय 100 पैरों में सूजन है बेबी मूवमेंट काम है अगले हफ्ते फिर आऊंगी'
const FIELDS = {
  beneficiary_id: 1, beneficiary_name: 'सुनीता साहू', beneficiary_name_en: 'Sunita Sahu', pregnancy_month: 7,
  bp_systolic: null, bp_diastolic: null, bp_unclear: true, bp_heard: '15/100', hb: null, weight_kg: null,
  temperature_f: null, symptoms: ['swelling'], fetal_movement: 'reduced', ifa_taking: null, ifa_tablets: null,
  td_dose: null, vaccine_given: null, next_visit_date: '2026-12-04',
}
const FIXED = { ...FIELDS, bp_systolic: 150, bp_diastolic: 100, bp_unclear: false, bp_heard: null }
const analysisOf = (fields, extra = {}) => ({
  fields, alerts: [], risk: 'normal', summary_hi: 'सारांश', summary_en: 'Summary', gloss_en: 'Sunita Sahu. 7 months.',
  engine: 'rules', engine_note: null, unclear: fields.bp_unclear ? ['bp'] : [], changed: true, ...extra,
})
const props = {
  status: { stt: 'browser', today: '2026-11-27' },
  people: [{ id: 1, name_hi: 'सुनीता साहू', name_en: 'Sunita Sahu', village: 'कुरुद', village_en: 'Kurud' }],
  symptomLabels: { swelling: { hi: 'पैरों में सूजन', en: 'Swelling (feet)' } },
  samples: [],
  preset: null,
}

const mic = () => document.querySelector('.mic')
const waitForAnswerPrompt = () => waitFor(() => expect(screen.getByText('Tap mic and say yes or no')).toBeTruthy())
const bpRowText = () => [...document.querySelectorAll('.field')].find((r) => r.textContent.includes('BP')).textContent

beforeEach(() => {
  script.length = 0
  vi.clearAllMocks()
  localStorage.clear()
  api.extract.mockImplementation(async (text, base) => {
    if (!base) return analysisOf(FIELDS)
    return text.includes('150') ? analysisOf(FIXED) : { ...analysisOf(base), changed: false }
  })
  api.intent.mockImplementation(async (text) => ({
    intent: /हाँ|haan|yes/i.test(text) ? 'yes' : /नहीं|nahi|\bno\b/i.test(text) ? 'no' : 'unknown',
  }))
  api.saveVisit.mockImplementation(async (_transcript, fields) => ({ analysis: analysisOf(fields) }))
})
afterEach(cleanup)

/** Dictate the visit, then pause through the confirm window AND its automatic retry. */
async function dictateThenPause(onSaved = vi.fn()) {
  script.push(DICTATION, '', '')
  const view = render(<RecordView {...props} onSaved={onSaved} />)
  fireEvent.click(mic())
  await waitForAnswerPrompt()
  return view
}

describe('confirm step after a pause', () => {
  it('listens longer and retries once before stopping, then shows the bilingual hint and Yes / No', async () => {
    await dictateThenPause()
    expect(listen).toHaveBeenCalledTimes(3) // dictation + answer window + one automatic retry
    expect(listen.mock.calls[1][0].startTimeoutMs).toBeGreaterThanOrEqual(8000)
    expect(screen.getByText('माइक दबाकर हाँ या नहीं बोलें')).toBeTruthy()
    expect(screen.getByRole('button', { name: /हाँ ✓/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /नहीं ✗/ })).toBeTruthy()
  })

  it('pause then tap mic -> listens only for the answer; all fields are kept and saved', async () => {
    const onSaved = vi.fn()
    await dictateThenPause(onSaved)
    script.push('हाँ')
    fireEvent.click(mic())
    await waitFor(() => expect(api.saveVisit).toHaveBeenCalledOnce())
    // Never re-dictated: every later extract call was a correction attempt on the SAME entry.
    expect(api.extract.mock.calls.filter(([, base]) => !base)).toHaveLength(1)
    expect(api.saveVisit).toHaveBeenCalledWith(DICTATION, FIELDS)
    expect(onSaved).toHaveBeenCalledOnce()
    expect(screen.getByText(DICTATION)).toBeTruthy()
  })

  it('correction after a timeout -> "बीपी 150 बाय 100" fills the BP in the same visit', async () => {
    await dictateThenPause()
    expect(bpRowText()).toContain('15/100')
    script.push('बीपी 150 बाय 100', '', '')
    fireEvent.click(mic())
    await waitFor(() => expect(bpRowText()).toContain('150/100'))
    expect(api.extract).toHaveBeenLastCalledWith('बीपी 150 बाय 100', FIELDS)
    expect(bpRowText()).not.toContain('15/100')
    expect(screen.getAllByText('सुनीता साहू').length).toBeGreaterThan(0) // the woman, month, etc. kept
    expect(screen.getByText(`${DICTATION} · बीपी 150 बाय 100`)).toBeTruthy()
    await waitForAnswerPrompt() // read back again, then waits for yes / no
  })

  it('the No button keeps the visit for editing; the Yes button saves it', async () => {
    await dictateThenPause()
    fireEvent.click(screen.getByRole('button', { name: /नहीं ✗/ }))
    expect(speak).toHaveBeenLastCalledWith(expect.stringContaining('टैप करके बदलें'), 'hi-IN')
    expect(bpRowText()).toContain('15/100')
    fireEvent.click(screen.getByRole('button', { name: /हाँ ✓/ }))
    await waitFor(() => expect(api.saveVisit).toHaveBeenCalledWith(DICTATION, FIELDS))
  })
})

describe('pending visit survives a refresh', () => {
  it('refresh restores the pending visit; answering then saves it and clears storage', async () => {
    const first = await dictateThenPause()
    expect(loadPending()).toMatchObject({ transcript: DICTATION, analysis: { fields: FIELDS } })
    first.unmount() // page refresh

    render(<RecordView {...props} onSaved={vi.fn()} />)
    expect(screen.getByText('Unsaved visit restored — not saved yet')).toBeTruthy()
    expect(bpRowText()).toContain('15/100')
    expect(screen.getByText(DICTATION)).toBeTruthy()
    expect(screen.getByRole('button', { name: /हाँ ✓/ })).toBeTruthy()

    script.push('हाँ')
    fireEvent.click(mic()) // answers the restored visit — no new dictation
    await waitFor(() => expect(api.saveVisit).toHaveBeenCalledWith(DICTATION, FIELDS))
    await waitFor(() => expect(loadPending()).toBeNull())
  })

  it('restores safely even before the server status (today\'s date) has loaded', async () => {
    const first = await dictateThenPause()
    first.unmount()
    render(<RecordView {...props} status={null} onSaved={vi.fn()} />) // first paint after a refresh
    expect(screen.getByText('Unsaved visit restored — not saved yet')).toBeTruthy()
    fireEvent.click([...document.querySelectorAll('.field-row')].find((r) => r.textContent.includes('Next visit')))
    expect(screen.getByRole('button', { name: /Tomorrow/ })).toBeTruthy() // quick-date chips render, no crash
  })

  it('only "New visit" discards it, and only after confirming', async () => {
    await dictateThenPause()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: /नई विज़िट/ }))
    expect(loadPending()).not.toBeNull() // cancelled: still pending
    fireEvent.click(screen.getByRole('button', { name: /नई विज़िट/ }))
    expect(confirm).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(loadPending()).toBeNull())
    expect(screen.queryByRole('button', { name: /हाँ ✓/ })).toBeNull()
  })
})
