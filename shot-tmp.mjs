import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage()
const SOSPECHOSO = /[a-záéíóúñ]{2}(src\/|https?:)/g
for (const r of ['','diagrama-actividades','diagrama-componentes','diagrama-comunicacion','pipeline-en-vivo','diagrama-red','diagrama-despliegue']) {
  await p.goto('http://localhost:4400/docs/' + r, { waitUntil: 'domcontentloaded' })
  const t = await p.locator('body').innerText()
  const hits = [...new Set([...t.matchAll(SOSPECHOSO)].map((m) => t.slice(Math.max(0, m.index - 20), m.index + 26).replace(/\n/g, ' ')))]
  console.log((r || 'index').padEnd(24), hits.length ? '⚠ ' + hits.join(' | ') : 'limpio')
}
await b.close()
