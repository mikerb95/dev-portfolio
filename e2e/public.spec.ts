import { expect, recogerErrores, test } from './fixtures'

// Las páginas públicas renderizan de verdad en un navegador. Cubre lo que el
// build no ve: una query que revienta en SSR, un script que falla, un layout
// que no pinta.

const PAGINAS = [
  { path: '/', titulo: /Ingeniería de software con propósito/i },
  { path: '/lab', titulo: /Laboratorio/i },
  { path: '/status', titulo: /Estado de los/i },
  { path: '/security', titulo: /.+/ },
  { path: '/tools', titulo: /.+/ },
  { path: '/notes', titulo: /.+/ },
  { path: '/demo', titulo: /Entra al panel/i },
  { path: '/contact', titulo: /.+/ },
]

for (const { path, titulo } of PAGINAS) {
  test(`${path} renderiza sin errores`, async ({ page }) => {
    const errores: string[] = []
    page.on('pageerror', (e) => errores.push(String(e)))
    page.on('console', (m) => m.type() === 'error' && errores.push(m.text()))

    const res = await page.goto(path)
    expect(res?.status(), `${path} no devolvió 200`).toBe(200)
    await expect(page.locator('h1').first()).toHaveText(titulo)
    expect(errores, `${path} tuvo errores de consola`).toEqual([])
  })
}

test('/lab publica datos reales del laboratorio', async ({ page }) => {
  await page.goto('/lab')
  await expect(page.locator('text=Pipelines exitosos')).toBeVisible()
  await expect(page.locator('text=Experimentos superados')).toBeVisible()
  // Los experimentos sembrados deben verse agrupados por tipo.
  await expect(page.locator('text=Caída de BD a mitad de una transacción de pago')).toBeVisible()
})

test('/status publica uptime y SLO', async ({ page }) => {
  await page.goto('/status')
  await expect(page.locator('text=Uptime agregado')).toBeVisible()
  await expect(page.locator('text=Objetivo SLO')).toBeVisible()
})

test('el sitemap lista las páginas públicas', async ({ request }) => {
  const res = await request.get('/sitemap.xml')
  expect(res.status()).toBe(200)
  const xml = await res.text()
  for (const path of ['/lab', '/demo', '/status', '/tools']) {
    expect(xml, `sitemap sin ${path}`).toContain(`${path}</loc>`)
  }
})

test('las páginas públicas llevan cabeceras de seguridad', async ({ request }) => {
  const res = await request.get('/')
  const h = res.headers()
  expect(h['content-security-policy']).toContain("default-src 'self'")
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['strict-transport-security']).toContain('max-age=')
})
