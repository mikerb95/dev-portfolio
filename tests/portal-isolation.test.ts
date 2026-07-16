import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// Base libsql local (archivo temporal) con el esquema real aplicado desde las
// migraciones, igual que payments.test.ts. Se prueba contra SQL de verdad
// porque lo que se está verificando —que un WHERE no se olvide— no se puede
// comprobar con dobles: un mock respondería lo que le pidas.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `portal-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

// El email no debe salir en tests: Resend no está configurado aquí, pero se
// silencia explícitamente para que un cambio futuro no empiece a mandar correo.
vi.mock('../src/lib/email', () => ({
  sendInvitationEmail: vi.fn(async () => ({ ok: true })),
  sendResetEmail: vi.fn(async () => ({ ok: true })),
  sendNotificationEmail: vi.fn(async () => ({ ok: true })),
  sendMail: vi.fn(async () => ({ ok: true })),
  emailConfigured: () => false,
  SITE_URL: 'https://codebymike.tech',
  escapeHtml: (s: string) => s,
  renderEmail: () => '',
  renderText: () => '',
}))

import { migrate } from 'drizzle-orm/libsql/migrator'
import { db } from '../src/db'
import { clients, clientUsers, invoices, projects, projectMilestones, portalThreads, portalMessages } from '../src/db/schema'
import { clientInvoice, clientInvoices, clientInvoiceSummary } from '../src/lib/portal/invoices'
import { clientProjects, projectMilestonesFor } from '../src/lib/portal/projects'
import { clientThreads, threadWithMessages } from '../src/lib/portal/threads'
import { attemptLogin } from '../src/lib/portal/login'
import { hashPassword } from '../src/lib/portal/passwords'
import { createSession, resolveSession, revokeSession, revokeAllSessions } from '../src/lib/portal/session'

// Dos clientes reales. Todo el test se resume en una pregunta: ¿puede ACME
// alcanzar algo de RIVAL?
let acme: number
let rival: number
let acmeProject: number
let rivalProject: number
let acmeInvoice: number
let rivalInvoice: number
let acmeUser: number
let rivalThread: number

const now = new Date()

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
})

beforeEach(async () => {
  // Orden inverso a las FK para no chocar con las restricciones.
  await db.delete(portalMessages)
  await db.delete(portalThreads)
  await db.delete(projectMilestones)
  await db.delete(invoices)
  await db.delete(clientUsers)
  await db.delete(projects)
  await db.delete(clients)

  const [a] = await db
    .insert(clients)
    .values({ name: 'ACME', company: 'ACME S.A.S.', portalEnabled: true, createdAt: now })
    .returning({ id: clients.id })
  const [r] = await db
    .insert(clients)
    .values({ name: 'RIVAL', company: 'RIVAL Ltda.', portalEnabled: true, createdAt: now })
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

  const [ai] = await db
    .insert(invoices)
    .values({
      clientId: acme,
      number: 'INV-2026-001',
      status: 'sent',
      totalCents: 1_000_000,
      issuedAt: now,
      createdAt: now,
    })
    .returning({ id: invoices.id })
  const [ri] = await db
    .insert(invoices)
    .values({
      clientId: rival,
      number: 'INV-2026-002',
      status: 'sent',
      totalCents: 9_999_999,
      issuedAt: now,
      createdAt: now,
    })
    .returning({ id: invoices.id })
  acmeInvoice = ai.id
  rivalInvoice = ri.id

  const [au] = await db
    .insert(clientUsers)
    .values({
      clientId: acme,
      email: 'ana@acme.com',
      name: 'Ana',
      passwordHash: await hashPassword('contrasena123'),
      role: 'owner',
      status: 'active',
      createdAt: now,
    })
    .returning({ id: clientUsers.id })
  acmeUser = au.id

  await db.insert(projectMilestones).values([
    { projectId: acmeProject, title: 'Hito de ACME', status: 'completado', visibleToClient: true, sortOrder: 0, createdAt: now },
    { projectId: rivalProject, title: 'Hito de RIVAL', status: 'completado', visibleToClient: true, sortOrder: 0, createdAt: now },
    // Hito interno: existe, pero el cliente no debe verlo.
    { projectId: acmeProject, title: 'Hito interno', status: 'pendiente', visibleToClient: false, sortOrder: 1, createdAt: now },
  ])

  const [rt] = await db
    .insert(portalThreads)
    .values({ clientId: rival, subject: 'Secreto de RIVAL', status: 'open', lastMessageAt: now, createdAt: now })
    .returning({ id: portalThreads.id })
  rivalThread = rt.id
  await db.insert(portalMessages).values({
    threadId: rivalThread,
    authorType: 'admin',
    body: 'Contenido confidencial de RIVAL',
    createdAt: now,
  })
})

