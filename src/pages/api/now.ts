import type { APIRoute } from 'astro'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '../../db'
import { ciRuns, monitorChecks, monitors, securityEvents } from '../../db/schema'
import { budgetHealth, computeSloFromCounts } from '../../lib/slo'

// Alimenta la card "Ahora" del index. Antes era una frase fija con una barra
// de progreso decorativa; el punto de este endpoint es que ese espacio diga
// algo distinto cada vez que alguien carga la página, con marcas de tiempo
// frescas que no se pueden fingir con texto estático.
//
// Solo agregados públicos (misma superficie que /status y /security): nombre
// del monitor, código de estado, sha corto del deploy y conteo de eventos.
// Nunca URLs internas, IPs, ni nombres de reglas de detección.
//
// Devuelve datos crudos, no frases: las etiquetas viven en el diccionario i18n
// y las arma el cliente, para no duplicar traducciones en la capa de API.

const DAY_MS = 86_400_000
const OBJECTIVE = 99.5
const SLO_DAYS = 30

export const GET: APIRoute = async () => {
  const now = Date.now()

  const payload: Record<string, unknown> = { ts: now, items: [], budget: null }

  // Fail-open: la card ya trae un texto de respaldo renderizado en SSR. Si la
  // base no responde, el visitante ve ese texto y nada se rompe.
  try {
    const [lastRun] = await db
      .select({
        at: ciRuns.createdAt,
        sha: ciRuns.sha,
        branch: ciRuns.branch,
        conclusion: ciRuns.conclusion,
      })
      .from(ciRuns)
      .orderBy(desc(ciRuns.createdAt))
      .limit(1)

    const [lastCheck] = await db
      .select({
        at: monitorChecks.at,
        ok: monitorChecks.ok,
        statusCode: monitorChecks.statusCode,
        responseMs: monitorChecks.responseMs,
        name: monitors.name,
      })
      .from(monitorChecks)
      .innerJoin(monitors, eq(monitors.id, monitorChecks.monitorId))
      .where(and(eq(monitors.active, true), eq(monitors.paused, false)))
      .orderBy(desc(monitorChecks.at))
      .limit(1)

    const [siem] = await db
      .select({ hits: sql<number>`coalesce(sum(${securityEvents.hits}), 0)` })
      .from(securityEvents)
      .where(gte(securityEvents.at, new Date(now - DAY_MS)))

    // Presupuesto de error global (30 d) sobre los monitores activos: el mismo
    // cálculo que /status, agregado en SQL para no traer un row por check.
    const [budgetRow] = await db
      .select({
        total: sql<number>`count(*)`,
        ok: sql<number>`coalesce(sum(${monitorChecks.ok}), 0)`,
      })
      .from(monitorChecks)
      .innerJoin(monitors, eq(monitors.id, monitorChecks.monitorId))
      .where(
        and(
          eq(monitors.active, true),
          eq(monitors.paused, false),
          gte(monitorChecks.at, new Date(now - SLO_DAYS * DAY_MS)),
        ),
      )

    const items: unknown[] = []

    if (lastRun?.at) {
      items.push({
        kind: 'deploy',
        at: lastRun.at.getTime(),
        sha: lastRun.sha.slice(0, 7),
        branch: lastRun.branch ?? 'main',
        conclusion: lastRun.conclusion,
      })
    }

    if (lastCheck?.at) {
      items.push({
        kind: 'uptime',
        at: lastCheck.at.getTime(),
        name: lastCheck.name,
        ok: lastCheck.ok,
        statusCode: lastCheck.statusCode,
        responseMs: lastCheck.responseMs,
      })
    }

    const events24h = Number(siem?.hits ?? 0)
    if (events24h > 0) {
      items.push({ kind: 'siem', at: now, events: events24h })
    }

    payload.items = items

    const slo = computeSloFromCounts(
      Number(budgetRow?.ok ?? 0),
      Number(budgetRow?.total ?? 0),
      OBJECTIVE,
      SLO_DAYS,
    )
    if (slo.budgetRemainingPct !== null) {
      payload.budget = {
        remainingPct: slo.budgetRemainingPct,
        health: budgetHealth(slo),
        objectivePct: OBJECTIVE,
        windowDays: SLO_DAYS,
      }
    }
  } catch {
    // Silencio deliberado: un fallo del panel de vitrina no puede tumbar el index.
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Agregados públicos: el CDN puede servirlos, pero la ventana es corta
      // para que "hace 4 min" siga siendo cierto.
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  })
}
