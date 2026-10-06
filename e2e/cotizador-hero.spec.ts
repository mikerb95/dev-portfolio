import { expect, ipDePrueba, recogerErrores, test } from './fixtures'

// Cotizador del hero de la portada (RF-037): la primera vuelta del asesor se
// hace desde "Cuéntame qué necesitas" y "Seguir preguntando" la pasa a la
// burbuja. Solo la API de Claude es falsa (e2e/fake-anthropic.mjs).
//
// Spec aparte de asesor-vivo.spec.ts a propósito: aquel borra las tablas del
// asesor en su beforeAll, que corre una vez POR WORKER; con estos tests en el
// mismo archivo, un worker borraba la conversación que el otro estaba leyendo.

test('el cotizador del hero hace la primera vuelta y "Seguir preguntando" la pasa a la burbuja', async ({ page }) => {
  test.setTimeout(60_000)
  await page.context().setExtraHTTPHeaders(ipDePrueba())
  const errores = recogerErrores(page)
  // El navegador de Playwright viene en inglés y la portada ofrecería /en con
  // una modal que tapa la esquina del cotizador.
  await page.addInitScript(() => localStorage.setItem('lang-prompt-dismissed', '1'))
  // Movimiento reducido: el terreno WebGL del hero pinta un solo fotograma. Con
  // varias portadas animándose a la vez, headless se queda sin frames y los
  // clics de los demás specs expiran. El motion se verificó con capturas.
  await page.emulateMedia({ reducedMotion: 'reduce' })

  await page.goto('/')
  // Con varias portadas (terreno WebGL) abiertas en paralelo, headless deja de
  // producir frames y un clic normal espera "estable" sin fin: los clics van
  // forzados y el resultado se comprueba con expect, como en el panel.
  const input = page.locator('#cotizador-input')
  await input.fill('Una página para mi restaurante con el menú y pedidos por WhatsApp')
  await input.press('Enter')

  // Mientras calcula, la tarjeta lo dice y el campo queda bloqueado.
  await expect(page.locator('#cotizador')).toHaveAttribute('data-estado', 'pensando')
  // La API falsa responde sin precio a una pregunta sin "cuánto": sin marca
  // "Calculado con el tarifario" y el WhatsApp lleva la idea de la persona.
  const texto = page.locator('[data-cotizador-texto]')
  await expect(texto).toContainText('Respuesta de prueba del asesor', { timeout: 15_000 })
  await expect(page.locator('[data-cotizador-marca]')).toBeHidden()
  await expect(page.locator('#cotizador')).toHaveAttribute('data-estado', 'listo')
  const wa = await page.locator('[data-cotizador-wa]').getAttribute('href')
  expect(wa).toContain('wa.me/573104641228?text=')
  expect(decodeURIComponent(wa ?? '')).toContain('restaurante')

  // El traspaso abre el chat con la misma vuelta: pregunta y respuesta, sin
  // volver a llamar al modelo.
  await page.locator('[data-cotizador-continuar]').click({ force: true })
  await expect(page.locator('#asesor-chat')).toBeVisible()
  const log = page.locator('#asesor-log')
  await expect(log.locator('.asesor-burbuja--yo')).toContainText('restaurante')
  await expect(log.locator('.asesor-burbuja--ia').last()).toContainText('Respuesta de prueba del asesor')

  // Y sobrevive a una recarga, como cualquier conversación de la burbuja.
  await page.reload()
  await page.locator('#wa-fab').click({ force: true })
  await page.locator('#asesor-abrir').click({ force: true })
  await expect(log.locator('.asesor-burbuja--yo')).toContainText('restaurante')

  expect(errores).toEqual([])
})

test('un estimado con precio desde el hero marca la cifra y avisa que Mike puede leer', async ({ page }) => {
  test.setTimeout(60_000)
  await page.context().setExtraHTTPHeaders(ipDePrueba())
  const errores = recogerErrores(page)
  // El navegador de Playwright viene en inglés y la portada ofrecería /en con
  // una modal que tapa la esquina del cotizador.
  await page.addInitScript(() => localStorage.setItem('lang-prompt-dismissed', '1'))
  // Movimiento reducido: el terreno WebGL del hero pinta un solo fotograma. Con
  // varias portadas animándose a la vez, headless se queda sin frames y los
  // clics de los demás specs expiran. El motion se verificó con capturas.
  await page.emulateMedia({ reducedMotion: 'reduce' })

  await page.goto('/')
  await page.locator('#cotizador-input').fill('¿Cuánto cuesta una página para mi restaurante?')
  await page.locator('[data-cotizador-enviar]').click({ force: true })
  const texto = page.locator('[data-cotizador-texto]')
  await expect(texto).toContainText('cuesta desde', { timeout: 15_000 })
  await expect(texto.locator('.asesor-precio')).toHaveCount(1)
  await expect(page.locator('[data-cotizador-marca]')).toBeVisible()

  // Hubo precio: la conversación ya se guarda para Mike y, al pasar a la
  // burbuja, el chat lo dice y conserva la marca de la cifra.
  await page.locator('[data-cotizador-continuar]').click({ force: true })
  const log = page.locator('#asesor-log')
  await expect(log.locator('.asesor-sistema')).toContainText('Mike puede leer')
  await expect(log.locator('.asesor-marca')).toBeVisible()

  expect(errores).toEqual([])
})
