import { describe, expect, it } from 'vitest'
import { PAUSE_MS, createEndDetector, endCommandIn, stripEndCommand } from './dictation.js'

const NOTE = 'सुनीता साहू सात महीने बीपी 150 बाय 100 अगले हफ्ते फिर आऊंगी'

describe('end commands: "बस" / "हो गया"', () => {
  it('recognises the commands in Devanagari and Roman', () => {
    expect(endCommandIn('हो गया')).toBe('हो गया')
    expect(endCommandIn('हो गया।')).toBe('हो गया')
    expect(endCommandIn('ho gaya')).toBe('ho gaya')
    expect(endCommandIn('बस')).toBe('बस')
    expect(endCommandIn(`${NOTE} बस`)).toBe('बस')            // at the end of a phrase
    expect(endCommandIn(`${NOTE}, बस हो गया`)).toBe('बस हो गया')
    expect(endCommandIn('Done')).toBe('done')
  })
  it('does not fire on ordinary sentences that contain the same words', () => {
    expect(endCommandIn('टीडी का दूसरा टीका हो गया')).toBeNull() // "the vaccine is done"
    expect(endCommandIn('बस से आई थी')).toBeNull()                // "came by bus"
    expect(endCommandIn('sujan bas thodi si hai')).toBeNull()
    expect(endCommandIn('')).toBeNull()
  })
  it('strips only the command from the transcript', () => {
    expect(stripEndCommand(`${NOTE} हो गया`, 'हो गया')).toBe(NOTE)
    expect(stripEndCommand(`${NOTE}। बस।`, 'बस')).toBe(NOTE)
    expect(stripEndCommand('टीका हो गया', null)).toBe('टीका हो गया') // no command: nothing removed
  })
})

describe('createEndDetector — "हो गया" counts only as its own phrase after a pause', () => {
  const clock = () => { let t = 0; return { now: () => t, wait: (ms) => { t += ms } } }

  it('"…आऊंगी" (pause) "हो गया" -> finish', () => {
    const c = clock()
    const d = createEndDetector(c.now)
    expect(d.update(NOTE)).toBeNull()
    c.wait(PAUSE_MS + 300)
    expect(d.update(`${NOTE} हो गया`)).toBe('हो गया')
  })
  it('"…टीका हो गया" said in one go -> keep listening', () => {
    const c = clock()
    const d = createEndDetector(c.now)
    d.update('टीडी का दूसरा')
    c.wait(300)
    expect(d.update('टीडी का दूसरा टीका हो गया')).toBeNull()
  })
  it('a trailing "बस" finishes even without a pause', () => {
    const c = clock()
    const d = createEndDetector(c.now)
    d.update(NOTE)
    c.wait(200)
    expect(d.update(`${NOTE} बस`)).toBe('बस')
  })
})
