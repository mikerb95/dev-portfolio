import type { APIRoute } from 'astro'
import { lt, sql } from 'drizzle-orm'
import { getSession } from 'auth-astro/server'
import { db } from '../../../db'
import { securityEvents, rateLimitBuckets, blockedIps } from '../../../db/schema'
import { runAutoBlock } from '../../../lib/security/autoblock'
import { invalidateBlocklistCache } from '../../../lib/security/blocklist'
import {
  storeRollups,
  hourlyBaselines,
  knownCountries,
  currentGeoTop,
  currentTopPaths,
  knownTopPaths,
  floorHour,
} from '../../../lib/security/rollup'
import { detectSpikes, detectNewPatterns, detectGeoAnomalies, type Anomaly } from '../../../lib/security/anomaly'
import { persistAnomalies } from '../../../lib/security/anomaly-store'
import { isAllowedLogin } from '../../../lib/auth'
import { sendEmail, sendPush } from '../../../lib/notify'

// Cron de seguridad. Ejecuta, en orden: auto-block (Fase 2), purga por retención,
// rollups horarios/diarios y detección de anomalías con alertas (Fase 3).
// Disparado por cron-job.org (GET + Bearer CRON_SECRET), como el resto de crons.

const CRON_SECRET = import.meta.env.CRON_SECRET
const SITE_URL = import.meta.env.AUTH_URL ?? 'https://codebymike.tech'

const EVENT_RETENTION_DAYS = 90

/** Detecta anomalías de la hora cerrada cruzando su agregado con la baseline. */
async function detectAnomalies(now: number, hourAggs: { category: string; count: number }[]): Promise<Anomaly[]> {
  const hourOfDay = new Date(floorHour(now) - 3_600_000).getUTCHours()
  const [baselines, countriesKnown, geoTop, curPaths, pathsKnown] = await Promise.all([
    hourlyBaselines(hourOfDay, now),
    knownCountries(now),
    currentGeoTop(now),
    currentTopPaths(now),
    knownTopPaths(now),
  ])

  const spikes = detectSpikes(
    hourAggs.map((a) => ({ category: a.category, observed: a.count, baseline: baselines.get(a.category) ?? [] }))
  )
  const geo = detectGeoAnomalies(geoTop, countriesKnown)
  const patterns = detectNewPatterns(curPaths, pathsKnown)
  return [...spikes, ...geo, ...patterns]
}

async function runRollup() {
  const now = new Date()

  // 1) Auto-block de IPs hostiles (honeypots + ráfagas de alta severidad).
  const auto = await runAutoBlock(now)

  // 2) Purga de bloqueos vencidos (TTL cumplido) y buckets de rate limit viejos.
  await db.delete(blockedIps).where(lt(blockedIps.expiresAt, now))
  await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.resetAt, now))
  invalidateBlocklistCache()

  // 3) Rollups horarios/diarios (materializados para dashboards y baseline).
  const hourAggs = await storeRollups(now.getTime())

  // 4) Detección de anomalías + persistencia con anti-fatiga.
  let freshAnomalies: Anomaly[] = []
  try {
    const found = await detectAnomalies(now.getTime(), hourAggs)
    freshAnomalies = await persistAnomalies(found, now)
  } catch (e) {
    // Fail-soft: un fallo del detector no debe abortar la purga ni el auto-block.
    console.error('[security-rollup] anomalías', e)
  }

  // 5) Purga de eventos crudos por retención (después de rollups/anomalías, que
  //    los leen).
  const cutoff = new Date(now.getTime() - EVENT_RETENTION_DAYS * 86_400_000)
  await db.delete(securityEvents).where(lt(securityEvents.at, cutoff))

  // 6) Alertas. El overflow del auto-block es crítico (posible ataque
  //    distribuido → hace falta la capa 0 / WAF). Las anomalías nuevas se
  //    agrupan en una sola notificación (anti-fatiga ya aplicado en persist).
  if (auto.overflow > 0) {
    await sendPush(
      'Auto-block al tope',
      `${auto.overflow} IPs hostiles sin bloquear (tope alcanzado). Posible ataque distribuido.`,
      { priority: 5, tags: 'rotating_light', click: `${SITE_URL}/admin/security` }
    ).catch(() => {})
  }
  if (freshAnomalies.length > 0) {
    const lines = freshAnomalies.map((a) => `• ${a.detail}`)
    const subject = `Anomalía de seguridad detectada (${freshAnomalies.length})`
    await Promise.all([
      sendPush(subject, lines.join('\n'), {
        priority: 4,
        tags: 'warning',
        click: `${SITE_URL}/admin/security`,
      }),
      sendEmail(
        subject,
        `${subject}\n\n${lines.join('\n')}\n\nPanel: ${SITE_URL}/admin/security`,
        `<h2 style="font-family:system-ui">Anomalías de seguridad</h2><ul style="font-family:system-ui;font-size:14px">${freshAnomalies
          .map((a) => `<li>${a.detail}</li>`)
          .join('')}</ul><p><a href="${SITE_URL}/admin/security">Abrir panel →</a></p>`
      ),
    ]).catch(() => {})
  }

  return { ok: true, ...auto, anomalies: freshAnomalies.length }
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
