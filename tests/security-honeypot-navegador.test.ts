import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// Un honeypot pedido por un NAVEGADOR no bloquea: otra web puede hacérselo
// pedir con un <img>, y el bloqueado sería el visitante (o un salón entero tras
// el mismo wifi). Se prueba el sensor (cómo se registra) y el cron de
// auto-bloqueo (que no lo cuente) contra libSQL en archivo temporal.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `honeypot-navegador-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

const record = vi.fn((_e: { classification: { ruleId: string; severity: string } }) => Promise.resolve())
vi.mock('../src/lib/security/events', () => ({ recordSecurityEvent: record }))
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))

const { observeRequest, HONEYPOT_NAVEGADOR } = await import('../src/lib/security/sensor')
const { runAutoBlock, esIpPropia } = await import('../src/lib/security/autoblock')
const { invalidateBlocklistCache } = await import('../src/lib/security/blocklist')

let client: { execute: (sql: string | { sql: string; args: unknown[] }) => Promise<{ rows: unknown[] }> }

beforeAll(async () => {
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client
  await client.execute(`CREATE TABLE security_events (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL, at integer NOT NULL, ip text, ip_hash text, method text,
    path text NOT NULL, query text, user_agent text, country text, asn text, category text NOT NULL,
    severity text NOT NULL, action text DEFAULT 'logged' NOT NULL, status_code integer, rule_id text,
    hits integer DEFAULT 1 NOT NULL)`)
  await client.execute(`CREATE TABLE blocked_ips (
    ip text PRIMARY KEY NOT NULL, reason text, rule_id text, hits integer NOT NULL DEFAULT 1,
    created_at integer NOT NULL, expires_at integer NOT NULL, source text NOT NULL DEFAULT 'auto')`)
  await client.execute(`CREATE TABLE admin_sessions (
    id text PRIMARY KEY NOT NULL, login text, user_agent text, ip text, first_seen integer, last_seen integer, revoked_at integer)`)
})

beforeEach(async () => {
  record.mockClear()
  for (const t of ['security_events', 'blocked_ips', 'admin_sessions']) await client.execute(`DELETE FROM ${t}`)
  invalidateBlocklistCache()
})

const pedir = (extra: Record<string, string> = {}) =>
  observeRequest({ method: 'GET', path: '/wp-login.php', headers: new Headers({ 'x-forwarded-for': '198.51.100.9', ...extra }) })

describe('sensor', () => {
  it('un escáner (sin Sec-Fetch-*) se registra como honeypot crítico', () => {
    const c = pedir({ 'user-agent': 'python-requests/2.31' })
    expect(c).toMatchObject({ category: 'honeypot', severity: 'critical', ruleId: 'honeypot.exact' })
  })

  it('un navegador (un <img> desde otra web) se registra, pero con su propia regla y sin severidad crítica', () => {
    const c = pedir({ 'sec-fetch-mode': 'no-cors', 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'image' })
    expect(c).toMatchObject({ category: 'honeypot', severity: 'medium', ruleId: HONEYPOT_NAVEGADOR })
    expect(record).toHaveBeenCalledTimes(1)
    expect(record.mock.calls[0]![0].classification.ruleId).toBe(HONEYPOT_NAVEGADOR)
  })
})

describe('cron de auto-bloqueo', () => {
  const evento = (ip: string, ruleId: string, severity: string) =>
    client.execute({
      sql: `INSERT INTO security_events (at, ip, path, category, severity, rule_id) VALUES (?, ?, '/wp-login.php', 'honeypot', ?, ?)`,
      args: [Math.floor(Date.now() / 1000), ip, severity, ruleId],
    })

  it('bloquea al escáner y deja en paz al navegador', async () => {
    await evento('203.0.113.1', 'honeypot.exact', 'critical')
    await evento('203.0.113.2', HONEYPOT_NAVEGADOR, 'medium')
    const r = await runAutoBlock()
    expect(r.blocked).toBe(1)
    const { rows } = await client.execute('SELECT ip FROM blocked_ips')
    expect(rows.map((x) => (x as { ip: string }).ip)).toEqual(['203.0.113.1'])
  })
})

describe('IPs propias', () => {
  it('la IP de una sesión admin viva es propia; la de una revocada, no', async () => {
    await client.execute(`INSERT INTO admin_sessions (id, ip) VALUES ('a', '192.0.2.10')`)
    await client.execute(`INSERT INTO admin_sessions (id, ip, revoked_at) VALUES ('b', '192.0.2.11', 1)`)
    expect(await esIpPropia('192.0.2.10')).toBe(true)
    expect(await esIpPropia('192.0.2.11')).toBe(false)
  })
})
