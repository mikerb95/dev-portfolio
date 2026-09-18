import { entrarALaDemo, expect, test } from './fixtures'
import { E2E } from '../playwright.config'

test('DEBUG vigila la fuga mientras el resto corre', async ({ page }) => {
  await entrarALaDemo(page)
  for (let i = 0; i < 25; i++) {
    const h = await page.request.get('/admin').then((r) => r.text())
    const ctx = h.match(/data-ctx="(\w+)"/)?.[1]
    const loc = h.match(/data-locals="(\w+)"/)?.[1]
    const n = h.split(E2E.sentinel).length - 1
    if (n > 0 || ctx !== 'true') console.log(`FUGA #${i} locals=${loc} contexto=${ctx} centinela=${n}`)
    await page.waitForTimeout(300)
  }
  console.log('vigilancia terminada')
})
