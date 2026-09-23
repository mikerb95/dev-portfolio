import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// Medidor contra la ingesta REAL (handler de Astro + libSQL en archivo
// temporal, nunca :memory:). Lo que se prueba aquí no cabe en una prueba pura:
// que un reintento del medidor no cobre dos veces el mismo consumo, y que un
// fallo de la base a mitad del lote no deje una marca sin su consumo.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `medidor-ingesta-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

// El micro-SIEM es fire-and-forget y no es lo que se prueba.
vi.mock('../src/lib/security/events', () => ({ recordSecurityEvent: vi.fn(async () => {}) }))

import { POST } from '../src/pages/api/computo/ingest'
import { encrypt } from '../src/lib/crypto'
import { crearMedidor, type OpcionesMedidor } from '../instrumentacion/medidor'

let client: { execute: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> }

const SECRETO = 'f'.repeat(64)

/** Transporte que entrega el lote al handler de la ingesta sin pasar por red. */
function aLaIngesta(opciones: { perderRespuesta?: number } = {}) {
  let perdidas = opciones.perderRespuesta ?? 0
  const estados: number[] = []
  const transporte: OpcionesMedidor['fetch'] = async (url, init) => {
    const request = new Request(url, init)
    const res = await POST({ request, clientAddress: '127.0.0.1' } as Parameters<typeof POST>[0])
    estados.push(res.status)
    // La ingesta aplicó el lote, pero la respuesta "se perdió" por el camino:
    // es el caso que obliga al medidor a reintentar algo ya entregado.
    if (perdidas > 0) {
      perdidas--
      throw new TypeError('fetch failed')
    }
    return res
  }
  return { transporte, estados }
}

function medidor(transporte: OpcionesMedidor['fetch'], proyecto = 'acme') {
  let cpu = 0
  return {
    m: crearMedidor({ endpoint: 'https://panel.test/api/computo/ingest', proyecto, secreto: SECRETO, cpuMs: () => cpu, fetch: transporte }),
    gastar: (ms: number) => { cpu += ms },
  }
}

async function totales() {
  const r = await client.execute(
    'SELECT coalesce(sum(invocations),0) AS inv, coalesce(sum(transfer_bytes),0) AS bytes, coalesce(sum(cpu_ms),0) AS cpu FROM compute_usage_hourly',
  )
  return { inv: Number(r.rows[0].inv), bytes: Number(r.rows[0].bytes), cpu: Number(r.rows[0].cpu) }
}

const lotes = async () => Number((await client.execute('SELECT count(*) AS n FROM compute_batches')).rows[0].n)

beforeAll(async () => {
  vi.stubEnv('ENCRYPTION_KEY', 'ab'.repeat(32))
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client
  await client.execute(`CREATE TABLE projects (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    client_id integer,
    vercel_project_id text,
    created_at integer
  )`)
  await client.execute(`CREATE TABLE compute_usage_hourly (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    project_id integer NOT NULL,
    hour integer NOT NULL,
    cpu_ms real NOT NULL DEFAULT 0,
    gb_ms real NOT NULL DEFAULT 0,
    invocations integer NOT NULL DEFAULT 0,
    transfer_bytes real NOT NULL DEFAULT 0,
    origin_transfer_bytes real NOT NULL DEFAULT 0,
    edge_requests integer NOT NULL DEFAULT 0,
    updated_at integer
  )`)
  await client.execute(`CREATE UNIQUE INDEX compute_usage_project_hour_idx ON compute_usage_hourly (project_id, hour)`)
  await client.execute(`CREATE TABLE compute_batches (
    id text PRIMARY KEY NOT NULL,
    project_id integer NOT NULL,
    received_at integer
  )`)
  await client.execute(`CREATE TABLE compute_terms (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    project_id integer NOT NULL UNIQUE,
    margen_pct real NOT NULL DEFAULT 30,
    minimo_usd real,
    incluido_cpu_ms real NOT NULL DEFAULT 0,
    incluido_gb_ms real NOT NULL DEFAULT 0,
    incluido_invocaciones integer NOT NULL DEFAULT 0,
    incluido_transfer_bytes real NOT NULL DEFAULT 0,
    ingest_secret text,
    active integer NOT NULL DEFAULT 1,
    created_at integer,
    updated_at integer
  )`)
  await client.execute(`INSERT INTO projects (id, slug, title) VALUES (1, 'acme', 'Acme'), (2, 'globex', 'Globex')`)
  await client.execute(`INSERT INTO compute_terms (project_id, ingest_secret) VALUES (1, '${encrypt(SECRETO)}'), (2, '${encrypt('0'.repeat(64))}')`)
})

beforeEach(async () => {
  await client.execute('DELETE FROM compute_usage_hourly')
  await client.execute('DELETE FROM compute_batches')
})

describe('medidor → ingesta', () => {
  it('lo medido llega a la tabla horaria', async () => {
    const { transporte, estados } = aLaIngesta()
    const { m, gastar } = medidor(transporte)
    for (let i = 0; i < 3; i++) {
      const cerrar = m.iniciar()
      gastar(10)
      cerrar(1_000)
    }
    await m.vaciar()
    expect(estados).toEqual([200])
    expect(await totales()).toEqual({ inv: 3, bytes: 3_000, cpu: 30 })
  })

  it('un reintento de un lote ya aplicado no cobra dos veces', async () => {
    const { transporte, estados } = aLaIngesta({ perderRespuesta: 1 })
    const { m } = medidor(transporte)
    m.iniciar()(500)
    await m.vaciar()
    expect(m.estado().pendientes).toBe(1)
    await m.vaciar()
    // Primer intento aplicado, segundo reconocido como duplicado.
    expect(estados).toEqual([200, 200])
    expect(m.estado().pendientes).toBe(0)
    expect(await totales()).toMatchObject({ inv: 1, bytes: 500 })
    expect(await lotes()).toBe(1)
  })

  it('un fallo de la base a mitad del lote no deja la marca sin el consumo', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { transporte, estados } = aLaIngesta()
    const { m } = medidor(transporte)
    m.iniciar()(700)

    // La marca entraría (su tabla existe) y las horas fallarían: con dos pasos
    // sueltos quedaba la marca y el reintento se daba por "duplicado".
    await client.execute('ALTER TABLE compute_usage_hourly RENAME TO compute_usage_hourly_fuera')
    try {
      await m.vaciar()
    } finally {
      await client.execute('ALTER TABLE compute_usage_hourly_fuera RENAME TO compute_usage_hourly')
    }
    expect(estados).toEqual([503])
    expect(await lotes()).toBe(0)
    expect(m.estado().pendientes).toBe(1)

    await m.vaciar()
    expect(estados).toEqual([503, 200])
    expect(await totales()).toMatchObject({ inv: 1, bytes: 700 })
    expect(await lotes()).toBe(1)
    error.mockRestore()
  })

  it('con el secreto de otro proyecto la ingesta rechaza y el medidor descarta', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { transporte, estados } = aLaIngesta()
    // Se presenta como globex con el secreto de acme: no debe poder inyectar
    // consumo en la cuenta de otro.
    const { m } = medidor(transporte, 'globex')
    m.iniciar()(100)
    await m.vaciar()
    expect(estados).toEqual([401])
    expect(m.estado().pendientes).toBe(0)
    expect(await totales()).toMatchObject({ inv: 0 })
    error.mockRestore()
  })
})
