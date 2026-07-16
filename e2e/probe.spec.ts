import { expect, test } from './fixtures'
test('probe', async ({ page }) => {
  const errs: string[] = []
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e)))
  await page.goto('/lab')
  await page.waitForTimeout(1500)
  console.log('ERRORES:', JSON.stringify(errs, null, 1))
  console.log('H1 home-lab:', await page.locator('h1').first().innerText())
  await page.goto('/')
  console.log('H1 home:', await page.locator('h1').first().innerText())
})
