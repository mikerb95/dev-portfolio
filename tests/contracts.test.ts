import { beforeAll, describe, expect, it, vi } from 'vitest'

// Contratos de 4 endpoints clave: /api/health, /api/payments/checkout,
// /api/status/latency y /api/admin/lab/slo. El objetivo NO es probar la
// lógica de negocio (ya tiene su batería propia) sino que el "shape" de la
// respuesta no cambie sin que alguien actualice src/lib/contracts.ts a
// propósito. Front y API viven en el mismo repo: esto hace de Pact liviano
// sin necesitar un consumidor en otro repositorio (ver comentario en
// contracts.ts). Si algún día SlideHub u otro servicio consumiera estas
// respuestas desde fuera, ahí sí valdría la pena Pact de verdad.
//
// BD: libsql en archivo temporal, migrada con el MISMO migrador que usa
// producción (drizzle-orm/libsql/migrator) — nunca DDL escrito a mano. Ya nos
// mordió una vez (tests/payments.test.ts) que el DDL a mano se desincronizara
// del esquema real cuando otro trabajo le agregó columnas.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')

  const file = join(tmpdir(), `contracts-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: join(__dirname, '..', 'drizzle') })

  return { db, demoAvailable: false, runInDemoContext: (fn: () => unknown) => fn() }
})

import {
  CheckoutResponseSchema,
  HealthResponseSchema,
  SloResponseSchema,
  StatusLatencyResponseSchema,
} from '../src/lib/contracts'

async function seedMonitor() {
  const { db } = (await import('../src/db')) as unknown as { db: any }
  const { monitors, monitorChecks } = await import('../src/db/schema')

  const [m] = await db
    .insert(monitors)
    .values({
      name: 'Contrato de prueba',
      url: 'https://example.test',
      active: true,
      paused: false,
      lastStatus: 'up',
      lastCheckedAt: new Date(),
      lastResponseMs: 120,
      createdAt: new Date(),
    })
    .returning({ id: monitors.id })

  const now = Date.now()
  for (let i = 0; i < 5; i++) {
    await db.insert(monitorChecks).values({
      monitorId: m.id,
      at: new Date(now - i * 60_000),
      ok: true,
      statusCode: 200,
      responseMs: 100 + i,
    })
  }
  return m.id
}

// Contexto mínimo de Astro APIRoute: los handlers bajo prueba solo leen
// `request` y `url`.
function makeContext(url: string, init?: RequestInit) {
  return { request: new Request(url, init), url: new URL(url) } as any
}

beforeAll(async () => {
  await seedMonitor()
})

describe('contrato · GET /api/health', () => {
  it('cumple el shape publicado', async () => {
    const { GET } = await import('../src/pages/api/health')
    const res = await GET(makeContext('http://localhost/api/health'))
    const body = await res.json()

    const parsed = HealthResponseSchema.safeParse(body)
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
  })
})

describe('contrato · POST /api/payments/checkout', () => {
  it('cumple el shape publicado (modo mock, sin llaves Wompi)', async () => {
    const { POST } = await import('../src/pages/api/payments/checkout')
    const res = await POST(
      makeContext('http://localhost/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: 25_000_00, idempotencyKey: crypto.randomUUID() }),
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()

    const parsed = CheckoutResponseSchema.safeParse(body)
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
  })
})

describe('contrato · GET /api/status/latency', () => {
  it('cumple el shape publicado', async () => {
    const { GET } = await import('../src/pages/api/status/latency')
    const res = await GET(makeContext('http://localhost/api/status/latency'))
    const body = await res.json()

    const parsed = StatusLatencyResponseSchema.safeParse(body)
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
  })
})

describe('contrato · GET /api/admin/lab/slo', () => {
  it('cumple el shape publicado', async () => {
    const { GET } = await import('../src/pages/api/admin/lab/slo')
    const res = await GET(makeContext('http://localhost/api/admin/lab/slo?objective=99.5&days=30'))
    const body = await res.json()

    const parsed = SloResponseSchema.safeParse(body)
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
  })
})

describe('contrato · el test SÍ detecta una ruptura real', () => {
  it('un campo renombrado hace fallar el schema (no un test vacío)', async () => {
    const { GET } = await import('../src/pages/api/health')
    const res = await GET(makeContext('http://localhost/api/health'))
    const body = await res.json()

    // Simula el cambio de shape que este test existe para atrapar: alguien
    // renombra `ok` a `healthy` sin tocar el contrato.
    const { ok, ...rest } = body
    const roto = { ...rest, healthy: ok }

    expect(HealthResponseSchema.safeParse(roto).success).toBe(false)
  })
})
