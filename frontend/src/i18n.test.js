import { describe, expect, it } from 'vitest'
import { STRINGS, STORAGE_KEY, detectLang, formatDate, loadLang, saveLang, translate } from './i18n.js'

const memoryStorage = (initial = {}) => {
  const data = { ...initial }
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v }, data }
}
const brokenStorage = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('QuotaExceeded') },
}

describe('language detection', () => {
  it('defaults to English when the browser language is not Hindi', () => {
    expect(detectLang(null, 'en-US')).toBe('en')
    expect(detectLang(null, 'ta-IN')).toBe('en')
    expect(detectLang(null, undefined)).toBe('en')
  })
  it('defaults to Hindi for a Hindi browser', () => {
    expect(detectLang(null, 'hi-IN')).toBe('hi')
    expect(detectLang(null, 'hi')).toBe('hi')
  })
  it('a stored choice always wins, unknown stored values are ignored', () => {
    expect(detectLang('hi', 'en-US')).toBe('hi')
    expect(detectLang('en', 'hi-IN')).toBe('en')
    expect(detectLang('fr', 'hi-IN')).toBe('hi')
  })
})

describe('localStorage persistence', () => {
  it('saves and reloads the choice', () => {
    const storage = memoryStorage()
    saveLang('hi', storage)
    expect(storage.data[STORAGE_KEY]).toBe('hi')
    expect(loadLang(storage, { language: 'en-GB' })).toBe('hi')
  })
  it('never throws when storage is blocked (private mode)', () => {
    expect(() => saveLang('en', brokenStorage)).not.toThrow()
    expect(loadLang(brokenStorage, { language: 'hi-IN' })).toBe('hi')
    expect(loadLang(brokenStorage, { language: 'en-US' })).toBe('en')
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
  it('keeps the offline badge text the judges expect', () => {
    expect(translate('en', 'offlineBadge')).toContain('key not set – offline mode')
  })
})

describe('formatDate', () => {
  it('formats relative dates in both languages', () => {
    expect(formatDate('2026-11-28', '2026-11-27', 'en')).toBe('Tomorrow · 28 Nov')
    expect(formatDate('2026-11-28', '2026-11-27', 'hi')).toBe('कल · 28 नव')
    expect(formatDate('2026-11-24', '2026-11-27', 'en')).toBe('24 Nov (3 days ago)')
    expect(formatDate(null, '2026-11-27', 'en')).toBe('—')
  })
})
