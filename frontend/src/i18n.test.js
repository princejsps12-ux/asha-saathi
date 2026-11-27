import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODE,
  MODES,
  MODE_LABELS,
  STORAGE_KEY,
  STRINGS,
  addDays,
  detectMode,
  formatDate,
  linesFor,
  loadMode,
  mainLang,
  saveMode,
  translate,
} from './i18n.js'

const memoryStorage = (initial = {}) => {
  const data = { ...initial }
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v
    },
    data,
  }
}
const brokenStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceeded')
  },
}

describe('display mode', () => {
  it('first open is always bilingual "हिं + EN", whatever the browser language', () => {
    expect(DEFAULT_MODE).toBe('both')
    expect(detectMode(null)).toBe('both')
    expect(loadMode(memoryStorage())).toBe('both')
    expect(detectMode.length).toBe(1) // takes only the stored value: no browser-language guessing
  })
  it('offers exactly three toggle options in order', () => {
    expect(MODES).toEqual(['both', 'hi', 'en'])
    expect(MODES.map((m) => MODE_LABELS[m])).toEqual(['हिं + EN', 'हिं', 'EN'])
  })
  it('a valid stored choice wins; junk falls back to bilingual', () => {
    expect(detectMode('hi')).toBe('hi')
    expect(detectMode('en')).toBe('en')
    expect(detectMode('fr')).toBe('both')
  })
  it('main language is Hindi unless EN-only', () => {
    expect([mainLang('both'), mainLang('hi'), mainLang('en')]).toEqual(['hi', 'hi', 'en'])
  })
})

describe('linesFor (what each label shows)', () => {
  it('both: Hindi main with a smaller English line', () => {
    expect(linesFor('both', 'सूजन', 'Swelling')).toEqual({ main: 'सूजन', sub: 'Swelling' })
  })
  it('hi: Hindi only, unless the English line is required (fields, alerts)', () => {
    expect(linesFor('hi', 'सूजन', 'Swelling')).toEqual({ main: 'सूजन', sub: null })
    expect(linesFor('hi', 'सूजन', 'Swelling', { alwaysEnglish: true })).toEqual({ main: 'सूजन', sub: 'Swelling' })
  })
  it('en: English only', () => {
    expect(linesFor('en', 'सूजन', 'Swelling', { alwaysEnglish: true })).toEqual({ main: 'Swelling', sub: null })
  })
  it('no duplicate line when both languages are the same, and fills a missing side', () => {
    expect(linesFor('both', '142/92', '142/92')).toEqual({ main: '142/92', sub: null })
    expect(linesFor('en', 'केवल हिंदी', '')).toEqual({ main: 'केवल हिंदी', sub: null })
  })
})

describe('localStorage persistence', () => {
  it('saves and reloads the choice', () => {
    const storage = memoryStorage()
    saveMode('en', storage)
    expect(storage.data[STORAGE_KEY]).toBe('en')
    expect(loadMode(storage)).toBe('en')
  })
  it('never throws when storage is blocked (private mode) and stays bilingual', () => {
    expect(() => saveMode('en', brokenStorage)).not.toThrow()
    expect(loadMode(brokenStorage)).toBe('both')
  })
})

describe('translations', () => {
  it('English and Hindi have exactly the same keys, none empty', () => {
    expect(Object.keys(STRINGS.en).sort()).toEqual(Object.keys(STRINGS.hi).sort())
    for (const lang of ['hi', 'en']) {
      for (const [key, text] of Object.entries(STRINGS[lang])) expect(text, `${lang}.${key}`).toBeTruthy()
    }
  })
  it('placeholders match between languages', () => {
    const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join()
    for (const key of Object.keys(STRINGS.hi)) expect(holes(STRINGS.en[key]), key).toBe(holes(STRINGS.hi[key]))
  })
  it('English UI strings contain no Devanagari, except bilingual toggle labels', () => {
    const bilingual = new Set(['langToggle'])
    for (const [key, text] of Object.entries(STRINGS.en)) {
      if (!bilingual.has(key)) expect(/[ऀ-ॿ]/.test(text), key).toBe(false)
    }
  })
  it('interpolates variables and falls back to the key', () => {
    expect(translate('en', 'monthN', { n: 7 })).toBe('month 7')
    expect(translate('hi', 'monthN', { n: 7 })).toBe('7 महीना')
    expect(translate('en', 'no_such_key')).toBe('no_such_key')
  })
  it('is honest about what needs internet: no "offline mode" claims anywhere', () => {
    expect(translate('en', 'offlineBadge')).toBe('No API keys needed')
    expect(translate('en', 'modeNote')).toBe(
      "No API keys needed; speech uses the browser's built-in recognition " +
        '(needs internet); extraction and danger rules run fully on our server.',
    )
    for (const lang of ['hi', 'en']) {
      for (const [key, text] of Object.entries(STRINGS[lang])) {
        expect(/offline mode|ऑफ़लाइन मोड/i.test(text), `${lang}.${key}`).toBe(false)
      }
    }
  })
  it('unsupported-browser message is exactly the agreed bilingual text', () => {
    expect(translate('hi', 'noStt')).toBe('इस ब्राउज़र में आवाज़ नहीं चलती - Chrome खोलें')
    expect(translate('en', 'noStt')).toBe('Voice not supported here - use Chrome')
  })
})

describe('formatDate', () => {
  it('formats relative dates in both languages', () => {
    expect(formatDate('2026-11-28', '2026-11-27', 'en')).toBe('Tomorrow · 28 Nov')
    expect(formatDate('2026-11-28', '2026-11-27', 'hi')).toBe('कल · 28 नव')
    expect(formatDate('2026-11-24', '2026-11-27', 'en')).toBe('24 Nov (3 days ago)')
    expect(formatDate(null, '2026-11-27', 'en')).toBe('—')
    expect(formatDate('2026-11-28', undefined, 'en')).toBe('28 Nov') // server "today" not loaded yet
  })
  it('addDays never crashes before the server date has loaded', () => {
    expect(addDays('2026-11-27', 1)).toBe('2026-11-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays(undefined, 1)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
