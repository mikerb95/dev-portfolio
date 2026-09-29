import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

// BD libsql en archivo temporal (no :memory:, ver CLAUDE.md), con la tabla
// creada por la MISMA migración que irá a Turso: si el schema y el SQL
// divergieran, este test lo vería.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `analista-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import { nuevaEjecucion } from '../src/lib/analista/bucle'
import {
  crearEjecucion,
  EN_CURSO_MS,
  gastoUltimas24h,
  guardarEjecucion,
  hayEnCurso,
  listarEjecuciones,
  obtenerEjecucion,
  presupuestoRestante,
  purgarEjecuciones,
  reclamarPropuesta,
  RETENCION_DIAS,
} from '../src/lib/analista/ejecuciones'

let client: { execute: (sql: string) => Promise<unknown> }

beforeAll(async () => {
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client
  const sql = readFileSync('drizzle/0037_free_darkhawk.sql', 'utf8')
  for (const sentencia of sql.split('--> statement-breakpoint')) {
    if (sentencia.trim()) await client.execute(sentencia)
  }
})

beforeEach(async () => {
  await client.execute('DELETE FROM analista_ejecuciones')
})

function pausada(id: string) {
  const e = nuevaEjecucion(id, 'Analiza')
  e.estado = 'esperando_aprobacion'
  e.seudonimos = { 'origen-01': '203.0.113.7' }
  e.propuesta = {
    toolUseId: 't1',
    origen: 'origen-01',
    motivo: 'fuerza bruta persistente',
    entrada: { origen: 'origen-01', motivo: 'fuerza bruta persistente' },
    resultadosPrevios: [],
    orden: ['t1'],
  }
  e.costoUsd = 0.5
  return e
}

describe('ejecuciones del analista (libSQL)', () => {
  it('guarda y recupera una ejecución pausada sin perder nada', async () => {
    const e = pausada('e1')
    await crearEjecucion(e)
    expect(await obtenerEjecucion('e1')).toEqual(e)
  })

  it('una propuesta solo se puede reclamar una vez', async () => {
    await crearEjecucion(pausada('e1'))
    const [a, b] = await Promise.all([reclamarPropuesta('e1'), reclamarPropuesta('e1')])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect((a ?? b)!.estado).toBe('corriendo')
    expect((a ?? b)!.propuesta?.origen).toBe('origen-01')
    expect(await reclamarPropuesta('e1')).toBeNull()
  })

  it('el tope diario cuenta solo el gasto de las últimas 24 h', async () => {
    const ahora = new Date('2026-09-30T12:00:00Z')
    const vieja = nuevaEjecucion('vieja', 'x')
    vieja.costoUsd = 2
    await crearEjecucion(vieja, new Date(ahora.getTime() - 25 * 3_600_000))
    const reciente = nuevaEjecucion('reciente', 'y')
    reciente.costoUsd = 1.25
    await crearEjecucion(reciente, new Date(ahora.getTime() - 3_600_000))
    expect(await gastoUltimas24h(ahora)).toBeCloseTo(1.25)
    expect(await presupuestoRestante(ahora)).toBeCloseTo(3 - 1.25)
  })

  it('solo cuenta como en curso lo que corre y tuvo actividad reciente', async () => {
    const ahora = new Date('2026-09-30T12:00:00Z')
    const muerta = nuevaEjecucion('muerta', 'x')
    await crearEjecucion(muerta, new Date(ahora.getTime() - EN_CURSO_MS - 1000))
    expect(await hayEnCurso(ahora)).toBe(false)
    const viva = nuevaEjecucion('viva', 'y')
    await crearEjecucion(viva, new Date(ahora.getTime() - 1000))
    expect(await hayEnCurso(ahora)).toBe(true)
    viva.estado = 'terminada'
    await guardarEjecucion(viva, ahora)
    expect(await hayEnCurso(ahora)).toBe(false)
  })

  it('el historial no expone mensajes, seudónimos ni IPs', async () => {
    await crearEjecucion(pausada('e1'))
    const [r] = await listarEjecuciones()
    expect(r).toMatchObject({ id: 'e1', pendiente: { origen: 'origen-01', motivo: 'fuerza bruta persistente' } })
    expect(JSON.stringify(r)).not.toContain('203.0.113.7')
    expect(r).not.toHaveProperty('mensajes')
    expect(r).not.toHaveProperty('seudonimos')
  })

  it('purga lo que pasó la retención', async () => {
    const ahora = new Date('2026-09-30T12:00:00Z')
    await crearEjecucion(nuevaEjecucion('vieja', 'x'), new Date(ahora.getTime() - (RETENCION_DIAS + 1) * 86_400_000))
    await crearEjecucion(nuevaEjecucion('nueva', 'y'), ahora)
    expect(await purgarEjecuciones(ahora)).toBe(1)
    expect(await obtenerEjecucion('nueva')).not.toBeNull()
  })
})
