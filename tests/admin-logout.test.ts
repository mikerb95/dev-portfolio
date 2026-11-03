import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// Cerrar sesión en el panel tiene que revocar la sesión en el servidor, no solo
// borrar la cookie: una copia del JWT seguía entrando después del "Cerrar
// sesión". Base libsql real porque lo que importa es qué filas toca el UPDATE.

vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `admin-logout-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }) }
})

const sesionActual: { value: unknown } = { value: null }
vi.mock('auth-astro/server', () => ({ getSession: vi.fn(async () => sesionActual.value) }))
vi.mock('../src/lib/security/events', () => ({ recordAdminEvent: vi.fn(async () => {}) }))

import { migrate } from 'drizzle-orm/libsql/migrator'
import { eq } from 'drizzle-orm'
import type { APIContext } from 'astro'
import { db } from '../src/db'
import { adminSessions } from '../src/db/schema'
import { recordAdminEvent } from '../src/lib/security/events'
import { POST } from '../src/pages/api/admin/sessions'

const cerrarSesion = (body: unknown) =>
  POST({
    request: new Request('https://codebymike.net/api/admin/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as APIContext)

const revocada = async (id: string) => {
  const [fila] = await db.select().from(adminSessions).where(eq(adminSessions.id, id))
  return fila.revokedAt !== null
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
})

beforeEach(async () => {
  vi.clearAllMocks()
  await db.delete(adminSessions)
  const ahora = new Date()
  await db.insert(adminSessions).values([
    { id: 'sid-portatil', login: 'mikerb95', firstSeen: ahora, lastSeen: ahora },
    { id: 'sid-celular', login: 'mikerb95', firstSeen: ahora, lastSeen: ahora },
  ])
})

describe('cerrar sesión en el panel', () => {
  it('revoca la sesión del JWT y ninguna otra', async () => {
    sesionActual.value = { user: { login: 'mikerb95' }, sid: 'sid-portatil' }

    const res = await cerrarSesion({ self: true })

    expect(res.status).toBe(200)
    expect(await revocada('sid-portatil')).toBe(true)
    expect(await revocada('sid-celular')).toBe(false)
    expect(recordAdminEvent).toHaveBeenCalledWith(expect.any(Request), 'session.logout')
  })

  it('el id sale del JWT, no del body', async () => {
    sesionActual.value = { user: { login: 'mikerb95' }, sid: 'sid-portatil' }

    await cerrarSesion({ self: true, id: 'sid-celular' })

    expect(await revocada('sid-portatil')).toBe(true)
    expect(await revocada('sid-celular')).toBe(false)
  })

  it('sin id de sesión en el JWT no revoca nada', async () => {
    sesionActual.value = { user: { login: 'mikerb95' } }

    const res = await cerrarSesion({ self: true })

    expect(res.status).toBe(400)
    expect(await revocada('sid-portatil')).toBe(false)
    expect(await revocada('sid-celular')).toBe(false)
  })
})
