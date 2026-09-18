import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'

// BD libsql en archivo temporal (no `:memory:`, ver payments.test.ts): lo que
// se prueba aquí es precisamente el UNIQUE de la tabla, así que hace falta la
// base real, no un mock del insert.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `load-ingest-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

const { POST } = await import('../src/pages/api/lab/ingest')

const CARGA = JSON.parse(readFileSync('lab/k6/resultados/carga-2026-08-10T05-26-20-277Z.json', 'utf8'))
const TOKEN = 'token-de-prueba'

let client: { execute: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> }

const postear = (body: unknown, token = TOKEN) =>
  POST({
    request: new Request('http://localhost/api/lab/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0]) as Promise<Response>

beforeAll(async () => {
  vi.stubEnv('LAB_INGEST_TOKEN', TOKEN)
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client

  await client.execute(`CREATE TABLE load_test_runs (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    tool text NOT NULL DEFAULT 'k6',
    scenario text NOT NULL,
    target text NOT NULL,
    vus_max integer,
    duration_s integer,
    requests integer,
    rps real,
    p50 real,
    p95 real,
    p99 real,
    avg_ms real,
    max_ms real,
    error_rate_pct real,
    checks_passed integer,
    checks_failed integer,
    thresholds_ok integer,
    sustained_rps real,
    breaking_point_rps real,
    recovered_after_s integer,
    steps_json text,
    findings_json text,
    raw_json text,
    ran_at integer NOT NULL,
    created_at integer
  )`)
  await client.execute(
    'CREATE UNIQUE INDEX load_test_runs_scenario_ran_at_idx ON load_test_runs (scenario, ran_at)',
  )
})

beforeEach(async () => {
  await client.execute('DELETE FROM load_test_runs')
})

const contar = async () =>
  Number((await client.execute('SELECT count(*) as n FROM load_test_runs')).rows[0].n)

describe('ingesta de corridas de carga', () => {
  it('guarda una corrida real y devuelve 201', async () => {
    const res = await postear({ kind: 'load_test', summary: CARGA })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.escalones).toBe(CARGA.curvaCapacidad.length)
    expect(await contar()).toBe(1)
  })

  it('reingerir el mismo resumen no crea una corrida nueva', async () => {
    // El paso de reporte del workflow corre con `always()`: si el job falla
    // antes de k6, reenvía los resúmenes que el repo versiona. Eso pasó de
    // verdad el 18 sep 2026 y duplicó el historial del panel.
    const primera = await postear({ kind: 'load_test', summary: CARGA })
    const segunda = await postear({ kind: 'load_test', summary: CARGA })

    expect(primera.status).toBe(201)
    expect(segunda.status).toBe(200)

    const b1 = await primera.json()
    const b2 = await segunda.json()
    expect(b2.duplicate).toBe(true)
    expect(b2.id).toBe(b1.id)
    expect(await contar()).toBe(1)
  })

  it('dos escenarios distintos con la misma fecha sí son dos corridas', async () => {
    await postear({ kind: 'load_test', summary: CARGA })
    const otro = await postear({ kind: 'load_test', summary: { ...CARGA, escenario: 'estres' } })
    expect(otro.status).toBe(201)
    expect(await contar()).toBe(2)
  })

  it('rechaza un objetivo de producción sin escribir nada', async () => {
    const res = await postear({ kind: 'load_test', summary: { ...CARGA, objetivo: 'https://codebymike.net' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/producción/)
    expect(await contar()).toBe(0)
  })

  it('rechaza un token que no es el esperado', async () => {
    const res = await postear({ kind: 'load_test', summary: CARGA }, 'otro-token')
    expect(res.status).toBe(401)
    expect(await contar()).toBe(0)
  })

  it('acepta el payload bajo la clave `resumen`, como lo nombran los scripts', async () => {
    const res = await postear({ kind: 'load_test', resumen: CARGA })
    expect(res.status).toBe(201)
    expect(await contar()).toBe(1)
  })
})
