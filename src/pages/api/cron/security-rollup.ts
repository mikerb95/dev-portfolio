import type { APIRoute } from 'astro'
import { lt, sql } from 'drizzle-orm'
import { getSession } from 'auth-astro/server'
import { db } from '../../../db'
import { securityEvents, rateLimitBuckets, blockedIps } from '../../../db/schema'
import { runAutoBlock } from '../../../lib/security/autoblock'
import { invalidateBlocklistCache } from '../../../lib/security/blocklist'
import { isAllowedLogin } from '../../../lib/auth'
import { sendPush } from '../../../lib/notify'

// Cron de seguridad. FASE 2: ejecuta el auto-block y la purga por retención.
// FASE 3 lo ampliará con rollups y detección de anomalías. Disparado por
// cron-job.org (GET + Bearer CRON_SECRET), como el resto de crons del repo.

const CRON_SECRET = import.meta.env.CRON_SECRET
const SITE_URL = import.meta.env.AUTH_URL ?? 'https://codebymike.tech'

const EVENT_RETENTION_DAYS = 90

async function runRollup() {
  const now = new Date()

  // 1) Auto-block de IPs hostiles (honeypots + ráfagas de alta severidad).
  const auto = await runAutoBlock(now)

  // 2) Purga de bloqueos vencidos (TTL cumplido) y buckets de rate limit viejos.
  await db.delete(blockedIps).where(lt(blockedIps.expiresAt, now))
  await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.resetAt, now))
  invalidateBlocklistCache()

  // 3) Purga de eventos crudos por retención.
  const cutoff = new Date(now.getTime() - EVENT_RETENTION_DAYS * 86_400_000)
  await db.delete(securityEvents).where(lt(securityEvents.at, cutoff))

  // 4) Si el auto-block se topó (posible ataque distribuido), avisar: es señal
  //    de que hace falta la capa 0 (WAF/Attack Mode), no llenar la tabla.
  if (auto.overflow > 0) {
    await sendPush(
      'Auto-block al tope',
      `${auto.overflow} IPs hostiles sin bloquear (tope alcanzado). Posible ataque distribuido.`,
      { priority: 5, tags: 'rotating_light', click: `${SITE_URL}/admin/security` }
    ).catch(() => {})
  }

  return { ok: true, ...auto }
}

// Disparo por cron-job.org / Vercel cron.
export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization')
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    return new Response(JSON.stringify(await runRollup()), { status: 200 })
  } catch (err) {
    console.error('[security-rollup]', err)
    return new Response(JSON.stringify({ error: 'rollup fallido' }), { status: 500 })
  }
}

// Disparo manual desde /admin/security (fuera del guard de /api/admin → validamos aquí).
export const PUT: APIRoute = async ({ request }) => {
  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  if (!session || (login && !isAllowedLogin(login))) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    return new Response(JSON.stringify(await runRollup()), { status: 200 })
  } catch (err) {
    console.error('[security-rollup]', err)
    return new Response(JSON.stringify({ error: 'rollup fallido' }), { status: 500 })
  }
}
