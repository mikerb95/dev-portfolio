import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@libsql/client'
import { E2E } from '../playwright.config'
import { expect, ipDePrueba, recogerErrores, test } from './fixtures'

// Tablero de la hackatón (RF-045 a RF-047): agregar personas, repartir, marcar
// tareas y ver el progreso, con el enlace del equipo. El token se siembra
// directo en la base desechable (en producción lo genera el admin), y la hora
// se simula con ?hora= para que el aviso del congelamiento sea determinista.

test.describe.configure({ mode: 'serial' })

let token = ''

test.beforeAll(async () => {
  token = randomBytes(24).toString('base64url')
  const db = createClient({ url: E2E.mainDbUrl })
  await db.execute('DELETE FROM hackaton_tableros')
  await db.execute('DELETE FROM hackaton_tokens')
  await db.execute({
    sql: 'INSERT INTO hackaton_tokens (tablero, hash, creado) VALUES (?, ?, ?)',
    args: ['defacc-2026', createHash('sha256').update(token).digest('hex'), Math.floor(Date.now() / 1000)],
  })
  db.close()
})

test('sin enlace la checklist se ve en modo lectura', async ({ page }) => {
  await page.setExtraHTTPHeaders(ipDePrueba())
  const errores = recogerErrores(page)
  await page.goto('/hackaton')
  await expect(page.locator('[data-estado-modo="lectura"]')).toBeVisible()
  await expect(page.locator('[data-grupo="nucleo"]')).toBeVisible()
  await expect(page.locator('[data-form-persona]')).toHaveCount(0)
  await expect(page.locator('[data-cambiar-estado]').first()).toBeDisabled()
  expect(errores).toEqual([])
})

test('agregar personas, repartir, marcar tareas y ver el progreso', async ({ page }) => {
  await page.setExtraHTTPHeaders(ipDePrueba())
  const errores = recogerErrores(page)
  await page.goto(`/hackaton?equipo=${token}&hora=13:00`)

  // El token sale de la barra de direcciones en cuanto se lee.
  await expect(page).not.toHaveURL(/equipo=/)
  await expect(page.locator('[data-estado-modo="edicion"]')).toBeVisible()

  const input = page.getByLabel('Nombre de la persona')
  for (const nombre of ['Ana', 'Beto', 'Caro']) {
    await input.fill(nombre)
    await page.getByRole('button', { name: 'Agregar', exact: true }).first().click()
    await expect(page.locator(`[data-personas] [data-persona="${nombre}"]`)).toBeVisible()
  }

  await page.locator('[data-repartir]').click()
  // Tres personas, cinco frentes: todas quedan con carga.
  for (const nombre of ['Ana', 'Beto', 'Caro']) {
    await expect(page.locator(`[data-carga="${nombre}"]`)).not.toContainText('Sin frente')
  }

  // A las 13:00 faltan 75 min para congelar: hay aviso de prioritarias.
  await expect(page.locator('[data-aviso]')).toContainText('para congelar funciones')

  // Marcar: pendiente → en curso → hecha.
  const primera = page.locator('[data-grupo="nucleo"] [data-tarea]').first()
  await primera.locator('[data-cambiar-estado]').click()
  await expect(primera).toHaveAttribute('data-estado', 'en_curso')
  await primera.locator('[data-cambiar-estado]').click()
  await expect(page.locator('[data-grupo="nucleo"] [data-tarea]').first()).toHaveAttribute('data-estado', 'hecha')

  await expect(page.locator('[data-progreso-global]')).not.toHaveAttribute('data-progreso-global', '0')

  // Persistido: otra visita (sin enlace) ve lo mismo.
  const otra = await page.context().browser()!.newPage()
  await otra.setExtraHTTPHeaders(ipDePrueba())
  await otra.goto('/hackaton')
  await expect(otra.locator('[data-personas] [data-persona="Caro"]')).toBeVisible()
  await expect(otra.locator('[data-grupo="nucleo"] [data-tarea]').first()).toHaveAttribute('data-estado', 'hecha')
  await otra.close()

  expect(errores).toEqual([])
})
