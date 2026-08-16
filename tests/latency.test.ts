import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// BD libsql en archivo temporal (no ':memory:', ver tests/payments.test.ts):
// aquí lo que se prueba es el SQL real que compone Drizzle, así que hace falta
// un motor de verdad - un mock del cliente no detectaría un UNION ALL mal
// parentizado ni un LIMIT que no se aplica por rama.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `latency-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import { recentLatency } from '../src/lib/latency'

// Recorte mínimo de la superficie de @libsql/client que usan estas pruebas:
// `execute` para el DDL y el plan de consulta, `batch` para sembrar sin pagar
// un viaje por fila.
type Client = {
  execute: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>
  batch: (
    stmts: { sql: string; args: (string | number | null)[] }[],
  ) => Promise<unknown>
}

async function client(): Promise<Client> {
  const { __client } = (await import('../src/db')) as unknown as { __client: Client }
  return __client
}

beforeAll(async () => {
  const c = await client()
  await c.execute(`CREATE TABLE monitor_checks (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    monitor_id integer NOT NULL,
    at integer NOT NULL,
    ok integer NOT NULL,
    status_code integer,
    response_ms integer,
    error text
  )`)
  await c.execute('CREATE INDEX monitor_checks_monitor_at_idx ON monitor_checks (monitor_id, at)')
  await c.execute('CREATE INDEX monitor_checks_at_idx ON monitor_checks (at)')
})

beforeEach(async () => {
  const c = await client()
  await c.execute('DELETE FROM monitor_checks')
})

// En un solo batch, no un execute por fila: el caso de los 120 monitores hacía
// 360 viajes secuenciales y el del plan de consulta 400, lo bastante lento para
// cruzar el timeout de 5s de vitest cuando la suite corre en paralelo bajo
// carga. Mismas filas, mismas aserciones, un viaje.
async function seed(monitorId: number, n: number, opts: { nullEvery?: number } = {}) {
  const c = await client()
  const filas = []
  for (let i = 0; i < n; i++) {
    const isNull = opts.nullEvery ? i % opts.nullEvery === 0 : false
    filas.push({
      sql: `INSERT INTO monitor_checks (monitor_id, at, ok, response_ms) VALUES (?, ?, ?, ?)`,
      args: [
        monitorId,
        1_700_000_000 + i * 300,
        i % 7 === 0 ? 0 : 1,
        isNull ? null : 100 + (i % 50),
      ],
    })
  }
  await c.batch(filas)
}

describe('recentLatency', () => {
  it('devuelve un mapa vacío sin monitores, sin tocar la BD', async () => {
    expect((await recentLatency([])).size).toBe(0)
  })

  it('limita a `points` por monitor de forma independiente', async () => {
    await seed(1, 60)
    await seed(2, 10)

    const out = await recentLatency([1, 2], 40)
    // El LIMIT debe aplicarse por rama: si el UNION ALL estuviera mal
    // parentizado, el límite recortaría el total y el monitor 2 llegaría vacío.
    expect(out.get(1)!.length).toBe(40)
    expect(out.get(2)!.length).toBe(10)
  })

  it('devuelve los checks MÁS RECIENTES, ordenados del más antiguo al más nuevo', async () => {
    await seed(1, 60)

    const pts = (await recentLatency([1], 40))!.get(1)!
    const ts = pts.map((p) => p.t)

    // Orden ascendente dentro de la serie (la gráfica se dibuja izq→der).
    expect([...ts].sort((a, b) => a - b)).toEqual(ts)
    // Y son la cola: el último punto es el check más nuevo sembrado (i = 59).
    expect(ts.at(-1)).toBe(1_700_000_000 + 59 * 300)
    expect(ts[0]).toBe(1_700_000_000 + 20 * 300)
  })

  it('excluye checks sin latencia medida (response_ms NULL)', async () => {
    await seed(1, 30, { nullEvery: 3 })

    const pts = (await recentLatency([1], 40))!.get(1)!
    expect(pts.length).toBe(20)
    expect(pts.every((p) => typeof p.ms === 'number')).toBe(true)
  })

  it('mapea `ok` a booleano y no mezcla series entre monitores', async () => {
    await seed(1, 5)
    await seed(2, 5)

    const out = await recentLatency([1, 2], 40)
    expect(out.get(1)!.every((p) => typeof p.ok === 'boolean')).toBe(true)
    // Series disjuntas: un WHERE mal armado las fundiría en una sola.
    expect(out.get(1)!.length + out.get(2)!.length).toBe(10)
  })

  it('omite del mapa a un monitor sin checks', async () => {
    await seed(1, 5)

    const out = await recentLatency([1, 99], 40)
    expect(out.has(99)).toBe(false)
  })

  it('no duplica la serie si llegan ids repetidos', async () => {
    await seed(1, 10)

    // El `where monitor_id in (1,1)` anterior deduplicaba solo; una rama por id
    // no, así que sin el Set esto devolvería 20 puntos para un solo monitor.
    const out = await recentLatency([1, 1, 1], 40)
    expect(out.get(1)!.length).toBe(10)
  })

  it('supera el techo de 50 términos por compound SELECT de Turso', async () => {
    // Turso corta los UNION ALL en 50 ramas. Con un monitor por rama, sin lotes
    // esto sería un 500 en /status el día que existan 51 monitores.
    const ids = Array.from({ length: 120 }, (_, i) => i + 1)
    for (const id of ids) await seed(id, 3)

    const out = await recentLatency(ids, 40)
    expect(out.size).toBe(120)
    expect([...out.values()].every((pts) => pts.length === 3)).toBe(true)
  })

  it('usa el índice en vez de escanear la tabla (la regresión que agotó la cuota)', async () => {
    await seed(1, 200)
    await seed(2, 200)
    const c = await client()

    // Se reconstruye el mismo SQL que emite recentLatency para poder pedirle el
    // plan: lo que se vigila es que ningún acceso a monitor_checks sea un SCAN
    // ni requiera un sort temporal de la tabla completa.
    const branch = (m: number) =>
      `select * from (select monitor_id,at,response_ms,ok from monitor_checks` +
      ` where monitor_id = ${m} and response_ms is not null order by at desc limit 40)`
    const plan = await c.execute(
      `explain query plan ${branch(1)} union all ${branch(2)} order by monitor_id asc, at asc`,
    )
    const details = plan.rows.map((r) => String(r.detail))

    expect(details.filter((d) => /SEARCH monitor_checks USING INDEX/.test(d)).length).toBe(2)
    expect(details.some((d) => /SCAN monitor_checks/.test(d))).toBe(false)
  })
})
