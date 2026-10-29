import { encode } from '@auth/core/jwt'
import { randomUUID } from 'node:crypto'
import { E2E } from '../playwright.config'
import { expect, ipDePrueba, recogerErrores, test } from './fixtures'

const COOKIE = 'authjs.session-token'

test('la wiki se lee dentro del panel y no fuera de él', async ({ page, browser }) => {
  await page.context().setExtraHTTPHeaders(ipDePrueba())

  // Sin sesión, la wiki es /admin como cualquier otra: al login.
  await page.goto('/admin/wiki')
  await expect(page).toHaveURL(/\/login/)

  const context = await browser.newContext({ baseURL: E2E.baseURL })
  const login = 'nadie-e2e'
  const token = await encode({
    token: { name: login, sub: 'e2e-wiki', login, sid: `e2e-wiki-${randomUUID()}`, authTime: Date.now() },
    secret: E2E.authSecret,
    salt: COOKIE,
  })
  await context.addCookies([{ name: COOKIE, value: token, url: E2E.baseURL, httpOnly: true }])
  await context.setExtraHTTPHeaders(ipDePrueba())
  const panel = await context.newPage()
  const errores = recogerErrores(panel)

  await panel.goto('/admin/wiki')
  // El título lo pinta el layout; el h1 del markdown no se repite en el cuerpo.
  await expect(panel.getByRole('heading', { level: 1, name: 'Wiki de codebymike.net' })).toBeVisible()
  await expect(panel.locator('article h1')).toHaveCount(0)

  // Un enlace entre páginas se queda en el panel, con su ancla; los enlaces al
  // código salen a GitHub, que es donde se pueden leer.
  await panel.goto('/admin/wiki/07-autenticacion-y-accesos')
  await expect(panel.getByRole('heading', { level: 1, name: /Autenticación y accesos/ })).toBeVisible()
  const interno = panel.locator('.prose-wiki a[href="/admin/wiki/08-seguridad-micro-siem#4-rate-limiting"]')
  await expect(interno).toHaveCount(1)
  await expect(panel.locator('.prose-wiki a[href$="/blob/main/src/middleware.ts"]')).toHaveCount(1)
  await expect(panel.locator('.prose-wiki table').first()).toBeAttached()

  await panel.goto('/admin/wiki/08-seguridad-micro-siem#4-rate-limiting')
  await expect(panel.locator('[id="4-rate-limiting"]')).toHaveCount(1)

  // Antes del 404 a propósito, que el navegador anota como error de consola.
  expect(errores).toEqual([])

  const res = await panel.goto('/admin/wiki/no-existe')
  expect(res?.status()).toBe(404)
  await context.close()
})
