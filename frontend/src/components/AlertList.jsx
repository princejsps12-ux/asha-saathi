import { Bi } from '../lang.jsx'

// Danger-sign alerts: every alert shows WHY it fired and which guideline it comes from.
// Alerts always carry an English line under the Hindi (`always`), even in Hindi-only mode,
// so a supervisor or doctor can read them; in EN mode they are English only.
export default function AlertList({ alerts, compact = false }) {
  if (!alerts?.length) return null
  const red = alerts.some((a) => a.severity === 'red')
  return (
    <section className={`alerts ${red ? 'alerts-red' : 'alerts-amber'}`} role="alert">
      {!compact && (
        <header className="alerts-head">
          <span className="alerts-icon" aria-hidden>
            {red ? '🚨' : '⚡'}
          </span>
          <div>
            <strong>
              <Bi k={red ? 'dangerTitle' : 'watchTitle'} always />
            </strong>
            <small>
              <Bi k={red ? 'dangerSub' : 'watchSub'} always inline />
            </small>
          </div>
        </header>
      )}
      <ul>
        {alerts.map((a) => (
          <li key={a.code} className={`alert alert-${a.severity}`}>
            <div className="alert-title">
              <Bi hi={a.title_hi} en={a.title_en} always />
            </div>
            <div className="alert-why">
              <b>
                <Bi k="why" always inline />:
              </b>{' '}
              <Bi hi={a.reason_hi || a.reason} en={a.reason} always />
            </div>
            {!compact && (
              <div className="alert-action">
                👉 <Bi hi={a.action_hi} en={a.action_en || a.action_hi} always />
              </div>
            )}
            {!compact && (
              <div className="alert-source">
                <Bi k="source" inline />: {a.source}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
