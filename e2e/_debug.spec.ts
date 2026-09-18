import { readFileSync, writeFileSync } from 'node:fs'
import { entrarALaDemo, expect, test } from './fixtures'
import { E2E } from '../playwright.config'

// Reproduce la condición del 14 sep: otra sesión editando fuentes mientras la
// suite corre, con el dev server recargando módulos por debajo.
test('DEBUG fuga con recarga de modulos', async ({ page }) => {
  test.setTimeout(180_000)
  const ruta = 'src/db/index.ts'
  const original = readFileSync(ruta, 'utf8')
  let fugas = 0
  try {
    await entrarALaDemo(page)
    for (let i = 0; i < 20; i++) {
      writeFileSync(ruta, `${original}\n// toque ${i}\n`)
      await page.waitForTimeout(400)
      const h = await page.request.get('/admin').then((r) => r.text())
      const n = h.split(E2E.sentinel).length - 1
      if (n > 0) {
        fugas++
        console.log(`FUGA en la iteracion ${i}: centinela x${n}`)
      }
    }
  } finally {
    writeFileSync(ruta, original)
  }
  console.log(`total fugas: ${fugas} de 20`)
})
