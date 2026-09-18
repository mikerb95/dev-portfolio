import { entrarALaDemo, expect, test } from './fixtures'
import { E2E } from '../playwright.config'

test('DEBUG contexto bajo concurrencia', async ({ page }) => {
  await entrarALaDemo(page)
  // Ocho peticiones a la vez con la misma cookie de pase, que es lo que la
  // corrida en paralelo provoca sin querer.
  const htmls = await Promise.all(
    Array.from({ length: 8 }, () => page.request.get('/admin').then((r) => r.text()))
  )
  htmls.forEach((h, i) => {
    const ctx = h.match(/data-ctx="(\w+)"/)?.[1]
    const loc = h.match(/data-locals="(\w+)"/)?.[1]
    const n = h.split(E2E.sentinel).length - 1
    console.log(`#${i} locals=${loc} contexto=${ctx} centinela=${n}`)
  })
})
