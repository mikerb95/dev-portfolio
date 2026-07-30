import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// Base libsql en archivo temporal con el esquema real, igual que
// portal-isolation.test.ts. El digest se prueba contra SQL de verdad porque lo
// que se verifica —que ningún WHERE se olvide del clientId y que un projectId
// ajeno no cuele— es exactamente lo que un mock respondería a favor.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `portal-live-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import { migrate } from 'drizzle-orm/libsql/migrator'
import { db } from '../src/db'
import {
  clients,
  clientUsers,
  invoices,
  projects,
  projectMilestones,
  portalThreads,
  portalMessages,
  portalNotifications,
} from '../src/db/schema'
import { portalLiveDigest } from '../src/lib/portal/live'

// Dos clientes. La pregunta de todo el archivo: ¿puede el digest de ACME
// filtrar algo de RIVAL, o dejar ver mensajes a quien no debe verlos?
let acme: number
let rival: number
let acmeProject: number
let rivalProject: number
let acmeUser: number
let acmeBilling: number
let acmeThread: number

const now = new Date('2026-07-29T12:00:00.000Z')
const hourAgo = new Date(now.getTime() - 3_600_000)
const dayAgo = new Date(now.getTime() - 86_400_000)

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
})

beforeEach(async () => {
  // Orden inverso a las FK.
  await db.delete(portalNotifications)
  await db.delete(portalMessages)
  await db.delete(portalThreads)
  await db.delete(projectMilestones)
  await db.delete(invoices)
  await db.delete(clientUsers)
  await db.delete(projects)
  await db.delete(clients)

  const [a] = await db
    .insert(clients)
    .values({ name: 'ACME', portalEnabled: true, createdAt: now })
    .returning({ id: clients.id })
  const [r] = await db
    .insert(clients)
    .values({ name: 'RIVAL', portalEnabled: true, createdAt: now })
    .returning({ id: clients.id })
  acme = a.id
  rival = r.id

  const [ap] = await db
    .insert(projects)
    .values({ slug: 'acme-web', title: 'Web de ACME', clientId: acme, status: 'activo' })
    .returning({ id: projects.id })
  const [rp] = await db
    .insert(projects)
    .values({ slug: 'rival-app', title: 'App de RIVAL', clientId: rival, status: 'activo' })
    .returning({ id: projects.id })
  acmeProject = ap.id
  rivalProject = rp.id

  const [au] = await db
    .insert(clientUsers)
    .values({
      clientId: acme,
      email: 'ana@acme.com',
      name: 'Ana',
      passwordHash: 'x',
      role: 'owner',
      status: 'active',
      createdAt: now,
    })
    .returning({ id: clientUsers.id })
  acmeUser = au.id

  const [ab] = await db
    .insert(clientUsers)
    .values({
      clientId: acme,
      email: 'pagos@acme.com',
      name: 'Contabilidad',
      passwordHash: 'x',
      role: 'billing',
      status: 'active',
      createdAt: now,
    })
    .returning({ id: clientUsers.id })
  acmeBilling = ab.id

  // ACME: 1 de 2 hitos completados → 50%. RIVAL: hito propio que no debe contar.
  await db.insert(projectMilestones).values([
    { projectId: acmeProject, title: 'Diseño', status: 'completado', visibleToClient: true, sortOrder: 0, createdAt: dayAgo, completedAt: hourAgo },
    { projectId: acmeProject, title: 'Desarrollo', status: 'pendiente', visibleToClient: true, sortOrder: 1, createdAt: dayAgo },
    { projectId: rivalProject, title: 'Hito de RIVAL', status: 'completado', visibleToClient: true, sortOrder: 0, createdAt: now, completedAt: now },
  ])

  await db.insert(invoices).values([
    { clientId: acme, number: 'ACME-1', status: 'sent', totalCents: 500_000, issuedAt: now, createdAt: now },
    { clientId: acme, number: 'ACME-2', status: 'overdue', totalCents: 300_000, issuedAt: dayAgo, createdAt: dayAgo },
    // Borrador: mío hasta que lo emita, no cuenta como pendiente del cliente.
    { clientId: acme, number: 'ACME-3', status: 'draft', totalCents: 999_999, issuedAt: now, createdAt: now },
    { clientId: rival, number: 'RIVAL-1', status: 'sent', totalCents: 9_999_999, issuedAt: now, createdAt: now },
  ])

  const [at] = await db
    .insert(portalThreads)
    .values({ clientId: acme, subject: 'Dudas de ACME', status: 'open', lastMessageAt: hourAgo, createdAt: dayAgo })
    .returning({ id: portalThreads.id })
  acmeThread = at.id
  await db.insert(portalMessages).values({ threadId: acmeThread, authorType: 'admin', body: 'Respuesta', createdAt: hourAgo })

  await db
    .insert(portalThreads)
    .values({ clientId: rival, subject: 'Secreto de RIVAL', status: 'open', lastMessageAt: now, createdAt: now })

  await db.insert(portalNotifications).values([
    { clientUserId: acmeUser, type: 'message', title: 'Nuevo mensaje', createdAt: hourAgo },
    { clientUserId: acmeUser, type: 'invoice', title: 'Factura emitida', createdAt: dayAgo },
    // Ya leída: no cuenta.
    { clientUserId: acmeUser, type: 'system', title: 'Bienvenida', createdAt: dayAgo, readAt: hourAgo },
    // De otro usuario del MISMO cliente: tampoco cuenta, el contador es por usuario.
    { clientUserId: acmeBilling, type: 'invoice', title: 'Para contabilidad', createdAt: now },
  ])
})

