import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 })
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
p.on('console', (m) => m.type() === 'error' && errores.push(m.text()))
await p.goto('http://localhost:4400/docs/diagrama-red', { waitUntil: 'networkidle' })
const svg = await p.locator('svg[role="img"]').first()
await svg.screenshot({ path: '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/27135fa6-ab89-42e9-aba7-a2b6e7f13a35/scratchpad/red-diagrama.png' })
await p.screenshot({ path: '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/27135fa6-ab89-42e9-aba7-a2b6e7f13a35/scratchpad/red-pagina.png', fullPage: true })
console.log('errores:', errores.length ? errores : 'ninguno')
await b.close()
