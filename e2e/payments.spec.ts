import { expect, ipDePrueba, test } from './fixtures'

// Pasarela en modo mock (sin llaves reales). Lo que se verifica aquí es la
// defensa que de verdad importa: la idempotencia sobrevive a un doble envío.
//
// Cada test lleva su propia IP: el checkout limita a 10/min por IP y la suite
// entera saldría de localhost (ver ipDePrueba).

const key = () => `e2e-${crypto.randomUUID()}`
const checkout = (idempotencyKey: string, amountCents = 25_000_00) => ({
  amountCents,
  idempotencyKey,
  description: 'compra de prueba e2e',
})

test.describe('checkout', () => {
  test('crea un pago y devuelve su referencia', async ({ page }) => {
    const res = await page.request.post('/api/payments/checkout', {
      data: checkout(key()),
      headers: ipDePrueba(),
    })
    expect(res.status(), await res.text()).toBe(201)

    const { payment, replayed } = await res.json()
    expect(replayed).toBe(false)
    expect(payment.reference).toMatch(/^pay_/)
    expect(payment.amountCents).toBe(25_000_00)
  })

  test('la misma clave devuelve el MISMO pago, no uno nuevo', async ({ page }) => {
    const headers = ipDePrueba()
    const k = key()

    const primera = await page.request.post('/api/payments/checkout', { data: checkout(k), headers })
    const segunda = await page.request.post('/api/payments/checkout', { data: checkout(k), headers })

    expect(primera.status()).toBe(201)
    expect(segunda.status()).toBe(200)

    const a = await primera.json()
    const b = await segunda.json()
    expect(b.replayed).toBe(true)
    expect(b.payment.reference).toBe(a.payment.reference)
  })

  test('la misma clave con otro monto es conflicto, no un cobro silencioso', async ({ page }) => {
    const headers = ipDePrueba()
    const k = key()

    await page.request.post('/api/payments/checkout', { data: checkout(k, 25_000_00), headers })
    const evil = await page.request.post('/api/payments/checkout', {
      data: checkout(k, 900_000_00),
      headers,
      failOnStatusCode: false,
    })
    expect(evil.status()).toBe(409)
  })

  test('rechaza montos fuera de rango y claves inválidas', async ({ page }) => {
    const headers = ipDePrueba()

    const bajo = await page.request.post('/api/payments/checkout', {
      data: checkout(key(), 100),
      headers,
      failOnStatusCode: false,
    })
    expect(bajo.status()).toBe(400)

    const claveMala = await page.request.post('/api/payments/checkout', {
      data: checkout('xx'),
      headers,
      failOnStatusCode: false,
    })
    expect(claveMala.status()).toBe(400)
  })

  test('/pay renderiza el formulario de pago', async ({ page }) => {
    const res = await page.goto('/pay')
    expect(res?.status()).toBe(200)
    await expect(page.locator('h1').first()).toBeVisible()
  })
})
