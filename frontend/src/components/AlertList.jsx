// Danger-sign alerts: every alert shows WHY it fired and which guideline it comes from.
export default function AlertList({ alerts, compact = false }) {
  if (!alerts?.length) return null
  const red = alerts.filter((a) => a.severity === 'red')
  return (
    <section className={`alerts ${red.length ? 'alerts-red' : 'alerts-amber'}`} role="alert">
      {!compact && (
        <header className="alerts-head">
          <span className="alerts-icon" aria-hidden>{red.length ? '🚨' : '⚡'}</span>
          <div>
            <strong>{red.length ? 'खतरे का संकेत' : 'ध्यान दें'}</strong>
            <small>{red.length ? 'Danger sign — refer now' : 'Needs follow-up'}</small>
          </div>
        </header>
      )}
      <ul>
        {alerts.map((a) => (
          <li key={a.code} className={`alert alert-${a.severity}`}>
            <div className="alert-title">
              {a.title_hi} <span className="en">· {a.title_en}</span>
            </div>
            <div className="alert-why"><b>क्यों / Why:</b> {a.reason}</div>
            {!compact && <div className="alert-action">👉 {a.action_hi}</div>}
            {!compact && <div className="alert-source">Source: {a.source}</div>}
          </li>
        ))}
      </ul>
    </section>
  )
}
