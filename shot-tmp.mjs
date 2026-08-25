import { chromium } from 'playwright'
const OUT = '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/27135fa6-ab89-42e9-aba7-a2b6e7f13a35/scratchpad/'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1700, height: 1400 }, deviceScaleFactor: 2 })
await p.goto('http://localhost:4400/docs/diagrama-red', { waitUntil: 'networkidle' })
const svg = p.locator('svg[role="img"]').first()
await svg.screenshot({ path: OUT + 'red-full.png' })
// Recorte de la mitad superior para comprobar el sentido de las puntas de flecha
const caja = await svg.boundingBox()
await p.screenshot({ path: OUT + 'red-zoom.png', clip: { x: caja.x, y: caja.y, width: caja.width, height: 420 } })
console.log('svg', caja.width, 'x', caja.height)
await b.close()
