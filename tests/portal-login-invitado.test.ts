import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// Una cuenta con la invitación pendiente (sin contraseña) tiene que costar lo
// mismo que una inexistente: responder sin derivar scrypt salía ~100 ms antes,
// y esa diferencia decía qué correos tienen una invitación abierta. Medir
// tiempos en un test sería frágil; se comprueba que el scrypt se ejecuta.

vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `portal-invitado-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }) }
})

vi.mock('../src/lib/portal/passwords', async (original) => {
  const real = await original<typeof import('../src/lib/portal/passwords')>()
  return { ...real, verifyPassword: vi.fn(real.verifyPassword) }
})

import { migrate } from 'drizzle-orm/libsql/migrator'
import { db } from '../src/db'
import { clients, clientUsers } from '../src/db/schema'
import { attemptLogin } from '../src/lib/portal/login'
import { verifyPassword } from '../src/lib/portal/passwords'

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
})

beforeEach(async () => {
  vi.clearAllMocks()
  await db.delete(clientUsers)
  await db.delete(clients)
  const ahora = new Date()
  const [cliente] = await db
    .insert(clients)
    .values({ name: 'ACME', portalEnabled: true, createdAt: ahora })
    .returning({ id: clients.id })
  await db.insert(clientUsers).values({
    clientId: cliente.id,
    email: 'pendiente@acme.com',
    role: 'member',
    status: 'invited',
    createdAt: ahora,
  })
})

describe('login del portal con una invitación pendiente', () => {
  it('gasta un scrypt igual que una cuenta inexistente', async () => {
    const pendiente = await attemptLogin({ email: 'pendiente@acme.com', password: 'contrasena123' })
    expect(verifyPassword).toHaveBeenCalledTimes(1)

    const inexistente = await attemptLogin({ email: 'nadie@acme.com', password: 'contrasena123' })
    expect(verifyPassword).toHaveBeenCalledTimes(2)

    expect(pendiente).toEqual(inexistente)
  })

  it('no entra con ninguna contraseña', async () => {
    const resultado = await attemptLogin({ email: 'pendiente@acme.com', password: 'contrasena123' })
    expect(resultado).toMatchObject({ ok: false, reason: 'invalid' })
  })
})
