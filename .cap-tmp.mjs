import { chromium } from '@playwright/test'
import { encode } from '@auth/core/jwt'
const OUT = process.argv[2]
const BASE = 'http://localhost:4337'
const COOKIE = 'authjs.session-token'
const token = await encode({ token: { name: 'nadie-e2e', sub: 'cap', login: 'nadie-e2e', sid: 'cap-' + Date.now(), authTime: Date.now() }, secret: 'e2e-auth-secret-no-usado-en-produccion-0123456789', salt: COOKIE })
const browser = await chromium.launch({ args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] })
const errores = []
async function pagina(opts) {
  const ctx = await browser.newContext(opts)
  await ctx.addCookies([{ name: COOKIE, value: token, url: BASE, httpOnly: true }])
  const p = await ctx.newPage()
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()))
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto(BASE + '/admin/analista', { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  return p
}
const modo = process.argv[3]
if (modo === 'escritorio') {
  const p = await pagina({ viewport: { width: 1440, height: 900 } })
  await p.screenshot({ path: `${OUT}/01-reposo.png` })
  await p.waitForTimeout(1300); await p.screenshot({ path: `${OUT}/02-reposo-pulso.png`, clip: { x: 0, y: 100, width: 640, height: 500 } })
  await p.click('summary:has-text("Datos reales")'); await p.waitForTimeout(500)
  await p.screenshot({ path: `${OUT}/03-chip-datos.png`, clip: { x: 640, y: 0, width: 800, height: 420 } })
  await p.click('summary:has-text("Pagado con")'); await p.waitForTimeout(1100)
  await p.screenshot({ path: `${OUT}/04-chip-pagado.png`, clip: { x: 640, y: 0, width: 800, height: 420 } })
  await p.click('summary:has-text("nunca ve una IP")'); await p.waitForTimeout(250)
  await p.screenshot({ path: `${OUT}/05a-chip-ip-descifrando.png`, clip: { x: 640, y: 0, width: 800, height: 420 } })
  await p.waitForTimeout(900)
  await p.screenshot({ path: `${OUT}/05b-chip-ip.png`, clip: { x: 640, y: 0, width: 800, height: 420 } })
  const abiertas = await p.evaluate(() => [...document.querySelectorAll('.chip-detalle')].filter((d) => d.open).length)
  await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  const trasEscape = await p.evaluate(() => [...document.querySelectorAll('.chip-detalle')].filter((d) => d.open).length)
  console.log('chips abiertos a la vez:', abiertas, '· tras Escape:', trasEscape)
  for (const n of ['1', '2', '3']) await p.click(`.paso-intro summary:has(.num:text-is("${n}"))`)
  await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}/06a-pasos-abriendo.png` })
  await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/06b-pasos-abiertos.png` })
  console.log('ancho', await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]))
  await p.click('.sugerencia >> nth=0')
  for (let i = 0; i < 12; i++) { await p.waitForTimeout(1000); await p.screenshot({ path: `${OUT}/07-recorrido-${String(i).padStart(2, '0')}.png`, clip: { x: 0, y: 90, width: 720, height: 720 } }) }
  await p.screenshot({ path: `${OUT}/08-final.png` })
}
if (modo === 'movil') {
  const p = await pagina({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await p.screenshot({ path: `${OUT}/10-movil.png`, fullPage: true })
  await p.tap('summary:has-text("nunca ve una IP")'); await p.waitForTimeout(1200)
  await p.screenshot({ path: `${OUT}/11-movil-chip.png`, fullPage: true })
  console.log('movil ancho', await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]))
}
if (modo === 'reducido') {
  const p = await pagina({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  for (const n of ['1', '2', '3']) await p.click(`.paso-intro summary:has(.num:text-is("${n}"))`)
  await p.click('summary:has-text("nunca ve una IP")'); await p.waitForTimeout(100)
  await p.screenshot({ path: `${OUT}/20-reducido.png` })
}
console.log('errores:', errores.length ? errores : 'ninguno')
await browser.close()
