import { Bi, useI18n } from '../lang.jsx'

// Danger-sign alerts: every alert shows WHY it fired and which guideline it comes from,
// with the current language on top and the other language underneath.
export default function AlertList({ alerts, compact = false }) {
  const { t } = useI18n()
  if (!alerts?.length) return null
  const red = alerts.some((a) => a.severity === 'red')
  return (
    <section className={`alerts ${red ? 'alerts-red' : 'alerts-amber'}`} role="alert">
      {!compact && (
        <header className="alerts-head">
          <span className="alerts-icon" aria-hidden>{red ? '🚨' : '⚡'}</span>
          <div>
            <strong><Bi k={red ? 'dangerTitle' : 'watchTitle'} /></strong>
            <small>{t(red ? 'dangerSub' : 'watchSub')}</small>
          </div>
        </header>
      )}
      <ul>
        {alerts.map((a) => (
          <li key={a.code} className={`alert alert-${a.severity}`}>
            <div className="alert-title"><Bi hi={a.title_hi} en={a.title_en} /></div>
            <div className="alert-why">
              <b>{t('why')}:</b> <Bi hi={a.reason_hi || a.reason} en={a.reason} />
            </div>
            {!compact && (
              <div className="alert-action">👉 <Bi hi={a.action_hi} en={a.action_en || a.action_hi} /></div>
            )}
            {!compact && <div className="alert-source">{t('source')}: {a.source}</div>}
          </li>
        ))}
      </ul>
    </section>
  )
}
