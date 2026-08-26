import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage()
await p.goto('http://localhost:4400/docs', { waitUntil: 'networkidle' })
const t = await p.locator('main, body').first().innerText()
// Palabras pegadas típicas de la compresión de HTML de Astro
const pegados = [...t.matchAll(/[a-záéíóúñ)](?:\(|\/)?(?:src\/|https?:)|[a-z]\)\w|\wy[A-Za-z]{0,0}/g)].slice(0, 0)
console.log('intro:', t.split('\n').find((l) => l.includes('dev-portfolio')))
await b.close()
