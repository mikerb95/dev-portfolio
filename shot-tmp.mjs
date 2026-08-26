import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage()
const activas = async (url) => {
  await p.goto(url, { waitUntil: 'networkidle' })
  return p.$$eval('nav[aria-label="Subpáginas de documentación"] a', (as) =>
    as.filter((a) => a.className.includes('text-cyan')).map((a) => a.textContent.trim()))
}
for (const r of ['/docs', '/docs/casos-de-uso', '/docs/casos-de-uso-extendidos', '/docs/diagrama-red', '/docs/testing', '/docs/usability-testing']) {
  console.log(r.padEnd(32), JSON.stringify(await activas('http://localhost:4400' + r)))
}
await b.close()
