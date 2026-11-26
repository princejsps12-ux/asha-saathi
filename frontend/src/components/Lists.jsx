import { useEffect, useState } from 'react'
import { api, toUiError } from '../api.js'
import { formatDate } from '../i18n.js'
import { RISK_ICON } from '../labels.js'
import { Bi } from '../lang.jsx'
import AlertList from './AlertList.jsx'
import { ErrorNote } from './Feedback.jsx'

export function RiskChip({ risk }) {
  return (
    <span className={`risk-chip risk-${risk}`}>
      {RISK_ICON[risk] || RISK_ICON.normal} <Bi k={`risk_${risk}`} inline />
    </span>
  )
}

/** A date in both languages, e.g. "कल · 28 नव" with "Tomorrow · 28 Nov" underneath. */
export function DateBi({ iso, today, inline = false }) {
  return <Bi hi={formatDate(iso, today, 'hi')} en={formatDate(iso, today, 'en')} inline={inline} />
}

const MonthBi = ({ month }) => (month
  ? <Bi k="monthN" vars={{ n: month }} inline />
  : <Bi k="monthUnknown" inline />)

function PersonCard({ person, today, onOpen, showAlerts }) {
  return (
    <li>
      <button type="button" className={`person risk-border-${person.risk}`} onClick={() => onOpen(person.id)}>
        <div className="person-main">
          <Bi hi={person.name_hi} en={person.name_en} className="person-name" />
          <span className="person-meta">
            📍 <Bi hi={person.village} en={person.village_en} inline /> · <MonthBi month={person.pregnancy_month} />
          </span>
        </div>
        <div className="person-side">
          <RiskChip risk={person.risk} />
          <span className="due">📅 <DateBi iso={person.next_visit_date} today={today} /></span>
        </div>
      </button>
      {showAlerts && person.alerts.length > 0 && <AlertList alerts={person.alerts} compact />}
    </li>
  )
}

export function PeopleList({ people, today, onOpen, emptyKey, showAlerts = false }) {
  if (!people) return <p className="muted center"><Bi k="loading" /></p>
  if (!people.length) return emptyKey ? <p className="muted center"><Bi k={emptyKey} /></p> : null
  return (
    <ul className="people">
      {people.map((p) => <PersonCard key={p.id} person={p} today={today} onOpen={onOpen} showAlerts={showAlerts} />)}
    </ul>
  )
}

export function DueView({ version, today, onOpen }) {
  const [due, setDue] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { api.due().then(setDue).catch((e) => setError(toUiError(e))) }, [version])
  if (error) return <ErrorNote error={error} />
  return (
    <div className="stack">
      <h2><Bi k="dueTomorrow" inline /> <span className="en">{due && <DateBi iso={due.tomorrow_date} inline />}</span></h2>
      <PeopleList people={due?.tomorrow} today={today} onOpen={onOpen} emptyKey="nothingTomorrow" />
      <h2><Bi k="dueToday" inline /></h2>
      <PeopleList people={due?.today} today={today} onOpen={onOpen} emptyKey="nothingToday" />
      {due?.overdue?.length > 0 && (
        <>
          <h2 className="overdue"><Bi k="overdue" inline /></h2>
          <PeopleList people={due.overdue} today={today} onOpen={onOpen} />
        </>
      )}
    </div>
  )
}

export function HighRiskView({ version, today, onOpen }) {
  const [people, setPeople] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { api.highRisk().then(setPeople).catch((e) => setError(toUiError(e))) }, [version])
  if (error) return <ErrorNote error={error} />
  return (
    <div className="stack">
      <h2><Bi k="highRiskTitle" inline /> <span className="en">(<Bi k="highRiskSub" inline />)</span></h2>
      <PeopleList people={people} today={today} onOpen={onOpen} showAlerts emptyKey="noHighRisk" />
    </div>
  )
}

export function PersonDetail({ id, today, version, onBack, onRecord }) {
  const [person, setPerson] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { api.beneficiary(id).then(setPerson).catch((e) => setError(toUiError(e))) }, [id, version])
  if (error) return <ErrorNote error={error} />
  if (!person) return <p className="muted center"><Bi k="loading" /></p>
  return (
    <div className="stack">
      <button type="button" className="btn btn-ghost back" onClick={onBack}><Bi k="back" /></button>
      <section className={`card profile risk-border-${person.risk}`}>
        <h2><Bi hi={person.name_hi} en={person.name_en} /></h2>
        <p>👨 <Bi k="husband" inline />: {person.husband_hi} · 🎂 <Bi k="years" vars={{ n: person.age }} inline /></p>
        <p>📍 <Bi hi={person.village} en={person.village_en} inline /></p>
        <p>🤰 <MonthBi month={person.pregnancy_month} /></p>
        <p>📅 <Bi k="nextVisit" inline />: <DateBi iso={person.next_visit_date} today={today} inline /></p>
        <RiskChip risk={person.risk} />
        <button type="button" className="btn btn-primary" onClick={() => onRecord(person.id)}><Bi k="recordFor" /></button>
      </section>
      <h2><Bi k="history" inline /> <span className="en">({person.visits.length})</span></h2>
      <ol className="timeline">
        {person.visits.map((v) => (
          <li key={v.id} className={`visit risk-border-${v.risk}`}>
            <div className="visit-head">
              <strong><DateBi iso={v.visit_date} today={today} /></strong>
              <RiskChip risk={v.risk} />
            </div>
            <VisitFacts f={v.fields} />
            {v.transcript && <p className="quote">“{v.transcript}”</p>}
            <AlertList alerts={v.alerts} compact />
          </li>
        ))}
      </ol>
    </div>
  )
}

// Compact, language-neutral facts (numbers and standard abbreviations read the same in both).
function VisitFacts({ f }) {
  const facts = [
    f.pregnancy_month && `🤰 ${f.pregnancy_month}/9`,
    f.bp_systolic && f.bp_diastolic && `🩺 BP ${f.bp_systolic}/${f.bp_diastolic}`,
    f.hb != null && `🩸 Hb ${f.hb}`,
    f.weight_kg != null && `⚖️ ${f.weight_kg} kg`,
    f.ifa_taking != null && `💊 IFA ${f.ifa_taking ? '✓' : '✗'}`,
    f.td_dose && `💉 Td-${f.td_dose === 3 ? 'B' : f.td_dose}`,
    f.next_visit_date && `📅 → ${f.next_visit_date.slice(8)}/${f.next_visit_date.slice(5, 7)}`,
  ].filter(Boolean)
  return <div className="facts">{facts.map((x) => <span key={x}>{x}</span>)}</div>
}
