import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { RISK } from '../labels.js'
import { browserSttSupported, listen, recordAudio, recorderSupported, speak, speechErrorText, stopSpeaking } from '../speech.js'
import AlertList from './AlertList.jsx'
import FieldsCard from './FieldsCard.jsx'

// The core flow: speak -> extract -> read back -> confirm by voice -> save -> alert.
// phase: idle | listening | thinking | speaking | confirming | review | saving | saved

const PHASE_TEXT = {
  idle: ['माइक दबाकर विज़िट बोलें', 'Tap the mic and describe the visit'],
  listening: ['सुन रही हूँ… बोलती रहिए', 'Listening… pause to finish'],
  thinking: ['समझ रही हूँ…', 'Extracting fields…'],
  speaking: ['सुनिए, क्या यह सही है?', 'Reading back the entry'],
  confirming: ['"हाँ" या "नहीं" बोलिए', 'Say “haan” to save or “nahi” to edit'],
  review: ['जाँचें, ज़रूरत हो तो टैप करके बदलें', 'Check and tap a field to fix it'],
  saving: ['सेव हो रहा है…', 'Saving…'],
  saved: ['सेव हो गया ✓', 'Saved'],
}

export default function RecordView({ status, people, symptomLabels, samples, preset, onSaved }) {
  const [phase, setPhase] = useState('idle')
  const [transcript, setTranscriptState] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState('')
  const [sampleIndex, setSampleIndex] = useState(0)
  const handle = useRef(null)
  const presetRef = useRef(preset)
  const transcriptRef = useRef('')
  // Every new action bumps this token; async callbacks from an older flow (TTS ending,
  // a late "haan") check it and quietly do nothing, so flows never overlap.
  const flow = useRef(0)
  const useServerStt = status?.stt === 'sarvam' && recorderSupported
  const canListen = browserSttSupported || useServerStt

  const setTranscript = (text) => { transcriptRef.current = text; setTranscriptState(text) }
  const newFlow = () => {
    flow.current += 1
    handle.current?.stop?.()
    handle.current = null
    stopSpeaking()
    return flow.current
  }

  useEffect(() => { presetRef.current = preset }, [preset])
  useEffect(() => () => { newFlow() }, [])

  const reset = () => {
    newFlow()
    setPhase('idle'); setTranscript(''); setAnalysis(null); setError('')
  }

  async function process(text) {
    const id = flow.current
    if (!text.trim()) {
      setError(speechErrorText('no-speech')); setPhase('idle'); return
    }
    setPhase('thinking'); setError('')
    try {
      let result = await api.extract(text)
      if (result.fields.beneficiary_id == null && presetRef.current) {
        result = await api.evaluate({ ...result.fields, beneficiary_id: presetRef.current })
      }
      if (id !== flow.current) return
      setAnalysis(result)
      await readBackAndConfirm(result)
    } catch (e) {
      if (id === flow.current) { setError(e.message); setPhase('idle') }
    }
  }

  async function readBackAndConfirm(result) {
    const id = newFlow()
    setPhase('speaking')
    await speak(result.summary_hi)
    if (id !== flow.current) return
    if (!browserSttSupported) { setPhase('review'); return }
    setPhase('confirming')
    handle.current = listen({
      silenceMs: 1500,
      startTimeoutMs: 6000,
      onError: () => id === flow.current && setPhase('review'),
      onEnd: async (answer) => {
        if (id !== flow.current) return
        if (!answer) { setPhase('review'); return }
        const { intent } = await api.intent(answer).catch(() => ({ intent: 'unknown' }))
        if (id !== flow.current) return
        if (intent === 'yes') save(result)
        else {
          setPhase('review')
          speak(intent === 'no' ? 'ठीक है। गलत जानकारी पर टैप करके बदलें, या दोबारा बोलें।'
            : 'समझ नहीं आया। नीचे बटन दबाएँ।')
        }
      },
    })
  }

  async function save(result = analysis) {
    newFlow()
    if (result?.fields.beneficiary_id == null) {
      setError('पहले लाभार्थी चुनें / Select the woman first'); setPhase('review')
      speak('पहले लाभार्थी चुनें।')
      return
    }
    setPhase('saving')
    try {
      const { analysis: saved } = await api.saveVisit(transcriptRef.current, result.fields)
      setAnalysis(saved); setPhase('saved')
      onSaved?.()
      const red = saved.alerts.filter((a) => a.severity === 'red')
      speak(red.length ? `सेव हो गया। ध्यान दें, खतरे का संकेत है: ${red.map((a) => a.title_hi).join(', ')}। ${red[0].action_hi}।`
        : 'सेव हो गया। धन्यवाद।')
    } catch (e) {
      setError(e.message); setPhase('review')
    }
  }

  async function startMic() {
    reset()
    if (useServerStt) return startServerStt()
    const id = flow.current
    setPhase('listening')
    handle.current = listen({
      onText: (text) => id === flow.current && setTranscript(text),
      onError: (code) => id === flow.current && setError(speechErrorText(code)),
      onEnd: (text) => {
        if (id !== flow.current) return
        setTranscript(text); process(text)
      },
    })
  }

  async function startServerStt() {
    const id = flow.current
    try {
      setPhase('listening')
      const rec = await recordAudio()
      handle.current = {
        stop: async () => {
          const blob = await rec.stop()
          if (id !== flow.current) return // cancelled: mic released, nothing uploaded
          setPhase('thinking')
          try {
            const { transcript: text } = await api.stt(blob)
            setTranscript(text); process(text)
          } catch (e) {
            setError(`${e.message} — ब्राउज़र आवाज़ पहचान इस्तेमाल करें`); setPhase('idle')
          }
        },
      }
    } catch {
      setError(speechErrorText('not-allowed')); setPhase('idle')
    }
  }

  function micPressed() {
    if (phase === 'listening') handle.current?.stop()
    else startMic()
  }

  async function trySample() {
    if (!samples.length) return
    reset()
    const id = flow.current
    const sample = samples[sampleIndex % samples.length]
    setSampleIndex((i) => i + 1)
    setPhase('listening')
    // Type the sentence out so it looks and feels like live dictation.
    const words = sample.text.split(' ')
    for (let i = 1; i <= words.length; i++) {
      if (id !== flow.current) return
      setTranscript(words.slice(0, i).join(' '))
      await new Promise((r) => setTimeout(r, 45))
    }
    process(sample.text)
  }

  async function onFieldsChange(fields) {
    newFlow()
    if (phase === 'confirming' || phase === 'speaking') setPhase('review')
    try {
      setAnalysis(await api.evaluate(fields)); setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  const [hi, en] = PHASE_TEXT[phase]
  const busy = ['thinking', 'saving', 'speaking'].includes(phase)
  const nextSample = samples[sampleIndex % (samples.length || 1)]

  return (
    <div className="record">
      <div className="mic-zone">
        <button type="button" className={`mic mic-${phase}`} onClick={micPressed}
          disabled={!canListen || busy || phase === 'confirming'}
          aria-label={phase === 'listening' ? 'Stop listening' : 'Start speaking'}>
          <svg viewBox="0 0 24 24" aria-hidden>
            {phase === 'listening'
              ? <rect x="7" y="7" width="10" height="10" rx="2" />
              : <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />}
          </svg>
        </button>
        <p className="phase-hi">{hi}</p>
        <p className="phase-en">{en}</p>
        {!canListen && (
          <p className="warn">इस ब्राउज़र में आवाज़ पहचान नहीं है — Chrome खोलें या “Try sample” दबाएँ।
            <br /><small>This browser has no speech recognition. Use Chrome, or press Try sample.</small></p>
        )}
        <button type="button" className="btn btn-ghost" onClick={trySample} disabled={busy || phase === 'listening'}>
          ▶ Try sample · नमूना चलाएँ {nextSample && <small>({nextSample.label})</small>}
        </button>
      </div>

      {(transcript || phase === 'listening') && (
        <section className="card transcript">
          <h3>आपने कहा <span className="en">Transcript</span></h3>
          <p>{transcript || <span className="muted">…</span>}{phase === 'listening' && <span className="caret" />}</p>
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {analysis && (
        <>
          {phase === 'saved' && (
            <div className={`saved-banner risk-${analysis.risk}`}>
              ✓ विज़िट सेव हुई · Visit saved — {RISK[analysis.risk].icon} {RISK[analysis.risk].hi} / {RISK[analysis.risk].en}
            </div>
          )}
          <AlertList alerts={analysis.alerts} />
          {analysis.engine_note && <p className="note">ℹ️ {analysis.engine_note}</p>}
          <FieldsCard fields={analysis.fields} people={people} symptomLabels={symptomLabels} today={status?.today}
            onChange={onFieldsChange} disabled={phase === 'saving' || phase === 'saved'} />
          <div className="actions">
            {phase === 'saved' ? (
              <button type="button" className="btn btn-primary btn-big" onClick={reset}>＋ नई विज़िट · New visit</button>
            ) : (
              <>
                <button type="button" className="btn btn-primary btn-big" onClick={() => save()}
                  disabled={phase === 'saving' || phase === 'thinking'}>✓ हाँ, सेव करें · Save</button>
                <button type="button" className="btn btn-secondary" onClick={() => readBackAndConfirm(analysis)}
                  disabled={busy}>🔊 दोबारा सुनें · Read again</button>
                <button type="button" className="btn btn-secondary" onClick={startMic} disabled={busy || !canListen}>
                  🎤 दोबारा बोलें · Re-record</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
