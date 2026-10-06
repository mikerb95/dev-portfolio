import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// BD libsql en archivo temporal (no :memory:, ver CLAUDE.md) con el schema real.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `asistente-escrituras-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

// El aviso al cliente sale por correo: aquí solo importa si se pidió.
const { notifyClient } = vi.hoisted(() => ({ notifyClient: vi.fn(async () => {}) }))
vi.mock('../src/lib/portal/notifications', () => ({ notifyClient }))

import { eq } from 'drizzle-orm'
import { db } from '../src/db'
import { clients, interactions, messages, portalActivity, projectMilestones, projects } from '../src/db/schema'
import { ESCRITURAS, escritura } from '../src/lib/asistente/escrituras'
import { soloDistintos } from '../src/lib/asistente/escrituras/cambio'
import { HERRAMIENTAS } from '../src/lib/asistente/herramientas'
import { avisaAlCliente, parcheHito } from '../src/lib/portal/hitos'

const NUEVAS = ['actualizar_proyecto', 'actualizar_hito', 'registrar_seguimiento', 'marcar_mensaje_leido']

let ids: { cliente: number; otro: number; proyecto: number; ajeno: number; visible: number; interno: number; pendiente: number; m1: number; m2: number; leido: number }

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  await migrate(db as never, { migrationsFolder: 'drizzle' })
})

beforeEach(async () => {
  notifyClient.mockClear()
  for (const t of [portalActivity, interactions, messages, projectMilestones, projects, clients]) await db.delete(t)
  const ahora = new Date()
  const [c] = await db.insert(clients).values({ name: 'Laura', company: 'Norte SAS', portalEnabled: true, createdAt: ahora }).returning()
  const [o] = await db.insert(clients).values({ name: 'Panadería Sur', createdAt: ahora }).returning()
  const [p] = await db
    .insert(projects)
    .values({ slug: 'reservas', title: 'Reservas', status: 'activo', clientId: c!.id, internalNotes: 'Nota vieja', startDate: new Date('2026-09-01T05:00:00Z'), createdAt: ahora })
    .returning()
  const [q] = await db.insert(projects).values({ slug: 'tienda', title: 'Tienda', status: 'activo', clientId: o!.id, createdAt: ahora }).returning()
  const [hv] = await db
    .insert(projectMilestones)
    .values({ projectId: p!.id, title: 'Diseño aprobado', status: 'en_curso', visibleToClient: true, createdAt: ahora })
    .returning()
  const [hi] = await db
    .insert(projectMilestones)
    .values({ projectId: p!.id, title: 'Refactor interno', status: 'pendiente', visibleToClient: false, createdAt: ahora })
    .returning()
  const [pe] = await db
    .insert(interactions)
    .values({ type: 'task', title: 'Llamar a Laura', clientId: c!.id, done: false, createdAt: ahora, updatedAt: ahora })
    .returning()
  const [m1] = await db.insert(messages).values({ name: 'Ana', email: 'ana@correo.com', subject: 'Cotización', body: 'Hola', read: false, createdAt: ahora }).returning()
  const [m2] = await db.insert(messages).values({ name: 'Beto', email: 'beto@correo.com', subject: null, body: 'Hola', read: false, createdAt: ahora }).returning()
  const [ml] = await db.insert(messages).values({ name: 'Ceci', email: 'ceci@correo.com', subject: 'Vieja', body: 'Hola', read: true, createdAt: ahora }).returning()
  ids = { cliente: c!.id, otro: o!.id, proyecto: p!.id, ajeno: q!.id, visible: hv!.id, interno: hi!.id, pendiente: pe!.id, m1: m1!.id, m2: m2!.id, leido: ml!.id }
})

const preparar = (nombre: string, entrada: unknown) => escritura(nombre)!.preparar(entrada)
const ejecutar = (nombre: string, entrada: unknown) => escritura(nombre)!.ejecutar(entrada)

describe('catálogo de escrituras (fase 5)', () => {
  it('las cuatro nuevas están, y ninguna en el catálogo de lectura (la terminal no las ve)', () => {
    const escrituras = ESCRITURAS.map((e) => e.nombre)
    const lecturas = HERRAMIENTAS.map((h) => h.nombre)
    for (const n of NUEVAS) {
      expect(escrituras).toContain(n)
      expect(lecturas).not.toContain(n)
    }
  })

  it('ninguna escritura sabe borrar: sus esquemas no tienen nada parecido', () => {
    for (const e of ESCRITURAS) expect(Object.keys(e.esquema.shape).join(' ')).not.toMatch(/borr|elimin|delete/i)
  })
})

