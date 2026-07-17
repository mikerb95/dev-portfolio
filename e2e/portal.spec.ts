import { expect, ipDePrueba, test } from './fixtures'

// Portal de clientes: el gate, la demo pública y el flujo de pago de punta a
// punta. Los datos salen de scripts/seed-demo.mjs (cliente Altiplano con
// portal habilitado, 3 facturas semilla) sembrado en AMBAS bases e2e — la
// demo pública siempre entra por TURSO_DEMO_URL, nunca por la principal.

test.describe('portal · gate', () => {
  test('/portal sin sesión redirige al login', async ({ page }) => {
    await page.goto('/portal')
    await expect(page).toHaveURL(/\/portal\/login/)
  })

  test('las subpáginas también están cerradas', async ({ page }) => {
    for (const path of ['/portal/facturas', '/portal/mensajes', '/portal/documentos', '/portal/cuenta']) {
      await page.goto(path)
      await expect(page, path).toHaveURL(/\/portal\/login/)
    }
  })

  test('las APIs no responden a anónimos', async ({ page }) => {
    const res = await page.request.get('/api/portal/cuenta/perfil', { headers: ipDePrueba() })
    expect(res.status()).toBe(401)
  })

  test('el portal no es indexable', async ({ page }) => {
    const res = await page.request.get('/portal/login', { headers: ipDePrueba() })
    expect(res.headers()['x-robots-tag']).toContain('noindex')
  })
})

test.describe('portal · demo pública', () => {
  // La demo es UNA base compartida por todos los workers (no se recrea por
  // test, a diferencia del resto de la suite). El test de pago la MUTA
  // (factura 2 pasa a 'paid'): en serie para que ningún otro test de este
  // bloque la lea a mitad de esa transición.
  test.describe.configure({ mode: 'serial' })

  test('el botón de /tools abre la demo sin credenciales', async ({ page }) => {
    await page.goto('/tools')
    await page.getByRole('link', { name: 'Probar el portal demo' }).click()
    await expect(page).toHaveURL(/\/portal$/)
    await expect(page.getByText('Demo pública')).toBeVisible()
  })

  test('muestra los datos ficticios del cliente sembrado', async ({ page }) => {
    await page.goto('/api/portal/demo')
    await expect(page).toHaveURL(/\/portal$/)
    await expect(page.getByText('Portal de pedidos Altiplano')).toBeVisible()

    await page.goto('/portal/facturas')
    await expect(page.getByText('INV-2026-101')).toBeVisible()
  })

  test('es de solo lectura: invitar y escribir mensajes se rechazan', async ({ page }) => {
    await page.goto('/api/portal/demo')

    const invite = await page.request.post('/api/portal/cuenta/equipo', {
      data: { email: 'quien-sea@ejemplo.com', role: 'owner' },
    })
    expect(invite.status()).toBe(403)

    const message = await page.request.post('/api/portal/mensajes', {
      data: { subject: 'x', body: 'y' },
    })
    expect(message.status()).toBe(403)
  })

  test('la única mutación permitida completa el pago de la factura de ejemplo', async ({ page }) => {
    await page.goto('/api/portal/demo')

    // Por los botones reales, no por page.request: ese cliente HTTP de
    // Playwright no reproduce fielmente los headers que pone un fetch() del
    // navegador (en particular el Content-Type), y aquí eso SÍ importa — la
    // protección CSRF de Astro decide por ese header.
    await page.goto('/portal/facturas/2')
    await page.getByRole('button', { name: 'Pagar ahora' }).click()
    await page.waitForURL(/\/simular\?ref=/)

    await page.getByRole('button', { name: 'Simular pago aprobado' }).click({ force: true })
    await page.waitForURL(/\/portal\/facturas\/2\?pagada=1/)
    await expect(page.getByText('Factura pagada')).toBeVisible()
  })

  test('un pase inventado no abre nada', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'portal_demo_pass',
        value: `4102444800.${'a'.repeat(64)}`,
        url: 'http://localhost:4331',
      },
    ])
    await page.goto('/portal')
    await expect(page).toHaveURL(/\/portal\/login/)
  })
})
