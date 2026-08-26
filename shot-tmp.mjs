import { chromium } from 'playwright'
const OUT = '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/27135fa6-ab89-42e9-aba7-a2b6e7f13a35/scratchpad/'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 2 })
await p.goto('http://localhost:4400/docs', { waitUntil: 'networkidle' })
await p.evaluate(() => {
  document.querySelectorAll('astro-dev-toolbar, [class*="fixed"], [style*="position: fixed"]').forEach((n) => n.remove())
})
// La rejilla de subpáginas, que es donde entró la card de paquetes
const card = await p.locator('a[href="/docs/diagrama-red"]').first()
await card.scrollIntoViewIfNeeded()
await p.screenshot({ path: OUT + 'docs-cards.png' })
await b.close()
