import { describe, expect, it } from 'vitest'
import { hasVisitDetails } from './visitFields.js'

const EMPTY = { beneficiary_id: null, beneficiary_name_heard: 'hello', symptoms: [], bp_unclear: false }

describe('hasVisitDetails', () => {
  it('is false for chatter with no visit details ("hello")', () => {
    expect(hasVisitDetails(EMPTY)).toBe(false)
    expect(hasVisitDetails(null)).toBe(false)
  })

  it('is true for a known woman, any detail, a symptom or an unclear BP', () => {
    expect(hasVisitDetails({ ...EMPTY, beneficiary_id: 3 })).toBe(true)
    expect(hasVisitDetails({ ...EMPTY, pregnancy_month: 6 })).toBe(true) // a new woman: "Anita Devi 6 mahine"
    expect(hasVisitDetails({ ...EMPTY, symptoms: ['bleeding'] })).toBe(true)
    expect(hasVisitDetails({ ...EMPTY, bp_unclear: true })).toBe(true)
    expect(hasVisitDetails({ ...EMPTY, ifa_taking: false })).toBe(true) // "not taking iron" is a detail too
  })
})
