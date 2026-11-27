// What counts as "something about a visit was understood".

const DETAIL_FIELDS = [
  'pregnancy_month',
  'bp_systolic',
  'bp_diastolic',
  'hb',
  'weight_kg',
  'temperature_f',
  'fetal_movement',
  'ifa_taking',
  'ifa_tablets',
  'td_dose',
  'vaccine_given',
  'next_visit_date',
]

/**
 * True when extraction found the woman on the list or at least one visit detail (or an unclear BP to ask
 * about). Plain chatter such as "hello" has none of these: the app then says what to say, instead of
 * offering to add a woman called "hello" and reading back an empty visit.
 */
export function hasVisitDetails(fields) {
  if (!fields) return false
  if (fields.beneficiary_id != null || fields.bp_unclear || fields.symptoms?.length) return true
  return DETAIL_FIELDS.some((key) => fields[key] != null)
}
