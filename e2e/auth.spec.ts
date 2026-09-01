import { expect, test } from './fixtures'

// El gate de /admin. Si algo de esto se pone verde por accidente, el panel
// quedó abierto: son los tests que más importa que fallen ruidosamente.

test.describe('gate del panel', () => {
  test('/admin sin sesión redirige al login', async ({ page }) => {
    const res = await page.goto('/admin')
    expect(res?.status()).toBe(200) // 200 del /login final, tras el redirect
    await expect(page).toHaveURL(/\/login\?callbackUrl=/)
  })

  test('las subpáginas del panel también están cerradas', async ({ page }) => {
    for (const path of ['/admin/costs', '/admin/clients', '/admin/security', '/admin/backup']) {
      await page.goto(path)
      await expect(page, path).toHaveURL(/\/login/)
    }
  })

  test('las APIs del panel no responden a anónimos', async ({ request }) => {
    for (const path of ['/api/admin/clients', '/api/admin/costs', '/api/admin/backup']) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect([302, 403], `${path} → ${res.status()}`).toContain(res.status())
    }
  })

  test('escribir en las APIs del panel tampoco', async ({ request }) => {
    const res = await request.post('/api/admin/clients', {
      data: { name: 'intruso' },
      maxRedirects: 0,
    })
    expect([302, 403]).toContain(res.status())
  })

  test('el deck privado no es público', async ({ page }) => {
    await page.goto('/docs/presentacion')
    await expect(page).toHaveURL(/\/login/)
  })

  // Dos sistemas distintos comparten vecindario en la raíz: `/remote` a secas
  // es el mando de `/final.html`, público a propósito, y `/remote/<sessionId>`
  // es el control de las presentaciones con deck, que mueve lo que ve el
  // público y es panel. El middleware los separa por ruta exacta; si esta
  // separación se rompe, se rompe hacia el lado peligroso sin hacer ruido.
  test('el control de presentaciones sigue cerrado aunque /remote esté abierto', async ({
    page,
  }) => {
    for (const path of ['/remote/abc123', '/remote/abc123/', '/remote/x/y']) {
      await page.goto(path)
      await expect(page, path).toHaveURL(/\/login/)
    }
  })

  test('el mando de la presentación sí es público', async ({ page }) => {
    for (const path of ['/remote', '/remote/']) {
      const res = await page.goto(path)
      expect(res?.status(), path).toBe(200)
      await expect(page, path).toHaveURL(/\/remote\/?$/)
    }
  })
})
