import { useState } from 'react'
import { addDays, formatDate, translate } from '../i18n.js'
import { Bi, useI18n } from '../lang.jsx'

// Extracted register fields. Each label and value has a Hindi line and an English line.
// Tap any row to correct it — mostly with big buttons, so corrections rarely need typing.

/** Value in both languages: {hi, en}. */
const both = (key, vars) => ({ hi: translate('hi', key, vars), en: translate('en', key, vars) })

function Choice({ options, value, onPick }) {
  return (
    <div className="choices">
      {options.map(([val, label]) => (
        <button key={String(val)} type="button" className={`chip ${value === val ? 'chip-on' : ''}`}
          onClick={() => onPick(val)}>
          {typeof label === 'string' ? label : <Bi hi={label.hi} en={label.en} always />}
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
      <button type="button" className="btn btn-small" onClick={commit}><Bi k="ok" /></button>
    </div>
  )
}

function BpInput({ fields, onCommit }) {
  const { plain } = useI18n()
  const [sys, setSys] = useState(fields.bp_systolic ?? '')
  const [dia, setDia] = useState(fields.bp_diastolic ?? '')
  const toNum = (v) => (v === '' ? null : Number(v))
  return (
    <div className="num-edit">
      <input type="number" inputMode="numeric" value={sys} placeholder={plain('bpUpper')} autoFocus
        onChange={(e) => setSys(e.target.value)} />
      <span className="slash">/</span>
      <input type="number" inputMode="numeric" value={dia} placeholder={plain('bpLower')}
        onChange={(e) => setDia(e.target.value)} />
      <button type="button" className="btn btn-small"
        onClick={() => onCommit({ bp_systolic: toNum(sys), bp_diastolic: toNum(dia), bp_unclear: false, bp_heard: null })}>
        <Bi k="ok" />
      </button>
    </div>
  )
}

const plain = (v) => (v === null || v === undefined || v === '' ? null : { hi: String(v), en: String(v) })

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
  const person = people.find((p) => p.id === fields.beneficiary_id)
  const yesNo = (v) => (v === true ? both('yes') : v === false ? both('no') : null)
  const ifa = yesNo(fields.ifa_taking)
  const tabletsHi = fields.ifa_tablets ? ` · ${translate('hi', 'ifaGiven', { n: fields.ifa_tablets })}` : ''
  const tabletsEn = fields.ifa_tablets ? ` · ${translate('en', 'ifaGiven', { n: fields.ifa_tablets })}` : ''
  const symptomText = (lang) => fields.symptoms.map((s) => symptomLabels[s]?.[lang] || s).join(', ')

  const rows = [
    {
      key: 'f_beneficiary',
      value: person ? { hi: person.name_hi, en: person.name_en }
        : plain(fields.beneficiary_name_en || fields.beneficiary_name),
      emptyKey: 'select',
      editor: <Choice value={fields.beneficiary_id}
        options={people.map((p) => [p.id, { hi: `${p.name_hi} · ${p.village}`, en: `${p.name_en} · ${p.village_en}` }])}
        onPick={(id) => set({ beneficiary_id: id })} />,
    },
    {
      key: 'f_month',
      value: fields.pregnancy_month && both('monthN', { n: fields.pregnancy_month }),
      editor: <Choice value={fields.pregnancy_month} options={[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => [m, String(m)])}
        onPick={(m) => set({ pregnancy_month: m })} />,
    },
    {
      key: 'f_bp',
      // A mis-heard BP is shown as what was heard + "say again" — never as a guessed value.
      unclear: fields.bp_unclear,
      value: fields.bp_systolic && fields.bp_diastolic ? plain(`${fields.bp_systolic}/${fields.bp_diastolic}`)
        : fields.bp_unclear ? both('bpUnclear', { heard: fields.bp_heard || '?' }) : null,
      editor: <BpInput fields={fields} onCommit={set} />,
    },
    {
      key: 'f_hb', value: plain(fields.hb),
      editor: <NumberInput value={fields.hb} step={0.1} placeholder="9.5" onCommit={(v) => set({ hb: v })} />,
    },
    {
      key: 'f_weight', value: plain(fields.weight_kg),
      editor: <NumberInput value={fields.weight_kg} onCommit={(v) => set({ weight_kg: v })} />,
    },
    {
      key: 'f_temp', value: plain(fields.temperature_f),
      editor: <NumberInput value={fields.temperature_f} step={0.1} placeholder="98.6"
        onCommit={(v) => set({ temperature_f: v })} />,
    },
    {
      key: 'f_symptoms',
      value: fields.symptoms.length ? { hi: symptomText('hi'), en: symptomText('en') } : null,
      emptyKey: 'none',
      editor: (
        <div className="choices">
          {Object.entries(symptomLabels).map(([code, l]) => (
            <button key={code} type="button" className={`chip ${fields.symptoms.includes(code) ? 'chip-on' : ''}`}
              onClick={() => toggleSymptom(code)}><Bi hi={l.hi} en={l.en} always /></button>
          ))}
        </div>
      ),
    },
    {
      key: 'f_fetal',
      unclear: fields.fetal_movement === 'unclear',
      value: fields.fetal_movement && both(`fetal_${fields.fetal_movement}`),
      editor: <Choice value={fields.fetal_movement}
        options={[['normal', both('fetal_normal')], ['reduced', both('fetal_reduced')], [null, both('unknown')]]}
        onPick={(v) => set({ fetal_movement: v })} />,
    },
    {
      key: 'f_ifa',
      value: ifa && { hi: ifa.hi + tabletsHi, en: ifa.en + tabletsEn },
      editor: <Choice value={fields.ifa_taking} options={[[true, both('yes')], [false, both('no')], [null, '—']]}
        onPick={(v) => set({ ifa_taking: v })} />,
    },
    {
      key: 'f_td',
      value: fields.td_dose ? both(`td_${fields.td_dose}`) : fields.vaccine_given ? both('vaccineGiven') : null,
      editor: <Choice value={fields.td_dose}
        options={[[1, both('td_1')], [2, both('td_2')], [3, both('td_3')], [null, '—']]}
        onPick={(v) => set({ td_dose: v, vaccine_given: v ? true : fields.vaccine_given })} />,
    },
    {
      key: 'f_next',
      value: fields.next_visit_date && {
        hi: formatDate(fields.next_visit_date, today, 'hi'), en: formatDate(fields.next_visit_date, today, 'en'),
      },
      editor: (
        <div>
          <Choice value={fields.next_visit_date}
            options={[1, 2, 7, 14, 28].map((d) => [addDays(today, d), both(`next_${d}`)])}
            onPick={(v) => set({ next_visit_date: v })} />
          <input type="date" className="date-input" value={fields.next_visit_date || ''}
            onChange={(e) => set({ next_visit_date: e.target.value || null })} />
        </div>
      ),
    },
  ]

  return (
    <section className="card fields">
      <h3><Bi k="fieldsTitle" always inline /> <span className="en">· <Bi k="tapToEdit" inline /></span></h3>
      <dl>
        {rows.map((row) => {
          const value = row.value || null
          return (
            <div key={row.key}
              className={`field ${open === row.key ? 'field-open' : ''} ${row.unclear ? 'field-unclear' : ''}`}>
              <button type="button" className="field-row" disabled={disabled}
                onClick={() => setOpen(open === row.key ? null : row.key)}>
                <dt><Bi k={row.key} always /></dt>
                <dd className={value ? '' : 'muted'}>
                  {row.unclear && <span className="unclear-icon" aria-hidden>⚠️</span>}
                  {value ? <Bi hi={value.hi} en={value.en} always />
                    : <Bi k={row.emptyKey || 'tapToAdd'} always />}
                </dd>
              </button>
              {open === row.key && <div className="field-editor">{row.editor}</div>}
            </div>
          )
        })}
      </dl>
    </section>
  )
}
