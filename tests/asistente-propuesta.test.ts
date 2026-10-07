import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// BD libsql en archivo temporal (no :memory:, ver CLAUDE.md) con el schema real.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `asistente-propuesta-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

// La IA de Plano es la única pieza falsa: el resto (base, motor de precios,
// citas verificadas) es el de verdad.
const { pedirJson } = vi.hoisted(() => ({ pedirJson: vi.fn() }))
vi.mock('../src/lib/plano/ia/motor', async (original) => ({ ...(await original<typeof import('../src/lib/plano/ia/motor')>()), pedirJson }))

import { eq } from 'drizzle-orm'
import { db } from '../src/db'
import { appSettings, clients, propuestas } from '../src/db/schema'
import { escritura } from '../src/lib/asistente/escrituras'
import { TOPE_ASISTENTE } from '../src/lib/asistente/presupuesto'
import type { SalidaChat } from '../src/lib/plano/ia/chat'
import { IaNoDisponible } from '../src/lib/plano/ia/motor'

const CONV = `[10:02] Laura: Hola Mike, tengo una panadería y quiero vender mis tortas por internet.
[10:03] Laura: Que la gente pague con PSE y me llegue el pedido. Mi número es 300 111 2233.
[10:06] Laura: Unos 30 productos, sin inventario por ahora.`

const salida = (): SalidaChat => ({
  titulo: 'Tienda de La Espiga',
  resumen: 'Necesitas vender tus tortas por internet y cobrar con PSE.',
  cliente: { nombre: 'Laura', empresa: 'Panadería La Espiga', tipo: 'persona', telefono: '3001112233', correo: 'laura@espiga.co' },
  base: 'negocio',
  moneda: 'COP',
  componentes: [
    { id: 'tienda', cantidad: 1, prioridad: 'esencial', cita: 'quiero vender mis tortas por internet', razon: 'Vende en línea', respuestas: [] },
    { id: 'pagos', cantidad: 1, prioridad: 'esencial', cita: 'Que la gente pague con PSE', razon: 'Cobra en línea', respuestas: [] },
  ],
  exclusiones: [],
  preguntasAbiertas: ['¿Haces domicilios? Escríbeme a laura@espiga.co'],
})

const crear = escritura('crear_propuesta')!
let cliente: number

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  await migrate(db as never, { migrationsFolder: 'drizzle' })
})

beforeEach(async () => {
  pedirJson.mockReset()
  for (const t of [propuestas, appSettings, clients]) await db.delete(t)
  const [c] = await db.insert(clients).values({ name: 'Laura', company: 'Panadería La Espiga', createdAt: new Date() }).returning()
  cliente = c!.id
})

describe('crear_propuesta (fase 3, sobre Plano)', () => {
  it('preparar no llama a la IA ni crea nada, y la tarjeta no lleva el teléfono', async () => {
    const p = await crear.preparar({ conversacion: CONV, titulo: 'Tienda de La Espiga', clienteId: cliente })
    if (!p.ok) throw new Error(p.error)
    expect(pedirJson).not.toHaveBeenCalled()
    expect(await db.select().from(propuestas)).toHaveLength(0)
    const v = p.vista as any
    expect(v.contexto).toBe('Panadería La Espiga')
    expect(v.avisos[0]).toMatch(/centavos/)
    expect(JSON.stringify(v)).not.toContain('111 2233')
  })

  it('al aprobar crea el borrador, guarda la conversación completa y la lee con la IA de Plano', async () => {
    pedirJson.mockResolvedValue({ datos: salida(), costo: 0.02 })
    const r = await crear.ejecutar({ conversacion: CONV, clienteId: cliente })
    if (!r.ok) throw new Error(r.error)
    const d = r.datos as any
    expect(d).toMatchObject({ hecho: true, iaLeyo: true, enlace: `/admin/plano/${d.id}` })
    expect(d.componentes).toBeGreaterThanOrEqual(2)
    // El rango sale formateado por el motor: el modelo lo cita, no lo calcula.
    expect(d.rango.desde.texto).toMatch(/COP$/)
    expect(d.rango.hasta.texto).toMatch(/COP$/)
    // Y en la forma que la guardia de cifras reconoce como dinero de una herramienta.
    const { recogerCifras } = await import('../src/lib/asistente/cifras')
    expect(recogerCifras(d).has(d.rango.hasta.valor)).toBe(true)

    const [fila] = await db.select().from(propuestas).where(eq(propuestas.id, d.id))
    expect(fila).toMatchObject({ estado: 'borrador', clientId: cliente, conversacion: CONV })
    expect(fila!.iaUsd).toBeCloseTo(0.02)
    const config = JSON.parse(fila!.config)
    expect(config.lineas.map((l: { id: string }) => l.id)).toEqual(expect.arrayContaining(['tienda', 'pagos', 'descubrimiento']))

    // Lo que vuelve al modelo del asistente no trae ni el correo ni el teléfono.
    expect(JSON.stringify(d)).not.toMatch(/laura@espiga|3001112233/)
    // Y la lectura cuenta para el tope diario del asistente.
    expect(await TOPE_ASISTENTE.presupuestoRestante()).toBeLessThan(3)
  })

  it('si la IA de Plano falla, la propuesta queda igual con la conversación, y lo dice', async () => {
    pedirJson.mockRejectedValue(new IaNoDisponible('api'))
    const r = await crear.ejecutar({ conversacion: CONV })
    if (!r.ok) throw new Error(r.error)
    const d = r.datos as any
    expect(d).toMatchObject({ hecho: true, iaLeyo: false, rango: null })
    expect(d.motivoSinIa).toMatch(/Leer el chat/)
    const [fila] = await db.select().from(propuestas).where(eq(propuestas.id, d.id))
    expect(fila).toMatchObject({ estado: 'borrador', conversacion: CONV, clientId: null })
  })

  it('rechaza una conversación demasiado corta y un cliente que no existe', async () => {
    expect(await crear.preparar({ conversacion: 'Hola, ¿cuánto vale?' })).toMatchObject({ ok: false })
    expect(await crear.preparar({ conversacion: CONV, clienteId: 9999 })).toMatchObject({ ok: false })
  })
})
