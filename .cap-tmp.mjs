// Capturas de la portada en los dos temas. Uso: node cap.mjs <tema> <ancho> [seccion...]
import { chromium } from 'playwright'
const [tema = 'claro', ancho = '1440', ...solo] = process.argv.slice(2)
const out = '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/f1884f35-b550-481c-9dcf-31327ecd63a4/scratchpad/'
const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: +ancho, height: +ancho < 600 ? 800 : 900 }, colorScheme: tema === 'claro' ? 'light' : 'dark', reducedMotion: 'reduce' })
const p = await ctx.newPage()
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
p.on('console', (m) => m.type() === 'error' && errores.push(m.text()))
await p.goto('http://localhost:4517/', { waitUntil: 'networkidle', timeout: 90000 })
await p.waitForTimeout(1500)
console.log('data-tema =', await p.evaluate(() => document.documentElement.dataset.tema ?? '(sin atributo)'))
const ids = solo.length ? solo : await p.evaluate(() => ['hero', ...Array.from(document.querySelectorAll('main > section[id]')).map((s) => s.id).filter((i) => i !== 'hero'), 'footer'])
for (const id of ids) {
  const sel = id === 'footer' ? 'footer' : `#${id}`
  const el = p.locator(sel).first()
  if (!(await el.count())) continue
  await el.scrollIntoViewIfNeeded()
  await p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'start' }), sel)
  await p.waitForTimeout(900)
  await p.screenshot({ path: `${out}${tema}-${ancho}-${id}.png` })
  console.log('ok', id)
}
if (errores.length) console.log('ERRORES', errores.slice(0, 8))
await b.close()
