// What a judge does first: open the app on a phone-sized screen, tap a sample chip, then "हाँ ✓ Yes".
// CI has no microphone, so speech is replaced by a silent stand-in; everything else is the real app.
//   node judge-check.mjs http://localhost:8000
import puppeteer from 'puppeteer-core'

const URL = process.argv[2] || 'http://localhost:8000'
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const problems = []

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
await page.evaluateOnNewDocument(() => {
  class Silent {
    start() {}
    stop() {
      setTimeout(() => this.onend?.(), 50)
    }
    abort() {
      this.stop()
    }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = Silent
  Object.defineProperty(window, 'speechSynthesis', {
    value: { speaking: false, getVoices: () => [], cancel() {}, speak: (u) => setTimeout(() => u.onend?.(), 30) },
  })
})
page.on('console', (m) => ['error', 'warn'].includes(m.type()) && problems.push(`console.${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 })
await page.waitForSelector('.sample-chip', { timeout: 30000 })
const chips = await page.$$eval('.sample-chip', (c) => c.map((x) => x.innerText.replace(/\s+/g, ' ')))
console.log('main screen loaded; sample chips:', chips)
if (chips.length !== 4) problems.push(`expected 4 sample chips, found ${chips.length}`)

await page.click('.sample-chip') // Danger signs · Hindi
await page.waitForSelector('.btn-yes', { timeout: 30000 })
const bp = await page.$$eval('.field-row', (rows) => rows.map((r) => r.innerText).find((t) => /BP/.test(t)) || '')
const red = await page.$('.alerts-red')
console.log('after the chip:', bp.replace(/\s+/g, ' '), '| red alert shown:', Boolean(red))
if (!bp.includes('142/92')) problems.push('BP 142/92 was not extracted from the sample')
if (!red) problems.push('no red danger alert for the danger-signs sample')

await page.click('.btn-yes')
await page.waitForSelector('.saved-banner', { timeout: 30000 })
console.log('after Yes:', (await page.$eval('.saved-banner', (e) => e.innerText)).replace(/\s+/g, ' '))
await browser.close()

if (problems.length) {
  console.error('FAILED:\n' + problems.join('\n'))
  process.exit(1)
}
console.log('PASS: main screen, sample chip, danger alert and save all work')
