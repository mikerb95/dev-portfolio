import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const CK = '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/b16c476a-b519-4f71-a86d-43a9456a9d0c/scratchpad/cookies.txt'
// Extraer el token del portal del cookies.txt de curl (formato Netscape)
const line = readFileSync(CK, 'utf8').split('\n').find((l) => l.includes('portal_session'))
const token = line.trim().split('\t').pop()

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } })
await ctx.addCookies([{ name: 'portal_session', value: token, domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
const out = '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/b16c476a-b519-4f71-a86d-43a9456a9d0c/scratchpad'

for (const [name, path] of [['dashboard','/portal'],['factura','/portal/facturas/3'],['login','/portal/login']]) {
  await page.goto(`http://localhost:4333${path}`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${out}/shot-${name}.png`, fullPage: true })
  console.log(`  ${name}: ${await page.title()}`)
}
await browser.close()
