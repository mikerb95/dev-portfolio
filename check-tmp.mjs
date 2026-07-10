import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (msg) => console.log('PAGE LOG:', msg.text()))
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))
await page.goto('http://localhost:4322/engineering', { waitUntil: 'networkidle' })

const card = await page.$('[data-pop-id="vital-LCP"]')
const box1 = await card.boundingBox()
await card.hover()
await page.waitForTimeout(400)
const panel = await page.$('#vital-LCP-panel')
const visible = await panel.isVisible()
const text = await panel.innerText()
console.log('Panel visible:', visible)
console.log('Panel text:\n', text)

const box2 = await card.boundingBox()
console.log('Card box before/after hover same position?', JSON.stringify(box1) === JSON.stringify(box2))

// Check CI + uptime panels
await page.mouse.move(0,0)
await page.waitForTimeout(300)
const ci = await page.$('[data-pop-id="ci-pipeline"]')
await ci.hover()
await page.waitForTimeout(400)
const ciPanel = await page.$('#ci-pipeline-panel')
console.log('CI panel text:\n', await ciPanel.innerText())

await page.mouse.move(0,0)
await page.waitForTimeout(300)
const up = await page.$('[data-pop-id="uptime"]')
await up.hover()
await page.waitForTimeout(400)
const upPanel = await page.$('#uptime-panel')
console.log('Uptime panel text:\n', await upPanel.innerText())

await page.screenshot({ path: '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/bfe449a5-c78e-4c89-9110-263aaccbea19/scratchpad/hover.png' })

await browser.close()
