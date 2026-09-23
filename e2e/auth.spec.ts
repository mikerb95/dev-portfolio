import { expect, test } from './fixtures'
import { E2E } from '../playwright.config'

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
    // Con barra final también: Astro sirve las dos formas, y el guard exacto
    // del middleware solo reconocía una. La otra servía el deck a cualquiera.
    for (const path of ['/docs/presentacion', '/docs/presentacion/']) {
      await page.goto(path)
      await expect(page, path).toHaveURL(/\/login/)
    }
  })

  // Las rutas de GitHub que usa /admin/repos vivieron en /api/github/, fuera
  // del gate: el GET listaba los repos privados del token y el POST dejaba a
  // cualquiera crear proyectos o cambiar su visibilidad.
  test('las rutas de GitHub del panel están cerradas', async ({ request }) => {
    const lista = await request.get('/api/admin/github/repos', { maxRedirects: 0 })
    expect([302, 403]).toContain(lista.status())

    const toggle = await request.post('/api/admin/github/toggle', {
      data: { slug: 'intruso', visible: true },
      maxRedirects: 0,
    })
    expect([302, 403]).toContain(toggle.status())

    // Y las rutas viejas ya no existen: nada quedó escuchando fuera del gate.
    expect((await request.get('/api/github/repos', { maxRedirects: 0 })).status()).toBe(404)
    expect((await request.post('/api/github/toggle', { data: {}, maxRedirects: 0 })).status()).toBe(404)
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

  // El challenge del login con llave venía de una cookie que escribe el
  // cliente, y el servidor aceptaba el que trajera: con un challenge inventado
  // el request pasaba de largo hasta buscar la llave. Ahora tiene que morir
  // en el challenge, que solo vale si lo emitió el servidor.
  test('el login con llave no acepta un challenge inventado por el cliente', async ({ request }) => {
    // Con `Origin`, como lo manda el navegador: sin él, el checkOrigin de Astro
    // rechaza cualquier POST sin cuerpo antes de llegar al endpoint.
    const opciones = await request.post('/api/auth/webauthn/options', {
      headers: { origin: new URL(E2E.baseURL).origin },
    })
    expect(opciones.status()).toBe(200)

    const cookie = JSON.stringify({ challenge: 'inventado-por-el-cliente', login: '', kind: 'auth' })
    const res = await request.post('/api/auth/webauthn/verify', {
      headers: { cookie: `wan_challenge=${encodeURIComponent(cookie)}` },
      data: { id: 'llave-x', rawId: 'llave-x', type: 'public-key', response: {} },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/challenge/)
  })

  test('el mando de la presentación sí es público', async ({ page }) => {
    for (const path of ['/remote', '/remote/']) {
      const res = await page.goto(path)
      expect(res?.status(), path).toBe(200)
      await expect(page, path).toHaveURL(/\/remote\/?$/)
    }
  })
})
