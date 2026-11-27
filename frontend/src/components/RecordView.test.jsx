// @vitest-environment jsdom
// Component tests for the confirm step, with speech recognition scripted and the API mocked.
// They reproduce the real-mic bug: a pause after the read-back used to end listening, and
// the next mic tap wiped the whole visit.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api.js'
import { loadPending } from '../pendingVisit.js'
import { listen, speak } from '../speech.js'
import { LangContext } from '../lang.jsx'
import RecordView from './RecordView.jsx'

// Each listen() call takes the next scripted utterance; '' means she paused and said nothing.
const script = vi.hoisted(() => [])

vi.mock('../speech.js', () => ({
  DICTATION_SILENCE_MS: 3500,
  DICTATION_START_TIMEOUT_MS: 10000,
  DICTATION_MAX_RESTARTS: 20,
  browserSttSupported: true,
  recorderSupported: false,
  RECOGNITION_LANG: 'hi-IN',
  speechLang: (lang) => (lang === 'en' ? 'en-IN' : 'hi-IN'),
  speak: vi.fn(() => Promise.resolve()),
  stopSpeaking: vi.fn(),
  recordAudio: vi.fn(),
  listen: vi.fn((opts) => {
    // A script item is the text heard, or { shown, final } for an engine that displays words
    // (interim) but ends with a different / empty final result, as mobile engines do.
    // { phrases, gapMs } speaks several phrases with pauses and keeps listening until stop().
    const item = script.length ? script.shift() : ''
    const { shown, final, phrases, gapMs = 0 } = typeof item === 'string' ? { shown: item, final: item } : item
    let ended = false
    const end = (value) => {
      if (!ended) {
        ended = true
        opts.onEnd(value)
      }
    }
    if (phrases) {
      let text = ''
      phrases.forEach((phrase, i) =>
        setTimeout(() => {
          if (ended) return
          vi.setSystemTime(Date.now() + gapMs) // the pause before this phrase
          text = [text, phrase].filter(Boolean).join(' ')
          opts.onText?.(text)
        }, i),
      )
    } else {
      setTimeout(() => {
        if (shown) opts.onText?.(shown)
        end(final)
      }, 0)
    }
    return { stop: () => end('') }
  }),
}))

vi.mock('../api.js', () => ({
  api: { extract: vi.fn(), evaluate: vi.fn(), intent: vi.fn(), saveVisit: vi.fn() },
  toUiError: () => ({ k: 'err_server' }),
}))

