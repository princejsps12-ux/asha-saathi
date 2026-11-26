import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { RISK_ICON } from '../labels.js'
import { Bi, useI18n } from '../lang.jsx'
import { browserSttSupported, listen, recordAudio, recorderSupported, speak, speechLang, stopSpeaking } from '../speech.js'
import AlertList from './AlertList.jsx'
import FieldsCard from './FieldsCard.jsx'

// The core flow: speak -> extract -> read back -> confirm by voice -> save -> alert.
// phase: idle | listening | thinking | speaking | confirming | review | saving | saved
// The display mode picks recognition + read-back language: Hindi (hi-IN) in 'हिं + EN' and 'हिं',
// English (en-IN) in 'EN'. The read-back card always shows the summary in the display mode.

export default function RecordView({ status, people, symptomLabels, samples, preset, onSaved }) {
  const { lang, t, plain, pick } = useI18n()
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
  const voice = speechLang(lang)
  const say = (text) => speak(text, voice)
  const speechError = (code) => (t(`err_${code}`) === `err_${code}` ? plain('err_other', { code }) : plain(`err_${code}`))

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
      setError(speechError('no-speech')); setPhase('idle'); return
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
    await say(pick(result.summary_hi, result.summary_en))
    if (id !== flow.current) return
    if (!browserSttSupported) { setPhase('review'); return }
    setPhase('confirming')
    handle.current = listen({
      lang: voice,
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
          say(t(intent === 'no' ? 'sayEdit' : 'sayUnknown'))
        }
      },
    })
  }

  async function save(result = analysis) {
    newFlow()
    if (result?.fields.beneficiary_id == null) {
      setError(plain('selectFirst')); setPhase('review')
      say(t('selectFirst'))
      return
    }
    setPhase('saving')
    try {
      const { analysis: saved } = await api.saveVisit(transcriptRef.current, result.fields)
      setAnalysis(saved); setPhase('saved')
      onSaved?.()
      const red = saved.alerts.filter((a) => a.severity === 'red')
      say(red.length
        ? t('saySavedDanger', {
          titles: red.map((a) => pick(a.title_hi, a.title_en)).join(', '),
          action: pick(red[0].action_hi, red[0].action_en),
        })
        : t('saySaved'))
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
      lang: voice,
      onText: (text) => id === flow.current && setTranscript(text),
      onError: (code) => id === flow.current && setError(speechError(code)),
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
            setError(plain('sttFallback', { msg: e.message })); setPhase('idle')
          }
        },
      }
    } catch {
      setError(speechError('not-allowed')); setPhase('idle')
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

  const busy = ['thinking', 'saving', 'speaking'].includes(phase)
  const nextSample = samples[sampleIndex % (samples.length || 1)]

  return (
    <div className="record">
      <div className="mic-zone">
        <button type="button" className={`mic mic-${phase}`} onClick={micPressed}
          disabled={!canListen || busy || phase === 'confirming'}
          aria-label={plain(phase === 'listening' ? 'micStop' : 'micStart')}>
          <svg viewBox="0 0 24 24" aria-hidden>
            {phase === 'listening'
              ? <rect x="7" y="7" width="10" height="10" rx="2" />
              : <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />}
          </svg>
        </button>
        <Bi k={`phase_${phase}`} className="phase" />
        {!canListen && <p className="warn"><Bi k="noStt" /></p>}
        <button type="button" className="btn btn-ghost" onClick={trySample} disabled={busy || phase === 'listening'}>
          <Bi k="trySample" />
          {nextSample && <small>(<Bi hi={nextSample.label_hi} en={nextSample.label_en} inline />)</small>}
        </button>
      </div>

      {(transcript || phase === 'listening') && (
        <section className="card transcript">
          <h3><Bi k="transcriptTitle" inline /></h3>
          <p>{transcript || <span className="muted">…</span>}{phase === 'listening' && <span className="caret" />}</p>
          {analysis?.gloss_en && (
            <div className="gloss" lang="en">
              <h4>{t('glossTitle')}</h4>
              <p>{analysis.gloss_en}</p>
            </div>
          )}
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {analysis && (
        <>
          {phase === 'saved' && (
            <div className={`saved-banner risk-${analysis.risk}`}>
              <Bi k="savedBanner" inline /> — {RISK_ICON[analysis.risk]} <Bi k={`risk_${analysis.risk}`} inline />
            </div>
          )}
          <AlertList alerts={analysis.alerts} />
          <section className="card readback">
            <h3>🔊 <Bi k="readbackTitle" inline /></h3>
            <Bi hi={analysis.summary_hi} en={analysis.summary_en} className="readback-text" />
          </section>
          {analysis.engine_note && <p className="note">ℹ️ {analysis.engine_note}</p>}
          <FieldsCard fields={analysis.fields} people={people} symptomLabels={symptomLabels} today={status?.today}
            onChange={onFieldsChange} disabled={phase === 'saving' || phase === 'saved'} />
          <div className="actions">
            {phase === 'saved' ? (
              <button type="button" className="btn btn-primary btn-big" onClick={reset}><Bi k="newVisit" /></button>
            ) : (
              <>
                <button type="button" className="btn btn-primary btn-big" onClick={() => save()}
                  disabled={phase === 'saving' || phase === 'thinking'}><Bi k="save" /></button>
                <button type="button" className="btn btn-secondary" onClick={() => readBackAndConfirm(analysis)}
                  disabled={busy}><Bi k="readAgain" /></button>
                <button type="button" className="btn btn-secondary" onClick={startMic} disabled={busy || !canListen}>
                  <Bi k="reRecord" /></button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
