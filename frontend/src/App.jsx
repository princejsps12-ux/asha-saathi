import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import { loadLang, saveLang } from './i18n.js'
import { LangContext, LangToggle, useI18n } from './lang.jsx'
import RecordView from './components/RecordView.jsx'
import { DueView, HighRiskView, PeopleList, PersonDetail } from './components/Lists.jsx'

const TABS = [
  { id: 'record', icon: '🎤', key: 'tabVisit' },
  { id: 'people', icon: '👩', key: 'tabWomen' },
  { id: 'due', icon: '📅', key: 'tabDue' },
  { id: 'risk', icon: '⚠️', key: 'tabRisk' },
]

function StatusBadges({ status }) {
  const { t } = useI18n()
  if (!status) return null
  if (status.offline_mode) {
    return <span className="badge badge-offline" title={t('offlineTitle')}>{t('offlineBadge')}</span>
  }
  return (
    <span className="badge badge-online">
      {t(status.sarvam_key_set ? 'sttSarvam' : 'sttBrowser')} · {t(status.gemini_key_set ? 'extractGemini' : 'extractRules')}
    </span>
  )
}

export default function App() {
  const [lang, setLangState] = useState(loadLang)
  const setLang = useCallback((next) => { saveLang(next); setLangState(next) }, [])
  const langValue = useMemo(() => ({ lang, setLang }), [lang, setLang])
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  return (
    <LangContext.Provider value={langValue}>
      <Shell />
    </LangContext.Provider>
  )
}

function Shell() {
  const { lang, t, tOther, pick } = useI18n()
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
    if (!window.confirm(t('resetConfirm'))) return
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
            <h1>{t('appName')}</h1>
            <small>{tOther('appName')} · {t('tagline')}</small>
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
              <p className="preset">👩 {t('presetVisit', { name: pick(presetPerson.name_hi, presetPerson.name_en) })}
                <button type="button" className="link" onClick={() => setPreset(null)}>{t('clear')}</button></p>
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
              <h2>{t('allWomen')} <span className="en">({people?.length ?? 0})</span></h2>
              <PeopleList people={people} today={status?.today} onOpen={setOpenId} emptyKey="noWomen" />
            </div>
          ))}
        {tab === 'due' && <DueView version={version} today={status?.today} onOpen={openPerson} />}
        {tab === 'risk' && <HighRiskView version={version} today={status?.today} onOpen={openPerson} />}
        <footer className="foot">
          <button type="button" className="link" onClick={resetDemo}>{t('resetDemo')}</button>
          <span>{t('footerRules')}</span>
        </footer>
      </main>

      <nav className="tabbar">
        {TABS.map((tb) => (
          <button key={tb.id} type="button" className={tab === tb.id ? 'tab tab-on' : 'tab'}
            onClick={() => { setTab(tb.id); setOpenId(null) }}>
            <span className="tab-icon">{tb.icon}</span>
            <span>{t(tb.key)}</span>
            {lang === 'hi' && <small>{tOther(tb.key)}</small>}
            {tb.id === 'due' && counts.due > 0 && <span className="count">{counts.due}</span>}
            {tb.id === 'risk' && counts.risk > 0 && <span className="count count-red">{counts.risk}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}
