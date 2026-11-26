import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { RISK, formatDate } from '../labels.js'
import AlertList from './AlertList.jsx'

export function RiskChip({ risk }) {
  const r = RISK[risk] || RISK.normal
  return <span className={`risk-chip risk-${risk}`}>{r.icon} {r.hi}<small> · {r.en}</small></span>
}

function PersonCard({ person, today, onOpen, showAlerts }) {
  return (
    <li>
      <button type="button" className={`person risk-border-${person.risk}`} onClick={() => onOpen(person.id)}>
        <div className="person-main">
          <strong>{person.name_hi}</strong>
          <span className="en">{person.name_en}</span>
          <span className="person-meta">📍 {person.village} · {person.pregnancy_month
            ? `${person.pregnancy_month} महीना` : 'महीना —'}</span>
        </div>
        <div className="person-side">
          <RiskChip risk={person.risk} />
          <span className="due">📅 {formatDate(person.next_visit_date, today)}</span>
        </div>
      </button>
      {showAlerts && person.alerts.length > 0 && <AlertList alerts={person.alerts} compact />}
    </li>
  )
}

export function PeopleList({ people, today, onOpen, empty, showAlerts = false }) {
  if (!people) return <p className="muted center">लोड हो रहा है… / Loading…</p>
  if (!people.length) return <p className="muted center">{empty}</p>
  return (
    <ul className="people">
      {people.map((p) => <PersonCard key={p.id} person={p} today={today} onOpen={onOpen} showAlerts={showAlerts} />)}
    </ul>
  )
}

export function DueView({ version, today, onOpen }) {
  const [due, setDue] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.due().then(setDue).catch((e) => setError(e.message)) }, [version])
  if (error) return <p className="error">{error}</p>
  return (
    <div className="stack">
      <h2>कल की विज़िट <span className="en">Due tomorrow · {due && formatDate(due.tomorrow_date)}</span></h2>
      <PeopleList people={due?.tomorrow} today={today} onOpen={onOpen} empty="कल कोई विज़िट नहीं / Nothing due tomorrow" />
      <h2>आज <span className="en">Due today</span></h2>
      <PeopleList people={due?.today} today={today} onOpen={onOpen} empty="आज कोई विज़िट नहीं / Nothing due today" />
      {due?.overdue?.length > 0 && (
        <>
          <h2 className="overdue">छूटी हुई <span className="en">Overdue</span></h2>
          <PeopleList people={due.overdue} today={today} onOpen={onOpen} empty="" />
        </>
      )}
    </div>
  )
}

export function HighRiskView({ version, today, onOpen }) {
  const [people, setPeople] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.highRisk().then(setPeople).catch((e) => setError(e.message)) }, [version])
  if (error) return <p className="error">{error}</p>
  return (
    <div className="stack">
      <h2>हाई रिस्क <span className="en">High-risk pregnancies (latest visit)</span></h2>
      <PeopleList people={people} today={today} onOpen={onOpen} showAlerts empty="कोई हाई रिस्क नहीं / No high-risk cases" />
    </div>
  )
}

export function PersonDetail({ id, today, version, onBack, onRecord }) {
  const [person, setPerson] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.beneficiary(id).then(setPerson).catch((e) => setError(e.message)) }, [id, version])
  if (error) return <p className="error">{error}</p>
  if (!person) return <p className="muted center">लोड हो रहा है… / Loading…</p>
  return (
    <div className="stack">
      <button type="button" className="btn btn-ghost back" onClick={onBack}>← वापस / Back</button>
      <section className={`card profile risk-border-${person.risk}`}>
        <h2>{person.name_hi} <span className="en">{person.name_en}</span></h2>
        <p>👨 पति: {person.husband_hi} · 🎂 {person.age} वर्ष</p>
        <p>📍 {person.village} <span className="en">({person.village_en})</span></p>
        <p>🤰 {person.pregnancy_month ? `${person.pregnancy_month} महीना` : '—'} · 📅 अगली विज़िट: {formatDate(person.next_visit_date, today)}</p>
        <RiskChip risk={person.risk} />
        <button type="button" className="btn btn-primary" onClick={() => onRecord(person.id)}>🎤 इनकी विज़िट दर्ज करें · Record visit</button>
      </section>
      <h2>विज़िट इतिहास <span className="en">Visit history ({person.visits.length})</span></h2>
      <ol className="timeline">
        {person.visits.map((v) => (
          <li key={v.id} className={`visit risk-border-${v.risk}`}>
            <div className="visit-head">
              <strong>{formatDate(v.visit_date, today)}</strong>
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
  const facts = [
    f.pregnancy_month && `🤰 ${f.pregnancy_month} महीना`,
    f.bp_systolic && f.bp_diastolic && `🩺 BP ${f.bp_systolic}/${f.bp_diastolic}`,
    f.hb != null && `🩸 Hb ${f.hb}`,
    f.weight_kg != null && `⚖️ ${f.weight_kg} kg`,
    f.ifa_taking != null && `💊 IFA ${f.ifa_taking ? '✓' : '✗'}`,
    f.td_dose && `💉 Td-${f.td_dose === 3 ? 'B' : f.td_dose}`,
    f.next_visit_date && `📅 ${formatDate(f.next_visit_date, today)}`,
  ].filter(Boolean)
  return <div className="facts">{facts.map((t) => <span key={t}>{t}</span>)}</div>
}
