import { describe, it, expect, afterAll, beforeAll, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Enlace del cliente de Cotiza (RF-224) contra libSQL en archivo temporal, con
// las tablas creadas por el SQL REAL de las migraciones 0045 y 0046.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `cotiza-enlace-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import { aceptar, congelar, crearAdicionalManual, crearEncargo, decidirAdicional, encargo, guardarConfig, reabrir, type Encargo } from '../src/lib/cotiza/db'
import {
  aceptarPorCliente,
  constanciaAceptacion,
  constanciaDecision,
  decidirPorCliente,
  encargoPorToken,
  estaVencida,
  generarEnlace,
  hashToken,
  registrarVista,
  tokenDe,
} from '../src/lib/cotiza/enlace'
import type { ConfigEncargo } from '../src/lib/cotiza/encargo'

let client: { execute: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> }

const CONFIG: ConfigEncargo = {
  titulo: 'Presentaciones para el comité',
  cliente: { nombre: 'Carolina Restrepo', empresa: 'Distribuidora del Caribe', contacto: '' },
  moneda: 'COP',
  entregables: [{ tipo: 'presentacion', nombre: 'Resultados del trimestre', diapositivas: 12, anexos: false, documentosFuente: 6, cantidad: 1 }],
  exclusiones: ['Negociación con agentes de carga'],
  supuestos: [],
  notas: 'NOTA PRIVADA: cliente que regatea',
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-06T15:00:00Z'))
  vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64))
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client
  for (const archivo of ['0045_low_dormammu.sql', '0046_woozy_dark_phoenix.sql']) {
    for (const s of readFileSync(join(__dirname, '..', 'drizzle', archivo), 'utf8').split('--> statement-breakpoint')) {
      if (s.trim()) await client.execute(s)
    }
  }
})

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

beforeEach(async () => {
  for (const t of ['cotiza_adicionales', 'cotiza_rondas', 'cotiza_reuniones', 'cotiza_solicitudes', 'cotiza_encargos']) await client.execute(`DELETE FROM ${t}`)
})

const recargar = async (e: Encargo) => (await encargo(e.id))!
const enviado = async () => congelar(await crearEncargo(CONFIG))

describe('el token', () => {
  it('se guarda como huella y cifrado, nunca en claro', async () => {
    const e = await enviado()
    const token = await generarEnlace(e)
    const fila = (await client.execute(`SELECT token_hash, token_cifrado FROM cotiza_encargos WHERE id = ${e.id}`)).rows[0]
    expect(fila.token_hash).toBe(hashToken(token))
    expect(String(fila.token_cifrado)).not.toContain(token)
    expect(tokenDe(await recargar(e))).toBe(token)
  })

  it('abre su encargo; un token de otra forma ni consulta, y uno inventado no abre nada', async () => {
    const e = await enviado()
    const token = await generarEnlace(e)
    expect((await encargoPorToken(token))?.id).toBe(e.id)
    expect(await encargoPorToken('corto')).toBeNull()
    expect(await encargoPorToken('A'.repeat(22))).toBeNull()
    expect(await encargoPorToken(null)).toBeNull()
  })

  it('rotar el enlace mata el anterior', async () => {
    const e = await enviado()
    const viejo = await generarEnlace(e)
    const nuevo = await generarEnlace(await recargar(e))
    expect(await encargoPorToken(viejo)).toBeNull()
    expect((await encargoPorToken(nuevo))?.id).toBe(e.id)
  })

  it('un borrador no tiene enlace, y al reabrir el enlace deja de mostrar la propuesta', async () => {
    const b = await crearEncargo(CONFIG)
    await expect(generarEnlace(b)).rejects.toMatchObject({ status: 409 })
    const e = await enviado()
    const token = await generarEnlace(e)
    await reabrir(await recargar(e))
    expect(await encargoPorToken(token)).toBeNull()
  })

  it('cuenta las visitas', async () => {
    const e = await enviado()
    await generarEnlace(e)
    await registrarVista(await recargar(e))
    await registrarVista(await recargar(e))
    const f = await recargar(e)
    expect(f.vistas).toBe(2)
    expect(f.vistaPrimera).not.toBeNull()
  })
})

