import { expect, ipDePrueba, test } from './fixtures'

// Formulario de contacto: la única escritura que un anónimo puede hacer en el
// sitio. Se ejercita contra la base desechable de los e2e, nunca contra Turso.
//
// Cada test usa su propia IP (ver ipDePrueba): el endpoint limita a 5/min por
// IP, así que sin separarlas el test de ráfaga tumbaría a los demás.

const mensaje = (extra: Record<string, unknown> = {}) => ({
  name: 'Persona de Prueba',
  email: 'prueba@example.com',
  subject: 'Hola desde los e2e',
  body: 'Mensaje enviado por la suite e2e.',
  ...extra,
})

test.describe('contacto', () => {
  test('un mensaje válido se acepta', async ({ page }) => {
    const res = await page.request.post('/api/contact', {
      data: mensaje(),
      headers: ipDePrueba(),
    })
    expect(res.status(), await res.text()).toBeLessThan(300)
  })

  test('rechaza campos faltantes y email inválido', async ({ page }) => {
    const headers = ipDePrueba()

    const sinCuerpo = await page.request.post('/api/contact', {
      data: mensaje({ body: '' }),
      headers,
      failOnStatusCode: false,
    })
    expect(sinCuerpo.status()).toBe(400)

    const emailMalo = await page.request.post('/api/contact', {
      data: mensaje({ email: 'esto-no-es-un-email' }),
      headers,
      failOnStatusCode: false,
    })
    expect(emailMalo.status()).toBe(400)
  })

  test('rechaza un cuerpo desmedido', async ({ page }) => {
    const res = await page.request.post('/api/contact', {
      data: mensaje({ body: 'x'.repeat(5001) }),
      headers: ipDePrueba(),
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(400)
  })

  test('el rate limit corta el envío en ráfaga', async ({ page }) => {
    // Misma IP en las 9: el límite es 5/min, así que las últimas deben rebotar.
    const headers = ipDePrueba()
    const estados: number[] = []

    for (let i = 0; i < 9; i++) {
      const res = await page.request.post('/api/contact', {
        data: mensaje({ subject: `ráfaga ${i}` }),
        headers,
        failOnStatusCode: false,
      })
      estados.push(res.status())
    }

    expect(estados, `estados: ${estados.join(',')}`).toContain(429)
    // Las primeras sí pasan: el límite corta el abuso, no el uso legítimo.
    expect(estados[0]).toBeLessThan(300)
  })
})
