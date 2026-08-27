import { chromium } from 'playwright'

const dir = '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/dfc5cfca-0911-42e1-8664-f06e86d52eea/scratchpad'
const browser = await chromium.launch()

for (const [name, width, height] of [['desktop', 1440, 2400], ['mobile', 390, 2600]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto('http://localhost:4399/ep', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${dir}/ep-${name}.png`, animations: 'disabled', timeout: 60000 })
  console.log(name, 'errores:', errors.length ? errors : 'ninguno')
  console.log(' estado:', await page.locator('#ep-fase').textContent(), '|', await page.locator('#ep-proximo').textContent())
  console.log(' stats:', await page.locator('#ep-stat-avance').textContent(), await page.locator('#ep-stat-dias').textContent(), await page.locator('#ep-stat-bitacora').textContent())
  await page.close()
}
await browser.close()
