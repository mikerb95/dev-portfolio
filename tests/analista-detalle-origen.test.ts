import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// BD libsql en archivo temporal (no :memory:, ver CLAUDE.md) con el schema
// real: se aplican todas las migraciones de drizzle/.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `analista-detalle-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import { detalleOrigen } from '../src/lib/analista/detalle-origen'
import { db } from '../src/db'
import { blockedIps, securityEvents } from '../src/db/schema'

const AHORA = new Date('2026-10-01T12:00:00Z')
const haceHoras = (h: number) => new Date(AHORA.getTime() - h * 3_600_000)

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  await migrate(db as never, { migrationsFolder: 'drizzle' })
})

beforeEach(async () => {
  await db.delete(securityEvents)
  await db.delete(blockedIps)
  vi.unstubAllEnvs()
})

const evento = (ip: string, at: Date, category: string, hits = 1, extra: Record<string, unknown> = {}) => ({
  ip,
  at,
  path: '/wp-login.php',
  category,
  severity: 'medium' as const,
  action: 'logged' as const,
  hits,
  ...extra,
})

describe('detalleOrigen', () => {
  it('resume la actividad hostil de la IP en los últimos 7 días', async () => {
    await db.insert(securityEvents).values([
      evento('203.0.113.7', haceHoras(30), 'recon_cms', 3, { country: 'NL', asn: 'AS14061 DigitalOcean' }),
      evento('203.0.113.7', haceHoras(2), 'secrets_probing', 2),
      // Fuera de la ventana: no cuenta.
      evento('203.0.113.7', haceHoras(24 * 8), 'injection', 50),
      // Otra IP: no cuenta.
      evento('198.51.100.1', haceHoras(1), 'recon_cms', 9),
    ])

    const d = await detalleOrigen('203.0.113.7', AHORA)

    expect(d.ip).toBe('203.0.113.7')
    expect(d.eventos).toBe(2)
    expect(d.hits).toBe(5)
    expect(d.categorias.sort()).toEqual(['recon_cms', 'secrets_probing'])
    expect(d.pais).toBe('NL')
    expect(d.asn).toBe('AS14061 DigitalOcean')
    expect(d.primeraVez).toBe(haceHoras(30).toISOString())
    expect(d.ultimaVez).toBe(haceHoras(2).toISOString())
    expect(d.bloqueadoHasta).toBeNull()
    expect(d.bloqueosPrevios).toBe(0)
  })

  it('no cuenta el rastro de auditoría como actividad hostil', async () => {
    await db.insert(securityEvents).values([evento('203.0.113.7', haceHoras(1), 'admin_action', 1)])
    const d = await detalleOrigen('203.0.113.7', AHORA)
    expect(d.eventos).toBe(0)
    expect(d.categorias).toEqual([])
    expect(d.primeraVez).toBeNull()
  })

  it('distingue un bloqueo vigente de uno ya vencido', async () => {
    await db.insert(blockedIps).values([
      { ip: '203.0.113.7', hits: 2, createdAt: haceHoras(1), expiresAt: haceHoras(-23) },
      { ip: '198.51.100.1', hits: 1, createdAt: haceHoras(48), expiresAt: haceHoras(47) },
    ])

    const vigente = await detalleOrigen('203.0.113.7', AHORA)
    expect(vigente.bloqueadoHasta).toBe(haceHoras(-23).toISOString())
    expect(vigente.bloqueosPrevios).toBe(2)

    const vencido = await detalleOrigen('198.51.100.1', AHORA)
    expect(vencido.bloqueadoHasta).toBeNull()
    expect(vencido.bloqueosPrevios).toBe(1)
  })

  it('avisa si la IP está en la allowlist', async () => {
    vi.stubEnv('SECURITY_IP_ALLOWLIST', '203.0.113.7')
    expect((await detalleOrigen('203.0.113.7', AHORA)).protegido).toBe(true)
    expect((await detalleOrigen('198.51.100.1', AHORA)).protegido).toBe(false)
  })
})
