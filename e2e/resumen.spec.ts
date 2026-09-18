import { entrarALaDemo, expect, recogerErrores, test } from './fixtures'

// El cálculo del resumen lo cubre tests/resumen-mensual.test.ts. Aquí se
// comprueba lo que Vitest no ve: que las dos páginas lean de verdad las tablas
// nuevas (la migración se aplicó a la base), que el cableado del navegador siga
// vivo y que la demo, que es solo lectura, las pueda abrir sin vetarlas.
//
// Los datos vienen de scripts/seed-demo.mjs. Los gastos reales se siembran en
// el mes en curso y solo hasta el día de hoy, así que los asertos no dependen
// de cifras exactas sino de que aparezcan las filas esperadas.

test.describe('resumen mensual', () => {
  test('pinta las tres secciones y la proyección de 12 meses', async ({ page }) => {
    const errores = recogerErrores(page)
    await entrarALaDemo(page)
    await page.goto('/admin/resumen')

    for (const titulo of ['Infraestructura', 'Suscripciones de trabajo', 'Costos de vida']) {
      await expect(page.getByRole('heading', { name: titulo })).toBeVisible()
    }
    // La suscripción sembrada va en su sección y no en la de infraestructura.
    await expect(page.getByText('Claude Max')).toBeVisible()
    await expect(page.locator('#chart .chart-bar')).toHaveCount(12)

    // El tooltip es la codificación secundaria de la gráfica: sin él, dos de
    // las tres series solo se distinguen por un color que falla con tritanopía.
    await page.locator('#chart .chart-bar').nth(5).hover({ force: true })
    await expect(page.locator('#chart-tip')).toBeVisible()
    await expect(page.locator('#chart-tip')).toContainText('Costos de vida')

    expect(errores).toEqual([])
  })

  test('navegar de mes cambia el periodo sin romper la página', async ({ page }) => {
    await entrarALaDemo(page)
    await page.goto('/admin/resumen?mes=2026-01')
    await expect(page.getByRole('heading', { level: 2 })).toContainText(/enero de 2026/i)
    await page.goto('/admin/resumen?mes=no-es-un-mes')
    expect((await page.request.get('/admin/resumen?mes=no-es-un-mes')).status()).toBe(200)
  })
})

test.describe('costos de vida', () => {
  test('lista la plantilla de fijos y el registro del mes', async ({ page }) => {
    const errores = recogerErrores(page)
    await entrarALaDemo(page)
    await page.goto('/admin/vida')

    await expect(page.getByRole('cell', { name: 'Arriendo apartamento', exact: false }).first()).toBeVisible()
    await expect(page.getByText('Plantilla de gastos fijos')).toBeVisible()

    // El formulario abre y el mes ancla solo aparece en ciclos no mensuales.
    await page.locator('#btn-fijo').click({ force: true })
    await expect(page.locator('#fijo-overlay')).toBeVisible()
    await expect(page.locator('#fx-anchor-wrap')).toHaveClass(/invisible/)
    await page.locator('#fx-cycle').selectOption('annual')
    await expect(page.locator('#fx-anchor-wrap')).not.toHaveClass(/invisible/)

    expect(errores).toEqual([])
  })
})
