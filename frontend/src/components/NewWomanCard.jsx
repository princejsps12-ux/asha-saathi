import { useState } from 'react'
import { api, toUiError } from '../api.js'
import { Bi, useI18n } from '../lang.jsx'
import { ErrorNote } from './Feedback.jsx'

// Shown when the spoken name did not confidently match anyone. We never guess: close names are
// offered as "did you mean…?", and an unknown name can be added as a new woman in one tap.
export default function NewWomanCard({ fields, suggestions, onPick, onAdded }) {
  const { plain } = useI18n()
  const [name, setName] = useState(fields.beneficiary_name_heard || '')
  const [village, setVillage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function add() {
    if (name.trim().length < 2) return
    setBusy(true)
    setError(null)
    try {
      const person = await api.addBeneficiary(name.trim(), village.trim())
      onAdded(person)
    } catch (e) {
      setError(toUiError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card new-woman" aria-live="polite">
      {suggestions?.length > 0 && (
        <div className="did-you-mean">
          <h3>
            <Bi k="didYouMean" always inline />
          </h3>
          <div className="choices">
            {suggestions.map((s) => (
              <button key={s.id} type="button" className="chip" onClick={() => onPick(s.id)}>
                <Bi hi={`${s.name_hi} · ${s.village}`} en={`${s.name_en} · ${s.village_en || s.village}`} always />
              </button>
            ))}
          </div>
        </div>
      )}
      {fields.beneficiary_name_heard && (
        <div className="add-new">
          <h3>
            👩 <Bi k="newWomanTitle" always inline />
          </h3>
          <label>
            <Bi k="newWomanName" inline />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={plain('newWomanName')} />
          </label>
          <label>
            <Bi k="newWomanVillage" inline />
            <input
              value={village}
              onChange={(e) => setVillage(e.target.value)}
              placeholder={plain('newWomanVillage')}
            />
          </label>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={add} disabled={busy || name.trim().length < 2}>
              <Bi k="newWomanAdd" />
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => onPick(null)}>
              <Bi k="newWomanPick" />
            </button>
          </div>
          <ErrorNote error={error} />
        </div>
      )}
      {!fields.beneficiary_name_heard && !suggestions?.length && (
        <p className="muted">
          <Bi k="selectFirst" />
        </p>
      )}
    </section>
  )
}
