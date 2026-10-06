import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// BD libsql en archivo temporal (no :memory:, ver CLAUDE.md) con el schema real.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `asistente-cuenta-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import { db } from '../src/db'
import { appSettings, clients, invoiceItems, invoices, projects } from '../src/db/schema'
import { ESCRITURAS, escritura } from '../src/lib/asistente/escrituras'
import { crearCuentaCobroAprobada, prepararCuentaCobro } from '../src/lib/asistente/escrituras/cuenta-cobro'
import { HERRAMIENTAS } from '../src/lib/asistente/herramientas'

const NIT = '900.123.456-7'
const DIRECCION = 'Calle 1 # 2-3'

let ids: { completo: number; sinNit: number; proyecto: number; ajeno: number }

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  await migrate(db as never, { migrationsFolder: 'drizzle' })
})

beforeEach(async () => {
  for (const t of [invoiceItems, invoices, projects, clients, appSettings]) await db.delete(t)
  const ahora = new Date()
  const [a] = await db
    .insert(clients)
    .values({ name: 'Laura', company: 'Norte SAS', billingInfo: JSON.stringify({ nit: NIT, direccion: DIRECCION, ciudad: 'Bogotá' }), createdAt: ahora })
    .returning()
  const [b] = await db.insert(clients).values({ name: 'Panadería Sur', createdAt: ahora }).returning()
  const [p] = await db.insert(projects).values({ slug: 'reservas', title: 'Reservas', status: 'activo', clientId: a!.id, createdAt: ahora }).returning()
  const [q] = await db.insert(projects).values({ slug: 'tienda', title: 'Tienda', status: 'activo', clientId: b!.id, createdAt: ahora }).returning()
  await db.insert(appSettings).values(
    Object.entries({
      emisor_nombre: 'Mike',
      emisor_cedula: '1.000.000',
      emisor_direccion: 'Cra 7',
      emisor_ciudad: 'Bogotá',
      emisor_banco: 'Banco',
      emisor_numero_cuenta: '123',
    }).map(([key, value]) => ({ key, value, updatedAt: ahora }))
  )
  ids = { completo: a!.id, sinNit: b!.id, proyecto: p!.id, ajeno: q!.id }
})

const entrada = (extra: Record<string, unknown> = {}) => ({
  clienteId: ids.completo,
  proyectoId: ids.proyecto,
  conceptos: [{ descripcion: 'Hito 2: agenda en línea', cantidad: 1, valorUnitario: 1_200_000 }],
  concepto: 'Desarrollo del módulo de reservas, hito 2',
  ...extra,
})

describe('crear_cuenta_cobro', () => {
  it('no está en el catálogo de lectura (la terminal no la ve)', () => {
    expect(HERRAMIENTAS.map((h) => h.nombre)).not.toContain('crear_cuenta_cobro')
    expect(ESCRITURAS.map((e) => e.nombre)).toContain('crear_cuenta_cobro')
  })

  it('preparar calcula la cuenta con las funciones del panel y no escribe nada', async () => {
    const p = await prepararCuentaCobro(entrada({ retenciones: ['honorarios'] }))
    if (!p.ok) throw new Error(p.error)
    expect(p.vista.cliente.nombre).toBe('Norte SAS')
    expect(p.vista.proyecto?.titulo).toBe('Reservas')
    expect(p.vista.subtotal.texto).toContain('1.200.000')
    // 10 % de honorarios (no declarante, el valor por defecto).
    expect(p.vista.retenciones[0]).toMatchObject({ aplicada: true })
    expect(p.vista.retenciones[0]!.valor.texto).toContain('120.000')
    expect(p.vista.neto.texto).toContain('1.080.000')
    expect(p.vista.ciudad).toBe('Bogotá')
    expect(p.vista.faltantesParaEmitir).toEqual([])
    expect(await db.select().from(invoices)).toHaveLength(0)
  })

  it('la vista nunca lleva el NIT ni la dirección del deudor', async () => {
    const w = escritura('crear_cuenta_cobro')!
    const p = await w.preparar(entrada())
    expect(JSON.stringify(p)).not.toContain(NIT)
    expect(JSON.stringify(p)).not.toContain(DIRECCION)
  })

  it('dice qué falta para emitir sin inventarlo, y el borrador se puede crear igual', async () => {
    const p = await prepararCuentaCobro(entrada({ clienteId: ids.sinNit, proyectoId: undefined }))
    if (!p.ok) throw new Error(p.error)
    expect(p.vista.faltantesParaEmitir.join(' ')).toMatch(/NIT/)
  })

  it('rechaza un proyecto de otro cliente y un cliente que no existe', async () => {
    const ajeno = await prepararCuentaCobro(entrada({ proyectoId: ids.ajeno }))
    expect(ajeno).toMatchObject({ ok: false })
    expect((ajeno as any).error).toMatch(/no es de Laura/)
    expect(await prepararCuentaCobro(entrada({ clienteId: 999_999 }))).toMatchObject({ ok: false })
    expect(await prepararCuentaCobro(entrada({ vence: '2026-02-30' }))).toMatchObject({ ok: false })
  })

  it('al aprobar crea un BORRADOR con la numeración del panel y sus líneas', async () => {
    const r = await crearCuentaCobroAprobada(entrada({ vence: '2026-10-30' }))
    if (!r.ok) throw new Error(r.error)
    expect(r.datos).toMatchObject({ creada: true, estado: 'borrador' })
    expect(r.datos.numero).toMatch(/^CC-\d{4}-001$/)
    expect(r.datos.enlace).toBe(`/admin/cuentas-cobro/${r.datos.id}`)
    const [fila] = await db.select().from(invoices)
    expect(fila).toMatchObject({ status: 'draft', docType: 'cuenta_cobro', totalCents: 120_000_000, clientId: ids.completo, projectId: ids.proyecto })
    expect(await db.select().from(invoiceItems)).toHaveLength(1)
  })
})
