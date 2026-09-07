import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// BD libsql en archivo temporal (nunca :memory:, que no comparte tablas entre
// conexiones). Lo que se ejercita aquí no se puede probar con lógica pura: el
// UPSERT que ACUMULA sobre (project_id, hour) y el UNIQUE de lotes que impide
// cobrar dos veces el mismo consumo.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `computo-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import { db } from '../src/db'
import { computeBatches, computePeriods, computeRates, computeTerms, computeUsageHourly } from '../src/db/schema'
import { sql } from 'drizzle-orm'
import {
  consumoDelPeriodo, factorHeredado, limpiarLotes, recalcularPeriodo,
} from '../src/lib/computo/store'

let client: { execute: (sql: string) => Promise<unknown> }

const HORA_MS = 3_600_000
const PROYECTO = 1
const OTRO = 2
const hora = (iso: string) => new Date(Date.parse(iso))

/** Aplica una muestra con el mismo UPSERT acumulativo que usa el endpoint. */
async function acumular(projectId: number, cuando: Date, uso: Partial<Record<string, number>>) {
  const valores = {
    projectId,
    hour: cuando,
    cpuMs: uso.cpuMs ?? 0,
    gbMs: uso.gbMs ?? 0,
    invocations: uso.invocations ?? 0,
    transferBytes: uso.transferBytes ?? 0,
    originTransferBytes: uso.originTransferBytes ?? 0,
    edgeRequests: uso.edgeRequests ?? 0,
    updatedAt: new Date(),
  }
  await db.insert(computeUsageHourly).values(valores).onConflictDoUpdate({
    target: [computeUsageHourly.projectId, computeUsageHourly.hour],
    set: {
      cpuMs: sql`${computeUsageHourly.cpuMs} + ${valores.cpuMs}`,
      gbMs: sql`${computeUsageHourly.gbMs} + ${valores.gbMs}`,
      invocations: sql`${computeUsageHourly.invocations} + ${valores.invocations}`,
      transferBytes: sql`${computeUsageHourly.transferBytes} + ${valores.transferBytes}`,
      originTransferBytes: sql`${computeUsageHourly.originTransferBytes} + ${valores.originTransferBytes}`,
      edgeRequests: sql`${computeUsageHourly.edgeRequests} + ${valores.edgeRequests}`,
      updatedAt: valores.updatedAt,
    },
  })
}

