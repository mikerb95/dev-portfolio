import { encode } from '@auth/core/jwt'
import { createClient } from '@libsql/client'
import type { Browser } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { E2E } from '../playwright.config'
import { expect, ipDePrueba, recogerErrores, test } from './fixtures'

// Asesor en vivo de punta a punta: un visitante pregunta un precio en la
// burbuja, la conversación queda guardada, Mike entra desde el panel y los dos
// se escriben por el mismo chat. Solo la API de Claude es falsa
// (e2e/fake-anthropic.mjs): "cuánto" la hace calcular un precio real.

const COOKIE = 'authjs.session-token'
const db = createClient({ url: E2E.mainDbUrl })

async function panelDeMike(browser: Browser) {
  const context = await browser.newContext({ baseURL: E2E.baseURL })
  const login = 'nadie-e2e'
  const token = await encode({
    token: { name: login, sub: 'e2e-asesor', login, sid: `e2e-asesor-${randomUUID()}`, authTime: Date.now() },
    secret: E2E.authSecret,
    salt: COOKIE,
  })
  await context.addCookies([{ name: COOKIE, value: token, url: E2E.baseURL, httpOnly: true }])
  return context.newPage()
}

test.beforeAll(async () => {
  // El servidor escribe en el mismo archivo SQLite a la vez que este test.
  await db.execute('PRAGMA busy_timeout = 5000')
  await db.execute('DELETE FROM asesor_mensajes')
  await db.execute('DELETE FROM asesor_conversaciones')
})

test('el visitante pide un precio, Mike entra desde el panel y conversan en el mismo chat', async ({ page, browser }) => {
  test.setTimeout(90_000)
  await page.context().setExtraHTTPHeaders(ipDePrueba())
  const errores = recogerErrores(page)

  await page.goto('/paginas-web')
  await page.locator('#wa-fab').click()
  const abrir = page.locator('#asesor-abrir')
  await expect(abrir).toBeEnabled()
  await abrir.click()
  await page.locator('#asesor-input').fill('¿Cuánto cuesta el plan Negocio?')
  await page.locator('#asesor-input').press('Enter')

  // El precio sale del tarifario y, por ser una señal de interés, el chat
  // avisa que Mike puede leer la conversación.
  const log = page.locator('#asesor-log')
  await expect(log.locator('.asesor-burbuja--ia').last()).toContainText('desde $', { timeout: 20_000 })
  await expect(log.locator('.asesor-sistema')).toContainText('Le avisé a Mike')

  const { rows } = await db.execute('SELECT id, motivo, estado FROM asesor_conversaciones')
  expect(rows).toHaveLength(1)
  expect(rows[0].motivo).toBe('precio')
  const id = Number(rows[0].id)

  // Mike abre el enlace de la notificación.
  const mike = await panelDeMike(browser)
  await mike.goto(`/admin/asesor/${id}`)
  await expect(mike.locator('#vivo-log')).toContainText('¿Cuánto cuesta el plan Negocio?')
  await expect(mike.locator('#vivo-presencia-texto')).toHaveText('Tiene el chat abierto')
  await mike.locator('#vivo-input').fill('Hola, soy Mike. ¿Para qué negocio es la página?')
  // El panel no produce frames en headless: el clic va forzado.
  await mike.locator('#vivo-enviar').click({ force: true })
  await expect(mike.locator('#vivo-aviso')).toContainText('el asesor ya no responde')

  // Al visitante le llega por el sondeo, en el mismo chat.
  await expect(log.locator('.asesor-burbuja--mike')).toContainText('Hola, soy Mike', { timeout: 15_000 })
  await expect(log.locator('.asesor-sistema').last()).toContainText('Mike entró')
  await expect(page.locator('#asesor-chat')).toHaveAttribute('data-mike', '')

  // Lo que responde ahora le llega a Mike y no al modelo.
  await page.locator('#asesor-input').fill('Es para un restaurante')
  await page.locator('#asesor-input').press('Enter')
  await expect(mike.locator('#vivo-log')).toContainText('Es para un restaurante', { timeout: 10_000 })
  const asesor = await db.execute({ sql: `SELECT count(*) AS n FROM asesor_mensajes WHERE conversacion_id = ? AND autor = 'asesor'`, args: [id] })
  expect(Number(asesor.rows[0].n)).toBe(1)

  // Con el chat cerrado, la burbuja avisa que Mike escribió.
  await page.locator('#asesor-cerrar').click()
  await mike.locator('#vivo-input').fill('Perfecto, te escribo por WhatsApp')
  await mike.locator('#vivo-enviar').click({ force: true })
  await expect(page.locator('#wa-fab')).toHaveAttribute('data-nuevo', '', { timeout: 25_000 })
  await page.locator('#wa-fab').click()
  await expect(page.locator('#wa-fab')).not.toHaveAttribute('data-nuevo', '')
  await expect(log.locator('.asesor-burbuja--mike').last()).toContainText('te escribo por WhatsApp')

  // Al recargar, la conversación con Mike sigue ahí.
  await page.reload()
  await page.locator('#wa-fab').click()
  await page.locator('#asesor-abrir').click()
  await expect(log.locator('.asesor-burbuja--mike')).toHaveCount(2)

  expect(errores).toEqual([])
  await mike.context().close()
})
