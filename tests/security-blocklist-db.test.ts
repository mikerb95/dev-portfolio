import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// BD libsql local (archivo temporal), igual que payments/cobros-db: ejercita el
// UNIQUE de blocked_ips y el onConflictDoUpdate del escalado real, sin tocar
// Turso. blockIpEscalated es la lógica compartida por el cron y el bloqueo
// inline de honeypots, así que se prueba contra la tabla de verdad.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `blocklist-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import { vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { blockIpEscalated, isBlocked, invalidateBlocklistCache, BLOCK_TTL_STEPS_SEC } from '../src/lib/security/blocklist'
import { db } from '../src/db'
import { blockedIps } from '../src/db/schema'

let client: { execute: (sql: string) => Promise<unknown> }

beforeAll(async () => {
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client
  await client.execute(`CREATE TABLE blocked_ips (
    ip text PRIMARY KEY NOT NULL,
    reason text,
    rule_id text,
    hits integer NOT NULL DEFAULT 1,
    created_at integer NOT NULL,
    expires_at integer NOT NULL,
    source text NOT NULL DEFAULT 'auto'
  )`)
})

beforeEach(async () => {
  await client.execute('DELETE FROM blocked_ips')
  invalidateBlocklistCache()
})

async function rowFor(ip: string) {
  const [r] = await db
    .select({ hits: blockedIps.hits, expiresAt: blockedIps.expiresAt, ruleId: blockedIps.ruleId })
    .from(blockedIps)
    .where(sql`${blockedIps.ip} = ${ip}`)
    .limit(1)
  return r
}

describe('blockIpEscalated · escalado sobre la tabla real', () => {
  const IP = '20.151.205.204'
  const now = new Date('2026-07-19T12:00:00Z')

  it('primer bloqueo aplica el escalón de 1h', async () => {
    const ok = await blockIpEscalated({ ip: IP, ruleId: 'honeypot.inline', source: 'auto' }, now)
    expect(ok).toBe(true)
    const r = await rowFor(IP)
    expect(r!.hits).toBe(1)
    expect(r!.ruleId).toBe('honeypot.inline')
    expect(Math.round((r!.expiresAt.getTime() - now.getTime()) / 1000)).toBe(BLOCK_TTL_STEPS_SEC[0])
  })

  it('reincidencias suben hits y escalan el TTL (1h → 24h → 7d)', async () => {
    await blockIpEscalated({ ip: IP, ruleId: 'honeypot.inline' }, now)
    await blockIpEscalated({ ip: IP, ruleId: 'honeypot.inline' }, now)
    let r = await rowFor(IP)
    expect(r!.hits).toBe(2)
    expect(Math.round((r!.expiresAt.getTime() - now.getTime()) / 1000)).toBe(BLOCK_TTL_STEPS_SEC[1])

    await blockIpEscalated({ ip: IP, ruleId: 'honeypot.inline' }, now)
    r = await rowFor(IP)
    expect(r!.hits).toBe(3)
    expect(Math.round((r!.expiresAt.getTime() - now.getTime()) / 1000)).toBe(BLOCK_TTL_STEPS_SEC[2])
  })

  it('una IP recién bloqueada queda vetada según isBlocked', async () => {
    expect(await isBlocked(IP)).toBe(false)
    await blockIpEscalated({ ip: IP, ruleId: 'honeypot.inline' }, now)
    expect(await isBlocked(IP)).toBe(true)
  })
})
