import { useEffect, useRef, useState } from 'react'
import { api, toUiError } from '../api.js'
import { CONFIRM_LISTEN, listenForAnswer, micAction, resolveAnswer } from '../confirmFlow.js'
import { translate } from '../i18n.js'
import { RISK_ICON } from '../labels.js'
import { Bi, useI18n } from '../lang.jsx'
import { createEndDetector, stripEndCommand } from '../dictation.js'
import { clearPending, loadPending, savePending } from '../pendingVisit.js'
import { forSpeech } from '../spokenText.js'
import {
  DICTATION_MAX_RESTARTS, DICTATION_SILENCE_MS, DICTATION_START_TIMEOUT_MS, browserSttSupported, listen, recordAudio,
  recorderSupported, speak, speechLang, stopSpeaking,
} from '../speech.js'
import AlertList from './AlertList.jsx'
import { ErrorNote } from './Feedback.jsx'
import FieldsCard from './FieldsCard.jsx'

// The core flow: dictate -> extract -> read back -> confirm by voice -> save -> alert.
// phase: idle | listening | thinking | speaking | confirming | review | saving | saved
//
// A *pending* visit (extracted, not yet saved) is never thrown away: a mic tap then only
// listens for the answer (yes / no / a correction), it survives a page refresh via
// localStorage, and only "New visit" or a successful save clears it.

const PENDING_PHASES = new Set(['speaking', 'confirming', 'review', 'saving'])
const MAX_ECHO_RELISTENS = 1
const SLOW_SERVER_MS = 6000 // after this, say the server is waking up (free tier cold start)

