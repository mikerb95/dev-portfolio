import { encode } from '@auth/core/jwt'
import { createClient } from '@libsql/client'
import { randomUUID } from 'node:crypto'
import { E2E } from '../playwright.config'
import { expect, test } from './fixtures'

test.use({ launchOptions: { args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'] }, viewport: { width: 1440, height: 1000 } })
const db = createClient({ url: E2E.mainDbUrl })

test('captura', async ({ page, context }) => {
  test.setTimeout(180_000)
  const token = await encode({ token: { name: 'nadie-e2e', sub: 'x', login: 'nadie-e2e', sid: `cap-${randomUUID()}`, authTime: Date.now() }, secret: E2E.authSecret, salt: 'authjs.session-token' })
  await context.addCookies([{ name: 'authjs.session-token', value: token, url: E2E.baseURL, httpOnly: true }])
  await db.execute('PRAGMA busy_timeout = 5000')
  await db.execute(`DELETE FROM clients WHERE name = 'Cliente E2E Asistente'`)
  await db.execute({ sql: 'INSERT INTO clients (name, created_at) VALUES (?, ?)', args: ['Cliente E2E Asistente', Math.floor(Date.now() / 1000)] })
  await page.goto('/admin')
  await page.waitForTimeout(3000)
  await page.reload()
  await page.waitForLoadState('networkidle')
  const fps = await page.evaluate(() => new Promise<number>((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n) }; requestAnimationFrame(f); setTimeout(() => r(n), 2500) }))
  console.log('fps', fps)
  await page.screenshot({ path: '.tmp/dash-1.png', timeout: 20_000 })
  await page.locator('#asis-input').fill('dominios')
  await page.waitForTimeout(800)
  await page.screenshot({ path: '.tmp/dash-2.png', timeout: 20_000 })
  await page.locator('#asis-input').fill('Ayúdame a crear una cuenta de cobro para Cliente E2E Asistente')
  await page.locator('#asis-input').press('Enter')
  await expect(page.locator('.turno-tarjeta')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(800)
  await page.locator('.turno').first().screenshot({ path: '.tmp/dash-3.png', timeout: 20_000 })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: '.tmp/dash-4.png', fullPage: false, timeout: 20_000 })
})
