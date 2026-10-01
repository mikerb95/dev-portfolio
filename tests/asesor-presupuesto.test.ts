import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// BD libsql en archivo temporal (como cobros-db.test.ts): el UPSERT con CASE
// del contador de gasto solo se puede probar contra SQLite de verdad.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `asesor-presupuesto-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import { CLAVE_GASTO, presupuestoRestante, sumarGasto, topeDiarioUsd } from '../src/lib/asesor/presupuesto'

let client: { execute: (sql: string | { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> }

const DIA1 = new Date('2026-10-01T15:00:00Z')
const DIA2 = new Date('2026-10-02T15:00:00Z')

beforeAll(async () => {
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client
  await client.execute(`CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY NOT NULL, value text, updated_at integer)`)
})

beforeEach(async () => {
  await client.execute(`DELETE FROM app_settings`)
})

async function valor(): Promise<string | null> {
  const r = await client.execute({ sql: 'SELECT value FROM app_settings WHERE key = ?', args: [CLAVE_GASTO] })
  return (r.rows[0]?.value as string | undefined) ?? null
}

describe('contador de gasto del asesor', () => {
  it('crea la fila el primer gasto del día', async () => {
    await sumarGasto(0.0042, DIA1)
    expect(await valor()).toBe('2026-10-01|0.0042')
    expect(await presupuestoRestante(DIA1)).toBeCloseTo(topeDiarioUsd() - 0.0042)
  })

  it('acumula dentro del mismo día', async () => {
    await sumarGasto(0.25, DIA1)
    await sumarGasto(0.5, DIA1)
    expect(await presupuestoRestante(DIA1)).toBeCloseTo(topeDiarioUsd() - 0.75)
  })

  it('arranca de cero al cambiar de día', async () => {
    await sumarGasto(0.9, DIA1)
    await sumarGasto(0.1, DIA2)
    expect(await valor()).toBe('2026-10-02|0.1')
    expect(await presupuestoRestante(DIA2)).toBeCloseTo(topeDiarioUsd() - 0.1)
  })

  it('gastos simultáneos no se pisan', async () => {
    await Promise.all(Array.from({ length: 10 }, () => sumarGasto(0.01, DIA1)))
    expect(await presupuestoRestante(DIA1)).toBeCloseTo(topeDiarioUsd() - 0.1)
  })
})
