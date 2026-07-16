import { test as base, expect, type Page } from '@playwright/test'

/**
 * Base de todos los specs. Corta cualquier petición a un host externo.
 *
 * Los e2e verifican ESTE sitio; que pasen o fallen no puede depender de que
 * fonts.googleapis.com responda. Sin este corte, `page.goto` se queda esperando
 * el evento `load` de recursos de terceros y los tests expiran en entornos sin
 * salida a internet (y quedan lentos y frágiles en los que sí la tienen).
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.context().route(
      (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
      (route) => route.abort()
    )
    await use(page)
  },
})

export { expect }

/**
 * Recoge los errores de JavaScript y de consola de una página.
 *
 * Descarta los que vienen de hosts externos: esos los cortamos nosotros en el
 * fixture, así que su fallo es esperado y no dice nada del sitio. Sin este
 * filtro, todo test que mire la consola fallaría por nuestro propio bloqueo.
 */
export function recogerErrores(page: Page): string[] {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(String(e)))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const url = m.location()?.url ?? ''
    if (url && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return
    errores.push(m.text())
  })
  return errores
}

/**
 * Cabecera con una IP distinta para cada test.
 *
 * Los rate limits del sitio son por IP (`clientIp()` lee `x-forwarded-for`) y
 * toda la suite sale de localhost, así que sin esto compartirían contador: el
 * test que agota el límite a propósito haría fallar a los demás según el orden
 * de ejecución. Cada test pide la suya y la reutiliza en todas sus peticiones.
 */
export function ipDePrueba(): Record<string, string> {
  const octeto = () => 1 + Math.floor(Math.random() * 254)
  return { 'x-forwarded-for': `10.${octeto()}.${octeto()}.${octeto()}` }
}

/**
 * Entra a la demo como lo haría una persona: por el formulario de /demo.
 *
 * Devuelve el `page` ya dentro del panel. Ojo al usar peticiones sueltas
 * después: el fixture `request` de Playwright vive en otro contexto y NO lleva
 * la cookie del pase — hay que usar `page.request`.
 */
export async function entrarALaDemo(page: Page) {
  await page.goto('/demo')
  await page.click('button[type=submit]')
  await page.waitForURL('**/admin')
}
