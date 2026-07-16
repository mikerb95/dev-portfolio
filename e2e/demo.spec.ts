import { entrarALaDemo, expect, test } from './fixtures'
import { E2E } from '../playwright.config'

// Las tres garantías de la demo (ver src/lib/demo.ts):
//  1. Los datos salen de otra base.
//  2. Solo lectura.
//  3. Las rutas sensibles están vetadas aunque sean GET.
// Cada una se verifica por separado: ninguna basta sola.
//
// Las peticiones van por `page.request` y no por el fixture `request`: este
// último corre en otro contexto y no lleva la cookie del pase, con lo que los
// 403 saldrían por falta de sesión y el test pasaría sin probar nada.

test.describe('demo · acceso', () => {
  test('el formulario de /demo abre el panel', async ({ page }) => {
    await entrarALaDemo(page)
    await expect(page.locator('text=Modo demo')).toBeVisible()
  })

  test('sin pasar por /demo el panel sigue cerrado', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('un pase inventado no abre nada', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'demo_session',
        // Caduca en 2100 y la firma es basura: debe rebotar igual.
        value: `4102444800.${'a'.repeat(64)}`,
        url: E2E.baseURL,
      },
    ])
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('el panel en demo tampoco es indexable', async ({ page }) => {
    await entrarALaDemo(page)
    const res = await page.request.get('/admin')
    expect(res.status()).toBe(200)
    expect(res.headers()['x-robots-tag']).toContain('noindex')
  })
})

test.describe('demo · aislamiento de datos', () => {
  test('el panel muestra los datos ficticios', async ({ page }) => {
    await entrarALaDemo(page)
    await page.goto('/admin/clients')
    await expect(page.getByText('Cafetería Altiplano').first()).toBeVisible()
  })

  test('ningún dato de la base principal aparece en la demo', async ({ page }) => {
    await entrarALaDemo(page)

    for (const path of ['/admin', '/admin/clients', '/admin/projects', '/admin/costs', '/admin/monitors']) {
      await page.goto(path)
      const html = await page.content()
      expect(html, `${path} filtró datos de la base principal`).not.toContain(E2E.sentinel)
    }
  })

  test('las páginas públicas leen la base principal, no la demo', async ({ page }) => {
    // Aunque el visitante lleve pase: fuera de /admin la demo no aplica.
    await entrarALaDemo(page)
    await page.goto('/status')
    expect(await page.content()).toContain(E2E.sentinel)
  })
})

test.describe('demo · solo lectura', () => {
  test('ningún método de escritura pasa', async ({ page }) => {
    await entrarALaDemo(page)

    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const res = await page.request[method]('/api/admin/clients', {
        data: { name: 'intruso' },
        maxRedirects: 0,
        failOnStatusCode: false,
      })
      expect(res.status(), `${method.toUpperCase()} debería ser 403`).toBe(403)
    }
  })

  test('los reveladores de credenciales están vetados (y son GET)', async ({ page }) => {
    await entrarALaDemo(page)

    for (const path of ['/api/admin/services/1/secrets', '/api/admin/projects/1/envvars']) {
      const res = await page.request.get(path, { maxRedirects: 0, failOnStatusCode: false })
      expect(res.status(), `${path} debería ser 403`).toBe(403)
    }
  })

  test('backup, passkeys, sesiones y chaos quedan fuera', async ({ page }) => {
    await entrarALaDemo(page)

    for (const path of ['/admin/backup', '/admin/passkeys', '/admin/sessions', '/api/admin/lab/chaos']) {
      const res = await page.request.get(path, { maxRedirects: 0, failOnStatusCode: false })
      expect(res.status(), `${path} debería ser 403`).toBe(403)
    }
  })
})
