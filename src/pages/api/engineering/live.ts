import type { APIRoute } from 'astro'
import { desc, gte, sql } from 'drizzle-orm'
import { db } from '../../../db'
import { webVitals, ciRuns, monitorChecks, monitorDaily, monitors } from '../../../db/schema'
import { dayKeyUTC } from '../../../lib/monitor-rollup'

// Tope de conteo para las cuentas de "cuántos en 24h": ver el comentario en la
// query de web_vitals. La UI muestra `500+` al llegar al tope.
const COUNT_CAP = 500

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
  // `count(*)` acotado: sin el LIMIT, un pico de RUM convierte esta cuenta en
  // un scan de decenas de miles de filas por apertura de card. Lo que la tarjeta
  // comunica es "hay muestras frescas y son muchas", no la cifra exacta, así
  // que se cuenta hasta el tope y se muestra como "500+".
  const [vitals24h] = await db
    .select({ n: sql<number>`count(*)` })
    .from(
      db
        .select({ id: webVitals.id })
        .from(webVitals)
        .where(gte(webVitals.createdAt, since24h))
        .limit(COUNT_CAP)
        .as('v'),
    )

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
  // Del resumen diario, no del crudo: son 2 días de filas (una por monitor y
  // día) en vez de una fila por sondeo. Al cruzar la medianoche UTC la ventana
  // "24h" pasa a ser "hoy + ayer", un poco más ancha; para un contador de
  // frescura eso es irrelevante y ahorra el scan completo.
  const [checks24h] = await db
    .select({ n: sql<number>`coalesce(sum(${monitorDaily.total}), 0)` })
    .from(monitorDaily)
    .where(gte(monitorDaily.day, dayKeyUTC(now - 24 * 60 * 60 * 1000)))

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
        count24hCapped: (vitals24h?.n ?? 0) >= COUNT_CAP,
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
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Era `no-store`, y con eso cada apertura de card de cada visitante
        // pegaba al origen. Nada de lo que devuelve cambia más rápido que el
        // cron de sondeo (~5 min), así que 30s de CDN colapsan todas las
        // aperturas simultáneas en un solo hit sin que el dato deje de ser
        // "fresco" a ojos de quien mira la tarjeta.
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    },
  )
}
