// Display language. Pure functions only (no React) so they are unit-tested in i18n.test.js.
//
// Three modes, chosen with the header toggle and remembered in localStorage:
//   'both' (default) — Hindi as the main text, a smaller English line under it
//   'hi'             — Hindi only (an ASHA's everyday view)
//   'en'             — English only (judges, supervisors who don't read Hindi)
// The default is ALWAYS 'both' on first open; we never guess from the browser language.

export const MODES = ['both', 'hi', 'en']
export const DEFAULT_MODE = 'both'
export const MODE_LABELS = { both: 'हिं + EN', hi: 'हिं', en: 'EN' }
export const STORAGE_KEY = 'asha.lang'

/** A valid stored choice wins; anything else (nothing stored, junk) means the bilingual default. */
export function detectMode(stored) {
  return MODES.includes(stored) ? stored : DEFAULT_MODE
}

export function loadMode(storage = globalThis.localStorage) {
  let stored = null
  try { stored = storage?.getItem(STORAGE_KEY) } catch { /* private mode / blocked storage */ }
  return detectMode(stored)
}

export function saveMode(mode, storage = globalThis.localStorage) {
  try { storage?.setItem(STORAGE_KEY, mode) } catch { /* ignore: preference just won't persist */ }
}

/** Language of the main line: English only in 'en' mode, otherwise Hindi. */
export const mainLang = (mode) => (mode === 'en' ? 'en' : 'hi')

/**
 * Which lines to show for a piece of text that exists in Hindi and English.
 * `alwaysEnglish` keeps an English line under the Hindi even in Hindi-only mode — used for
 * the register fields and danger alerts, which a supervisor or doctor must always be able to read.
 */
export function linesFor(mode, hi, en, { alwaysEnglish = false } = {}) {
  const h = hi || en || ''
  const e = en || hi || ''
  if (mode === 'en') return { main: e, sub: null }
  const showSub = mode === 'both' || alwaysEnglish
  return { main: h, sub: showSub && e !== h ? e : null }
}

