import { entrarALaDemo, expect, test } from './fixtures'
import { E2E } from '../playwright.config'

test('DEBUG alcance de la fuga', async ({ page }) => {
  await entrarALaDemo(page)
  for (const path of ['/admin', '/admin/clients', '/admin/projects', '/admin/costs', '/admin/monitors', '/admin/finances']) {
    await page.goto(path)
    const html = await page.content()
    const n = html.split(E2E.sentinel).length - 1
    console.log(`${path} -> centinela x${n}`)
  }
})
