import { createContext, useContext } from 'react'
import { DEFAULT_MODE, MODES, MODE_LABELS, formatDate, linesFor, mainLang, translate } from './i18n.js'

export const LangContext = createContext({ mode: DEFAULT_MODE, setMode: () => {} })

/**
 * Hook for components.
 *  - lang: language of the main line ('hi' or 'en') — also drives speech recognition / TTS
 *  - t(key): main-language text, for places that render a <Bi> sub-line themselves
 *  - plain(key): one string for attributes/dialogs that can't hold two lines
 *    ("हिंदी / English" in bilingual mode)
 */
export function useI18n() {
  const { mode, setMode } = useContext(LangContext)
  const lang = mainLang(mode)
  const joined = (hi, en) => {
    const { main, sub } = linesFor(mode, hi, en)
    return sub ? `${main} / ${sub}` : main
  }
  return {
    mode,
    setMode,
    lang,
    t: (key, vars) => translate(lang, key, vars),
    plain: (key, vars) => joined(translate('hi', key, vars), translate('en', key, vars)),
    plainText: joined,
    pick: (hi, en) => linesFor(mode, hi, en).main,
    fmtDate: (iso, today) => formatDate(iso, today, lang),
  }
}

/**
 * Bilingual text. Main line in Hindi (or English in EN mode); in 'हिं + EN' mode a smaller
 * English line sits underneath. Pass a translation key (k + vars) or explicit hi/en text.
 * `always` keeps the English line even in Hindi-only mode (register fields, danger alerts).
 */
export function Bi({ k, vars, hi, en, always = false, inline = false, className = '' }) {
  const { mode } = useContext(LangContext)
  const { main, sub } = linesFor(
    mode,
    hi ?? (k ? translate('hi', k, vars) : ''),
    en ?? (k ? translate('en', k, vars) : ''),
    { alwaysEnglish: always },
  )
  return (
    <span className={`bi ${inline ? 'inline' : ''} ${className}`}>
      <span className="bi-main">{main}</span>
      {/* Screen readers (and accessible names) get "हिंदी / English", not the two lines glued together. */}
      {sub && <span className="sr-only"> / </span>}
      {sub && (
        <span className="bi-sub" lang="en">
          {sub}
        </span>
      )}
    </span>
  )
}

/** "हिं + EN | हिं | EN" segmented toggle for the header. */
export function LangToggle() {
  const { mode, setMode } = useContext(LangContext)
  return (
    <div className="lang-toggle" role="group" aria-label="भाषा / Language">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          className={mode === m ? 'on' : ''}
          onClick={() => setMode(m)}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  )
}