export const STRINGS = {
  hi: {
    tagline: 'मितानिन की आवाज़ वाली डायरी',
    offlineBadge: 'API की नहीं – ऑफ़लाइन मोड',
    offlineTitle: 'ब्राउज़र आवाज़ पहचान + नियम-आधारित पार्सर। किसी API की की ज़रूरत नहीं।',
    sttSarvam: '🎙 Sarvam आवाज़',
    sttBrowser: '🎙 ब्राउज़र आवाज़',
    extractGemini: '✨ Gemini + नियम',
    extractRules: 'नियम',
    readbackTitle: 'सुनाया गया सार',
    tabVisit: 'विज़िट', tabWomen: 'लाभार्थी', tabDue: 'कल', tabRisk: 'हाई रिस्क',
    resetDemo: '↺ डेमो डेटा रीसेट करें',
    resetConfirm: 'डेमो डेटा रीसेट करें? सेव की गई विज़िट हट जाएँगी।',
    footerRules: 'नियम: MoHFW / NHM ANC दिशानिर्देश · केवल निर्णय-सहायता',
    presetVisit: '{name} की विज़िट',
    clear: '✕ हटाएँ',
    allWomen: 'सभी लाभार्थी',
    noWomen: 'कोई लाभार्थी नहीं',
    loading: 'लोड हो रहा है…',

    phase_idle: 'माइक दबाकर विज़िट बोलें',
    phase_listening: 'सुन रही हूँ… बोलती रहिए',
    phase_thinking: 'समझ रही हूँ…',
    phase_speaking: 'सुनिए, क्या यह सही है?',
    phase_confirming: '"हाँ" या "नहीं" बोलिए',
    phase_review: 'माइक दबाकर हाँ या नहीं बोलें',
    phase_listenAgain: 'फिर से सुन रही हूँ… हाँ या नहीं बोलिए',
    reviewSub: 'या नीचे हाँ / नहीं दबाएँ, गलत जानकारी पर टैप करके बदलें',
    confirmYes: 'हाँ ✓', confirmNo: 'नहीं ✗',
    micAnswer: 'माइक दबाकर जवाब दें',
    pendingRestored: 'अधूरी विज़िट वापस लाई गई — अभी सेव नहीं हुई है',
    discardConfirm: 'यह विज़िट अभी सेव नहीं हुई है। इसे हटाकर नई विज़िट शुरू करें?',
    phase_clarify: 'जो साफ़ नहीं सुना, वो दोबारा बोलिए — या "हाँ" बोलकर सेव करें',
    phase_saving: 'सेव हो रहा है…',
    phase_waking: 'सर्वर जाग रहा है, थोड़ा रुकिए… (करीब 1 मिनट)',
    retryExtract: '🔁 दोबारा कोशिश करें',
    phase_saved: 'सेव हो गया ✓',
    micStart: 'बोलना शुरू करें',
    micStop: 'सुनना बंद करें',
    noStt: 'इस ब्राउज़र में आवाज़ पहचान नहीं है — Chrome खोलें या “नमूना चलाएँ” दबाएँ।',
    trySample: '▶ नमूना चलाएँ',
    transcriptTitle: 'आपने कहा',
    glossTitle: 'English gloss · अंग्रेज़ी सार',
    savedBanner: '✓ विज़िट सेव हुई',
    newVisit: '＋ नई विज़िट',
    readAgain: '🔊 दोबारा सुनें',
    selectFirst: 'पहले लाभार्थी चुनें',
    sayEdit: 'ठीक है। गलत जानकारी पर टैप करके बदलें, या दोबारा बोलें।',
    sayNoChange: 'सुन लिया, कोई नई जानकारी नहीं मिली। सेव करने के लिए हाँ बोलें या हाँ बटन दबाएँ।',
    saySaved: 'सेव हो गया। धन्यवाद।',
    saySavedDanger: 'सेव हो गया। ध्यान दें, खतरे का संकेत है: {titles}। {action}।',
    'err_not-allowed': 'माइक की अनुमति नहीं मिली',
    'err_no-speech': 'कुछ सुनाई नहीं दिया',
    'err_audio-capture': 'माइक नहीं मिला',
    err_network: 'आवाज़ पहचान के लिए इंटरनेट चाहिए',
    err_other: 'आवाज़ पहचान में दिक्कत: {code}',
    err_unreachable: 'सर्वर से कनेक्ट नहीं हो पाया। ऐप चालू है? दोबारा कोशिश करें।',
    err_invalid: 'यह जानकारी सही नहीं लगती — जाँचकर दोबारा डालें।',
    err_notFound: 'यह रिकॉर्ड नहीं मिला। सूची दोबारा खोलें।',
    err_tooLarge: 'रिकॉर्डिंग बहुत लंबी है — छोटा करके दोबारा बोलें।',
    err_sttService: 'ऑनलाइन आवाज़ सेवा नहीं चली — ब्राउज़र आवाज़ पहचान से बोलें।',
    err_server: 'कुछ गड़बड़ हुई। दोबारा कोशिश करें — आपका डेटा सुरक्षित है।',
    crashTitle: 'माफ़ कीजिए, स्क्रीन में दिक्कत आ गई',
    crashBody: 'आपकी सेव की गई विज़िट सुरक्षित हैं।',
    reload: '↻ दोबारा खोलें',
    introTitle: 'बोलिए, लिखिए नहीं — कोई माइक नहीं? “नमूना चलाएँ” दबाएँ',
    introStep1: 'गर्भवती महिला की घर-विज़िट हिंदी, हिंग्लिश या अंग्रेज़ी में बोलें',
    introStep2: 'रजिस्टर अपने-आप भरेगा, हिंदी में पढ़कर सुनाएगा, "हाँ" बोलकर सेव करें',
    introStep3: 'खतरे के संकेत (हाई बीपी, खून आना, हलचल कम) पर लाल अलर्ट — कारण के साथ',

    fieldsTitle: 'रजिस्टर एंट्री', tapToEdit: 'टैप करके बदलें',
    f_beneficiary: 'लाभार्थी', f_month: 'गर्भ का महीना', f_bp: 'बीपी', f_hb: 'हीमोग्लोबिन',
    f_weight: 'वज़न', f_temp: 'तापमान', f_symptoms: 'लक्षण', f_fetal: 'बच्चे की हलचल',
    f_ifa: 'आयरन गोली (IFA)', f_td: 'टीडी टीका', f_next: 'अगली विज़िट',
    select: 'चुनें', none: 'कोई नहीं', tapToAdd: '— टैप करें', ok: 'ठीक',
    monthN: '{n} महीना', bpUpper: 'ऊपर', bpLower: 'नीचे',
    fetal_normal: 'ठीक', fetal_reduced: 'कम', fetal_unclear: 'साफ़ नहीं सुना — दोबारा बताएँ', unknown: 'पता नहीं',
    bpUnclear: 'समझ नहीं आया (सुना: {heard}) — दोबारा बोलें',
    yes: 'हाँ', no: 'नहीं', ifaGiven: '{n} गोली दी',
    td_1: 'पहला', td_2: 'दूसरा', td_3: 'बूस्टर', vaccineGiven: 'टीका लगा',
    next_1: 'कल', next_2: 'परसों', next_7: 'अगले हफ्ते', next_14: '2 हफ्ते', next_28: '4 हफ्ते',

    dangerTitle: 'खतरे का संकेत', dangerSub: 'अभी रेफ़र करें',
    watchTitle: 'ध्यान दें', watchSub: 'फ़ॉलो-अप ज़रूरी',
    why: 'क्यों', source: 'स्रोत',

    risk_red: 'खतरा', risk_amber: 'ध्यान दें', risk_normal: 'सामान्य',
    monthUnknown: 'महीना —',
    dueTomorrow: 'कल की विज़िट', dueToday: 'आज की विज़िट', overdue: 'छूटी हुई विज़िट',
    nothingTomorrow: 'कल कोई विज़िट नहीं', nothingToday: 'आज कोई विज़िट नहीं',
    highRiskTitle: 'हाई रिस्क गर्भावस्था', highRiskSub: 'आखिरी विज़िट के आधार पर', noHighRisk: 'कोई हाई रिस्क नहीं',
    back: '← वापस', husband: 'पति', years: '{n} वर्ष', nextVisit: 'अगली विज़िट',
    recordFor: '🎤 इनकी विज़िट दर्ज करें', history: 'विज़िट इतिहास',

    date_today: 'आज', date_tomorrow: 'कल', date_dayAfter: 'परसों', date_yesterday: 'कल था',
    date_ago: '{n} दिन पहले',
  },
  en: {
    tagline: 'ASHA Saathi · voice diary for ASHA workers',
    offlineBadge: 'key not set – offline mode',
    offlineTitle: 'Browser speech recognition + rule-based parser. No API key needed.',
    sttSarvam: '🎙 Sarvam STT',
    sttBrowser: '🎙 browser STT',
    extractGemini: '✨ Gemini + rules',
    extractRules: 'rules',
    readbackTitle: 'Read-back summary',
    tabVisit: 'Visit', tabWomen: 'Women', tabDue: 'Due', tabRisk: 'High risk',
    resetDemo: '↺ Reset demo data',
    resetConfirm: 'Reset demo data? Saved visits will be removed.',
    footerRules: 'Rules: MoHFW / NHM ANC guidelines · decision support only',
    presetVisit: 'Visit for {name}',
    clear: '✕ Clear',
    allWomen: 'All beneficiaries',
    noWomen: 'No beneficiaries',
    loading: 'Loading…',

    phase_idle: 'Tap the mic and describe the visit',
    phase_listening: 'Listening… pause to finish',
    phase_thinking: 'Extracting fields…',
    phase_speaking: 'Reading back — is this correct?',
    phase_confirming: 'Say “yes” to save or “no” to edit',
    phase_review: 'Tap mic and say yes or no',
    phase_listenAgain: 'Listening again… say yes or no',
    reviewSub: 'or tap Yes / No below; tap a wrong field to fix it',
    confirmYes: 'Yes', confirmNo: 'No',
    micAnswer: 'Tap mic to answer',
    pendingRestored: 'Unsaved visit restored — not saved yet',
    discardConfirm: 'This visit is not saved yet. Discard it and start a new visit?',
    phase_clarify: 'Say the unclear part again — or say "yes" to save',
    phase_saving: 'Saving…',
    phase_waking: 'Waking up the server, please wait… (about a minute)',
    retryExtract: '🔁 Try again',
    phase_saved: 'Saved ✓',
    micStart: 'Start speaking',
    micStop: 'Stop listening',
    noStt: 'This browser has no speech recognition — use Chrome, or press “Try sample”.',
    trySample: '▶ Try sample',
    transcriptTitle: 'Transcript',
    glossTitle: 'English gloss',
    savedBanner: '✓ Visit saved',
    newVisit: '＋ New visit',
    readAgain: '🔊 Read again',
    selectFirst: 'Select the woman first',
    sayEdit: 'Okay. Tap a wrong field to fix it, or record again.',
    sayNoChange: 'Heard you, but nothing new. Say yes, or tap Yes, to save.',
    saySaved: 'Saved. Thank you.',
    saySavedDanger: 'Saved. Warning, danger sign: {titles}. {action}.',
    'err_not-allowed': 'Microphone permission denied',
    'err_no-speech': 'No speech heard',
    'err_audio-capture': 'No microphone found',
    err_network: 'Speech recognition needs internet',
    err_other: 'Speech recognition error: {code}',
    err_unreachable: "Can't reach the server. Is the app running? Please try again.",
    err_invalid: "That value doesn't look right — please check it and try again.",
    err_notFound: 'That record was not found. Please reopen the list.',
    err_tooLarge: 'The recording is too long — please record a shorter note.',
    err_sttService: 'Online speech service failed — please use browser speech recognition.',
    err_server: 'Something went wrong. Please try again — your data is safe.',
    crashTitle: 'Sorry, this screen hit a problem',
    crashBody: 'Your saved visits are safe.',
    reload: '↻ Reload',
    introTitle: 'Speak, don\'t type — no mic? Press “Try sample”',
    introStep1: 'Speak a pregnancy home visit in Hindi, Hinglish or English',
    introStep2: 'The register fills itself and is read back aloud; say “haan” (yes) to save',
    introStep3: 'Danger signs (high BP, bleeding, reduced baby movement) raise a red alert, with the reason',

    fieldsTitle: 'Register entry', tapToEdit: 'tap to edit',
    f_beneficiary: 'Woman', f_month: 'Pregnancy month', f_bp: 'BP (mmHg)', f_hb: 'Hb (g/dL)',
    f_weight: 'Weight (kg)', f_temp: 'Temperature (°F)', f_symptoms: 'Symptoms', f_fetal: 'Baby movement',
    f_ifa: 'Taking IFA tablets', f_td: 'Td vaccine', f_next: 'Next visit',
    select: 'Select', none: 'None', tapToAdd: '— tap to add', ok: 'OK',
    monthN: 'month {n}', bpUpper: 'Upper', bpLower: 'Lower',
    fetal_normal: 'Normal', fetal_reduced: 'Reduced', fetal_unclear: 'Not clear — please say again', unknown: 'Unknown',
    bpUnclear: 'Not clear (heard {heard}) — say again',
    yes: 'Yes', no: 'No', ifaGiven: '{n} tablets given',
    td_1: '1st dose', td_2: '2nd dose', td_3: 'Booster', vaccineGiven: 'Vaccine given',
    next_1: 'Tomorrow', next_2: 'Day after', next_7: 'Next week', next_14: '2 weeks', next_28: '4 weeks',

    dangerTitle: 'Danger sign', dangerSub: 'Refer now',
    watchTitle: 'Watch', watchSub: 'Needs follow-up',
    why: 'Why', source: 'Source',

    risk_red: 'High risk', risk_amber: 'Watch', risk_normal: 'Normal',
    monthUnknown: 'month —',
    dueTomorrow: 'Due tomorrow', dueToday: 'Due today', overdue: 'Overdue',
    nothingTomorrow: 'Nothing due tomorrow', nothingToday: 'Nothing due today',
    highRiskTitle: 'High-risk pregnancies', highRiskSub: 'based on the latest visit', noHighRisk: 'No high-risk cases',
    back: '← Back', husband: 'Husband', years: '{n} yrs', nextVisit: 'Next visit',
    recordFor: '🎤 Record a visit', history: 'Visit history',

    date_today: 'Today', date_tomorrow: 'Tomorrow', date_dayAfter: 'Day after tomorrow', date_yesterday: 'Yesterday',
    date_ago: '{n} days ago',
  },
}