describe('actualizar_proyecto', () => {
  it('prepara el antes y el después sin escribir', async () => {
    const p = await preparar('actualizar_proyecto', { proyectoId: ids.proyecto, estado: 'pausado', fin: '2026-12-15' })
    if (!p.ok) throw new Error(p.error)
    expect(p.vista).toMatchObject({ tipo: 'cambio', titulo: 'Reservas', contexto: 'Norte SAS' })
    expect((p.vista as any).cambios).toEqual([
      { campo: 'Estado', antes: 'Activo', despues: 'Pausado' },
      { campo: 'Fin', antes: null, despues: expect.stringContaining('2026') },
    ])
    const [fila] = await db.select().from(projects).where(eq(projects.id, ids.proyecto))
    expect(fila!.status).toBe('activo')
  })

  it('al aprobar guarda, y la nota se agrega al final sin pisar la anterior', async () => {
    const r = await ejecutar('actualizar_proyecto', { proyectoId: ids.proyecto, estado: 'pausado', nota: 'El cliente pidió pausar hasta enero' })
    expect(r).toMatchObject({ ok: true, datos: { hecho: true, enlace: `/admin/projects/${ids.proyecto}` } })
    const [fila] = await db.select().from(projects).where(eq(projects.id, ids.proyecto))
    expect(fila!.status).toBe('pausado')
    expect(fila!.internalNotes).toMatch(/^Nota vieja\n\n\[\d{4}-\d{2}-\d{2}\] El cliente pidió pausar hasta enero$/)
  })

  it('rechaza lo que no cambia nada, un fin antes del inicio y un proyecto que no existe', async () => {
    expect(await preparar('actualizar_proyecto', { proyectoId: ids.proyecto, estado: 'activo' })).toMatchObject({ ok: false })
    expect(await preparar('actualizar_proyecto', { proyectoId: ids.proyecto })).toMatchObject({ ok: false })
    expect(await preparar('actualizar_proyecto', { proyectoId: ids.proyecto, fin: '2026-08-01' })).toMatchObject({ ok: false, error: expect.stringContaining('antes del inicio') })
    expect(await preparar('actualizar_proyecto', { proyectoId: 9999, estado: 'pausado' })).toMatchObject({ ok: false })
    expect(await preparar('actualizar_proyecto', { proyectoId: ids.proyecto, fin: '2026-02-30' })).toMatchObject({ ok: false })
  })

  it('no acepta campos públicos del portafolio aunque el modelo los mande', async () => {
    await ejecutar('actualizar_proyecto', { proyectoId: ids.proyecto, estado: 'pausado', titulo: 'Otro', visible: true, slug: 'x' })
    const [fila] = await db.select().from(projects).where(eq(projects.id, ids.proyecto))
    expect(fila).toMatchObject({ title: 'Reservas', slug: 'reservas', visible: false })
  })
})

describe('actualizar_hito', () => {
  it('un hito visible avisa en grande que el cliente lo ve y que completarlo le manda correo', async () => {
    const p = await preparar('actualizar_hito', { hitoId: ids.visible, estado: 'completado' })
    if (!p.ok) throw new Error(p.error)
    const v = p.vista as any
    expect(v.rotulo).toMatch(/visible para el cliente/)
    expect(v.avisos).toHaveLength(2)
    expect(v.avisos[1]).toMatch(/aviso por correo/)
    expect(notifyClient).not.toHaveBeenCalled()
  })

  it('al aprobar completa el hito, avisa al cliente y deja el registro en su feed', async () => {
    const r = await ejecutar('actualizar_hito', { hitoId: ids.visible, estado: 'completado' })
    expect(r).toMatchObject({ ok: true, datos: { hecho: true, avisado: true } })
    const [h] = await db.select().from(projectMilestones).where(eq(projectMilestones.id, ids.visible))
    expect(h!.status).toBe('completado')
    expect(h!.completedAt).toBeInstanceOf(Date)
    expect(notifyClient).toHaveBeenCalledOnce()
    expect(await db.select().from(portalActivity)).toHaveLength(1)
  })

  it('un hito interno no avisa a nadie', async () => {
    const p = await preparar('actualizar_hito', { hitoId: ids.interno, estado: 'completado', vence: '2026-11-01' })
    if (!p.ok) throw new Error(p.error)
    expect((p.vista as any).avisos).toEqual([])
    const r = await ejecutar('actualizar_hito', { hitoId: ids.interno, estado: 'completado' })
    expect(r).toMatchObject({ ok: true, datos: { avisado: false } })
    expect(notifyClient).not.toHaveBeenCalled()
  })

  it('no cambia la visibilidad para el cliente aunque el modelo la mande', async () => {
    await ejecutar('actualizar_hito', { hitoId: ids.interno, titulo: 'Refactor', visibleToClient: true, visible: true })
    const [h] = await db.select().from(projectMilestones).where(eq(projectMilestones.id, ids.interno))
    expect(h).toMatchObject({ title: 'Refactor', visibleToClient: false })
  })

  it('rechaza un hito que no existe y un cambio vacío', async () => {
    expect(await preparar('actualizar_hito', { hitoId: 9999, estado: 'completado' })).toMatchObject({ ok: false })
    expect(await preparar('actualizar_hito', { hitoId: ids.visible, estado: 'en_curso' })).toMatchObject({ ok: false })
  })
})

