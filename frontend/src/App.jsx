import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import { loadMode, mainLang, saveMode } from './i18n.js'
import { Bi, LangContext, LangToggle, useI18n } from './lang.jsx'
import RecordView from './components/RecordView.jsx'
import { DueView, HighRiskView, PeopleList, PersonDetail } from './components/Lists.jsx'

const TABS = [
  { id: 'record', icon: '🎤', key: 'tabVisit' },
  { id: 'people', icon: '👩', key: 'tabWomen' },
  { id: 'due', icon: '📅', key: 'tabDue' },
  { id: 'risk', icon: '⚠️', key: 'tabRisk' },
]

function StatusBadges({ status }) {
  const { plain } = useI18n()
  if (!status) return null
  if (status.offline_mode) {
    return <span className="badge badge-offline" title={plain('offlineTitle')}><Bi k="offlineBadge" /></span>
  }
  return (
    <span className="badge badge-online">
      <Bi k={status.sarvam_key_set ? 'sttSarvam' : 'sttBrowser'} inline /> ·{' '}
      <Bi k={status.gemini_key_set ? 'extractGemini' : 'extractRules'} inline />
    </span>
  )
}

export default function App() {
  // Default is always bilingual ('हिं + EN'); the toggle choice is remembered in localStorage.
  const [mode, setModeState] = useState(loadMode)
  const setMode = useCallback((next) => { saveMode(next); setModeState(next) }, [])
  const langValue = useMemo(() => ({ mode, setMode }), [mode, setMode])
  useEffect(() => { document.documentElement.lang = mainLang(mode) }, [mode])

  return (
    <LangContext.Provider value={langValue}>
      <Shell />
    </LangContext.Provider>
  )
}

function Shell() {
  const { plain, pick } = useI18n()
  const [tab, setTab] = useState('record')
  const [status, setStatus] = useState(null)
  const [people, setPeople] = useState(null)
  const [samples, setSamples] = useState([])
  const [symptomLabels, setSymptomLabels] = useState({})
  const [counts, setCounts] = useState({ due: 0, risk: 0 })
  const [openId, setOpenId] = useState(null)
  const [preset, setPreset] = useState(null)
  const [version, setVersion] = useState(0)
  const [fatal, setFatal] = useState('')

  useEffect(() => {
    Promise.all([api.status(), api.samples(), api.symptoms()])
      .then(([s, sm, sy]) => { setStatus(s); setSamples(sm); setSymptomLabels(sy) })
      .catch((e) => setFatal(e.message))
  }, [])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  useEffect(() => {
    api.beneficiaries().then(setPeople).catch((e) => setFatal(e.message))
    Promise.all([api.due(), api.highRisk()])
      .then(([d, r]) => setCounts({ due: d.tomorrow.length, risk: r.filter((p) => p.risk === 'red').length }))
      .catch(() => {})
  }, [version])

  const openPerson = (id) => { setOpenId(id); setTab('people') }
  const recordFor = (id) => { setPreset(id); setOpenId(null); setTab('record') }
  const resetDemo = async () => {
    if (!window.confirm(plain('resetConfirm'))) return
    await api.resetDemo().catch((e) => setFatal(e.message))
    setOpenId(null); refresh()
  }

  const presetPerson = people?.find((p) => p.id === preset)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="36" height="36" />
          <div>
            <h1>आशा साथी</h1>
            <small>ASHA Saathi · <Bi k="tagline" inline /></small>
          </div>
        </div>
        <div className="topbar-right">
          <LangToggle />
          <StatusBadges status={status} />
        </div>
      </header>

      <main className="content">
        {fatal && <p className="error">{fatal}</p>}
        {tab === 'record' && (
          <>
            {presetPerson && (
              <p className="preset">
                <span>👩 <Bi k="presetVisit" inline
                  vars={{ name: pick(presetPerson.name_hi, presetPerson.name_en) }} /></span>
                <button type="button" className="link" onClick={() => setPreset(null)}><Bi k="clear" /></button></p>
            )}
            <RecordView status={status} people={people || []} symptomLabels={symptomLabels} samples={samples}
              preset={preset} onSaved={() => { setPreset(null); refresh() }} />
          </>
        )}
        {tab === 'people' && (openId
          ? <PersonDetail id={openId} today={status?.today} version={version} onBack={() => setOpenId(null)}
            onRecord={recordFor} />
          : (
            <div className="stack">
              <h2><Bi k="allWomen" inline /> <span className="en">({people?.length ?? 0})</span></h2>
              <PeopleList people={people} today={status?.today} onOpen={setOpenId} emptyKey="noWomen" />
            </div>
          ))}
        {tab === 'due' && <DueView version={version} today={status?.today} onOpen={openPerson} />}
        {tab === 'risk' && <HighRiskView version={version} today={status?.today} onOpen={openPerson} />}
        <footer className="foot">
          <button type="button" className="link" onClick={resetDemo}><Bi k="resetDemo" /></button>
          <Bi k="footerRules" />
        </footer>
      </main>

      <nav className="tabbar">
        {TABS.map((tb) => (
          <button key={tb.id} type="button" className={tab === tb.id ? 'tab tab-on' : 'tab'}
            onClick={() => { setTab(tb.id); setOpenId(null) }}>
            <span className="tab-icon">{tb.icon}</span>
            <Bi k={tb.key} />
            {tb.id === 'due' && counts.due > 0 && <span className="count">{counts.due}</span>}
            {tb.id === 'risk' && counts.risk > 0 && <span className="count count-red">{counts.risk}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}
