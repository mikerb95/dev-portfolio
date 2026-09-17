import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// Mismo patrón que portal-isolation.test.ts: libsql en archivo temporal con
// las migraciones reales aplicadas, porque lo que se prueba aquí (que el
// WHERE tokenHash + acceptedAt IS NULL gane la carrera una sola vez) no se
// puede verificar con un mock.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `portal-invitations-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

const mocks = vi.hoisted(() => ({
  sendInvitationEmail: vi.fn(async (_params: { to: string; clientName: string; url: string; expiresHours: number }) => ({ ok: true })),
  sendResetEmail: vi.fn(async (_params: { to: string; url: string; expiresMinutes: number }) => ({ ok: true })),
}))
const { sendInvitationEmail, sendResetEmail } = mocks

vi.mock('../src/lib/email', () => ({
  sendInvitationEmail: mocks.sendInvitationEmail,
  sendResetEmail: mocks.sendResetEmail,
  sendNotificationEmail: vi.fn(async () => ({ ok: true })),
  sendMail: vi.fn(async () => ({ ok: true })),
  emailConfigured: () => false,
  SITE_URL: 'https://codebymike.net',
  escapeHtml: (s: string) => s,
  renderEmail: () => '',
  renderText: () => '',
}))

import { migrate } from 'drizzle-orm/libsql/migrator'
import { eq } from 'drizzle-orm'
import { db } from '../src/db'
import { clients, clientUsers, clientInvitations } from '../src/db/schema'
import { inviteUser, startPasswordReset, resolveToken, consumeToken } from '../src/lib/portal/invitations'
import { hashPassword } from '../src/lib/portal/passwords'

let acme: number
let rival: number
let acmeUser: number

const now = new Date()

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
})

beforeEach(async () => {
  vi.clearAllMocks()

  await db.delete(clientInvitations)
  await db.delete(clientUsers)
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
})

const tokenFromUrl = (url: string): string => url.split('/').pop()!

