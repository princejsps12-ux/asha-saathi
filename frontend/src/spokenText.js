// Text-to-speech reads Latin abbreviations badly: the hi-IN voice says "FRU" as "फ्लू" (flu).
// forSpeech() rewrites ONLY what is spoken, so abbreviations are spelled out letter by letter
// (and FRU is explained). The text on screen is never changed.

const HINDI = [
  [/\bFRU\b/g, 'एफ़-आर-यू यानी बड़े अस्पताल'],
  [/\bPHC\b/g, 'पी-एच-सी'],
  [/\bCHC\b/g, 'सी-एच-सी'],
  [/\bANM\b/g, 'ए-एन-एम'],
  [/\bANC\b/g, 'ए-एन-सी'],
  [/\bHRP\b/g, 'एच-आर-पी'],
  [/\bIFA\b/g, 'आई-एफ़-ए'],
  [/\bASHA\b/g, 'आशा'],
  [/\bMO\b/g, 'मेडिकल ऑफिसर'],
  [/\bTd\b/g, 'टी-डी'],
  [/\bBP\b/g, 'बी-पी'],
  [/\bHb\b/g, 'हीमोग्लोबिन'],
  [/\bmmHg\b/g, ''],
  [/\bg\/dL\b/g, 'ग्राम'],
  [/°\s?F\b/g, ' डिग्री'],
  [/\s\/\s/g, ' या '], // "बुलाएँ / FRU रेफ़र करें" -> "… या …"
]

const ENGLISH = [
  [/\bFRU\b/g, 'F-R-U, the first referral hospital,'],
  [/\bPHC\b/g, 'P-H-C'],
  [/\bCHC\b/g, 'C-H-C'],
  [/\bANM\b/g, 'A-N-M'],
  [/\bANC\b/g, 'A-N-C'],
  [/\bHRP\b/g, 'H-R-P'],
  [/\bIFA\b/g, 'I-F-A'],
  [/\bASHA\b/g, 'Asha'],
  [/\bMO\b/g, 'medical officer'],
  [/\bTd\b/g, 'T-D'],
  [/\bBP\b/g, 'B-P'],
  [/\b(\d{2,3})\/(\d{2,3})\b/g, '$1 over $2'], // BP 150/100 is read "150 over 100", not "slash"
  [/\bHb\b/g, 'haemoglobin'],
  [/\bmmHg\b/g, 'millimetres of mercury'],
  [/\bg\/dL\b/g, 'grams per decilitre'],
  [/°\s?F\b/g, ' degrees Fahrenheit'],
  [/\s\/\s/g, ' or '], // "Call 108 ambulance / refer to FRU" -> "… or …"
]

/** The version of `text` to hand to speechSynthesis in `lang` ('hi' or 'en'). */
export function forSpeech(text, lang = 'hi') {
  let spoken = String(text || '')
  for (const [pattern, replacement] of lang === 'en' ? ENGLISH : HINDI) spoken = spoken.replace(pattern, replacement)
  return spoken
    .replace(/,\s*([,.?!।])/g, '$1') // "hospital,." -> "hospital."
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
