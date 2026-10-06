import { encode } from '@auth/core/jwt'
import { createClient } from '@libsql/client'
import type { BrowserContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { E2E } from '../playwright.config'
import { expect, recogerErrores, test } from './fixtures'

// Asistente del dashboard de punta a punta (RF-210): caja, búsqueda sin IA,
// rutas, base y bucle reales; solo la API de Claude es falsa
// (e2e/fake-anthropic.mjs). Dentro de /admin los clics van con force: true
// (el panel no produce frames en headless, ver e2e/infra.spec.ts).
// Esperas de 60 s en el primer paso de cada flujo: la primera petición a
// /api/admin/asistente compila la ruta y el SDK en el servidor de desarrollo, y
// en frío eso solo ya pasa de 20 s.

const COOKIE = 'authjs.session-token'
const CLIENTE = 'Cliente E2E Asistente'
const db = createClient({ url: E2E.mainDbUrl })

async function sesionAdmin(context: BrowserContext) {
  const login = 'nadie-e2e'
  const token = await encode({
    token: { name: login, sub: 'e2e-asistente', login, sid: `e2e-asistente-${randomUUID()}`, authTime: Date.now() },
    secret: E2E.authSecret,
    salt: COOKIE,
  })
  await context.addCookies([{ name: COOKIE, value: token, url: E2E.baseURL, httpOnly: true }])
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await db.execute('PRAGMA busy_timeout = 5000')
})

test.beforeEach(async ({ context }) => {
  await db.execute('DELETE FROM asistente_conversaciones')
  await db.execute(`DELETE FROM app_settings WHERE key = 'asistente_gasto'`)
  await db.execute({ sql: `DELETE FROM invoice_items WHERE invoice_id IN (SELECT i.id FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.name = ?)`, args: [CLIENTE] })
  await db.execute({ sql: `DELETE FROM invoices WHERE client_id IN (SELECT id FROM clients WHERE name = ?)`, args: [CLIENTE] })
  await db.execute({ sql: 'DELETE FROM clients WHERE name = ?', args: [CLIENTE] })
  await db.execute({ sql: 'INSERT INTO clients (name, created_at) VALUES (?, ?)', args: [CLIENTE, Math.floor(Date.now() / 1000)] })
  await sesionAdmin(context)
})

test('la caja busca sin IA mientras se escribe', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.locator('.asis-saludo')).toContainText('Mike')
  await page.locator('#asis-input').fill('dominios')
  const lista = page.locator('#asis-resultados')
  await expect(lista).toBeVisible()
  await expect(lista.locator('.es-ia')).toContainText('Preguntarle a la IA')
  await expect(lista.getByRole('option', { name: /Dominios/ })).toBeVisible()
  // La búsqueda no abre conversaciones ni gasta.
  const n = await db.execute('SELECT count(*) n FROM asistente_conversaciones')
  expect(Number(n.rows[0]!.n)).toBe(0)
})

test('una pregunta muestra los pasos, la respuesta y solo enlaces internos', async ({ page }) => {
  const errores = recogerErrores(page)
  await page.goto('/admin')
  await page.getByRole('button', { name: '¿Qué dominios vencen?' }).click({ force: true })
  const turno = page.locator('.turno').first()
  await expect(turno.locator('.turno-pasos')).toContainText('Revisando qué dominios vencen', { timeout: 60_000 })
  await expect(turno.locator('.turno-respuesta')).toContainText('dominios por vencer', { timeout: 60_000 })
  await expect(turno.locator('a.enlace', { hasText: 'Dominios' })).toHaveAttribute('href', '/admin/domains')
  // El enlace externo que "escribió" el modelo queda como texto plano.
  await expect(turno.locator('a', { hasText: 'afuera' })).toHaveCount(0)
  await expect(turno.locator('.turno-pie')).toContainText('US$')
  await expect(page).toHaveURL(/\?c=/)
  expect(errores).toEqual([])
})

test('crear una cuenta de cobro: tarjeta, aprobación y borrador en la base', async ({ page }) => {
  await page.goto('/admin')
  await page.locator('#asis-input').fill(`Ayúdame a crear una cuenta de cobro para ${CLIENTE} por el hito 2`)
  await page.locator('#asis-input').press('Enter')

  const tarjeta = page.locator('.turno-tarjeta')
  await expect(tarjeta).toBeVisible({ timeout: 60_000 })
  await expect(tarjeta.locator('.tc-cliente')).toHaveText(CLIENTE)
  await expect(tarjeta.locator('.tc-total')).toContainText('1.200.000')
  // El cliente de prueba no tiene NIT: la tarjeta lo dice en vez de inventarlo.
  await expect(tarjeta.locator('.tc-faltan')).toContainText('NIT')
  let cuentas = await db.execute({ sql: 'SELECT count(*) n FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.name = ?', args: [CLIENTE] })
  expect(Number(cuentas.rows[0]!.n)).toBe(0)

  // Al recargar, la propuesta sigue esperando: vive en la base, no en la pestaña.
  await page.reload()
  await expect(page.locator('.turno-tarjeta .boton-pri')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.asis-recientes')).toContainText('Espera tu decisión')

  await page.locator('.turno-tarjeta .boton-pri').click({ force: true })
  await expect(page.locator('.turno-hecho')).toContainText('creada en borrador', { timeout: 60_000 })
  await expect(page.locator('.turno-respuesta').last()).toContainText('quedó en borrador')

  cuentas = await db.execute({ sql: `SELECT i.status, i.total_cents FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.name = ?`, args: [CLIENTE] })
  expect(cuentas.rows).toHaveLength(1)
  expect(cuentas.rows[0]).toMatchObject({ status: 'draft', total_cents: 120_000_000 })
  const audit = await db.execute(`SELECT count(*) n FROM security_events WHERE rule_id = 'asistente.propuesta_aprobada'`)
  expect(Number(audit.rows[0]!.n)).toBeGreaterThan(0)
})

test('descartar la propuesta no crea nada', async ({ page }) => {
  await page.goto('/admin')
  await page.locator('#asis-input').fill(`Crea una cuenta de cobro para ${CLIENTE}`)
  await page.locator('#asis-input').press('Enter')
  await expect(page.locator('.turno-tarjeta')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Descartar' }).click({ force: true })
  await expect(page.locator('.turno-respuesta').last()).toContainText('no la creo', { timeout: 60_000 })
  const cuentas = await db.execute({ sql: 'SELECT count(*) n FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.name = ?', args: [CLIENTE] })
  expect(Number(cuentas.rows[0]!.n)).toBe(0)
})

test('Ctrl+K en otra página abre la paleta y busca', async ({ page }) => {
  await page.goto('/admin/costs')
  await page.keyboard.press('Control+k')
  await expect(page.locator('#paleta')).toBeVisible()
  await page.locator('#paleta-input').fill('cuentas de cobro')
  await expect(page.locator('#paleta-resultados').getByRole('option', { name: /Cuentas de cobro/ })).toBeVisible()
})