describe('portal · invitaciones', () => {
  it('invita a un correo nuevo y crea el usuario en estado "invited"', async () => {
    const result = await inviteUser({ clientId: acme, email: 'nuevo@acme.com', invitedBy: 'admin' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const [user] = await db.select().from(clientUsers).where(eq(clientUsers.email, 'nuevo@acme.com'))
    expect(user.status).toBe('invited')
    expect(sendInvitationEmail).toHaveBeenCalledTimes(1)
  })

  it('rechaza invitar un correo que ya pertenece a otro cliente', async () => {
    await inviteUser({ clientId: acme, email: 'compartido@x.com', invitedBy: 'admin' })
    const result = await inviteUser({ clientId: rival, email: 'compartido@x.com', invitedBy: 'admin' })
    expect(result).toMatchObject({ ok: false })
  })

  it('rechaza invitar a alguien que ya tiene acceso activo', async () => {
    const result = await inviteUser({ clientId: acme, email: 'ana@acme.com', invitedBy: 'admin' })
    expect(result).toMatchObject({ ok: false })
  })

  it('invitar dos veces al mismo correo invalida el token anterior', async () => {
    const first = await inviteUser({ clientId: acme, email: 'dos@acme.com', invitedBy: 'admin' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const firstToken = tokenFromUrl(first.url)

    const second = await inviteUser({ clientId: acme, email: 'dos@acme.com', invitedBy: 'admin' })
    expect(second.ok).toBe(true)

    expect(await resolveToken(firstToken)).toBeNull()
  })
})

describe('portal · restablecimiento de contraseña', () => {
  it('no hace nada (en silencio) si el correo no existe', async () => {
    await startPasswordReset({ email: 'nadie@ejemplo.com' })
    expect(sendResetEmail).not.toHaveBeenCalled()

    const rows = await db.select().from(clientInvitations)
    expect(rows).toHaveLength(0)
  })

  it('no hace nada (en silencio) si el usuario está desactivado', async () => {
    await db.update(clientUsers).set({ status: 'disabled' }).where(eq(clientUsers.id, acmeUser))
    await startPasswordReset({ email: 'ana@acme.com' })
    expect(sendResetEmail).not.toHaveBeenCalled()
  })

  it('crea un token de reset y envía el correo', async () => {
    await startPasswordReset({ email: 'ana@acme.com' })
    expect(sendResetEmail).toHaveBeenCalledTimes(1)

    const [row] = await db.select().from(clientInvitations).where(eq(clientInvitations.clientUserId, acmeUser))
    expect(row.kind).toBe('reset')
    expect(row.acceptedAt).toBeNull()
  })

  it('el email es insensible a mayúsculas y espacios', async () => {
    await startPasswordReset({ email: '  ANA@ACME.COM ' })
    expect(sendResetEmail).toHaveBeenCalledTimes(1)
  })

  it('pedir un segundo reset invalida el token anterior', async () => {
    await startPasswordReset({ email: 'ana@acme.com' })
    const firstUrl = (sendResetEmail.mock.calls[0][0] as { url: string }).url
    const firstToken = tokenFromUrl(firstUrl)

    await startPasswordReset({ email: 'ana@acme.com' })

    expect(await resolveToken(firstToken)).toBeNull()
  })

  it('resuelve un token de reset válido', async () => {
    await startPasswordReset({ email: 'ana@acme.com' })
    const url = (sendResetEmail.mock.calls[0][0] as { url: string }).url
    const token = tokenFromUrl(url)

    const resolved = await resolveToken(token)
    expect(resolved).toMatchObject({ clientUserId: acmeUser, clientId: acme, kind: 'reset', email: 'ana@acme.com' })
  })

  it('un token inventado no resuelve', async () => {
    expect(await resolveToken('token-que-no-existe')).toBeNull()
    expect(await resolveToken(undefined)).toBeNull()
  })

  it('un token caducado no resuelve', async () => {
    await startPasswordReset({ email: 'ana@acme.com', now: new Date(Date.now() - 60 * 60_000) })
    const url = (sendResetEmail.mock.calls[0][0] as { url: string }).url
    const token = tokenFromUrl(url)

    expect(await resolveToken(token)).toBeNull()
  })

  it('un token ya consumido no vuelve a resolver', async () => {
    await startPasswordReset({ email: 'ana@acme.com' })
    const url = (sendResetEmail.mock.calls[0][0] as { url: string }).url
    const token = tokenFromUrl(url)
    const resolved = await resolveToken(token)

    expect(await consumeToken(resolved!.invitationId)).toBe(true)
    expect(await resolveToken(token)).toBeNull()
  })

  it('un token no resuelve si mientras tanto se apagó el portal del cliente', async () => {
    await startPasswordReset({ email: 'ana@acme.com' })
    const url = (sendResetEmail.mock.calls[0][0] as { url: string }).url
    const token = tokenFromUrl(url)

    await db.update(clients).set({ portalEnabled: false }).where(eq(clients.id, acme))
    expect(await resolveToken(token)).toBeNull()
  })

  it('un token no resuelve si mientras tanto se desactivó al usuario', async () => {
    await startPasswordReset({ email: 'ana@acme.com' })
    const url = (sendResetEmail.mock.calls[0][0] as { url: string }).url
    const token = tokenFromUrl(url)

    await db.update(clientUsers).set({ status: 'disabled' }).where(eq(clientUsers.id, acmeUser))
    expect(await resolveToken(token)).toBeNull()
  })

  describe('consumeToken', () => {
    it('marca el token como aceptado y devuelve true la primera vez', async () => {
      await startPasswordReset({ email: 'ana@acme.com' })
      const url = (sendResetEmail.mock.calls[0][0] as { url: string }).url
      const token = tokenFromUrl(url)
      const resolved = await resolveToken(token)

      expect(await consumeToken(resolved!.invitationId)).toBe(true)
    })

    it('la segunda vez (dos clics simultáneos) pierde la carrera', async () => {
      await startPasswordReset({ email: 'ana@acme.com' })
      const url = (sendResetEmail.mock.calls[0][0] as { url: string }).url
      const token = tokenFromUrl(url)
      const resolved = await resolveToken(token)

      const [first, second] = await Promise.all([
        consumeToken(resolved!.invitationId),
        consumeToken(resolved!.invitationId),
      ])
      expect([first, second].filter(Boolean)).toHaveLength(1)
    })
  })
})
