import { createContext, useContext } from 'react'
import { formatDate, otherLang, translate } from './i18n.js'

export const LangContext = createContext({ lang: 'hi', setLang: () => {} })

/** t('key') in the current language; tOther('key') in the other one (for the secondary line). */
export function useI18n() {
  const { lang, setLang } = useContext(LangContext)
  const other = otherLang(lang)
  return {
    lang,
    setLang,
    t: (key, vars) => translate(lang, key, vars),
    tOther: (key, vars) => translate(other, key, vars),
    fmtDate: (iso, today) => formatDate(iso, today, lang),
    pick: (hi, en) => (lang === 'hi' ? hi : en) || hi || en,
  }
}

/**
 * A two-line bilingual label: the current language on top, the other below in small text.
 * Hindi-first users always see an English line too (and vice versa), so a judge or a
 * supervisor can read any card. Pass either a translation key, or explicit hi/en text.
 */
export function Bi({ k, vars, hi, en, className = '' }) {
  const { lang } = useContext(LangContext)
  const text = {
    hi: hi ?? translate('hi', k, vars),
    en: en ?? translate('en', k, vars),
  }
  const main = text[lang] || text.hi || text.en
  const sub = text[otherLang(lang)]
  return (
    <span className={`bi ${className}`}>
      <span className="bi-main">{main}</span>
      {sub && sub !== main && <span className="bi-sub" lang={otherLang(lang)}>{sub}</span>}
    </span>
  )
}

/** EN | हिं segmented toggle for the header. */
export function LangToggle() {
  const { lang, setLang } = useContext(LangContext)
  return (
    <div className="lang-toggle" role="group" aria-label={translate(lang, 'langToggle')}>
      {[['en', 'EN'], ['hi', 'हिं']].map(([code, label]) => (
        <button key={code} type="button" lang={code} aria-pressed={lang === code}
          className={lang === code ? 'on' : ''} onClick={() => setLang(code)}>{label}</button>
      ))}
    </div>
  )
}
