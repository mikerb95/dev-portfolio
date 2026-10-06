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
  await db.execute(`DELETE FROM messages WHERE subject LIKE 'Asistente IA: WhatsApp%'`)
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

  // El precio sale del tarifario y, por ser una señal de interés, el asesor
  // pide el WhatsApp con la pregunta fija y el chat avisa que Mike puede leer.
  const log = page.locator('#asesor-log')
  await expect(log.locator('.asesor-burbuja--ia').last()).toContainText('desde $', { timeout: 20_000 })
  await expect(log.locator('.asesor-burbuja--ia').last()).toContainText('¿me dejas tu número de WhatsApp')
  await expect(log.locator('.asesor-sistema')).toContainText('Mike puede leer esta conversación')

  // Solo las de esta página: el cotizador del hero (e2e/cotizador-hero.spec.ts)
  // abre las suyas con pagina 'inicio' en paralelo.
  const { rows } = await db.execute(`SELECT id, motivo, estado FROM asesor_conversaciones WHERE pagina = 'paginas-web'`)
  expect(rows).toHaveLength(1)
  expect(rows[0].motivo).toBe('precio')
  const id = Number(rows[0].id)

  // Mike abre el enlace de la notificación. Todavía no hay número.
  const mike = await panelDeMike(browser)
  await mike.goto(`/admin/asesor/${id}`)
  await expect(mike.locator('#vivo-log')).toContainText('¿Cuánto cuesta el plan Negocio?')
  await expect(mike.locator('#vivo-telefono')).toBeHidden()

  // La persona deja su número respondiendo a la pregunta: el asesor sigue la
  // conversación y el panel lo muestra solo, con el botón para escribirle.
  await page.locator('#asesor-input').fill('Sí, es el 310 464 1228')
  await page.locator('#asesor-input').press('Enter')
  await expect(log.locator('.asesor-burbuja--ia').last()).toContainText('Respuesta de prueba', { timeout: 20_000 })
  await expect(mike.locator('#vivo-telefono-texto')).toHaveText('+57 310 464 1228', { timeout: 10_000 })
  await expect(mike.locator('#vivo-telefono-enlace')).toHaveAttribute('href', /^https:\/\/wa\.me\/573104641228\?text=/)
  const buzon = await db.execute(`SELECT count(*) AS n FROM messages WHERE subject = 'Asistente IA: WhatsApp +57 310 464 1228'`)
  expect(Number(buzon.rows[0].n)).toBe(1)

  await expect(mike.locator('#vivo-presencia-texto')).toHaveText('Tiene el chat abierto')
  await mike.locator('#vivo-input').fill('Hola, soy Mike. ¿Para qué negocio es la página?')
  // El panel no produce frames en headless: el clic va forzado.
  await mike.locator('#vivo-enviar').click({ force: true })
  await expect(mike.locator('#vivo-aviso')).toContainText('el asesor ya no responde')

  // Al visitante le llega por el sondeo, en el mismo chat.
  await expect(log.locator('.asesor-burbuja--mike')).toContainText('Hola, soy Mike', { timeout: 15_000 })
  await expect(log.locator('.asesor-sistema').last()).toContainText('Mike entró')
  await expect(page.locator('#asesor-chat')).toHaveAttribute('data-mike', '')
  await expect(page.locator('#asesor-subtitulo')).toHaveText('Estás hablando con Mike.')

  // Lo que responde ahora le llega a Mike y no al modelo.
  await page.locator('#asesor-input').fill('Es para un restaurante')
  await page.locator('#asesor-input').press('Enter')
  await expect(mike.locator('#vivo-log')).toContainText('Es para un restaurante', { timeout: 10_000 })
  const asesor = await db.execute({ sql: `SELECT count(*) AS n FROM asesor_mensajes WHERE conversacion_id = ? AND autor = 'asesor'`, args: [id] })
  expect(Number(asesor.rows[0].n)).toBe(2)

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