const DICTATION = 'सुनीता साहू 7 महीने बीपी 15 बाय 100 पैरों में सूजन है बेबी मूवमेंट काम है अगले हफ्ते फिर आऊंगी'
const FIELDS = {
  beneficiary_id: 1,
  beneficiary_name: 'सुनीता साहू',
  beneficiary_name_en: 'Sunita Sahu',
  pregnancy_month: 7,
  bp_systolic: null,
  bp_diastolic: null,
  bp_unclear: true,
  bp_heard: '15/100',
  hb: null,
  weight_kg: null,
  temperature_f: null,
  symptoms: ['swelling'],
  fetal_movement: 'reduced',
  ifa_taking: null,
  ifa_tablets: null,
  td_dose: null,
  vaccine_given: null,
  next_visit_date: '2026-12-04',
}
const FIXED = { ...FIELDS, bp_systolic: 150, bp_diastolic: 100, bp_unclear: false, bp_heard: null }
const analysisOf = (fields, extra = {}) => ({
  fields,
  alerts: [],
  risk: 'normal',
  summary_hi: 'सारांश',
  summary_en: 'Summary',
  gloss_en: 'Sunita Sahu. 7 months.',
  engine: 'rules',
  engine_note: null,
  unclear: fields.bp_unclear ? ['bp'] : [],
  changed: true,
  ...extra,
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

  it("restores safely even before the server status (today's date) has loaded", async () => {
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

describe('live-site phone bug: mixed Roman + Devanagari dictation', () => {
  const PHONE_TEXT = 'Sunita Sahu सात महीने BP 150 बाय 100 पैरों में सूजन है, बेबी मूवमेंट कम है, अगले हफ्ते फिर आऊंगी'
  const spokenTexts = () => speak.mock.calls.map(([text]) => text)

  it('words shown but no final result from the engine -> still extracted; own read-back echo -> no "समझ नहीं आया"', async () => {
    const readBackEcho = 'सारांश सारांश सारांश' // the mic hears our own summary_hi ("सारांश") from the speaker
    script.push({ shown: PHONE_TEXT, final: '' }, readBackEcho, '', '')
    render(<RecordView {...props} onSaved={vi.fn()} />)
    fireEvent.click(mic())
    await waitForAnswerPrompt()
    expect(api.extract.mock.calls[0]).toEqual([PHONE_TEXT]) // extraction ran on the on-screen words
    expect(screen.getByText(PHONE_TEXT)).toBeTruthy()
    expect(listen).toHaveBeenCalledTimes(4) // dictation, echo, then one re-listen (+ its silence retry)
    expect(spokenTexts().some((text) => text.includes('समझ नहीं आया'))).toBe(false)
    expect(spokenTexts().some((text) => text.includes('कोई नई जानकारी'))).toBe(false)
  })

  it('an unclear non-empty answer asks her to say yes — never "समझ नहीं आया"', async () => {
    script.push(PHONE_TEXT, 'अच्छा ठीक', '')
    render(<RecordView {...props} onSaved={vi.fn()} />)
    fireEvent.click(mic())
    await waitFor(() => expect(spokenTexts().some((text) => text.includes('कोई नई जानकारी नहीं मिली'))).toBe(true))
    expect(spokenTexts().some((text) => text.includes('समझ नहीं आया'))).toBe(false)
    expect(screen.getByRole('button', { name: /हाँ ✓/ })).toBeTruthy() // visit kept, Yes still available
  })

  it('extraction failure keeps the transcript and offers "Try again" on the same words', async () => {
    api.extract.mockRejectedValueOnce(new Error('cold start'))
    script.push(PHONE_TEXT, '', '')
    render(<RecordView {...props} onSaved={vi.fn()} />)
    fireEvent.click(mic())
    const retry = await screen.findByRole('button', { name: /दोबारा कोशिश करें/ })
    expect(screen.getByText(PHONE_TEXT)).toBeTruthy()
    fireEvent.click(retry)
    await waitForAnswerPrompt()
    expect(api.extract).toHaveBeenLastCalledWith(PHONE_TEXT)
  })
})

describe('spoken read-back vs on-screen text', () => {
  it('TTS hears "एफ़-आर-यू यानी बड़े अस्पताल" while the screen keeps "FRU"', async () => {
    const summary = 'खतरे का संकेत: बहुत ज़्यादा बीपी। तुरंत 108 एम्बुलेंस बुलाएँ / FRU रेफ़र करें।'
    api.extract.mockResolvedValueOnce(analysisOf(FIELDS, { summary_hi: summary }))
    script.push(DICTATION, '', '')
    render(<RecordView {...props} onSaved={vi.fn()} />)
    fireEvent.click(mic())
    await waitForAnswerPrompt()
    const spoken = speak.mock.calls.map(([text]) => text).join(' ')
    expect(spoken).toContain('एफ़-आर-यू यानी बड़े अस्पताल')
    expect(spoken).not.toContain('FRU')
    expect(document.querySelector('.readback-text').textContent).toContain('/ FRU रेफ़र करें') // screen unchanged
  })
})

describe('dictation with thinking pauses', () => {
  afterEach(() => vi.useRealTimers())
  const NOTE_PARTS = ['सुनीता साहू सात महीने', 'BP 150 बाय 100', 'अगले हफ्ते फिर आऊंगी']
  const NOTE = NOTE_PARTS.join(' ')

  it('listens with a ~3.5 s silence window and shows "सुन रही हूँ…" with a big बस / Done button', async () => {
    script.push({ phrases: NOTE_PARTS, gapMs: 2000 }, '', '')
    render(<RecordView {...props} onSaved={vi.fn()} />)
    fireEvent.click(mic())
    expect(listen.mock.calls[0][0].silenceMs).toBeGreaterThanOrEqual(3000)
    expect(screen.getByText('सुन रही हूँ…')).toBeTruthy()
    const done = screen.getByRole('button', { name: /बस ✓/ })
    await waitFor(() => expect(screen.getByText(NOTE)).toBeTruthy()) // pauses did not end it
    expect(api.extract).not.toHaveBeenCalled()
    fireEvent.click(done) // finish early
    await waitForAnswerPrompt()
    expect(api.extract.mock.calls[0]).toEqual([NOTE]) // everything said was kept
  })

  it('saying "हो गया" after a pause finishes the note, and the command is not extracted', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    script.push({ phrases: [...NOTE_PARTS, 'हो गया'], gapMs: 1500 }, '', '')
    render(<RecordView {...props} onSaved={vi.fn()} />)
    fireEvent.click(mic())
    await waitForAnswerPrompt()
    expect(api.extract.mock.calls[0]).toEqual([NOTE])
    expect(screen.getByText(NOTE)).toBeTruthy()
  })
})

describe('bug: BP after "बीपी" must parse the same in every language mode', () => {
  const EN_MODE_STT = 'सुनीता साहू 7 महीने बीपी 150/100 पैरों में सूजन है बेबी मूवमेंट कम है अगले हफ्ते फिर आऊंगी'
  const PARSED = { ...FIELDS, bp_systolic: 150, bp_diastolic: 100, bp_unclear: false, bp_heard: null }

  // The voice flow is identical in every mode: recognition is always hi-IN; only the read-back voice changes.
  for (const mode of ['both', 'hi', 'en']) {
    it(`${mode}: the exact transcript reaches extraction unchanged and BP shows 150/100`, async () => {
      api.extract.mockResolvedValueOnce(analysisOf(PARSED))
      script.push(EN_MODE_STT, '', '')
      render(
        <LangContext.Provider value={{ mode, setMode: vi.fn() }}>
          <RecordView {...props} onSaved={vi.fn()} />
        </LangContext.Provider>,
      )
      fireEvent.click(mic())
      await waitFor(() => expect(api.extract).toHaveBeenCalled())
      expect(api.extract.mock.calls[0]).toEqual([EN_MODE_STT]) // the UI language never rewrites the text
      expect(listen.mock.calls[0][0].lang).toBe('hi-IN')
      await waitFor(() => expect(bpRowText()).toContain('150/100'))
      expect(bpRowText()).not.toMatch(/not clear|समझ नहीं/i)
      await waitFor(() => expect(speak).toHaveBeenCalled())
      expect(speak.mock.calls[0][1]).toBe(mode === 'en' ? 'en-IN' : 'hi-IN') // only the read-back voice changes
    })
  }
})
