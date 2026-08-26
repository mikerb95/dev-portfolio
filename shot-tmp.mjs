import { chromium } from 'playwright'
const OUT = '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/27135fa6-ab89-42e9-aba7-a2b6e7f13a35/scratchpad/'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 2 })
const limpia = () => p.evaluate(() => {
  document.querySelectorAll('astro-dev-toolbar, [class*="fixed"], [style*="position: fixed"]').forEach((n) => n.remove())
})

// 1. Pestaña activa en la ruta que colisionaba por prefijo
await p.goto('http://localhost:4400/docs/casos-de-uso-extendidos', { waitUntil: 'networkidle' })
const activas = await p.$$eval('nav[aria-label="Subpáginas de documentación"] a', (as) =>
  as.filter((a) => a.className.includes('text-cyan')).map((a) => a.textContent.trim()))
console.log('pestañas activas en /docs/casos-de-uso-extendidos:', JSON.stringify(activas))

// 2. Todas las cards del índice resuelven a 200
await p.goto('http://localhost:4400/docs', { waitUntil: 'networkidle' })
const hrefs = await p.$$eval('a[href^="/docs/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))])
const malos = []
for (const h of hrefs) {
  const r = await p.request.get('http://localhost:4400' + h)
  if (r.status() !== 200) malos.push(`${h} -> ${r.status()}`)
}
console.log('enlaces de /docs comprobados:', hrefs.length, '| no-200:', JSON.stringify(malos))

await limpia()
await p.screenshot({ path: OUT + 'docs-index.png', fullPage: false })
await b.close()
