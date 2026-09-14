import { entrarALaDemo, expect, test } from './fixtures'
import { E2E } from '../playwright.config'

test('DEBUG dónde filtra /admin', async ({ page }) => {
  await entrarALaDemo(page)
  await page.goto('/admin')
  const html = await page.content()
  let i = html.indexOf(E2E.sentinel)
  let n = 0
  while (i !== -1 && n < 3) {
    console.log('--- ocurrencia', n, '---')
    console.log(html.slice(Math.max(0, i - 400), i + 120).replace(/\s+/g, ' '))
    i = html.indexOf(E2E.sentinel, i + 1)
    n++
  }
  console.log('ocurrencias totales:', html.split(E2E.sentinel).length - 1)
})
