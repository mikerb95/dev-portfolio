import { chromium } from 'playwright'
const OUT = '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/8a4de489-8ff2-4eb2-b592-0abc315278a1/scratchpad/cap'
const URL = process.argv[2] ?? 'http://localhost:4471/'
const browser = await chromium.launch({ args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'] })
const errores = []
async function sesion(nombre, opts, fn) {
  const ctx = await browser.newContext(opts)
  await ctx.addInitScript(() => { try { localStorage.setItem('lang-prompt-dismissed', '1') } catch {} })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errores.push(`${nombre}: ${m.text()}`) })
  page.on('pageerror', (e) => errores.push(`${nombre} pageerror: ${e.message}`))
  await page.goto(URL, { waitUntil: 'networkidle' })
  await fn(page)
  await ctx.close()
}
await sesion('desk', { viewport: { width: 1452, height: 859 } }, async (page) => {
  await page.mouse.move(1400, 50)
  await page.waitForTimeout(2600)
  await page.screenshot({ path: `${OUT}/d0.png` })
  // Clic en cada paso del índice
  for (let i = 1; i < 5; i++) {
    await page.locator(`[data-paso="${i}"]`).click({ force: true })
    await page.mouse.move(1400, 50)
    await page.waitForTimeout(450)
    if (i === 1) await page.screenshot({ path: `${OUT}/d${i}-medio.png` })
    await page.waitForTimeout(2200)
    await page.screenshot({ path: `${OUT}/d${i}.png` })
  }
  // Rotación automática: esperar a que avance solo desde el 4 al 0
  await page.locator('body').click({ position: { x: 1400, y: 20 }, force: true })
  await page.mouse.move(1400, 50)
  const antes = await page.locator('[data-paso][aria-pressed="true"]').getAttribute('data-paso')
  await page.waitForTimeout(7600)
  const despues = await page.locator('[data-paso][aria-pressed="true"]').getAttribute('data-paso')
  console.log('auto', antes, '->', despues)
  const info = await page.evaluate(() => ({
    activos: document.querySelectorAll('.hero-cuadro[data-activo]').length,
    cta: document.querySelector('[data-hero-cta]')?.getAttribute('href'),
    ctaTexto: document.querySelector('[data-hero-cta-texto]')?.textContent,
    ejemplo: document.querySelector('[data-cotizador-ejemplo]')?.textContent,
    inert: [...document.querySelectorAll('.hero-detalle')].map((d) => d.inert),
    scrollW: document.documentElement.scrollWidth,
  }))
  console.log(JSON.stringify(info))
})
await sesion('movil', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, async (page) => {
  await page.waitForTimeout(2600)
  await page.screenshot({ path: `${OUT}/m0.png` })
  await page.locator('[data-paso="3"]').tap({ force: true })
  await page.waitForTimeout(2600)
  await page.screenshot({ path: `${OUT}/m3.png` })
  console.log('movil scrollW', await page.evaluate(() => document.documentElement.scrollWidth))
})
await sesion('reducido', { viewport: { width: 1452, height: 859 }, reducedMotion: 'reduce' }, async (page) => {
  await page.locator('[data-paso="2"]').click({ force: true })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/r2.png` })
})
console.log('errores', JSON.stringify(errores.slice(0, 15), null, 1))
await browser.close()
