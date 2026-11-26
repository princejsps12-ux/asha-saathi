import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import RecordView from './components/RecordView.jsx'
import { DueView, HighRiskView, PeopleList, PersonDetail } from './components/Lists.jsx'

const TABS = [
  { id: 'record', icon: '🎤', hi: 'विज़िट', en: 'Visit' },
  { id: 'people', icon: '👩', hi: 'लाभार्थी', en: 'Women' },
  { id: 'due', icon: '📅', hi: 'कल', en: 'Due' },
  { id: 'risk', icon: '⚠️', hi: 'हाई रिस्क', en: 'Risk' },
]

function StatusBadges({ status }) {
  if (!status) return null
  if (status.offline_mode) {
    return <span className="badge badge-offline" title="Browser speech + rule-based parser. No API key needed.">
      🔌 key not set – offline mode</span>
  }
  return (
    <span className="badge badge-online">
      {status.sarvam_key_set ? '🎙 Sarvam STT' : '🎙 browser STT'} · {status.gemini_key_set ? '✨ Gemini + rules' : 'rules'}
    </span>
  )
}

export default function App() {
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
    if (!window.confirm('डेमो डेटा रीसेट करें? / Reset demo data?')) return
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
            <small>ASHA Saathi · मितानिन की आवाज़ वाली डायरी</small>
          </div>
        </div>
        <StatusBadges status={status} />
      </header>

      <main className="content">
        {fatal && <p className="error">{fatal}</p>}
        {tab === 'record' && (
          <>
            {presetPerson && (
              <p className="preset">👩 {presetPerson.name_hi} की विज़िट
                <button type="button" className="link" onClick={() => setPreset(null)}>✕ हटाएँ</button></p>
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
              <h2>सभी लाभार्थी <span className="en">All beneficiaries ({people?.length ?? 0})</span></h2>
              <PeopleList people={people} today={status?.today} onOpen={setOpenId} empty="कोई लाभार्थी नहीं" />
            </div>
          ))}
        {tab === 'due' && <DueView version={version} today={status?.today} onOpen={openPerson} />}
        {tab === 'risk' && <HighRiskView version={version} today={status?.today} onOpen={openPerson} />}
        <footer className="foot">
          <button type="button" className="link" onClick={resetDemo}>↺ Reset demo data</button>
          <span>Rules: MoHFW / NHM ANC guidelines · decision support only</span>
        </footer>
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'tab tab-on' : 'tab'}
            onClick={() => { setTab(t.id); setOpenId(null) }}>
            <span className="tab-icon">{t.icon}</span>
            <span>{t.hi}</span>
            <small>{t.en}</small>
            {t.id === 'due' && counts.due > 0 && <span className="count">{counts.due}</span>}
            {t.id === 'risk' && counts.risk > 0 && <span className="count count-red">{counts.risk}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}
