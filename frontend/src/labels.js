// Hindi-first labels and small formatting helpers shared by all screens.

export const RISK = {
  red: { hi: 'खतरा', en: 'High risk', icon: '⚠️' },
  amber: { hi: 'ध्यान दें', en: 'Watch', icon: '⚡' },
  normal: { hi: 'सामान्य', en: 'Normal', icon: '✓' },
}

export const TD_DOSE = { 1: 'पहला / 1st', 2: 'दूसरा / 2nd', 3: 'बूस्टर / Booster' }

const HINDI_MONTHS = ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुला', 'अग', 'सित', 'अक्टू', 'नव', 'दिस']

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(isoToday, days) {
  const d = parseISODate(isoToday)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "कल · 28 नव" style relative date, given server "today". */
export function formatDate(iso, today) {
  if (!iso) return '—'
  const d = parseISODate(iso)
  const label = `${d.getDate()} ${HINDI_MONTHS[d.getMonth()]}`
  if (!today) return label
  const diff = Math.round((d - parseISODate(today)) / 86400000)
  const rel = { [-1]: 'कल था', 0: 'आज', 1: 'कल', 2: 'परसों' }[diff]
  if (rel) return `${rel} · ${label}`
  return diff < 0 ? `${label} (${-diff} दिन पहले)` : label
}