describe('aceptación del cliente', () => {
  it('acepta con constancia recalculable', async () => {
    const e = await enviado()
    const f = await aceptarPorCliente(e, { nombre: 'Carolina  Restrepo', documento: '1.020.304', acepto: true, huella: e.huella })
    expect(f.estado).toBe('aceptado')
    expect(f.aceptadoPor).toBe('Carolina Restrepo')
    expect(f.aceptacionHuella).toBe(
      constanciaAceptacion({ huellaPropuesta: e.huella!, nombre: 'Carolina Restrepo', documento: '1.020.304', instante: f.aceptadoEl!.toISOString() })
    )
  })

  it('exige nombre, documento, la casilla y la huella de lo que vio', async () => {
    const e = await enviado()
    await expect(aceptarPorCliente(e, { nombre: 'Ca', documento: '1020304', acepto: true, huella: e.huella })).rejects.toThrow(/nombre/)
    await expect(aceptarPorCliente(e, { nombre: 'Carolina', documento: '12', acepto: true, huella: e.huella })).rejects.toThrow(/documento/)
    await expect(aceptarPorCliente(e, { nombre: 'Carolina', documento: '1020304', acepto: false, huella: e.huella })).rejects.toThrow(/casilla/)
    await expect(aceptarPorCliente(e, { nombre: 'Carolina', documento: '1020304', acepto: true, huella: 'otra' })).rejects.toMatchObject({ status: 409 })
  })

  it('si Mike reabre, cambia algo y vuelve a congelar, no se acepta la versión vieja', async () => {
    const e = await enviado()
    const vieja = e.huella
    const borrador = await guardarConfig(await reabrir(e), { ...CONFIG, entregables: [{ ...CONFIG.entregables[0], diapositivas: 25 }] })
    const otra = await congelar(borrador)
    expect(otra.huella).not.toBe(vieja)
    await expect(aceptarPorCliente(otra, { nombre: 'Carolina', documento: '1020304', acepto: true, huella: vieja })).rejects.toMatchObject({ status: 409 })
  })

  it('dos aceptaciones: la segunda choca', async () => {
    const e = await enviado()
    await aceptarPorCliente(e, { nombre: 'Carolina', documento: '1020304', acepto: true, huella: e.huella })
    await expect(aceptarPorCliente(e, { nombre: 'Carolina', documento: '1020304', acepto: true, huella: e.huella })).rejects.toMatchObject({ status: 409 })
  })

  it('vencida a los 15 días no se acepta', async () => {
    const e = await enviado()
    expect(estaVencida(e, new Date('2026-10-20T15:00:00Z'))).toBe(false)
    expect(estaVencida(e, new Date('2026-10-22T15:00:00Z'))).toBe(true)
    vi.setSystemTime(new Date('2026-10-25T15:00:00Z'))
    try {
      await expect(aceptarPorCliente(e, { nombre: 'Carolina', documento: '1020304', acepto: true, huella: e.huella })).rejects.toThrow(/venció/)
    } finally {
      vi.setSystemTime(new Date('2026-10-06T15:00:00Z'))
    }
  })
})

describe('decisiones del cliente sobre adicionales', () => {
  const enCurso = async () => aceptar(await enviado())

  it('aprueba con constancia y queda registrado quién', async () => {
    const e = await enCurso()
    const a = await crearAdicionalManual(e, { descripcion: 'Comparativo de agentes', horas: 2, nivel: 'analitica' })
    const f = await decidirPorCliente(e, { adicionalId: a.id, decision: 'aprobado', nombre: 'Carolina Restrepo' })
    expect(f).toMatchObject({ estado: 'aprobado', decididoPor: 'cliente', decididoNombre: 'Carolina Restrepo' })
    expect(f.constancia).toBe(
      constanciaDecision({ encargoId: e.id, adicionalId: a.id, monto: a.monto, decision: 'aprobado', nombre: 'Carolina Restrepo', instante: f.decididoEl!.toISOString() })
    )
  })

  it('no puede decidir adicionales de otro encargo ni decidir dos veces', async () => {
    const e = await enCurso()
    const otro = await enCurso()
    const a = await crearAdicionalManual(otro, { descripcion: 'Ajeno', horas: 1, nivel: 'documental' })
    await expect(decidirPorCliente(e, { adicionalId: a.id, decision: 'aprobado', nombre: 'Carolina' })).rejects.toMatchObject({ status: 409 })
    await decidirPorCliente(otro, { adicionalId: a.id, decision: 'rechazado', nombre: 'Carolina' })
    await expect(decidirPorCliente(otro, { adicionalId: a.id, decision: 'aprobado', nombre: 'Carolina' })).rejects.toMatchObject({ status: 409 })
  })

  it('lo que Mike marca a mano queda como suyo', async () => {
    const e = await enCurso()
    const a = await crearAdicionalManual(e, { descripcion: 'Uno', horas: 1, nivel: 'documental' })
    expect((await decidirAdicional(e, a.id, 'aprobado')).decididoPor).toBe('mike')
  })

  it('sin propuesta en curso no hay decisiones', async () => {
    const e = await enviado()
    await expect(decidirPorCliente(e, { adicionalId: 1, decision: 'aprobado', nombre: 'Carolina' })).rejects.toMatchObject({ status: 409 })
  })
})
