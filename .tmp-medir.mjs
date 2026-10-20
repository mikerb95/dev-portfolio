import { chromium } from 'playwright'
const browser = await chromium.launch({ args: ['--use-angle=gl-egl'] })
const page = await browser.newPage({ viewport: { width: 1452, height: 859 } })
await page.goto('http://localhost:4471/', { waitUntil: 'networkidle' })
console.log(await page.evaluate(() => { const r = document.getElementById('isolineas').getBoundingClientRect(); const t = document.querySelector('[data-hero-titular]').getBoundingClientRect(); const c = document.getElementById('cotizador').getBoundingClientRect(); return { lienzo: [r.width, r.height], titular: [t.left, t.top, t.right, t.bottom], cot: [c.left, c.top, c.right, c.bottom] } }))
await browser.close()
