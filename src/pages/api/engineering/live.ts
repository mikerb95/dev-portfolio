import type { APIRoute } from 'astro'
import { desc, gte, sql } from 'drizzle-orm'
import { db } from '../../../db'
import { webVitals, ciRuns, monitorChecks, monitors } from '../../../db/schema'

// Prueba de vida para las cards de /engineering. Los popovers se renderizan
// server-side con datos reales, pero eso es invisible para el visitante: este
// endpoint se consulta desde el navegador al abrir cada card y devuelve marcas
// de tiempo frescas (última muestra RUM, último sondeo, último run CI) más el
// reloj del servidor, para demostrar que nada está harcodeado.
// Solo expone metadatos de frescura; nunca URLs internas ni configuración.
export const GET: APIRoute = async () => {
  const now = Date.now()
  const since24h = new Date(now - 24 * 60 * 60 * 1000)

  const [lastVital] = await db
    .select({ metric: webVitals.metric, value: webVitals.value, at: webVitals.createdAt })
    .from(webVitals)
    .orderBy(desc(webVitals.createdAt))
    .limit(1)
  const [vitals24h] = await db
    .select({ n: sql<number>`count(*)` })
    .from(webVitals)
    .where(gte(webVitals.createdAt, since24h))

  const [lastCheck] = await db
    .select({
      at: monitorChecks.at,
      ok: monitorChecks.ok,
      statusCode: monitorChecks.statusCode,
      responseMs: monitorChecks.responseMs,
      name: monitors.name,
    })
    .from(monitorChecks)
    .innerJoin(monitors, sql`${monitors.id} = ${monitorChecks.monitorId}`)
    .orderBy(desc(monitorChecks.at))
    .limit(1)
  const [checks24h] = await db
    .select({ n: sql<number>`count(*)` })
    .from(monitorChecks)
    .where(gte(monitorChecks.at, since24h))

  const [lastRun] = await db
    .select({ at: ciRuns.createdAt, conclusion: ciRuns.conclusion, sha: ciRuns.sha })
    .from(ciRuns)
    .orderBy(desc(ciRuns.createdAt))
    .limit(1)

  return new Response(
    JSON.stringify({
      ts: now,
      vitals: {
        lastAt: lastVital?.at ? lastVital.at.getTime() : null,
        lastMetric: lastVital?.metric ?? null,
        count24h: vitals24h?.n ?? 0,
      },
      uptime: {
        lastAt: lastCheck?.at ? lastCheck.at.getTime() : null,
        lastOk: lastCheck?.ok ?? null,
        lastStatusCode: lastCheck?.statusCode ?? null,
        lastMs: lastCheck?.responseMs ?? null,
        lastName: lastCheck?.name ?? null,
        count24h: checks24h?.n ?? 0,
      },
      ci: {
        lastAt: lastRun?.at ? lastRun.at.getTime() : null,
        lastConclusion: lastRun?.conclusion ?? null,
        lastSha: lastRun?.sha ? lastRun.sha.slice(0, 7) : null,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
  )
}
