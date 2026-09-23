import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// Alta de proyectos medidos contra una base libSQL en archivo temporal. La
// sesión admin la exige el middleware y no se prueba aquí; lo que sí: que el
// secreto se guarda cifrado, que solo sale en la respuesta del alta, y que
// rotarlo invalida el anterior de verdad.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `computo-alta-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})
vi.mock('../src/lib/security/events', () => ({ recordSecurityEvent: vi.fn(async () => {}) }))

import { POST, PATCH } from '../src/pages/api/admin/computo/proyectos'
import { decrypt, isEncrypted } from '../src/lib/crypto'
import { recordSecurityEvent } from '../src/lib/security/events'

let client: { execute: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> }

const llamar = (handler: typeof POST, metodo: string, cuerpo: unknown) =>
  handler({
    request: new Request('https://panel.test/api/admin/computo/proyectos', {
      method: metodo,
      headers: { 'content-type': 'application/json' },
      body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
    }),
  } as Parameters<typeof POST>[0])

const guardado = async (projectId: number) =>
  (await client.execute(`SELECT ingest_secret, active FROM compute_terms WHERE project_id = ${projectId}`)).rows[0]

beforeAll(async () => {
  vi.stubEnv('ENCRYPTION_KEY', 'cd'.repeat(32))
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client
  await client.execute(`CREATE TABLE projects (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    client_id integer,
    vercel_project_id text,
    created_at integer
  )`)
  await client.execute(`CREATE TABLE compute_terms (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    project_id integer NOT NULL UNIQUE,
    margen_pct real NOT NULL DEFAULT 30,
    minimo_usd real,
    incluido_cpu_ms real NOT NULL DEFAULT 0,
    incluido_gb_ms real NOT NULL DEFAULT 0,
    incluido_invocaciones integer NOT NULL DEFAULT 0,
    incluido_transfer_bytes real NOT NULL DEFAULT 0,
    ingest_secret text,
    active integer NOT NULL DEFAULT 1,
    created_at integer,
    updated_at integer
  )`)
  await client.execute(`INSERT INTO projects (id, slug, title) VALUES (1, 'acme', 'Acme')`)
})

beforeEach(async () => {
  await client.execute('DELETE FROM compute_terms')
  vi.mocked(recordSecurityEvent).mockClear()
})

describe('alta de proyecto medido', () => {
  it('genera el secreto, lo guarda cifrado y lo devuelve una sola vez', async () => {
    const res = await llamar(POST, 'POST', { projectId: 1 })
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const datos = await res.json()
    expect(datos).toMatchObject({ slug: 'acme', rotado: false })
    expect(datos.secreto).toMatch(/^[a-f0-9]{64}$/)

    const fila = await guardado(1)
    expect(isEncrypted(String(fila.ingest_secret))).toBe(true)
    expect(fila.ingest_secret).not.toContain(datos.secreto)
    expect(decrypt(String(fila.ingest_secret))).toBe(datos.secreto)
    expect(recordSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
      classification: expect.objectContaining({ ruleId: 'computo.secreto_emitido' }),
    }))
  })

  it('rotar reemplaza el secreto: el anterior deja de valer', async () => {
    const primero = await (await llamar(POST, 'POST', { projectId: 1 })).json()
    const segundo = await (await llamar(POST, 'POST', { projectId: 1 })).json()
    expect(segundo.rotado).toBe(true)
    expect(segundo.secreto).not.toBe(primero.secreto)
    expect(decrypt(String((await guardado(1)).ingest_secret))).toBe(segundo.secreto)
    expect(recordSecurityEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      classification: expect.objectContaining({ ruleId: 'computo.secreto_rotado' }),
    }))
  })

  it('rotar reactiva un proyecto pausado', async () => {
    await llamar(POST, 'POST', { projectId: 1 })
    await llamar(PATCH, 'PATCH', { projectId: 1, activo: false })
    await llamar(POST, 'POST', { projectId: 1 })
    expect(Number((await guardado(1)).active)).toBe(1)
  })

  it('rechaza proyectos inexistentes y cuerpos inválidos', async () => {
    expect((await llamar(POST, 'POST', { projectId: 99 })).status).toBe(404)
    expect((await llamar(POST, 'POST', { projectId: 'uno' })).status).toBe(400)
    expect((await llamar(POST, 'POST', 'no es json')).status).toBe(400)
  })
})

describe('pausar y reanudar', () => {
  it('cambia el estado sin tocar el secreto', async () => {
    await llamar(POST, 'POST', { projectId: 1 })
    const antes = (await guardado(1)).ingest_secret
    const res = await llamar(PATCH, 'PATCH', { projectId: 1, activo: false })
    expect(res.status).toBe(200)
    const despues = await guardado(1)
    expect(Number(despues.active)).toBe(0)
    expect(despues.ingest_secret).toBe(antes)
  })

  it('un proyecto sin medición da 404 y un activo no booleano da 400', async () => {
    expect((await llamar(PATCH, 'PATCH', { projectId: 1, activo: true })).status).toBe(404)
    expect((await llamar(PATCH, 'PATCH', { projectId: 1, activo: 'si' })).status).toBe(400)
  })
})
