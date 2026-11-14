import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Integración de la API del tablero (RF-047) contra libSQL en archivo temporal
// migrado con el migrador real: ejercita el compare-and-swap, el hash del token
// y el rate limit durable sobre el esquema de verdad.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `hackaton-api-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: join(__dirname, '..', 'drizzle') })
  return { db, __client: client }
})

// La sesión de admin la controla cada test.
const sesion = vi.hoisted(() => ({ actual: null as null | { user: { login: string }; sid: string } }))
vi.mock('auth-astro/server', () => ({ getSession: vi.fn(async () => sesion.actual) }))

import { GET, POST } from '../src/pages/api/hackaton/tablero'
import { POST as generarEnlace } from '../src/pages/api/admin/hackaton/enlace'
import { generarToken, hashToken } from '../src/lib/hackaton/store'
import { _resetMem } from '../src/lib/security/ratelimit-durable'

type Cliente = { execute: (sql: string | { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> }
let client: Cliente

const cookies = { get: () => undefined, set: () => {} }
let ipN = 1
let ip = '10.0.0.1'

function req(method: 'GET' | 'POST', body?: unknown, token?: string): Request {
  return new Request('http://localhost/api/hackaton/tablero', {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      ...(token ? { 'x-equipo-token': token } : {}),
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const ctx = (request: Request) => ({ request, cookies }) as unknown as Parameters<typeof GET>[0]
const leer = async (token?: string) => {
  const r = await GET(ctx(req('GET', undefined, token)))
  return { status: r.status, cuerpo: await r.json() }
}
const escribir = async (op: unknown, token?: string) => {
  const r = await POST(ctx(req('POST', { op }, token)))
  return { status: r.status, cuerpo: await r.json(), cache: r.headers.get('cache-control') }
}

beforeAll(async () => {
  const mod = (await import('../src/db')) as unknown as { __client: Cliente }
  client = mod.__client
})

beforeEach(async () => {
  await client.execute('DELETE FROM hackaton_tableros')
  await client.execute('DELETE FROM hackaton_tokens')
  await client.execute('DELETE FROM admin_sessions')
  await client.execute('DELETE FROM rate_limit_buckets')
  _resetMem()
  sesion.actual = null
  ip = `10.0.0.${++ipN}`
})

describe('GET /api/hackaton/tablero', () => {
  it('es público, sin caché y entrega el tablero precargado en modo lectura', async () => {
    const r = await GET(ctx(req('GET')))
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    const j = await r.json()
    expect(j.version).toBe(0)
    expect(j.puedeEditar).toBe(false)
    expect(j.estado.tareas.length).toBeGreaterThan(20)
  })
})

describe('POST /api/hackaton/tablero', () => {
  it('sin llave responde 401 y no escribe', async () => {
    const r = await escribir({ tipo: 'persona.agregar', nombre: 'Ana' })
    expect(r.status).toBe(401)
    expect((await leer()).cuerpo.version).toBe(0)
  })

  it('con el token del equipo escribe y la lectura lo ve', async () => {
    const token = await generarToken()
    const r = await escribir({ tipo: 'persona.agregar', nombre: 'Ana' }, token)
    expect(r.status).toBe(200)
    expect(r.cache).toBe('no-store')
    expect(r.cuerpo.version).toBe(1)
    const l = await leer(token)
    expect(l.cuerpo.puedeEditar).toBe(true)
    expect(l.cuerpo.llave).toBe('equipo')
    expect(l.cuerpo.estado.personas.map((p: { nombre: string }) => p.nombre)).toEqual(['Ana'])
  })

  it('guarda el hash del token, nunca el token', async () => {
    const token = await generarToken()
    const { rows } = await client.execute('SELECT hash FROM hackaton_tokens')
    expect(rows).toHaveLength(1)
    expect(rows[0].hash).toBe(hashToken(token))
    expect(String(rows[0].hash)).not.toContain(token)
  })

  it('un enlace nuevo revoca el anterior', async () => {
    const viejo = await generarToken()
    const nuevo = await generarToken()
    expect((await escribir({ tipo: 'persona.agregar', nombre: 'Ana' }, viejo)).status).toBe(401)
    expect((await escribir({ tipo: 'persona.agregar', nombre: 'Ana' }, nuevo)).status).toBe(200)
  })

  it('valida la operación (400) y las reglas del tablero (409)', async () => {
    const token = await generarToken()
    expect((await escribir({ tipo: 'borrar.todo' }, token)).status).toBe(400)
    expect((await escribir({ tipo: 'persona.agregar', nombre: '<b>'.repeat(20) }, token)).status).toBe(400)
    const r = await POST(ctx(req('POST', '{no es json', token)))
    expect(r.status).toBe(400)
    const regla = await escribir({ tipo: 'grupo.asignar', grupo: 'panel', persona: 'p99' }, token)
    expect(regla.status).toBe(409)
    expect(regla.cuerpo.error).toMatch(/ya no está/)
  })

  it('el límite de personas del reglamento se aplica en el servidor', async () => {
    const token = await generarToken()
    for (const n of ['A', 'B', 'C', 'D', 'E']) expect((await escribir({ tipo: 'persona.agregar', nombre: n }, token)).status).toBe(200)
    const sexta = await escribir({ tipo: 'persona.agregar', nombre: 'F' }, token)
    expect(sexta.status).toBe(409)
    expect(sexta.cuerpo.error).toMatch(/máximo 5/)
  })

  it('escrituras simultáneas no se pisan (compare-and-swap con reintento)', async () => {
    const token = await generarToken()
    const nombres = ['Ana', 'Beto', 'Caro', 'Dani']
    const rs = await Promise.all(nombres.map((nombre) => escribir({ tipo: 'persona.agregar', nombre }, token)))
    expect(rs.every((r) => r.status === 200)).toBe(true)
    const l = await leer()
    expect(l.cuerpo.version).toBe(4)
    expect(l.cuerpo.estado.personas.map((p: { nombre: string }) => p.nombre).sort()).toEqual([...nombres].sort())
  })

  it('reparte, marca una tarea y el progreso se refleja en el estado guardado', async () => {
    const token = await generarToken()
    for (const n of ['Ana', 'Beto', 'Caro']) await escribir({ tipo: 'persona.agregar', nombre: n }, token)
    const rep = await escribir({ tipo: 'repartir', modo: 'cero' }, token)
    expect(rep.cuerpo.estado.grupos.filter((g: { tipo: string; dueno: string | null }) => g.tipo === 'frente').every((g: { dueno: string | null }) => g.dueno)).toBe(true)
    const tarea = rep.cuerpo.estado.tareas[0]
    await escribir({ tipo: 'tarea.estado', tarea: tarea.id, estado: 'hecha' }, token)
    const l = await leer()
    expect(l.cuerpo.estado.tareas[0].estado).toBe('hecha')
  })

  it('limita las escrituras por IP (429)', async () => {
    const token = await generarToken()
    let ultimo = 0
    for (let i = 0; i < 95; i++) {
      const t = i % 2 ? 'pendiente' : 'hecha'
      ultimo = (await escribir({ tipo: 'tarea.estado', tarea: 't1', estado: t }, token)).status
    }
    expect(ultimo).toBe(429)
  })

  it('frena los intentos con un token inválido', async () => {
    let ultimo = 0
    for (let i = 0; i < 12; i++) ultimo = (await escribir({ tipo: 'reiniciar' }, 'x'.repeat(32))).status
    expect(ultimo).toBe(429)
  })
})

describe('sesión de administrador', () => {
  const ADMIN = { user: { login: 'mikerb95' }, sid: 'sid-prueba' }

  it('una sesión vigente escribe sin token', async () => {
    sesion.actual = ADMIN
    await client.execute({ sql: 'INSERT INTO admin_sessions (id, login, first_seen, last_seen) VALUES (?, ?, ?, ?)', args: ['sid-prueba', 'mikerb95', 1, 1] })
    expect((await leer()).cuerpo.llave).toBe('admin')
    expect((await escribir({ tipo: 'persona.agregar', nombre: 'Ana' })).status).toBe(200)
  })

  it('una sesión revocada o sin registrar queda en modo lectura', async () => {
    sesion.actual = ADMIN
    expect((await escribir({ tipo: 'persona.agregar', nombre: 'Ana' })).status).toBe(401)
    await client.execute({ sql: 'INSERT INTO admin_sessions (id, login, first_seen, last_seen, revoked_at) VALUES (?, ?, ?, ?, ?)', args: ['sid-prueba', 'mikerb95', 1, 1, 2] })
    expect((await escribir({ tipo: 'persona.agregar', nombre: 'Ana' })).status).toBe(401)
  })

  it('un login fuera de la allowlist no es admin', async () => {
    sesion.actual = { user: { login: 'alguien-mas' }, sid: 'sid-otro' }
    await client.execute({ sql: 'INSERT INTO admin_sessions (id, login, first_seen, last_seen) VALUES (?, ?, ?, ?)', args: ['sid-otro', 'alguien-mas', 1, 1] })
    expect((await leer()).cuerpo.puedeEditar).toBe(false)
  })

  it('el endpoint de enlace devuelve el token una vez y la ruta lista para compartir', async () => {
    const r = await generarEnlace({ request: new Request('http://localhost/api/admin/hackaton/enlace', { method: 'POST' }) } as never)
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ruta).toBe(`/hackaton?equipo=${j.token}`)
    expect((await escribir({ tipo: 'persona.agregar', nombre: 'Ana' }, j.token)).status).toBe(200)
  })
})
