// TEMPORAL: integración contra Turso real para validar las queries del panel
// /admin/security ejecutando el código drizzle de verdad. Se borra tras verificar.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '../src/db'
import { securityEvents, securityAnomalies } from '../src/db/schema'
import { listActiveBlocks } from '../src/lib/security/blocklist'
import { blockIp, unblockIp } from '../src/lib/security/blocklist'

const DAY = 86_400_000
const now = Date.now()
const d1 = new Date(now - DAY)
const sumHits = sql<number>`coalesce(sum(${securityEvents.hits}), 0)`

beforeAll(async () => {
  await db.insert(securityEvents).values([
    { at: new Date(now - 1000), ip: '203.0.113.10', ipHash: 'h1', method: 'GET', path: '/wp-login.php', query: null, userAgent: 'sqlmap', country: 'RU', asn: null, category: 'honeypot', severity: 'critical', action: 'honeypot', statusCode: 200, ruleId: 'honeypot.exact', hits: 1 },
    { at: new Date(now - 2000), ip: '203.0.113.11', ipHash: 'h2', method: 'GET', path: '/.env', query: null, userAgent: 'nikto', country: 'US', asn: null, category: 'secrets_probing', severity: 'high', action: 'logged', statusCode: 404, ruleId: 'secrets_probing.dotfiles', hits: 5 },
  ])
  await db.insert(securityAnomalies).values({ at: new Date(now - 3000), kind: 'spike', zScore: 12, baseline: 2, observed: 40, detail: 'test spike', notified: true, acknowledged: false })
  await blockIp({ ip: '203.0.113.10', reason: 'test', ttlSec: 3600, source: 'manual' })
})

afterAll(async () => {
  await db.delete(securityEvents)
  await db.delete(securityAnomalies)
  await unblockIp('203.0.113.10')
})

describe('queries del panel /admin/security (integración)', () => {
  it('agrega por categoría con IPs únicas', async () => {
    const byCat = await db
      .select({ category: securityEvents.category, count: sumHits, ips: sql<number>`count(distinct ${securityEvents.ip})` })
      .from(securityEvents)
      .where(gte(securityEvents.at, d1))
      .groupBy(securityEvents.category)
      .orderBy(sql`2 desc`)
    expect(byCat.length).toBeGreaterThanOrEqual(2)
    const secrets = byCat.find((c) => c.category === 'secrets_probing')
    // ≥5 (mis hits sembrados); tolera datos concurrentes en la DB compartida.
    expect(Number(secrets?.count)).toBeGreaterThanOrEqual(5)
  })

  it('top rutas y países incluyen lo sembrado', async () => {
    const topPaths = await db
      .select({ path: securityEvents.path, count: sumHits })
      .from(securityEvents)
      .where(gte(securityEvents.at, d1))
      .groupBy(securityEvents.path)
      .orderBy(sql`2 desc`)
      .limit(10)
    expect(topPaths.map((p) => p.path)).toContain('/.env')

    const topCountries = await db
      .select({ country: securityEvents.country, count: sumHits })
      .from(securityEvents)
      .where(and(gte(securityEvents.at, d1), sql`${securityEvents.country} is not null`))
      .groupBy(securityEvents.country)
      .orderBy(sql`2 desc`)
      .limit(8)
    expect(topCountries.map((c) => c.country)).toContain('RU')
  })

  it('bloqueos activos y anomalías abiertas', async () => {
    const blocks = await listActiveBlocks(now)
    expect(blocks.some((b) => b.ip === '203.0.113.10')).toBe(true)
    const anomalies = await db
      .select()
      .from(securityAnomalies)
      .where(eq(securityAnomalies.acknowledged, false))
      .orderBy(desc(securityAnomalies.at))
    expect(anomalies.length).toBeGreaterThanOrEqual(1)
  })

  it('explorador con filtro por severidad', async () => {
    const recent = await db
      .select()
      .from(securityEvents)
      .where(and(gte(securityEvents.at, d1), eq(securityEvents.severity, 'critical')))
      .orderBy(desc(securityEvents.at))
      .limit(60)
    expect(recent.every((e) => e.severity === 'critical')).toBe(true)
    expect(recent.some((e) => e.path === '/wp-login.php')).toBe(true)
  })
})