export default function RecordView({ status, people, symptomLabels, samples, preset, onSaved }) {
  const { lang, t, plain, pick } = useI18n()
  const [restored] = useState(loadPending) // read once, on first render
  const [phase, setPhase] = useState(restored ? 'review' : 'idle')
  const [transcript, setTranscriptState] = useState(restored?.transcript || '')
  const [analysis, setAnalysis] = useState(restored?.analysis || null)
  const [error, setError] = useState(null) // { k, vars } i18n key, rendered by <ErrorNote>
  const [notice, setNotice] = useState(restored ? 'pendingRestored' : null)
  const [retrying, setRetrying] = useState(false)
  const [heardAnswer, setHeardAnswer] = useState('')
  const [slow, setSlow] = useState(false)
  const [dictating, setDictating] = useState(false)
  const [sampleIndex, setSampleIndex] = useState(0)
  const handle = useRef(null)
  const presetRef = useRef(preset)
  const transcriptRef = useRef(restored?.transcript || '')
  // Every new action bumps this token; async callbacks from an older flow (TTS ending,
  // a late "haan") check it and quietly do nothing, so flows never overlap.
  const flow = useRef(0)
  const useServerStt = status?.stt === 'sarvam' && recorderSupported
  const canListen = browserSttSupported || useServerStt
  const pending = Boolean(analysis) && PENDING_PHASES.has(phase)
  const voice = speechLang(lang)
  const say = (text) => speak(forSpeech(text, lang), voice) // abbreviations spelled out for TTS only
  const speechError = (code) => (translate('en', `err_${code}`) === `err_${code}`
    ? { k: 'err_other', vars: { code } } : { k: `err_${code}` })

  const setTranscript = (text) => { transcriptRef.current = text; setTranscriptState(text) }
  const newFlow = () => {
    flow.current += 1
    handle.current?.stop?.()
    handle.current = null
    stopSpeaking()
    setRetrying(false)
    setDictating(false)
    return flow.current
  }

  useEffect(() => { presetRef.current = preset }, [preset])
  // Stop any listening / speech when the screen unmounts.
  useEffect(() => () => { newFlow() }, [])

  // Keep the pending visit in localStorage; clear it once saved or discarded.
  useEffect(() => {
    if (analysis && phase !== 'saved') savePending({ transcript, analysis })
    else clearPending()
  }, [analysis, transcript, phase])

  // A sleeping free-tier server can take ~50 s to wake: say so instead of looking frozen.
  const waitingForServer = phase === 'thinking' || phase === 'saving'
  useEffect(() => {
    if (!waitingForServer) { setSlow(false); return undefined }
    const timer = setTimeout(() => setSlow(true), SLOW_SERVER_MS)
    return () => clearTimeout(timer)
  }, [waitingForServer])

  /** Start fresh. Called after a save, or by the "New visit" button (asks before discarding). */
  const newVisit = () => {
    newFlow()
    setPhase('idle'); setTranscript(''); setAnalysis(null); setError(null); setNotice(null); setHeardAnswer('')
  }

  /** The only way to throw away an unsaved visit: an explicit tap, confirmed. */
  function discardAndStartNew() {
    if (pending && !window.confirm(plain('discardConfirm'))) return
    newVisit()
  }

  async function process(text) {
    const id = flow.current
    if (!text.trim()) {
      setError(speechError('no-speech')); setPhase('idle'); return
    }
    setPhase('thinking'); setError(null)
    try {
      let result = await api.extract(text)
      if (result.fields.beneficiary_id == null && presetRef.current) {
        result = await api.evaluate({ ...result.fields, beneficiary_id: presetRef.current })
      }
      if (id !== flow.current) return
      setAnalysis(result)
      await readBackAndConfirm(result)
    } catch (e) {
      if (id === flow.current) { setError(toUiError(e)); setPhase('idle') }
    }
  }

  async function readBackAndConfirm(result) {
    const id = newFlow()
    setPhase('speaking')
    await say(pick(result.summary_hi, result.summary_en))
    if (id !== flow.current) return
    await listenAndResolve(result, id)
  }

  /** One listening window for the answer (resolves '' on silence / error). */
  const listenOnce = (id) => new Promise((resolve) => {
    if (id !== flow.current) return resolve('')
    setHeardAnswer('')
    handle.current = listen({
      lang: voice,
      startTimeoutMs: CONFIRM_LISTEN.startTimeoutMs,
      silenceMs: CONFIRM_LISTEN.silenceMs,
      onText: (text) => id === flow.current && setHeardAnswer(text),
      onError: (code) => {
        if (id === flow.current && code !== 'no-speech') setError(speechError(code))
      },
      onEnd: resolve,
    })
  })

  /** Listen for yes / no / a correction (with one automatic retry) and act on it. */
  async function listenAndResolve(result, id) {
    if (!browserSttSupported) { setPhase('review'); return } // buttons are the fallback
    setPhase('confirming')
    let outcome
    let answer = ''
    for (let echoes = 0; ; echoes++) {
      answer = await listenForAnswer(() => listenOnce(id), { onRetry: () => setRetrying(true) })
      if (id !== flow.current) return
      setRetrying(false)
      outcome = await resolveAnswer(answer, result, api)
      if (id !== flow.current) return
      // The phone's mic heard our own read-back: ignore it and listen once more.
      if (outcome.action !== 'echo' || echoes >= MAX_ECHO_RELISTENS) break
      setRetrying(true)
    }
    switch (outcome.action) {
      case 'save':
        return save(result)
      case 'corrected':
        setTranscript(`${transcriptRef.current} · ${answer}`)
        setAnalysis(outcome.analysis)
        return readBackAndConfirm(outcome.analysis)
      case 'edit':
        setPhase('review')
        say(t('sayEdit'))
        return undefined
      case 'nochange': // heard and understood, but no yes / no and nothing new: never "didn't understand"
        setPhase('review')
        say(t('sayNoChange'))
        return undefined
      default: // silence, or only our own echo: wait; the visit stays, the mic now answers
        setPhase('review')
        return undefined
    }
  }

  /** Mic tap while a visit is pending: listen for the answer only, keep every field. */
  function answerByVoice() {
    setNotice(null); setError(null)
    listenAndResolve(analysis, newFlow())
  }

  function answerNo() {
    newFlow()
    setPhase('review')
    say(t('sayEdit'))
  }

  async function save(result = analysis) {
    newFlow()
    if (result?.fields.beneficiary_id == null) {
      setError({ k: 'selectFirst' }); setPhase('review')
      say(t('selectFirst'))
      return
    }
    setPhase('saving'); setError(null); setNotice(null)
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
      setError(toUiError(e)); setPhase('review') // still pending: nothing is lost
    }
  }

  function startDictation() {
    newVisit()
    if (useServerStt) return startServerStt()
    const id = flow.current
    const endDetector = createEndDetector()
    let endCommand = null // "बस" / "हो गया" said as a command: removed before extraction
    setPhase('listening')
    setDictating(true)
    const dictation = listen({
      lang: voice,
      // Real ASHAs pause to think: only ~3.5 s of silence ends the note; mobile engines that
      // stop at each pause are restarted and the text is appended.
      silenceMs: DICTATION_SILENCE_MS,
      startTimeoutMs: DICTATION_START_TIMEOUT_MS,
      maxRestarts: DICTATION_MAX_RESTARTS,
      onText: (text) => {
        if (id !== flow.current) return
        setTranscript(text)
        const command = endDetector.update(text)
        if (command && !endCommand) {
          endCommand = command
          dictation.stop() // she said "बस" / "हो गया": finish now
        }
      },
      onError: (code) => id === flow.current && setError(speechError(code)),
      onEnd: (text) => {
        if (id !== flow.current) return
        setDictating(false)
        // Never lose words that were already on screen (some mobile engines end with no final result).
        const heard = stripEndCommand(text || transcriptRef.current, endCommand)
        setTranscript(heard)
        if (heard.trim()) setError(null) // an engine error after speech doesn't matter: we have text
        process(heard)
      },
    })
    handle.current = dictation
    return undefined
  }

  /** The big "बस / Done" button: finish dictating now, keeping everything said. */
  function finishDictation() {
    handle.current?.stop()
  }

  /** Re-run extraction on the transcript already on screen (e.g. after a network error). */
  function retryExtraction() {
    setError(null)
    newFlow()
    process(transcriptRef.current)
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
            setError(toUiError(e)); setPhase('idle')
          }
        },
      }
    } catch {
      setError(speechError('not-allowed')); setPhase('idle')
    }
  }

  function micPressed() {
    const action = micAction({ phase, pending })
    if (action === 'stop') handle.current?.stop()
    else if (action === 'answer') answerByVoice()
    else startDictation()
  }

  async function trySample() {
    if (!samples.length || pending) return
    newVisit()
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
      setAnalysis(await api.evaluate(fields)); setError(null)
    } catch (e) {
      setError(toUiError(e))
    }
  }

  const busy = ['thinking', 'saving'].includes(phase)
  const canRetryExtraction = Boolean(error) && !analysis && Boolean(transcript.trim()) && phase === 'idle'
  const nextSample = samples[sampleIndex % (samples.length || 1)]
  const phaseKey = phase === 'confirming'
    ? (retrying ? 'phase_listenAgain' : analysis?.unclear?.length ? 'phase_clarify' : 'phase_confirming')
    : busy && slow ? 'phase_waking' : `phase_${phase}`
  const micLabel = phase === 'listening' || phase === 'confirming' ? 'micStop' : pending ? 'micAnswer' : 'micStart'

  return (
    <div className="record">
      <div className="mic-zone">
        <button type="button" className={`mic mic-${phase}`} onClick={micPressed}
          disabled={!canListen || busy} aria-label={plain(micLabel)}>
          <svg viewBox="0 0 24 24" aria-hidden>
            {phase === 'listening' || phase === 'confirming'
              ? <rect x="7" y="7" width="10" height="10" rx="2" />
              : <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />}
          </svg>
        </button>
        {phase === 'listening' && dictating ? (
          <div className="listening" role="status" aria-live="polite">
            <span className="listening-dot" aria-hidden />
            <Bi k="phase_listening" className="phase" />
            <small className="phase-sub"><Bi k="listeningHint" /></small>
            <button type="button" className="btn btn-done" onClick={finishDictation}><Bi k="doneButton" /></button>
          </div>
        ) : <Bi k={phaseKey} className="phase" />}
        {phase === 'review' && pending && <small className="phase-sub"><Bi k="reviewSub" /></small>}
        {phase === 'confirming' && heardAnswer && <p className="heard">“{heardAnswer}”</p>}
        {!canListen && <p className="warn"><Bi k="noStt" /></p>}
        {!pending && (
          <button type="button" className="btn btn-ghost" onClick={trySample} disabled={busy || phase === 'listening'}>
            <Bi k="trySample" />
            {nextSample && <small>(<Bi hi={nextSample.label_hi} en={nextSample.label_en} inline />)</small>}
          </button>
        )}
      </div>

      {pending && (
        <div className="confirm-bar" role="group" aria-label="हाँ / नहीं · Yes / No">
          <button type="button" className="btn btn-yes" onClick={() => save()} disabled={phase === 'saving'}>
            <Bi k="confirmYes" />
          </button>
          <button type="button" className="btn btn-no" onClick={answerNo} disabled={phase === 'saving'}>
            <Bi k="confirmNo" />
          </button>
        </div>
      )}

      {notice && <p className="notice" role="status"><Bi k={notice} always /></p>}

      {phase === 'idle' && !analysis && !transcript && (
        <section className="card intro" aria-label="How it works">
          <h3><Bi k="introTitle" /></h3>
          <ol className="intro-steps">
            <li><span aria-hidden>🎤</span><Bi k="introStep1" /></li>
            <li><span aria-hidden>📋</span><Bi k="introStep2" /></li>
            <li><span aria-hidden>🚨</span><Bi k="introStep3" /></li>
          </ol>
        </section>
      )}

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

      <ErrorNote error={error} />
      {canRetryExtraction && (
        <button type="button" className="btn btn-primary" onClick={retryExtraction}><Bi k="retryExtract" /></button>
      )}

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
            {phase !== 'saved' && (
              <button type="button" className="btn btn-secondary" onClick={() => readBackAndConfirm(analysis)}
                disabled={busy || phase === 'speaking'}><Bi k="readAgain" /></button>
            )}
            <button type="button" className={`btn ${phase === 'saved' ? 'btn-primary btn-big' : 'btn-secondary'}`}
              onClick={discardAndStartNew} disabled={phase === 'saving'}><Bi k="newVisit" /></button>
          </div>
        </>
      )}
    </div>
  )
}
