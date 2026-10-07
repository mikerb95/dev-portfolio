import { readFileSync } from 'node:fs'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'

// libSQL en archivo temporal (no ':memory:'), igual que tests/payments.test.ts.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `vigia-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

const { push, corrida } = vi.hoisted(() => ({
  push: vi.fn(async () => ({ channel: 'push' as const, ok: true })),
  corrida: vi.fn(async () => {}),
}))
vi.mock('../src/lib/notify', () => ({ sendPush: push }))
vi.mock('../src/lib/cron-runs', () => ({ registrarCronRun: corrida }))

import { VIGIA_AGENT_ID } from '../src/lib/vigia/config'
import { procesarSesion } from '../src/lib/vigia/sesion'

const INFORME = readFileSync(new URL('./fixtures/vigia-informe-2026-10-06.json', import.meta.url), 'utf8')
type Db = { execute: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> }
const base = async () => ((await import('../src/db')) as unknown as { __client: Db }).__client

/** Cliente falso con lo justo que lee procesarSesion. */
function cliente(opts: {
  agente?: string
  status: 'idle' | 'terminated' | 'running'
  parada?: { type: string; event_ids?: string[] } | null
  archivos?: Record<string, string>
  usos?: { id: string; type: string; name: string; input: unknown }[]
}): Anthropic {
  const archivos = opts.archivos ?? {}
  const lista = <T,>(data: T[]) => Object.assign(Promise.resolve({ data }), {
    async *[Symbol.asyncIterator]() { yield* data },
    data,
  })
  return {
    beta: {
      sessions: {
        retrieve: async (id: string) => ({
          id,
          agent: { id: opts.agente ?? VIGIA_AGENT_ID },
          status: opts.status,
          created_at: '2026-10-06T23:30:00Z',
          usage: { list_cost: { amount: '191', currency: 'USD' }, active_seconds: 602.4 },
        }),
        events: {
          list: (_id: string, p: { types: string[] }) => {
            if (p.types.includes('session.status_idle')) {
              const data = opts.parada ? [{ id: 'sevt_idle', type: 'session.status_idle', stop_reason: opts.parada }] : []
              return Object.assign(Promise.resolve({ data }), { data })
            }
            return lista(opts.usos ?? [])
          },
        },
      },
      files: {
        list: () => lista(Object.keys(archivos).map((n) => ({ id: `file_${n}`, filename: n }))),
        download: async (id: string) => new Response(archivos[id.replace(/^file_/, '')] ?? '', { status: 200 }),
      },
    },
  } as unknown as Anthropic
}

beforeAll(async () => {
  await (await base()).execute(`CREATE TABLE vigia_corridas (
    session_id text PRIMARY KEY NOT NULL, desenlace text NOT NULL, estado text, resumen text,
    informe text, informe_md text, pendientes text, costo_centavos integer, activo_segundos integer,
    creada integer NOT NULL, actualizada integer NOT NULL)`)
})

beforeEach(async () => {
  await (await base()).execute('DELETE FROM vigia_corridas')
  push.mockClear()
  corrida.mockClear()
})

const fila = async (id: string) => (await (await base()).execute(`SELECT * FROM vigia_corridas WHERE session_id = '${id}'`)).rows[0]

describe('procesarSesion', () => {
  it('guarda el informe real, anota la corrida y avisa una sola vez aunque el aviso llegue duplicado', async () => {
    const c = cliente({ status: 'idle', parada: { type: 'end_turn' }, archivos: { 'informe.json': INFORME, 'informe.md': '# Vigía' } })
    const r1 = await procesarSesion(c, 'sesn_a')
    const r2 = await procesarSesion(c, 'sesn_a')
    expect(r1).toEqual({ ignorada: false, desenlace: 'informe', anunciado: true })
    expect(r2).toEqual({ ignorada: false, desenlace: 'informe', anunciado: false })
    expect(corrida).toHaveBeenCalledTimes(1)
    expect(corrida).toHaveBeenCalledWith('vigia-nocturno', true, 602000, 'informe entregado')
    expect(push).toHaveBeenCalledTimes(1)
    const f = await fila('sesn_a')
    expect(f.estado).toBe('amarillo')
    expect(f.costo_centavos).toBe(191)
    expect(f.informe_md).toBe('# Vigía')
  })

  it('un terminated posterior no borra el informe ni cuenta otra corrida', async () => {
    await procesarSesion(cliente({ status: 'idle', parada: { type: 'end_turn' }, archivos: { 'informe.json': INFORME } }), 'sesn_b')
    const r = await procesarSesion(cliente({ status: 'terminated', parada: null }), 'sesn_b')
    expect(r).toMatchObject({ desenlace: 'error', anunciado: false })
    const f = await fila('sesn_b')
    expect(f.desenlace).toBe('informe')
    expect(f.estado).toBe('amarillo')
    expect(corrida).toHaveBeenCalledTimes(1)
  })

  it('ignora sesiones de otros agentes del workspace', async () => {
    const r = await procesarSesion(cliente({ agente: 'agent_otro', status: 'idle', parada: { type: 'end_turn' } }), 'sesn_c')
    expect(r).toEqual({ ignorada: true })
    expect(await fila('sesn_c')).toBeUndefined()
  })

  it('el tope de gasto cuenta como corrida fallida', async () => {
    await procesarSesion(cliente({ status: 'idle', parada: { type: 'budget_reached' } }), 'sesn_d')
    expect(corrida).toHaveBeenCalledWith('vigia-nocturno', false, 602000, 'tope de gasto')
    expect((await fila('sesn_d')).desenlace).toBe('tope')
  })

  it('una aprobación pendiente guarda qué quiere usar y avisa sin contar corrida', async () => {
    const c = cliente({
      status: 'idle',
      parada: { type: 'requires_action', event_ids: ['sevt_1'] },
      usos: [{ id: 'sevt_1', type: 'agent.mcp_tool_use', name: 'create_issue', input: { title: 'NaN commits' } }],
    })
    await procesarSesion(c, 'sesn_e')
    const f = await fila('sesn_e')
    expect(JSON.parse(String(f.pendientes))).toEqual([{ eventId: 'sevt_1', nombre: 'create_issue', entrada: '{"title":"NaN commits"}' }])
    expect(corrida).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('un informe.json con otra forma se marca como corrida fallida pero guarda el .md', async () => {
    await procesarSesion(cliente({ status: 'idle', parada: { type: 'end_turn' }, archivos: { 'informe.json': '{"x":1}', 'informe.md': 'texto' } }), 'sesn_f')
    expect(corrida).toHaveBeenCalledWith('vigia-nocturno', false, 602000, 'informe con forma inválida')
    const f = await fila('sesn_f')
    expect(f.estado).toBeNull()
    expect(f.informe_md).toBe('texto')
  })
})