describe('regla compartida de hitos (panel y asistente)', () => {
  it('solo avisa en la transición a completado y si el hito queda visible', () => {
    expect(avisaAlCliente({ status: 'en_curso', visibleToClient: true }, { status: 'completado' })).toBe(true)
    expect(avisaAlCliente({ status: 'completado', visibleToClient: true }, { status: 'completado' })).toBe(false)
    expect(avisaAlCliente({ status: 'en_curso', visibleToClient: false }, { status: 'completado' })).toBe(false)
    expect(avisaAlCliente({ status: 'en_curso', visibleToClient: true }, { status: 'completado', visibleToClient: false })).toBe(false)
    expect(avisaAlCliente({ status: 'en_curso', visibleToClient: true }, { title: 'x' })).toBe(false)
  })

  it('conserva la fecha de completado original y la borra al reabrir', () => {
    const antes = new Date('2026-01-01')
    expect(parcheHito({ status: 'completado', completedAt: antes }, { status: 'completado' }).completedAt).toBe(antes)
    expect(parcheHito({ status: 'completado', completedAt: antes }, { status: 'en_curso' }).completedAt).toBeNull()
    expect(parcheHito({ status: 'pendiente', completedAt: null }, {})).toEqual({})
  })
})

describe('registrar_seguimiento', () => {
  it('anota la llamada y cierra el pendiente que resuelve, las dos cosas juntas', async () => {
    const entrada = {
      tipo: 'call',
      titulo: 'Llamé a Laura por el diseño',
      clienteId: ids.cliente,
      proyectoId: ids.proyecto,
      siguientePaso: 'Mandar la segunda versión',
      vence: '2026-10-20',
      cierraPendienteId: ids.pendiente,
    }
    const p = await preparar('registrar_seguimiento', entrada)
    if (!p.ok) throw new Error(p.error)
    expect((p.vista as any).cambios.at(-1)).toEqual({ campo: 'Cierra el pendiente', antes: 'Llamar a Laura', despues: 'Hecho' })

    const r = await ejecutar('registrar_seguimiento', entrada)
    expect(r).toMatchObject({ ok: true, datos: { hecho: true, enlace: '/admin/seguimiento' } })
    const filas = await db.select().from(interactions)
    expect(filas).toHaveLength(2)
    const nueva = filas.find((f) => f.title === 'Llamé a Laura por el diseño')!
    expect(nueva).toMatchObject({ type: 'call', clientId: ids.cliente, projectId: ids.proyecto, nextAction: 'Mandar la segunda versión', done: false })
    expect(nueva.dueDate).toBeInstanceOf(Date)
    expect(filas.find((f) => f.id === ids.pendiente)).toMatchObject({ done: true })
  })

  it('rechaza un proyecto de otro cliente y un pendiente ya cerrado', async () => {
    expect(await preparar('registrar_seguimiento', { tipo: 'note', titulo: 'x', clienteId: ids.cliente, proyectoId: ids.ajeno })).toMatchObject({ ok: false })
    await db.update(interactions).set({ done: true }).where(eq(interactions.id, ids.pendiente))
    expect(await preparar('registrar_seguimiento', { tipo: 'note', titulo: 'x', cierraPendienteId: ids.pendiente })).toMatchObject({ ok: false })
  })
})

describe('marcar_mensaje_leido', () => {
  it('la tarjeta lleva nombre y asunto, nunca el correo ni el cuerpo', async () => {
    const p = await preparar('marcar_mensaje_leido', { mensajeIds: [ids.m1, ids.m2, ids.leido] })
    if (!p.ok) throw new Error(p.error)
    const texto = JSON.stringify(p)
    expect(texto).toContain('Ana')
    expect(texto).not.toContain('@correo.com')
    expect((p.vista as any).cambios).toHaveLength(2)
    expect((p.vista as any).contexto).toContain(String(ids.leido))
  })

  it('al aprobar marca solo los que estaban sin leer', async () => {
    const r = await ejecutar('marcar_mensaje_leido', { mensajeIds: [ids.m1, ids.m2] })
    expect(r).toMatchObject({ ok: true, datos: { hecho: true, marcados: 2 } })
    const sinLeer = await db.select().from(messages).where(eq(messages.read, false))
    expect(sinLeer).toHaveLength(0)
    expect(await preparar('marcar_mensaje_leido', { mensajeIds: [ids.m1] })).toMatchObject({ ok: false })
  })
})

describe('soloDistintos', () => {
  it('quita los campos que no cambian', () => {
    expect(soloDistintos([{ campo: 'a', antes: 'x', despues: 'x' }, { campo: 'b', antes: null, despues: 'y' }])).toEqual([{ campo: 'b', antes: null, despues: 'y' }])
  })
})