/** Look up a string; falls back to Hindi, then to the key itself. Replaces {placeholders}. */
export function translate(lang, key, vars) {
  const text = STRINGS[lang]?.[key] ?? STRINGS.hi[key] ?? key
  return vars ? text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? '')) : text
}

const MONTHS = {
  hi: ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुला', 'अग', 'सित', 'अक्टू', 'नव', 'दिस'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** ISO date `days` after the server's "today" (or the device's today if that hasn't loaded yet). */
export function addDays(isoToday, days) {
  const d = isoToday ? parseISODate(isoToday) : new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Tomorrow · 28 Nov" / "कल · 28 नव", relative to the server's "today". */
export function formatDate(iso, today, lang = 'hi') {
  if (!iso) return '—'
  const d = parseISODate(iso)
  const label = `${d.getDate()} ${MONTHS[lang][d.getMonth()]}`
  if (!today) return label
  const diff = Math.round((d - parseISODate(today)) / 86400000)
  const rel = { [-1]: 'date_yesterday', 0: 'date_today', 1: 'date_tomorrow', 2: 'date_dayAfter' }[diff]
  if (rel) return `${translate(lang, rel)} · ${label}`
  return diff < 0 ? `${label} (${translate(lang, 'date_ago', { n: -diff })})` : label
}
