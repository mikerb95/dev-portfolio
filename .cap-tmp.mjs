// Página completa en trozos. Uso: node .cap-tmp.mjs <ruta> <tema> <ancho> <prefijo>
import { chromium } from 'playwright'
const S = '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/f1884f35-b550-481c-9dcf-31327ecd63a4/scratchpad/'
const [ruta, tema = 'claro', ancho = '1440', pref = 'p'] = process.argv.slice(2)
const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] })
const alto = +ancho < 600 ? 844 : 900
const ctx = await b.newContext({ viewport: { width: +ancho, height: alto }, colorScheme: tema === 'claro' ? 'light' : 'dark', locale: 'es-CO', reducedMotion: 'reduce' })
const p = await ctx.newPage()
const err = []
p.on('pageerror', (e) => err.push(String(e)))
await p.addInitScript(() => { try { localStorage.setItem('lang-suggest-dismissed', '1') } catch {} })
await p.goto('http://localhost:4517' + ruta, { waitUntil: 'networkidle', timeout: 90000 })
await p.waitForTimeout(1200)
const total = await p.evaluate(() => document.documentElement.scrollHeight)
const tema2 = await p.evaluate(() => document.documentElement.dataset.tema ?? 'oscuro')
let i = 0
for (let y = 0; y < total && i < 14; y += alto - 80, i++) {
  await p.evaluate((y) => window.scrollTo(0, y), y)
  await p.waitForTimeout(700)
  await p.screenshot({ path: `${S}${pref}-${String(i).padStart(2, '0')}.png` })
}
console.log(ruta, 'tema', tema2, 'alto', total, 'trozos', i, 'desborde', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), err.length ? err.slice(0, 4) : '')
await b.close()
