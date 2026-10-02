// El endpoint que revela la IP real detrás de un alias del analista, llamado de
// verdad. Lo que importa aquí es el cableado: que un alias solo se resuelva
// dentro del análisis del que salió, que la respuesta no quede en caché y que
// cada revelado deje rastro de auditoría.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Seudonimos } from '../src/lib/analista/seudonimos'

// vi.mock sube al principio del archivo: los dobles se crean con vi.hoisted.
const { recordAdminEvent, obtenerEjecucion, detalleOrigen } = vi.hoisted(() => ({
  recordAdminEvent: vi.fn(async () => {}),
  obtenerEjecucion: vi.fn(),
  detalleOrigen: vi.fn(async (ip: string) => ({ ip, eventos: 3 })),
}))
vi.mock('../src/lib/security/events', () => ({ recordAdminEvent }))
vi.mock('../src/lib/analista/ejecuciones', () => ({ obtenerEjecucion }))
vi.mock('../src/lib/analista/detalle-origen', () => ({ detalleOrigen }))

import { GET } from '../src/pages/api/admin/analista/origen'

async function llamar(params: Record<string, string>) {
  const url = new URL(`https://codebymike.net/api/admin/analista/origen?${new URLSearchParams(params)}`)
  const request = new Request(url)
  const res = await (GET as unknown as (ctx: unknown) => Promise<Response>)({ request, url })
  return { res, datos: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/analista/origen', () => {
  it('resuelve el alias con la tabla guardada del análisis y audita el revelado', async () => {
    obtenerEjecucion.mockResolvedValueOnce({ seudonimos: { 'origen-01': '203.0.113.7' } })

    const { res, datos } = await llamar({ id: 'abc', alias: 'origen-01' })

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(datos).toEqual({ ip: '203.0.113.7', eventos: 3 })
    expect(obtenerEjecucion).toHaveBeenCalledWith('abc')
    expect(recordAdminEvent).toHaveBeenCalledWith(expect.any(Request), 'analista.ip_revelada', { severity: 'medium' })
  })

  it('no resuelve un alias que no salió de ese análisis', async () => {
    obtenerEjecucion.mockResolvedValueOnce({ seudonimos: { 'origen-01': '203.0.113.7' } })
    const { res } = await llamar({ id: 'abc', alias: 'origen-02' })
    expect(res.status).toBe(404)
    expect(detalleOrigen).not.toHaveBeenCalled()
    expect(recordAdminEvent).not.toHaveBeenCalled()
  })

  it('no resuelve nada de un análisis que no existe', async () => {
    obtenerEjecucion.mockResolvedValueOnce(null)
    expect((await llamar({ id: 'nada', alias: 'origen-01' })).res.status).toBe(404)
  })

  it('pide el análisis y el alias', async () => {
    expect((await llamar({ alias: 'origen-01' })).res.status).toBe(400)
    expect((await llamar({ id: 'abc' })).res.status).toBe(400)
  })

  it('resuelve los análisis de la Agent SDK desde su tabla en memoria', async () => {
    const s = new Seudonimos()
    s.alias('198.51.100.9')
    const vivos = (globalThis as { __analistaSdkSeudonimos?: Map<string, Seudonimos> }).__analistaSdkSeudonimos!
    vivos.set('sdk-1', s)
    try {
      const { res, datos } = await llamar({ id: 'sdk-1', alias: 'origen-01' })
      expect(res.status).toBe(200)
      expect(datos.ip).toBe('198.51.100.9')
      expect(obtenerEjecucion).not.toHaveBeenCalled()
    } finally {
      vivos.delete('sdk-1')
    }
    // Terminado el análisis, su tabla ya no está.
    expect((await llamar({ id: 'sdk-1', alias: 'origen-01' })).res.status).toBe(404)
  })

  it('responde 503 si la base no responde, sin revelar nada', async () => {
    obtenerEjecucion.mockRejectedValueOnce(new Error('turso caído'))
    const { res } = await llamar({ id: 'abc', alias: 'origen-01' })
    expect(res.status).toBe(503)
    expect(recordAdminEvent).not.toHaveBeenCalled()
  })
})
