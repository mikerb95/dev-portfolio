import { encode } from '@auth/core/jwt'
import { createClient } from '@libsql/client'
import type { Browser } from '@playwright/test'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { E2E } from '../playwright.config'
import { expect, ipDePrueba, recogerErrores, test } from './fixtures'

// Correos promocionales de punta a punta (docs/plan-marketing.md): un visitante
// se suscribe en /novedades y confirma, Mike arma y dispara una campaña desde
// el panel, y el visitante se da de baja. Resend está apagado en el servidor de
// pruebas (RESEND_API_KEY vacío): el correo de confirmación no sale, así que
// el spec planta un token conocido, y el envío de la campaña falla con un
// error claro en vez de llegar a un buzón real.

const COOKIE = 'authjs.session-token'
const db = createClient({ url: E2E.mainDbUrl })
const CORREO = `visitante-${Date.now()}@ejemplo.co`

async function panelDeMike(browser: Browser) {
  const context = await browser.newContext({ baseURL: E2E.baseURL })
  const login = 'nadie-e2e'
  const token = await encode({
    token: { name: login, sub: 'e2e-marketing', login, sid: `e2e-marketing-${randomUUID()}`, authTime: Date.now() },
    secret: E2E.authSecret,
    salt: COOKIE,
  })
  await context.addCookies([{ name: COOKIE, value: token, url: E2E.baseURL, httpOnly: true }])
  return context.newPage()
}

test.beforeAll(async () => {
  await db.execute('PRAGMA busy_timeout = 5000')
  await db.execute('DELETE FROM marketing_envios')
  await db.execute('DELETE FROM marketing_campanas')
  await db.execute('DELETE FROM marketing_suscriptores')
})

test('suscripción, campaña desde el panel y baja', async ({ page, browser }) => {
  test.setTimeout(120_000)
  await page.context().setExtraHTTPHeaders(ipDePrueba())
  const errores = recogerErrores(page)

  // 1. El visitante se suscribe. Sin marcar la casilla el navegador no deja.
  await page.goto('/novedades')
  await page.locator('#nv-form input[name="email"]').fill(CORREO)
  await page.getByRole('button', { name: 'Suscribirme' }).click()
  await expect(page.locator('#nv-estado')).toHaveText('')
  await page.locator('#nv-form input[name="acepto"]').check()
  await page.getByRole('button', { name: 'Suscribirme' }).click()
  await expect(page.locator('#nv-estado')).toContainText('Revisa tu correo')

  const fila = await db.execute({ sql: 'SELECT id, estado, origen, texto_consentimiento FROM marketing_suscriptores WHERE email = ?', args: [CORREO] })
  expect(fila.rows[0]).toMatchObject({ estado: 'pendiente', origen: 'formulario' })
  expect(String(fila.rows[0].texto_consentimiento)).toContain('Autorizo')
  const id = Number(fila.rows[0].id)

  // 2. Confirma con el enlace del correo (token plantado: Resend está apagado).
  const token = 'token-de-prueba-e2e'
  await db.execute({
    sql: 'UPDATE marketing_suscriptores SET token_confirmacion_hash = ? WHERE id = ?',
    args: [createHash('sha256').update(token).digest('hex'), id],
  })
  await page.goto(`/api/marketing/confirmar?t=${token}`)
  await expect(page).toHaveURL(/\/novedades\?estado=confirmado/)
  await expect(page.getByRole('status').first()).toContainText('quedaste suscrito')
  // El mismo enlace no sirve dos veces.
  await page.goto(`/api/marketing/confirmar?t=${token}`)
  await expect(page).toHaveURL(/estado=invalido/)

  // 3. Mike arma una campaña: la vista previa refleja lo que escribe.
  const panel = await panelDeMike(browser)
  await panel.goto('/admin/marketing')
  await expect(panel.locator('.mk-card').first()).toContainText('1')
  await expect(panel.getByText(CORREO)).toBeVisible()

  await panel.goto('/admin/marketing/nueva')
  await panel.locator('[data-c="asunto"]').fill('Tres cupos para octubre')
  await panel.locator('[data-c="titulo"]').fill('Abro tres cupos de desarrollo')
  await panel.locator('[data-c="cuerpo"]').fill('Hola. Este mes tomo **tres proyectos nuevos**.\n\nDetalles en [la página](https://codebymike.net/paginas-web).')
  await panel.locator('[data-c="botonTexto"]').fill('Ver planes')
  await panel.locator('[data-c="botonUrl"]').fill('http://inseguro.co')
  await expect(panel.locator('#ed-errores')).toContainText('https://')
  await panel.locator('[data-c="botonUrl"]').fill('https://codebymike.net/paginas-web')
  await expect(panel.locator('#ed-errores')).toBeEmpty()

  const vista = panel.frameLocator('#ed-preview')
  await expect(vista.locator('h1')).toHaveText('Abro tres cupos de desarrollo')
  await expect(vista.locator('strong')).toHaveText('tres proyectos nuevos')
  await expect(vista.getByText('Ver planes')).toBeVisible()
  await expect(vista.getByText('Darme de baja')).toBeVisible()

  await panel.getByRole('button', { name: 'Guardar borrador' }).click({ force: true })
  await expect(panel).toHaveURL(/\/admin\/marketing\/\d+$/)
  const campanaId = Number(panel.url().split('/').pop())
  await expect(panel.locator('#ed-disparar')).toBeEnabled()

  // 4. Dispara. Con Resend apagado el lote falla con un error legible y nada
  // queda colgado en 'enviando'.
  panel.once('dialog', (d) => d.accept())
  await panel.getByRole('button', { name: 'Disparar campaña' }).click({ force: true })
  await expect(panel.locator('#ed-estado')).toContainText('En cola: 1')
  const envios = await db.execute({ sql: 'SELECT estado, error FROM marketing_envios WHERE campana_id = ?', args: [campanaId] })
  expect(envios.rows).toHaveLength(1)
  const { estado: estadoEnvio, error } = envios.rows[0]
  // Dentro del horario legal el lote se intenta (y falla por la clave); fuera
  // de él se queda pendiente para el cron. Las dos cosas son correctas.
  if (estadoEnvio === 'fallido') expect(String(error)).toContain('RESEND_API_KEY')
  else expect(estadoEnvio).toBe('pendiente')

  // 5. El visitante se da de baja desde el enlace del correo.
  const t = createHmac('sha256', E2E.marketingSecret).update(`baja:${id}`, 'utf8').digest('hex').slice(0, 32)
  await page.goto(`/novedades/baja?s=${id}&t=${t}&c=${campanaId}`)
  // Abrir la página no da de baja (los escáneres de enlaces abren todo).
  expect((await db.execute({ sql: 'SELECT estado FROM marketing_suscriptores WHERE id = ?', args: [id] })).rows[0].estado).toBe('activo')
  await page.getByRole('button', { name: 'Darme de baja' }).click()
  await expect(page.getByRole('status')).toContainText('no vas a recibir más')
  const final = await db.execute({ sql: 'SELECT estado, baja_campana_id FROM marketing_suscriptores WHERE id = ?', args: [id] })
  expect(final.rows[0]).toMatchObject({ estado: 'baja', baja_campana_id: campanaId })

  // Un token falso no da de baja a nadie.
  await page.goto(`/novedades/baja?s=${id}&t=${'0'.repeat(32)}`)
  await page.getByRole('button', { name: 'Darme de baja' }).click({ force: true })
  await expect(page.getByRole('status')).toContainText('no es válido')
  expect(errores).toEqual([])
})
