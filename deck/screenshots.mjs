// Captures real screenshots of the LIVE app for the pitch deck (phone size, 2x).
// Speech is replaced by a silent stand-in so the run needs no microphone and makes no sound;
// everything else (extraction, rules, read-back text, saving, lists) is the real live server.
//   node screenshots.mjs [baseUrl]
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] || 'https://asha-saathi-0csj.onrender.com'
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = new URL('./img/', import.meta.url).pathname
const REAL_STT = 'सुनीता साहू 7 महीने बीपी 15 बाय 100 पैरों में सूजन है बेबी मूवमेंट काम है अगले हफ्ते फिर आऊंगी'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const fakeSpeech = () => {
  class SilentRecognition {
    start() {}
    stop() { setTimeout(() => this.onend && this.onend(), 50) }
    abort() { this.stop() }
  }
  window.SpeechRecognition = SilentRecognition
  window.webkitSpeechRecognition = SilentRecognition
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      speaking: false, getVoices: () => [], cancel() {},
      speak(u) { setTimeout(() => u.onend && u.onend(), 30) },
    },
  })
}

async function main() {
  await fetch(`${BASE}/api/health`) // wake the free-tier server
  await fetch(`${BASE}/api/demo/reset`, { method: 'POST' })
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage()
  await page.emulate({
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Mobile Safari/537.36',
  })
  await page.evaluateOnNewDocument(fakeSpeech)
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle0' })
  const shot = async (name, el) => {
    const target = el ? await page.$(el) : page
    await target.screenshot({ path: `${OUT}${name}.png` })
    console.log('saved', name)
  }

  await shot('01-home')

  // Try sample (Hindi, danger signs) -> extraction, read-back, waiting for "हाँ"
  await page.click('.sample-chip') // first sample: Hindi, danger signs
  await page.waitForSelector('.confirm-bar', { timeout: 60000 })
  await wait(1500)
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot('02-confirm')
  await page.evaluate(() => document.querySelector('.alerts').scrollIntoView({ block: 'start' }))
  await wait(300)
  await shot('03-alert', '.alerts')
  await shot('04-fields', '.fields')

  // "हाँ" (Yes) -> saved
  await page.click('.btn-yes')
  await page.waitForSelector('.saved-banner', { timeout: 30000 })
  await page.evaluate(() => document.querySelector('.saved-banner').scrollIntoView({ block: 'center' }))
  await wait(300)
  await shot('05-saved')

  // Real browser STT with a mis-heard BP ("150" heard as "15"): typed in, shown as unclear
  await page.evaluate(() => [...document.querySelectorAll('.actions button')].find((b) => b.textContent.includes('New visit'))?.click())
  await page.waitForSelector('.type-in .link')
  await page.click('.type-in .link')
  await page.type('.type-in textarea', REAL_STT)
  await page.click('.type-in button[type=submit]')
  await page.waitForSelector('.field-unclear', { timeout: 30000 })
  await page.evaluate(() => document.querySelector('.field-unclear').scrollIntoView({ block: 'center' }))
  await wait(300)
  await shot('06-bp-unclear')

  // Due-tomorrow list
  await page.evaluate(() => document.querySelectorAll('.tab')[2].click())
  await page.waitForSelector('.people')
  await wait(500)
  await shot('07-due')

  await browser.close()
  await fetch(`${BASE}/api/demo/reset`, { method: 'POST' }) // leave the live demo clean
}

main().catch((err) => { console.error(err); process.exit(1) })
