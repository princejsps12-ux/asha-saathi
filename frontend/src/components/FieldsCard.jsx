import { useState } from 'react'
import { TD_DOSE, addDays, formatDate } from '../labels.js'

// Extracted register fields. Tap any row to correct it — mostly with big buttons, so
// even corrections rarely need typing.

function Choice({ options, value, onPick }) {
  return (
    <div className="choices">
      {options.map(([val, label]) => (
        <button key={String(val)} type="button" className={`chip ${value === val ? 'chip-on' : ''}`}
          onClick={() => onPick(val)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function NumberInput({ value, onCommit, step = 1, placeholder }) {
  const [draft, setDraft] = useState(value ?? '')
  const commit = () => onCommit(draft === '' ? null : Number(draft))
  return (
    <div className="num-edit">
      <input type="number" inputMode="decimal" step={step} value={draft} placeholder={placeholder} autoFocus
        onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      <button type="button" className="btn btn-small" onClick={commit}>ठीक / OK</button>
    </div>
  )
}

function BpInput({ fields, onCommit }) {
  const [sys, setSys] = useState(fields.bp_systolic ?? '')
  const [dia, setDia] = useState(fields.bp_diastolic ?? '')
  const toNum = (v) => (v === '' ? null : Number(v))
  return (
    <div className="num-edit">
      <input type="number" inputMode="numeric" value={sys} placeholder="ऊपर" autoFocus
        onChange={(e) => setSys(e.target.value)} />
      <span className="slash">/</span>
      <input type="number" inputMode="numeric" value={dia} placeholder="नीचे" onChange={(e) => setDia(e.target.value)} />
      <button type="button" className="btn btn-small"
        onClick={() => onCommit({ bp_systolic: toNum(sys), bp_diastolic: toNum(dia) })}>ठीक / OK</button>
    </div>
  )
}

export default function FieldsCard({ fields, people, symptomLabels, today, onChange, disabled }) {
  const [open, setOpen] = useState(null)
  const set = (patch) => {
    setOpen(null)
    onChange({ ...fields, ...patch })
  }
  const toggleSymptom = (code) => {
    const has = fields.symptoms.includes(code)
    onChange({ ...fields, symptoms: has ? fields.symptoms.filter((s) => s !== code) : [...fields.symptoms, code] })
  }
  const yesNo = (v) => (v === true ? 'हाँ / Yes' : v === false ? 'नहीं / No' : null)

  const rows = [
    {
      key: 'beneficiary', hi: 'लाभार्थी', en: 'Woman',
      value: fields.beneficiary_name,
      empty: 'चुनें / Select',
      editor: <Choice value={fields.beneficiary_id}
        options={people.map((p) => [p.id, `${p.name_hi} · ${p.village}`])}
        onPick={(id) => set({ beneficiary_id: id, beneficiary_name: people.find((p) => p.id === id)?.name_hi })} />,
    },
    {
      key: 'month', hi: 'गर्भ का महीना', en: 'Month',
      value: fields.pregnancy_month && `${fields.pregnancy_month} महीना`,
      editor: <Choice value={fields.pregnancy_month} options={[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => [m, String(m)])}
        onPick={(m) => set({ pregnancy_month: m })} />,
    },
    {
      key: 'bp', hi: 'बीपी', en: 'BP',
      value: fields.bp_systolic && fields.bp_diastolic && `${fields.bp_systolic}/${fields.bp_diastolic}`,
      editor: <BpInput fields={fields} onCommit={set} />,
    },
    {
      key: 'hb', hi: 'हीमोग्लोबिन', en: 'Hb g/dL', value: fields.hb,
      editor: <NumberInput value={fields.hb} step={0.1} placeholder="9.5" onCommit={(v) => set({ hb: v })} />,
    },
    {
      key: 'weight', hi: 'वज़न', en: 'Weight kg', value: fields.weight_kg,
      editor: <NumberInput value={fields.weight_kg} onCommit={(v) => set({ weight_kg: v })} />,
    },
    {
      key: 'temp', hi: 'तापमान', en: 'Temp °F', value: fields.temperature_f,
      editor: <NumberInput value={fields.temperature_f} step={0.1} placeholder="98.6"
        onCommit={(v) => set({ temperature_f: v })} />,
    },
    {
      key: 'symptoms', hi: 'लक्षण', en: 'Symptoms',
      value: fields.symptoms.length ? fields.symptoms.map((s) => symptomLabels[s]?.hi || s).join(', ') : null,
      empty: 'कोई नहीं / None',
      editor: (
        <div className="choices">
          {Object.entries(symptomLabels).map(([code, l]) => (
            <button key={code} type="button" className={`chip ${fields.symptoms.includes(code) ? 'chip-on' : ''}`}
              onClick={() => toggleSymptom(code)}>{l.hi}<small>{l.en}</small></button>
          ))}
        </div>
      ),
    },
    {
      key: 'fetal', hi: 'बच्चे की हलचल', en: 'Baby movement',
      value: { normal: 'ठीक / Normal', reduced: 'कम / Reduced' }[fields.fetal_movement],
      editor: <Choice value={fields.fetal_movement}
        options={[['normal', 'ठीक / Normal'], ['reduced', 'कम / Reduced'], [null, '— पता नहीं']]}
        onPick={(v) => set({ fetal_movement: v })} />,
    },
    {
      key: 'ifa', hi: 'आयरन गोली (IFA)', en: 'Taking IFA',
      value: yesNo(fields.ifa_taking) && `${yesNo(fields.ifa_taking)}${fields.ifa_tablets ? ` · ${fields.ifa_tablets} दी` : ''}`,
      editor: <Choice value={fields.ifa_taking} options={[[true, 'हाँ / Yes'], [false, 'नहीं / No'], [null, '—']]}
        onPick={(v) => set({ ifa_taking: v })} />,
    },
    {
      key: 'td', hi: 'टीडी टीका', en: 'Td vaccine',
      value: TD_DOSE[fields.td_dose] || (fields.vaccine_given ? 'लगा / Given' : null),
      editor: <Choice value={fields.td_dose} options={[[1, TD_DOSE[1]], [2, TD_DOSE[2]], [3, TD_DOSE[3]], [null, '—']]}
        onPick={(v) => set({ td_dose: v, vaccine_given: v ? true : fields.vaccine_given })} />,
    },
    {
      key: 'next', hi: 'अगली विज़िट', en: 'Next visit',
      value: fields.next_visit_date && formatDate(fields.next_visit_date, today),
      editor: (
        <div>
          <Choice value={fields.next_visit_date}
            options={[[1, 'कल'], [2, 'परसों'], [7, 'अगले हफ्ते'], [14, '2 हफ्ते'], [28, '4 हफ्ते']]
              .map(([d, l]) => [addDays(today, d), l])}
            onPick={(v) => set({ next_visit_date: v })} />
          <input type="date" className="date-input" value={fields.next_visit_date || ''}
            onChange={(e) => set({ next_visit_date: e.target.value || null })} />
        </div>
      ),
    },
  ]

  return (
    <section className="card fields">
      <h3>रजिस्टर एंट्री <span className="en">Register entry · टैप करके बदलें / tap to edit</span></h3>
      <dl>
        {rows.map((row) => {
          const filled = row.value !== null && row.value !== undefined && row.value !== ''
          return (
            <div key={row.key} className={`field ${open === row.key ? 'field-open' : ''}`}>
              <button type="button" className="field-row" disabled={disabled}
                onClick={() => setOpen(open === row.key ? null : row.key)}>
                <dt>{row.hi}<small>{row.en}</small></dt>
                <dd className={filled ? '' : 'muted'}>{filled ? row.value : (row.empty || '— टैप करें')}</dd>
              </button>
              {open === row.key && <div className="field-editor">{row.editor}</div>}
            </div>
          )
        })}
      </dl>
    </section>
  )
}
