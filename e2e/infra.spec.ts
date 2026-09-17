import { entrarALaDemo, expect, recogerErrores, test } from './fixtures'

// El simulador de /admin/infra es la única página del panel cuyo valor está en
// el JavaScript: el servidor pinta el primer escenario y el navegador recalcula
// con el MISMO módulo (src/lib/infra-stack.ts). Los tests de Vitest cubren la
// aritmética; lo que no pueden ver es que el cableado del navegador siga vivo,
// que es justo lo que se rompe en silencio al tocar el marcado.
//
// Se entra por la demo y no con sesión real: la página no lee datos de cliente
// (solo la tasa de cambio de app_settings), así que el pase basta y de paso
// queda comprobado que no está vetada.
//
// Los clics van con `force: true` y NO es para tapar un problema de la página:
// bajo Chromium headless el panel no produce frames de animación (medido:
// requestAnimationFrame no dispara ni una vez por segundo en /admin, /admin/costs
// ni aquí, mientras las páginas públicas dan 2-4), y el chequeo de estabilidad
// de Playwright compara la caja del elemento entre dos frames consecutivos, así
// que nunca termina y el clic expira a los 30 s con el botón visible y quieto.
// `force` salta ese chequeo pero sigue disparando un clic de ratón real en el
// centro del elemento: si algo lo tapara, el evento se lo llevaría el de encima
// y el test fallaría igual. Es el primer spec que pulsa algo DENTRO del panel;
// los demás solo comprueban redirecciones y leen contenido, por eso no había
// salido antes.

/** Lee un importe del panel: es-CO usa coma decimal y punto de millar. */
function monto(texto: string | null): number {
  const limpio = (texto ?? '').replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')
  return Number(limpio)
}

test.describe('simulador de infra', () => {
  test('abre con la tarifa más baja de cada proveedor y sin errores de JS', async ({ page }) => {
    const errores = recogerErrores(page)
    await entrarALaDemo(page)
    await page.goto('/admin/infra')

    // Los cuatro proveedores del catálogo, cada uno con su tabla.
    for (const id of ['vercel', 'turso', 'claude', 'workspace']) {
      await expect(page.locator(`[data-prov="${id}"]`)).toBeVisible()
    }

    // Escenario de arranque con los planes más baratos: lo único que cuesta
    // dinero es el buzón de Workspace. Si esta cifra cambia, o el default dejó
    // de ser el plan más barato, o alguien movió una tarifa.
    await expect(page.locator('[data-total-prov="workspace"]')).toHaveText(/7/)
    expect(monto(await page.locator('[data-total="mes"]').textContent())).toBe(7.3)
    await expect(page.locator('[data-total="topes"]')).toHaveText('0')

    expect(errores).toEqual([])
  })

  test('cambiar de escenario recalcula y enseña dónde se rompe el gratis', async ({ page }) => {
    await entrarALaDemo(page)
    await page.goto('/admin/infra')
    const arranque = monto(await page.locator('[data-total="mes"]').textContent())

    await page.locator('[data-escenario="pico"]').click({ force: true })

    // El mes malo sale más caro Y rompe cuotas: las dos cosas a la vez, porque
    // el número que sube sin avisar de los topes duros es el que engaña.
    const pico = monto(await page.locator('[data-total="mes"]').textContent())
    expect(pico).toBeGreaterThan(arranque)
    expect(Number(await page.locator('[data-total="topes"]').textContent())).toBeGreaterThan(0)
    await expect(page.locator('[data-linea="turso:filasLeidas"] [data-costo]')).toHaveText('se corta')
  })

  test('editar un uso a mano recalcula el total', async ({ page }) => {
    await entrarALaDemo(page)
    await page.goto('/admin/infra')
    const antes = monto(await page.locator('[data-total="mes"]').textContent())

    // Un buzón más en Workspace son siete dólares más, sin tocar nada más.
    await page.fill('[data-uso="workspace:usuarios"]', '2')

    expect(monto(await page.locator('[data-total="mes"]').textContent())).toBe(antes + 7)
  })

  test('subir de plan cambia la cuota y apaga el tope duro', async ({ page }) => {
    await entrarALaDemo(page)
    await page.goto('/admin/infra')
    await page.locator('[data-escenario="pico"]').click({ force: true })
    await expect(page.locator('[data-linea="turso:filasLeidas"] [data-costo]')).toHaveText('se corta')

    await page.selectOption('[data-plan="turso"]', 'scaler')

    // Con Scaler las lecturas del pico caben en la cuota y las escrituras no,
    // que es exactamente la diferencia que la página existe para enseñar: el
    // mismo uso deja de cortar el servicio y pasa a costar dinero.
    await expect(page.locator('[data-linea="turso:filasLeidas"] [data-costo]')).toHaveText('-')
    await expect(page.locator('[data-linea="turso:filasEscritas"] [data-costo]')).toHaveText(/\d/)
    // 24,92 de cargo fijo + 20 M de escrituras sobre la cuota a 0,80 por millón.
    expect(monto(await page.locator('[data-total-prov="turso"]').textContent())).toBe(40.92)
  })
})