const digestFor = (userId: number, role: 'owner' | 'billing' = 'owner', requestedProjectId?: number) =>
  portalLiveDigest({ clientId: acme, userId, role, requestedProjectId, now })

describe('portal · digest de la capa viva', () => {
  it('devuelve solo los datos del cliente de la sesión', async () => {
    const d = await digestFor(acmeUser)

    // Facturas: las dos pendientes de ACME (borrador excluido), nunca la de RIVAL.
    expect(d.invoices.pending).toBe(2)
    expect(d.invoices.pendingCents).toBe(800_000)
    expect(d.invoices.overdue).toBe(1)

    // Hilos: el suyo, no el de RIVAL. El de RIVAL tiene lastMessageAt MÁS
    // reciente (now vs hourAgo), así que si la query se olvidara del clientId
    // este caso lo cazaría por el lado de la fecha además del contador.
    expect(d.threads.unread).toBe(1)
    expect(d.threads.lastMessageAt).toBe(hourAgo.toISOString())
    expect(d.threads.lastThreadId).toBe(acmeThread)

    // Proyecto: el suyo, con su avance (1 completado de 2 → 50%).
    expect(d.project?.id).toBe(acmeProject)
    expect(d.project?.progress).toEqual({ pct: 50, done: 1, total: 2 })
    // Los hitos de RIVAL no engordan el total del proyecto de ACME.
    expect(d.project?.progress.total).toBe(2)
  })

  it('un projectId ajeno cae al proyecto propio, sin filtrar que existe', async () => {
    const d = await digestFor(acmeUser, 'owner', rivalProject)

    // Ni 403 ni error: el digest responde con el proyecto propio. Un 403
    // confirmaría que ese id existe, que es justo lo que no se quiere decir.
    expect(d.project?.id).toBe(acmeProject)
    expect(d.project?.id).not.toBe(rivalProject)
    expect(d.project?.progress.pct).toBe(50)
  })

  it('un projectId inexistente también cae al propio', async () => {
    const d = await digestFor(acmeUser, 'owner', 999_999)
    expect(d.project?.id).toBe(acmeProject)
  })

  it('el rol billing no recibe nada de mensajes', async () => {
    const d = await digestFor(acmeBilling, 'billing')

    // Hay un hilo con no leídos, pero este rol no ve mensajes en ninguna vista;
    // el digest no puede ser la rendija por la que se enteren.
    expect(d.threads.unread).toBe(0)
    expect(d.threads.lastMessageAt).toBeNull()
    expect(d.threads.lastThreadId).toBeNull()

    // Lo que sí le corresponde sigue llegando.
    expect(d.invoices.pending).toBe(2)
  })

  it('las notificaciones no leídas son del usuario, no del cliente', async () => {
    const owner = await digestFor(acmeUser)
    // 2 sin leer de 3 propias; la del usuario de facturación no se suma.
    expect(owner.notifications.unread).toBe(2)

    const billing = await digestFor(acmeBilling, 'billing')
    expect(billing.notifications.unread).toBe(1)
  })

  it('milestonesAt es la marca de cambio más reciente de los hitos', async () => {
    const d = await digestFor(acmeUser)
    // El completado hace una hora manda sobre los createdAt de ayer.
    expect(d.project?.milestonesAt).toBe(hourAgo.toISOString())
  })

  it('un cliente sin proyectos devuelve project null en vez de reventar', async () => {
    await db.delete(projectMilestones)
    await db.delete(projects)

    const d = await portalLiveDigest({ clientId: acme, userId: acmeUser, role: 'owner', now })
    expect(d.project).toBeNull()
    // El resto del digest sigue siendo útil.
    expect(d.invoices.pending).toBe(2)
    expect(d.notifications.unread).toBe(2)
  })

  it('sella la versión y la marca de tiempo del digest', async () => {
    const d = await digestFor(acmeUser)
    // `v` existe para que el script del navegador pueda ignorar un digest de una
    // versión que no entiende, en vez de leer campos que ya no significan lo mismo.
    expect(d.v).toBe(1)
    expect(d.at).toBe(now.toISOString())
  })
})
