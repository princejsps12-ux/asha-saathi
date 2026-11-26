import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { RISK_ICON } from '../labels.js'
import { Bi, useI18n } from '../lang.jsx'
import AlertList from './AlertList.jsx'

export function RiskChip({ risk }) {
  const { t } = useI18n()
  return <span className={`risk-chip risk-${risk}`}>{RISK_ICON[risk] || RISK_ICON.normal} {t(`risk_${risk}`)}</span>
}

function PersonCard({ person, today, onOpen, showAlerts }) {
  const { t, pick, fmtDate } = useI18n()
  return (
    <li>
      <button type="button" className={`person risk-border-${person.risk}`} onClick={() => onOpen(person.id)}>
        <div className="person-main">
          <Bi hi={person.name_hi} en={person.name_en} className="person-name" />
          <span className="person-meta">📍 {pick(person.village, person.village_en)} · {person.pregnancy_month
            ? t('monthN', { n: person.pregnancy_month }) : t('monthUnknown')}</span>
        </div>
        <div className="person-side">
          <RiskChip risk={person.risk} />
          <span className="due">📅 {fmtDate(person.next_visit_date, today)}</span>
        </div>
      </button>
      {showAlerts && person.alerts.length > 0 && <AlertList alerts={person.alerts} compact />}
    </li>
  )
}

export function PeopleList({ people, today, onOpen, emptyKey, showAlerts = false }) {
  const { t } = useI18n()
  if (!people) return <p className="muted center">{t('loading')}</p>
  if (!people.length) return emptyKey ? <p className="muted center">{t(emptyKey)}</p> : null
  return (
    <ul className="people">
      {people.map((p) => <PersonCard key={p.id} person={p} today={today} onOpen={onOpen} showAlerts={showAlerts} />)}
    </ul>
  )
}

export function DueView({ version, today, onOpen }) {
  const { fmtDate } = useI18n()
  const [due, setDue] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.due().then(setDue).catch((e) => setError(e.message)) }, [version])
  if (error) return <p className="error">{error}</p>
  return (
    <div className="stack">
      <h2><Bi k="dueTomorrow" /> <span className="en">{due && fmtDate(due.tomorrow_date)}</span></h2>
      <PeopleList people={due?.tomorrow} today={today} onOpen={onOpen} emptyKey="nothingTomorrow" />
      <h2><Bi k="dueToday" /></h2>
      <PeopleList people={due?.today} today={today} onOpen={onOpen} emptyKey="nothingToday" />
      {due?.overdue?.length > 0 && (
        <>
          <h2 className="overdue"><Bi k="overdue" /></h2>
          <PeopleList people={due.overdue} today={today} onOpen={onOpen} />
        </>
      )}
    </div>
  )
}

export function HighRiskView({ version, today, onOpen }) {
  const { t } = useI18n()
  const [people, setPeople] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.highRisk().then(setPeople).catch((e) => setError(e.message)) }, [version])
  if (error) return <p className="error">{error}</p>
  return (
    <div className="stack">
      <h2><Bi k="highRiskTitle" /> <span className="en">({t('highRiskSub')})</span></h2>
      <PeopleList people={people} today={today} onOpen={onOpen} showAlerts emptyKey="noHighRisk" />
    </div>
  )
}

export function PersonDetail({ id, today, version, onBack, onRecord }) {
  const { t, pick, fmtDate } = useI18n()
  const [person, setPerson] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.beneficiary(id).then(setPerson).catch((e) => setError(e.message)) }, [id, version])
  if (error) return <p className="error">{error}</p>
  if (!person) return <p className="muted center">{t('loading')}</p>
  return (
    <div className="stack">
      <button type="button" className="btn btn-ghost back" onClick={onBack}>{t('back')}</button>
      <section className={`card profile risk-border-${person.risk}`}>
        <h2><Bi hi={person.name_hi} en={person.name_en} /></h2>
        <p>👨 {t('husband')}: {person.husband_hi} · 🎂 {t('years', { n: person.age })}</p>
        <p>📍 <Bi hi={person.village} en={person.village_en} className="inline" /></p>
        <p>🤰 {person.pregnancy_month ? t('monthN', { n: person.pregnancy_month }) : '—'} · 📅 {t('nextVisit')}:{' '}
          {fmtDate(person.next_visit_date, today)}</p>
        <RiskChip risk={person.risk} />
        <button type="button" className="btn btn-primary" onClick={() => onRecord(person.id)}>{t('recordFor')}</button>
      </section>
      <h2><Bi k="history" /> <span className="en">({person.visits.length})</span></h2>
      <ol className="timeline">
        {person.visits.map((v) => (
          <li key={v.id} className={`visit risk-border-${v.risk}`}>
            <div className="visit-head">
              <strong>{fmtDate(v.visit_date, today)}</strong>
              <RiskChip risk={v.risk} />
            </div>
            <VisitFacts f={v.fields} today={today} />
            {v.transcript && <p className="quote">“{v.transcript}”</p>}
            <AlertList alerts={v.alerts} compact />
          </li>
        ))}
      </ol>
    </div>
  )
}

function VisitFacts({ f, today }) {
  const { t, fmtDate } = useI18n()
  const facts = [
    f.pregnancy_month && `🤰 ${t('monthN', { n: f.pregnancy_month })}`,
    f.bp_systolic && f.bp_diastolic && `🩺 BP ${f.bp_systolic}/${f.bp_diastolic}`,
    f.hb != null && `🩸 Hb ${f.hb}`,
    f.weight_kg != null && `⚖️ ${f.weight_kg} kg`,
    f.ifa_taking != null && `💊 IFA ${f.ifa_taking ? '✓' : '✗'}`,
    f.td_dose && `💉 Td-${f.td_dose === 3 ? 'B' : f.td_dose}`,
    f.next_visit_date && `📅 ${fmtDate(f.next_visit_date, today)}`,
  ].filter(Boolean)
  return <div className="facts">{facts.map((x) => <span key={x}>{x}</span>)}</div>
}
