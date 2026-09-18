import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { isValidTxId, resultView, wompiApiBase } from '../src/lib/pay-result'

// BD: libsql en archivo temporal migrada con el migrador real (mismo patrón
// que tests/contracts.test.ts), para que el cruce por referencia use el
// esquema de verdad.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')

  const file = join(tmpdir(), `pay-result-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: join(__dirname, '..', 'drizzle') })
  return { db, demoAvailable: false, realDbIsLocal: true, runInDemoContext: (fn: () => unknown) => fn() }
})

describe('pay-result (puro)', () => {
  it('elige la API según el ambiente de la llave', () => {
    expect(wompiApiBase('pub_prod_abc')).toBe('https://production.wompi.co/v1')
    expect(wompiApiBase('pub_test_abc')).toBe('https://sandbox.wompi.co/v1')
  })

  it('solo acepta ids con forma de transacción', () => {
    expect(isValidTxId('1234-1668624561-38705')).toBe(true)
    expect(isValidTxId('../admin')).toBe(false)
    expect(isValidTxId('a/b')).toBe(false)
    expect(isValidTxId(null)).toBe(false)
  })

  it('aprobado no ofrece reintentar', () => {
    const v = resultView({ status: 'approved', origin: 'pay', method: 'CARD' })
    expect(v.tone).toBe('ok')
    expect(v.retry).toBeNull()
  })

  it('pendiente nombra el medio cuando lo conoce', () => {
    const v = resultView({ status: 'pending', origin: 'pay', method: 'PSE' })
    expect(v.tone).toBe('wait')
    expect(v.body).toContain('PSE')
  })

  it('rechazado en /pay vuelve a /pay; en un cobro no expone el link', () => {
    expect(resultView({ status: 'declined', origin: 'pay', method: null }).retry?.href).toBe('/pay')
    const cobro = resultView({ status: 'error', origin: 'cobro', method: null })
    expect(cobro.tone).toBe('fail')
    expect(cobro.retry).toBeNull()
    expect(cobro.body).toContain('mismo link')
  })
})

describe('GET /api/payments/resultado', () => {
  const call = async (id: string) => {
    const { GET } = await import('../src/pages/api/payments/resultado')
    const url = `http://localhost/api/payments/resultado?id=${encodeURIComponent(id)}`
    // IP distinta por llamada: el endpoint limita por IP y aquí no se prueba eso.
    const headers = { 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }
    return GET({ request: new Request(url, { headers }), url: new URL(url) } as any)
  }

  const wompiReturns = (data: Record<string, unknown> | null, status = 200) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data }), { status })))

  beforeAll(async () => {
    process.env.WOMPI_PUBLIC_KEY = 'pub_test_x'
    const { db } = (await import('../src/db')) as unknown as { db: any }
    const { payments } = await import('../src/db/schema')
    await db.insert(payments).values({
      reference: 'pay_nuestra',
      idempotencyKey: 'k-resultado-1',
      amountCents: 25_000_00,
      provider: 'wompi',
      source: 'pay',
      payerEmail: 'secreto@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('devuelve el estado de una transacción nuestra, sin datos del pagador', async () => {
    wompiReturns({ reference: 'pay_nuestra', status: 'APPROVED', amount_in_cents: 2_500_000, payment_method_type: 'NEQUI' })
    const res = await call('1234-1668624561-38705')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = await res.json()
    expect(body).toEqual({ status: 'approved', amountCents: 2_500_000, reference: 'pay_nuestra', origin: 'pay', method: 'NEQUI' })
    expect(JSON.stringify(body)).not.toContain('secreto')
  })

  it('no responde por transacciones de otro comercio', async () => {
    wompiReturns({ reference: 'ref_ajena', status: 'APPROVED', amount_in_cents: 1 })
    const res = await call('1234-1668624561-38706')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'unknown' })
  })

  it('si Wompi falla, responde unknown en vez de lanzar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout') }))
    const res = await call('1234-1668624561-38707')
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ status: 'unknown' })
  })

  it('rechaza ids mal formados sin llamar a Wompi', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const res = await call('../../admin')
    expect(res.status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })
})
