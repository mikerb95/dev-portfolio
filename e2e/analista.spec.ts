import { encode } from '@auth/core/jwt'
import { createClient } from '@libsql/client'
import type { BrowserContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { E2E } from '../playwright.config'
import { expect, recogerErrores, test } from './fixtures'

// Analista del micro-SIEM de punta a punta: pantalla, rutas, base y bucle del
// agente reales; solo la API de Claude es falsa (e2e/fake-anthropic.mjs), así
// que la suite no gasta créditos. El guion de la API falsa consulta
// top_origenes, propone bloquear origen-01 y cierra con un veredicto.

const COOKIE = 'authjs.session-token'

async function sesionAdmin(context: BrowserContext) {
  // Mismos valores que playwright.config.ts le pasa al servidor: las variables
  // del proceso pisan los .env locales (así carga el entorno Vite).
  const login = 'nadie-e2e'
  const token = await encode({
    token: { name: login, sub: 'e2e-analista', login, sid: `e2e-analista-${randomUUID()}`, authTime: Date.now() },
    secret: E2E.authSecret,
    salt: COOKIE,
  })
  await context.addCookies([{ name: COOKIE, value: token, url: E2E.baseURL, httpOnly: true }])
}

// IP de documentación (RFC 5737) con muchísimos hits: es la primera que ve el
// agente, así que es la que recibe el alias origen-01.
const IP = '203.0.113.77'
const db = createClient({ url: E2E.mainDbUrl })

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ context }) => {
  await db.execute('DELETE FROM analista_ejecuciones')
  await db.execute(`DELETE FROM blocked_ips WHERE rule_id = 'analista.propuesta'`)
  await db.execute({ sql: 'DELETE FROM security_events WHERE ip = ? OR path = ?', args: [IP, '/admin/analista'] })
  const hace1h = Math.floor(Date.now() / 1000) - 3600
  await db.execute({
    sql: `INSERT INTO security_events (at, ip, method, path, category, severity, action, rule_id, hits)
          VALUES (?, ?, 'POST', '/wp-login.php', 'auth_probing', 'high', 'logged', 'auth.bruteforce', 5000)`,
    args: [hace1h, IP],
  })
  await sesionAdmin(context)
})

test('rechazar el bloqueo: el agente sigue y nada se bloquea', async ({ page }) => {
  const errores = recogerErrores(page)
  await page.goto('/admin/analista')
  await page.getByRole('button', { name: '¿Qué pasó esta semana?' }).click({ force: true })

  await expect(page.locator('#aprobacion')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('#ap-origen')).toHaveText('origen-01')
  await expect(page.locator('#bitacora')).toContainText('Buscando quién insiste más de la última semana')
  await page.locator('#ap-rechazar').click({ force: true })

  await expect(page.locator('.veredicto')).toContainText('bloqueo rechazado', { timeout: 20_000 })
  await expect(page.locator('#bitacora')).toContainText('Rechazaste el bloqueo de origen-01')
  await expect(page.locator('#estadisticas')).toContainText('US$')

  const bloqueos = await db.execute(`SELECT count(*) n FROM blocked_ips WHERE rule_id = 'analista.propuesta'`)
  expect(Number(bloqueos.rows[0]!.n)).toBe(0)
  // El modelo ve alias, y la pantalla también: la IP no llega al navegador.
  expect(await page.content()).not.toContain(IP)
  expect(errores).toEqual([])
})

test('aprobar el bloqueo: se aplica con TTL y queda auditado', async ({ page }) => {
  await page.goto('/admin/analista')
  await page.getByRole('button', { name: '¿Qué pasó esta semana?' }).click({ force: true })
  await expect(page.locator('#aprobacion')).toBeVisible({ timeout: 20_000 })
  await page.locator('#ap-aprobar').click({ force: true })

  await expect(page.locator('.veredicto')).toContainText('quedó bloqueado', { timeout: 20_000 })
  await expect(page.locator('#bitacora')).toContainText('Aprobaste el bloqueo de origen-01')

  const bloqueo = await db.execute({ sql: 'SELECT source, expires_at FROM blocked_ips WHERE ip = ?', args: [IP] })
  expect(bloqueo.rows[0]).toMatchObject({ source: 'manual' })
  expect(Number(bloqueo.rows[0]!.expires_at)).toBeGreaterThan(Date.now() / 1000)
  const rastro = await db.execute(`SELECT rule_id FROM security_events WHERE path = '/admin/analista' AND category = 'admin_action'`)
  expect(rastro.rows.map((r) => r.rule_id)).toContain('blocklist.manual_block')
  expect(await page.content()).not.toContain(IP)
})

test('cerrar la pestaña a mitad: el bloqueo pendiente se retoma al volver', async ({ page }) => {
  await page.goto('/admin/analista')
  await page.getByRole('button', { name: '¿Qué pasó esta semana?' }).click({ force: true })
  await expect(page.locator('#aprobacion')).toBeVisible({ timeout: 20_000 })

  await page.reload()
  await expect(page.locator('#respuesta')).toContainText('quedó esperando tu decisión')
  await page.getByRole('button', { name: 'Revisar el bloqueo' }).click({ force: true })
  await expect(page.locator('#ap-origen')).toHaveText('origen-01')
  await page.locator('#ap-rechazar').click({ force: true })
  await expect(page.locator('.veredicto')).toContainText('bloqueo rechazado', { timeout: 20_000 })

  // Una decisión repetida (doble clic, otra pestaña) no vuelve a aplicarse.
  const [fila] = (await db.execute('SELECT id FROM analista_ejecuciones LIMIT 1')).rows
  const otra = await page.request.post('/api/admin/analista/decision', { data: { id: fila!.id, aprobado: true } })
  expect(otra.status()).toBe(409)
})