beforeAll(async () => {
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
  await client.execute(`CREATE TABLE invoices (id integer PRIMARY KEY AUTOINCREMENT NOT NULL)`)
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
  await client.execute(`CREATE TABLE compute_rates (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    vigente_desde text NOT NULL UNIQUE,
    cpu_activa_hora real NOT NULL,
    memoria_gb_hora real NOT NULL,
    invocaciones_millon real NOT NULL,
    transferencia_gb real NOT NULL,
    transferencia_origen_gb real NOT NULL,
    edge_requests_millon real NOT NULL,
    fuente text,
    created_at integer
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
  await client.execute(`CREATE TABLE compute_periods (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    project_id integer NOT NULL,
    periodo text NOT NULL,
    cpu_ms real NOT NULL DEFAULT 0,
    gb_ms real NOT NULL DEFAULT 0,
    invocations integer NOT NULL DEFAULT 0,
    transfer_bytes real NOT NULL DEFAULT 0,
    origin_transfer_bytes real NOT NULL DEFAULT 0,
    edge_requests integer NOT NULL DEFAULT 0,
    costo_medido_usd real NOT NULL DEFAULT 0,
    factor_reconciliacion real NOT NULL DEFAULT 1,
    costo_usd real NOT NULL DEFAULT 0,
    margen_pct real NOT NULL DEFAULT 0,
    total_usd real NOT NULL DEFAULT 0,
    factura_real_usd real,
    estado text NOT NULL DEFAULT 'abierto',
    invoice_id integer,
    cerrado_at integer,
    updated_at integer
  )`)
  await client.execute(`CREATE UNIQUE INDEX compute_periods_project_periodo_idx ON compute_periods (project_id, periodo)`)
  await client.execute(`INSERT INTO projects (id, slug, title) VALUES (1, 'acme', 'Acme'), (2, 'globex', 'Globex')`)
})

beforeEach(async () => {
  for (const t of ['compute_usage_hourly', 'compute_batches', 'compute_periods', 'compute_terms', 'compute_rates']) {
    await client.execute(`DELETE FROM ${t}`)
  }
  // Tarifas a 1 para que el costo sea legible: con estas, una hora-CPU vale 1 USD.
  await db.insert(computeRates).values({
    vigenteDesde: '2026-01-01',
    cpuActivaHora: 1, memoriaGbHora: 1, invocacionesMillon: 1,
    transferenciaGb: 1, transferenciaOrigenGb: 1, edgeRequestsMillon: 1,
    createdAt: new Date(),
  })
})

describe('acumulación horaria', () => {
  it('suma en la misma fila cuando dos procesos reportan la misma hora', async () => {
    // El caso real: Fluid corre varios procesos por proyecto y cada uno solo
    // conoce su trozo. Si el UPSERT reemplazara en vez de sumar, se facturaría
    // el consumo de un solo proceso.
    const h = hora('2026-09-07T10:00:00Z')
    await acumular(PROYECTO, h, { cpuMs: 1000, invocations: 5 })
    await acumular(PROYECTO, h, { cpuMs: 2500, invocations: 7 })

    const filas = await db.select().from(computeUsageHourly)
    expect(filas).toHaveLength(1)
    expect(filas[0].cpuMs).toBe(3500)
    expect(filas[0].invocations).toBe(12)
  })

  it('mantiene separados los proyectos y las horas', async () => {
    await acumular(PROYECTO, hora('2026-09-07T10:00:00Z'), { cpuMs: 100 })
    await acumular(PROYECTO, hora('2026-09-07T11:00:00Z'), { cpuMs: 200 })
    await acumular(OTRO, hora('2026-09-07T10:00:00Z'), { cpuMs: 999 })

    const consumos = await consumoDelPeriodo('2026-09')
    expect(consumos).toHaveLength(2)
    expect(consumos.find((c) => c.projectId === PROYECTO)!.cpuMs).toBe(300)
    expect(consumos.find((c) => c.projectId === OTRO)!.cpuMs).toBe(999)
  })

  it('el agregado del periodo no incluye horas de otros meses', async () => {
    await acumular(PROYECTO, hora('2026-08-31T23:00:00Z'), { cpuMs: 500 })
    await acumular(PROYECTO, hora('2026-09-01T00:00:00Z'), { cpuMs: 70 })
    await acumular(PROYECTO, hora('2026-09-30T23:00:00Z'), { cpuMs: 30 })
    await acumular(PROYECTO, hora('2026-10-01T00:00:00Z'), { cpuMs: 900 })

    const [consumo] = await consumoDelPeriodo('2026-09')
    expect(consumo.cpuMs).toBe(100)
  })
})

describe('idempotencia de lotes', () => {
  it('el UNIQUE del lote impide aplicar dos veces el mismo consumo', async () => {
    // Un reintento del instrumentador tras un timeout de red es normal. Sin
    // esta marca, ese reintento le cobraría de más a una empresa, que es el
    // peor error que puede cometer este sistema.
    const id = `${PROYECTO}:lote-repetido`
    await db.insert(computeBatches).values({ id, projectId: PROYECTO, receivedAt: new Date() })
    await expect(
      db.insert(computeBatches).values({ id, projectId: PROYECTO, receivedAt: new Date() }),
    ).rejects.toThrow()
  })

  it('el mismo batchId en proyectos distintos no colisiona', async () => {
    // La clave lleva el proyecto delante: dos instrumentadores independientes
    // pueden generar el mismo identificador sin que uno anule al otro.
    await db.insert(computeBatches).values({ id: `${PROYECTO}:x1`, projectId: PROYECTO, receivedAt: new Date() })
    await db.insert(computeBatches).values({ id: `${OTRO}:x1`, projectId: OTRO, receivedAt: new Date() })
    expect(await db.select().from(computeBatches)).toHaveLength(2)
  })

  it('la limpieza borra los lotes viejos y conserva los recientes', async () => {
    const ahora = Date.parse('2026-09-07T00:00:00Z')
    await db.insert(computeBatches).values([
      { id: 'viejo', projectId: PROYECTO, receivedAt: new Date(ahora - 50 * 24 * HORA_MS) },
      { id: 'nuevo', projectId: PROYECTO, receivedAt: new Date(ahora - 2 * 24 * HORA_MS) },
    ])
    await limpiarLotes(ahora)
    const quedan = await db.select().from(computeBatches)
    expect(quedan.map((f) => f.id)).toEqual(['nuevo'])
  })
})

describe('recálculo del periodo', () => {
  beforeEach(async () => {
    await db.insert(computeTerms).values({
      projectId: PROYECTO, margenPct: 30, active: true, createdAt: new Date(),
    })
  })

  it('escribe la fila del periodo con el cobro calculado', async () => {
    await acumular(PROYECTO, hora('2026-09-07T10:00:00Z'), { cpuMs: 10 * HORA_MS })
    const r = await recalcularPeriodo('2026-09')

    expect(r.proyectos).toBe(1)
    const [fila] = await db.select().from(computePeriods)
    expect(fila.costoMedidoUsd).toBeCloseTo(10)
    expect(fila.totalUsd).toBeCloseTo(13)
    expect(fila.estado).toBe('abierto')
  })

  it('es idempotente: correrlo dos veces no duplica ni acumula', async () => {
    await acumular(PROYECTO, hora('2026-09-07T10:00:00Z'), { cpuMs: 10 * HORA_MS })
    await recalcularPeriodo('2026-09')
    await recalcularPeriodo('2026-09')

    const filas = await db.select().from(computePeriods)
    expect(filas).toHaveLength(1)
    expect(filas[0].costoMedidoUsd).toBeCloseTo(10)
  })

  it('omite proyectos sin términos cargados en vez de facturarlos sin margen', async () => {
    await acumular(OTRO, hora('2026-09-07T10:00:00Z'), { cpuMs: 5 * HORA_MS })
    const r = await recalcularPeriodo('2026-09')
    expect(r.proyectos).toBe(0)
    expect(r.omitidos).toBe(1)
    expect(await db.select().from(computePeriods)).toHaveLength(0)
  })

  it('omite los proyectos con la medición desactivada', async () => {
    await db.update(computeTerms).set({ active: false })
    await acumular(PROYECTO, hora('2026-09-07T10:00:00Z'), { cpuMs: 5 * HORA_MS })
    const r = await recalcularPeriodo('2026-09')
    expect(r.omitidos).toBe(1)
  })

  it('no toca un periodo ya facturado', async () => {
    // La cifra que se le envió a una empresa no puede moverse porque alguien
    // ajustó el margen tres meses después.
    await acumular(PROYECTO, hora('2026-09-07T10:00:00Z'), { cpuMs: 10 * HORA_MS })
    await recalcularPeriodo('2026-09')
    await db.update(computePeriods).set({ estado: 'facturado', totalUsd: 13 })

    await acumular(PROYECTO, hora('2026-09-08T10:00:00Z'), { cpuMs: 90 * HORA_MS })
    const r = await recalcularPeriodo('2026-09')

    expect(r.omitidos).toBe(1)
    const [fila] = await db.select().from(computePeriods)
    expect(fila.totalUsd).toBeCloseTo(13)
  })
})

describe('reconciliación contra la factura real', () => {
  beforeEach(async () => {
    await db.insert(computeTerms).values({
      projectId: PROYECTO, margenPct: 0, active: true, createdAt: new Date(),
    })
  })

  it('hereda el factor del último periodo con factura cargada', async () => {
    await db.insert(computePeriods).values({
      projectId: PROYECTO, periodo: '2026-08',
      costoMedidoUsd: 80, facturaRealUsd: 100, estado: 'facturado',
    })
    expect(await factorHeredado(PROYECTO, '2026-09')).toBeCloseTo(1.25)
  })

  it('aplica ese factor al cobro del periodo siguiente', async () => {
    await db.insert(computePeriods).values({
      projectId: PROYECTO, periodo: '2026-08',
      costoMedidoUsd: 80, facturaRealUsd: 100, estado: 'facturado',
    })
    await acumular(PROYECTO, hora('2026-09-07T10:00:00Z'), { cpuMs: 10 * HORA_MS })
    await recalcularPeriodo('2026-09')

    const fila = (await db.select().from(computePeriods)).find((f) => f.periodo === '2026-09')!
    expect(fila.costoMedidoUsd).toBeCloseTo(10)
    expect(fila.factorReconciliacion).toBeCloseTo(1.25)
    expect(fila.costoUsd).toBeCloseTo(12.5)
  })

  it('busca hacia atrás si el mes anterior no tiene factura cargada', async () => {
    // Cargar la factura es un acto manual y se puede olvidar un mes; el
    // sistema no debe volver a la medición cruda por ese olvido.
    await db.insert(computePeriods).values([
      { projectId: PROYECTO, periodo: '2026-06', costoMedidoUsd: 50, facturaRealUsd: 75, estado: 'facturado' },
      { projectId: PROYECTO, periodo: '2026-07', costoMedidoUsd: 60, estado: 'cerrado' },
      { projectId: PROYECTO, periodo: '2026-08', costoMedidoUsd: 70, estado: 'cerrado' },
    ])
    expect(await factorHeredado(PROYECTO, '2026-09')).toBeCloseTo(1.5)
  })

  it('sin ninguna factura cargada el factor es 1', async () => {
    expect(await factorHeredado(PROYECTO, '2026-09')).toBe(1)
  })

  it('ignora un factor fuera de rango: es un dato mal cargado', async () => {
    // 5 USD medidos contra 4000 facturados no es sesgo de medición, es un cero
    // de más al teclear. Arrastrarlo inflaría la siguiente factura real.
    await db.insert(computePeriods).values({
      projectId: PROYECTO, periodo: '2026-08',
      costoMedidoUsd: 5, facturaRealUsd: 4000, estado: 'facturado',
    })
    expect(await factorHeredado(PROYECTO, '2026-09')).toBe(1)
  })

  it('el factor de un proyecto no contamina a otro', async () => {
    await db.insert(computePeriods).values({
      projectId: OTRO, periodo: '2026-08',
      costoMedidoUsd: 80, facturaRealUsd: 100, estado: 'facturado',
    })
    expect(await factorHeredado(PROYECTO, '2026-09')).toBe(1)
  })
})
