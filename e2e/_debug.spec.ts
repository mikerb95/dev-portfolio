import { entrarALaDemo, expect, test } from './fixtures'
import { E2E } from '../playwright.config'

test('DEBUG vigila con navegación real', async ({ page }) => {
  await entrarALaDemo(page)
  for (let i = 0; i < 20; i++) {
    await page.goto('/admin')
    const h = await page.content()
    const ctx = h.match(/data-ctx="(\w+)"/)?.[1]
    const loc = h.match(/data-locals="(\w+)"/)?.[1]
    const n = h.split(E2E.sentinel).length - 1
    if (n > 0 || ctx !== 'true') console.log(`FUGA #${i} locals=${loc} contexto=${ctx} centinela=${n}`)
  }
  console.log('vigilancia terminada')
})
