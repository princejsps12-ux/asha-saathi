// Renders deck.html -> ASHA-Saathi-Pitch.pdf (16:9, one slide per page, real selectable text)
// with the locally installed Chrome, after checking that no slide has cut-off text.
//   npm install && node build.mjs
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const here = new URL('.', import.meta.url).pathname
const OUT = `${here}ASHA-Saathi-Pitch.pdf`

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
await page.goto(`file://${here}deck.html`, { waitUntil: 'networkidle0' })
await page.evaluate(() => document.fonts.ready)

// Layout check: content must not run into the footer, out of the slide, or out of its box.
const problems = await page.evaluate(() => {
  const issues = []
  document.querySelectorAll('.slide').forEach((slide, i) => {
    const box = slide.getBoundingClientRect()
    const foot = slide.querySelector('.foot')?.getBoundingClientRect()
    for (const child of slide.children) {
      if (child.classList.contains('foot')) continue
      const r = child.getBoundingClientRect()
      if (r.bottom > box.bottom || r.right > box.right + 1) issues.push(`slide ${i + 1}: <${child.tagName.toLowerCase()}> leaves the slide`)
      if (foot && r.bottom > foot.top - 2) issues.push(`slide ${i + 1}: <${child.tagName.toLowerCase()}.${child.className}> overlaps the footer`)
    }
    slide.querySelectorAll('p, li, td, th, b, span, div').forEach((el) => {
      if (el.closest('.frame')) return
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') {
        issues.push(`slide ${i + 1}: text cut off in "${el.textContent.trim().slice(0, 40)}"`)
      }
    })
    if (foot && foot.bottom > box.bottom) issues.push(`slide ${i + 1}: footer cut off`)
  })
  return issues
})
if (problems.length) {
  console.error('Layout problems:\n' + problems.join('\n'))
  await browser.close()
  process.exit(1)
}

await page.pdf({ path: OUT, width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true })
await browser.close()
console.log(`OK: ${OUT}`)