describe('portal · aislamiento entre clientes', () => {
  describe('facturas', () => {
    it('cada cliente solo ve sus facturas', async () => {
      const rows = await clientInvoices(acme)
      expect(rows).toHaveLength(1)
      expect(rows[0].number).toBe('INV-2026-001')
    })

    it('pedir la factura de otro cliente devuelve null, no sus datos', async () => {
      // El id existe y es válido: lo único que lo separa del atacante es el
      // filtro por clientId. Este test es la razón de ser del módulo.
      expect(await clientInvoice(acme, rivalInvoice)).toBeNull()
    })

    it('la propia factura sí se devuelve', async () => {
      const result = await clientInvoice(acme, acmeInvoice)
      expect(result?.invoice.number).toBe('INV-2026-001')
    })

    it('el resumen no suma importes de otros clientes', async () => {
      const summary = await clientInvoiceSummary(acme)
      expect(summary.dueCents).toBe(1_000_000)
      expect(summary.dueCount).toBe(1)
    })

    it('los borradores no son visibles para el cliente', async () => {
      await db.insert(invoices).values({
        clientId: acme,
        number: 'INV-2026-003',
        status: 'draft',
        totalCents: 500_000,
        createdAt: now,
      })
      const rows = await clientInvoices(acme)
      expect(rows.map((r) => r.number)).not.toContain('INV-2026-003')

      const summary = await clientInvoiceSummary(acme)
      expect(summary.dueCents).toBe(1_000_000)
    })
  })

  describe('proyectos e hitos', () => {
    it('cada cliente solo ve sus proyectos', async () => {
      const rows = await clientProjects(acme)
      expect(rows).toHaveLength(1)
      expect(rows[0].title).toBe('Web de ACME')
    })

    it('los hitos de un proyecto ajeno no se devuelven', async () => {
      expect(await projectMilestonesFor(acme, rivalProject)).toHaveLength(0)
    })

    it('los hitos internos no llegan al cliente', async () => {
      const rows = await projectMilestonesFor(acme, acmeProject)
      expect(rows).toHaveLength(1)
      expect(rows[0].title).toBe('Hito de ACME')
    })
  })

  describe('mensajes', () => {
    it('cada cliente solo ve sus hilos', async () => {
      expect(await clientThreads(acme)).toHaveLength(0)
    })

    it('un hilo ajeno no se abre aunque se conozca su id', async () => {
      expect(await threadWithMessages(acme, rivalThread)).toBeNull()
    })
  })

  describe('sesiones', () => {
    it('una sesión válida resuelve a su propio cliente', async () => {
      const token = await createSession({ clientUserId: acmeUser })
      const session = await resolveSession(token)
      expect(session?.client.id).toBe(acme)
      expect(session?.user.email).toBe('ana@acme.com')
    })

    it('un token inventado no resuelve', async () => {
      expect(await resolveSession('token-falso')).toBeNull()
      expect(await resolveSession(undefined)).toBeNull()
      expect(await resolveSession('')).toBeNull()
    })

    it('una sesión revocada deja de servir de inmediato', async () => {
      const token = await createSession({ clientUserId: acmeUser })
      const session = await resolveSession(token)
      await revokeSession(session!.sessionId)
      expect(await resolveSession(token)).toBeNull()
    })

    it('una sesión caducada no resuelve', async () => {
      const token = await createSession({ clientUserId: acmeUser, now: new Date(Date.now() - 40 * 86_400_000) })
      expect(await resolveSession(token)).toBeNull()
    })

    it('desactivar al usuario corta sus sesiones vivas sin tocarlas', async () => {
      // Esto es lo que hace que "desactivar acceso" en el panel sea inmediato y
      // no una promesa que se cumple cuando expire la cookie.
      const token = await createSession({ clientUserId: acmeUser })
      expect(await resolveSession(token)).not.toBeNull()

      const { eq } = await import('drizzle-orm')
      await db.update(clientUsers).set({ status: 'disabled' }).where(eq(clientUsers.id, acmeUser))
      expect(await resolveSession(token)).toBeNull()
    })

    it('apagar el portal del cliente corta las sesiones de todos sus usuarios', async () => {
      const token = await createSession({ clientUserId: acmeUser })
      const { eq } = await import('drizzle-orm')
      await db.update(clients).set({ portalEnabled: false }).where(eq(clients.id, acme))
      expect(await resolveSession(token)).toBeNull()
    })

    it('revocar todas conserva la sesión exceptuada', async () => {
      // El caso "cambié mi contraseña": echa a todos los demás dispositivos,
      // pero no a quien está haciendo el cambio.
      const a = await createSession({ clientUserId: acmeUser })
      const b = await createSession({ clientUserId: acmeUser })
      const sessionB = await resolveSession(b)

      await revokeAllSessions(acmeUser, { except: sessionB!.sessionId })

      expect(await resolveSession(a)).toBeNull()
      expect(await resolveSession(b)).not.toBeNull()
    })
  })

  describe('login', () => {
    it('entra con las credenciales correctas', async () => {
      const result = await attemptLogin({ email: 'ana@acme.com', password: 'contrasena123' })
      expect(result).toMatchObject({ ok: true, clientId: acme })
    })

    it('el email es insensible a mayúsculas y espacios', async () => {
      const result = await attemptLogin({ email: '  ANA@ACME.COM ', password: 'contrasena123' })
      expect(result.ok).toBe(true)
    })

    it('rechaza la contraseña incorrecta', async () => {
      const result = await attemptLogin({ email: 'ana@acme.com', password: 'incorrecta1' })
      expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    })

    it('una cuenta inexistente falla igual que una contraseña incorrecta', async () => {
      // Mismo `reason` ⇒ mismo mensaje ⇒ no se puede enumerar quién es cliente.
      const noExiste = await attemptLogin({ email: 'nadie@ejemplo.com', password: 'contrasena123' })
      const malPass = await attemptLogin({ email: 'ana@acme.com', password: 'incorrecta1' })
      expect(noExiste).toEqual(malPass)
    })

    it('bloquea la cuenta tras 10 intentos fallidos', async () => {
      for (let i = 0; i < 9; i++) {
        expect((await attemptLogin({ email: 'ana@acme.com', password: 'mala12345' })).ok).toBe(false)
      }
      const decimo = await attemptLogin({ email: 'ana@acme.com', password: 'mala12345' })
      expect(decimo).toMatchObject({ ok: false, reason: 'locked' })

      // Y la contraseña CORRECTA tampoco entra mientras dure el bloqueo: si no,
      // el bloqueo no serviría de nada contra un diccionario que acaba acertando.
      const conBuena = await attemptLogin({ email: 'ana@acme.com', password: 'contrasena123' })
      expect(conBuena).toMatchObject({ ok: false, reason: 'locked' })
    })

    it('un login correcto limpia el contador de fallos', async () => {
      await attemptLogin({ email: 'ana@acme.com', password: 'mala12345' })
      await attemptLogin({ email: 'ana@acme.com', password: 'contrasena123' })

      const { eq } = await import('drizzle-orm')
      const [user] = await db.select().from(clientUsers).where(eq(clientUsers.id, acmeUser))
      expect(user.failedAttempts).toBe(0)
      expect(user.lastLoginAt).not.toBeNull()
    })

    it('un usuario invitado que aún no fijó contraseña no puede entrar', async () => {
      await db.insert(clientUsers).values({
        clientId: acme,
        email: 'pendiente@acme.com',
        role: 'member',
        status: 'invited',
        createdAt: now,
      })
      const result = await attemptLogin({ email: 'pendiente@acme.com', password: 'loquesea123' })
      expect(result.ok).toBe(false)
    })

    it('un usuario desactivado no entra ni con la contraseña correcta', async () => {
      const { eq } = await import('drizzle-orm')
      await db.update(clientUsers).set({ status: 'disabled' }).where(eq(clientUsers.id, acmeUser))
      const result = await attemptLogin({ email: 'ana@acme.com', password: 'contrasena123' })
      expect(result).toMatchObject({ ok: false, reason: 'disabled' })
    })

    it('sin portal habilitado no se entra', async () => {
      const { eq } = await import('drizzle-orm')
      await db.update(clients).set({ portalEnabled: false }).where(eq(clients.id, acme))
      const result = await attemptLogin({ email: 'ana@acme.com', password: 'contrasena123' })
      expect(result).toMatchObject({ ok: false, reason: 'no_portal' })
    })
  })
})
