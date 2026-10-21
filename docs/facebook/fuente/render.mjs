// Genera las imágenes de docs/facebook/imagenes desde piezas.html.
// Uso (desde la raíz del repo): node docs/facebook/fuente/render.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const html = new URL('./piezas.html', import.meta.url).href
const salida = fileURLToPath(new URL('../imagenes/', import.meta.url))

// Sin GPU, Chromium headless no pinta bien los desenfoques del fondo.
const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--allow-file-access-from-files'] })
const p = await b.newPage({ viewport: { width: 1700, height: 1400 } })
await p.goto(html)
await p.evaluate(() => document.fonts.ready)
for (const id of await p.$$eval('.frame', els => els.map(e => e.id))) {
  await p.locator(`[id="${id}"]`).screenshot({ path: `${salida}${id}.png` })
  console.log(id)
}
await b.close()
