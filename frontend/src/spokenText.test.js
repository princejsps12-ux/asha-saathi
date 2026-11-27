import { describe, expect, it } from 'vitest'
import { forSpeech } from './spokenText.js'

// Real strings produced by backend/app/rules.py and summary.py
const EMERGENCY_HI = 'तुरंत 108 एम्बुलेंस बुलाएँ / FRU रेफ़र करें'
const EMERGENCY_EN = 'Call 108 ambulance / refer to FRU now'
const REFER_HI = 'आज ही 24 घंटे वाले PHC / मेडिकल ऑफिसर के पास रेफ़र करें'
const REFER_EN = 'Refer to a 24-hour PHC / medical officer today'
const READBACK_HI =
  'गीता यादव। 8 महीने की गर्भवती। बीपी 150 बटा 112। खतरे का संकेत: बहुत ज़्यादा बीपी। ' +
  `${EMERGENCY_HI}। क्या यह सही है? हाँ या नहीं बोलिए।`
const READBACK_EN =
  'Geeta Yadav. 8 months pregnant. BP 150/112. Hb 9.5 g/dL. Temperature 101 °F. Taking IFA tablets. ' +
  `Td 2nd dose given. Danger sign: Severe high BP. ${EMERGENCY_EN}. Is this correct? Say yes or no.`

describe('read-back spells out abbreviations for text-to-speech', () => {
  it('Hindi: FRU becomes "एफ़-आर-यू यानी बड़े अस्पताल", never left for the voice to say "फ्लू"', () => {
    expect(forSpeech(EMERGENCY_HI, 'hi')).toBe('तुरंत 108 एम्बुलेंस बुलाएँ या एफ़-आर-यू यानी बड़े अस्पताल रेफ़र करें')
    expect(forSpeech(REFER_HI, 'hi')).toBe('आज ही 24 घंटे वाले पी-एच-सी या मेडिकल ऑफिसर के पास रेफ़र करें')
  })
  it('English: FRU becomes "F-R-U, the first referral hospital"; PHC is spelled P-H-C', () => {
    expect(forSpeech(EMERGENCY_EN, 'en')).toBe('Call 108 ambulance or refer to F-R-U, the first referral hospital, now')
    expect(forSpeech(REFER_EN, 'en')).toBe('Refer to a 24-hour P-H-C or medical officer today')
    expect(forSpeech('Go to the FRU.', 'en')).toBe('Go to the F-R-U, the first referral hospital.')
  })
  it('a full Hindi read-back has no Latin abbreviation left for the hi-IN voice', () => {
    const spoken = forSpeech(READBACK_HI, 'hi')
    expect(spoken).toContain('एफ़-आर-यू यानी बड़े अस्पताल')
    expect(spoken).not.toMatch(/[A-Za-z]{2,}/)
  })
  it('a full English read-back spells out every abbreviation and unit', () => {
    const spoken = forSpeech(READBACK_EN, 'en')
    for (const part of [
      'B-P 150 over 112',
      'haemoglobin 9.5 grams per decilitre',
      '101 degrees Fahrenheit',
      'I-F-A tablets',
      'T-D 2nd dose',
      'F-R-U, the first referral hospital',
    ])
      expect(spoken).toContain(part)
    expect(spoken).not.toMatch(/\b(FRU|PHC|IFA|Hb|Td|BP)\b/)
  })
  it('leaves ordinary words and numbers alone (no false matches inside words)', () => {
    expect(forSpeech('FRUIT and PHCs stay; 108 stays', 'en')).toBe('FRUIT and PHCs stay; 108 stays')
    expect(forSpeech('', 'hi')).toBe('')
  })
})
