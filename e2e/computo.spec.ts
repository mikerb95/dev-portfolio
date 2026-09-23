import { entrarALaDemo, expect, recogerErrores, test } from './fixtures'

// El cotizador de /admin/computo recalcula en el navegador con el mismo módulo
// que pinta el servidor (lib/computo/cotizador.ts). Lo que una prueba unitaria
// no ve es que ese módulo se pueda importar desde el navegador sin arrastrar
// la base ni node:crypto, y que los controles de verdad disparen el recálculo.
//
// Los clics van con `force: true`: en /admin requestAnimationFrame no dispara
// (ver e2e/infra.spec.ts) y Playwright se queda esperando a que el botón esté
// "estable".

/** Lee un importe del panel: es-CO usa coma decimal y punto de millar. */
function monto(texto: string | null): number {
  const limpio = (texto ?? '').replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')
  return Number(limpio)
}

test.describe('cotizador de cómputo', () => {
  test('abre sin errores de JS y, con cómputo de centavos, sugiere la parte del asiento Pro', async ({ page }) => {
    const errores = recogerErrores(page)
    await entrarALaDemo(page)
    await page.goto('/admin/computo')

    await expect(page.locator('#cotizador')).toBeVisible()
    const asiento = monto(await page.locator('[data-res="asiento"]').textContent())
    expect(asiento).toBeGreaterThan(0)
    // El sitio SSR pequeño cuesta centavos en Pro: manda el asiento.
    expect(monto(await page.locator('[data-res="sugerida"]').textContent())).toBe(asiento)
    await expect(page.locator('[data-res="razon"]')).toContainText('manda su parte del asiento')

    expect(errores).toEqual([])
  })

  test('cambiar de plantilla recalcula el consumo', async ({ page }) => {
    await entrarALaDemo(page)
    await page.goto('/admin/computo')
    const antes = await page.locator('[data-linea="invocaciones"] [data-cantidad]').textContent()

    await page.locator('[data-plantilla="tienda"]').click({ force: true })

    await expect(page.locator('[data-campo="visitasMes"]')).toHaveValue('20000')
    await expect(page.locator('[data-linea="invocaciones"] [data-cantidad]')).not.toHaveText(antes ?? '')
  })

  test('un tráfico enorme no cabe en la cuota y pasa a cobrarse por cómputo', async ({ page }) => {
    await entrarALaDemo(page)
    await page.goto('/admin/computo')
    const asiento = monto(await page.locator('[data-res="asiento"]').textContent())

    await page.fill('[data-campo="visitasMes"]', '5000000')

    await expect(page.locator('[data-res="razon"]')).toContainText('NO cabe')
    await expect(page.locator('[data-res="razon"]')).toContainText('Manda su cómputo')
    expect(monto(await page.locator('[data-res="sugerida"]').textContent())).toBeGreaterThan(asiento)
  })
})
