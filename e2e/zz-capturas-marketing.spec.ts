import { encode } from '@auth/core/jwt'
import { createClient } from '@libsql/client'
import { randomUUID } from 'node:crypto'
import { E2E } from '../playwright.config'
import { test } from './fixtures'

test.use({ launchOptions: { args: ['--use-angle=gl-egl'] }, viewport: { width: 1440, height: 1000 } })
const db = createClient({ url: E2E.mainDbUrl })

test('capturas', async ({ page, browser }) => {
  test.setTimeout(120_000)
  await db.execute('PRAGMA busy_timeout = 5000')
  for (const [e, n, o, est] of [['ana@empresa.co', 'Ana', 'formulario', 'activo'], ['luis@tienda.co', 'Luis', 'contacto', 'activo'], ['carla@estudio.co', null, 'portal', 'activo'], ['pedro@x.co', null, 'formulario', 'pendiente']] as const) {
    await db.execute({ sql: `INSERT OR IGNORE INTO marketing_suscriptores (email, nombre, origen, estado, texto_consentimiento, creado, confirmado) VALUES (?, ?, ?, ?, 'ok', 1791300000, 1791300000)`, args: [e, n, o, est] })
  }
  await page.goto('/novedades')
  await page.screenshot({ path: '/tmp/resend-tools/cap-novedades.png', fullPage: true })
  await page.goto('/contact')
  await page.locator('#contact-form').scrollIntoViewIfNeeded()
  await page.locator('#contact-form').screenshot({ path: '/tmp/resend-tools/cap-contact.png' })

  const ctx = await browser.newContext({ baseURL: E2E.baseURL, viewport: { width: 1440, height: 1000 } })
  const token = await encode({ token: { name: 'nadie-e2e', sub: 'cap', login: 'nadie-e2e', sid: `cap-${randomUUID()}`, authTime: Date.now() }, secret: E2E.authSecret, salt: 'authjs.session-token' })
  await ctx.addCookies([{ name: 'authjs.session-token', value: token, url: E2E.baseURL, httpOnly: true }])
  const p = await ctx.newPage()
  await p.goto('/admin/marketing/nueva')
  await p.locator('[data-c="asunto"]').fill('Tres cupos para octubre')
  await p.locator('[data-c="preheader"]').fill('Proyectos web con entrega en 4 semanas')
  await p.locator('[data-c="titulo"]').fill('Abro tres cupos de desarrollo este mes')
  await p.locator('[data-c="cuerpo"]').fill('Hola. Este mes tomo **tres proyectos nuevos** de páginas web y sistemas a la medida.\n\nSi llevas tiempo pensando en la página de tu negocio, es buen momento: diseño, desarrollo y publicación en cuatro semanas.\n\nTodos los planes y precios están en [la página de servicios](https://codebymike.net/paginas-web).')
  await p.locator('[data-c="botonTexto"]').fill('Ver planes')
  await p.locator('[data-c="botonUrl"]').fill('https://codebymike.net/paginas-web')
  await p.waitForTimeout(600)
  await p.screenshot({ path: '/tmp/resend-tools/cap-editor.png', fullPage: true })
  await p.getByRole('button', { name: 'Guardar borrador' }).click({ force: true })
  await p.waitForURL(/\/admin\/marketing\/\d+$/)
  await p.waitForTimeout(600)
  await p.screenshot({ path: '/tmp/resend-tools/cap-editor-guardado.png', fullPage: true })
  await p.goto('/admin/marketing')
  await p.waitForTimeout(400)
  await p.screenshot({ path: '/tmp/resend-tools/cap-panel.png', fullPage: true })
})
