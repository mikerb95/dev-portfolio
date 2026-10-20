import { chromium } from 'playwright'
const OUT = '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/8a4de489-8ff2-4eb2-b592-0abc315278a1/scratchpad/cap'
const browser = await chromium.launch({ args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'] })
const ctx = await browser.newContext({ viewport: { width: 1452, height: 859 } })
await ctx.addInitScript(() => { try { localStorage.setItem('lang-prompt-dismissed', '1') } catch {} })
const page = await ctx.newPage()
await page.goto('http://localhost:4471/', { waitUntil: 'networkidle' })
await page.addStyleTag({ content: '#hero > div.relative, .hero-velo, nav, header, [class*="fantasma"], [class*="halloween"] { opacity: 0 !important }' })
for (let i = 0; i < 5; i++) {
  await page.locator(`[data-paso="${i === 0 ? 1 : 0}"]`).click({ force: true })
  await page.waitForTimeout(300)
  await page.locator(`[data-paso="${i}"]`).click({ force: true })
  await page.mouse.move(5, 845)
  await page.waitForTimeout(2600)
  await page.screenshot({ path: `${OUT}/t${i}.png` })
}
await browser.close()
