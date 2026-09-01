import type { APIRoute } from 'astro'
import { and, gte, lt } from 'drizzle-orm'
import { getSession } from 'auth-astro/server'
import { db } from '../../../db'
import { monitorChecks, monitorDaily } from '../../../db/schema'
import { isAllowedLogin } from '../../../lib/auth'
import { cronSecretOk } from '../../../lib/cron-auth'
import {
  aggregateChecks,
  serializeHist,
  startOfDayUTC,
  type CheckRow,
} from '../../../lib/monitor-rollup'
import { conRegistro } from '../../../lib/cron-runs'

// Cron del resumen diario de sondeos. Convierte `monitor_checks` (una fila cada
// ~5 min por monitor) en `monitor_daily` (una fila por monitor y día), que es lo
// que lee /status. Ver el comentario de la tabla en db/schema.ts.
//
// Corre una vez al día y es suficiente: el día EN CURSO no se guarda nunca aquí,
// /status lo calcula en vivo (son ~2.300 filas, no 200.000).

/**
 * Días hacia atrás que se recalculan en cada pasada, sin contar el de hoy.
 *
 * Dos y no uno: el cron corre de madrugada UTC y un sondeo puede haberse
 * escrito con retraso justo al otro lado del cambio de día. Recalcular ayer y
 * anteayer cuesta unas 4.600 filas y cierra ese hueco sin depender de que los
 * relojes cuadren.
 */
const DIAS_POR_DEFECTO = 2

/** Tope del parámetro `days`, para que un backfill no se pida sin querer. */
const DIAS_MAX = 120

/**
 * Recalcula y reescribe el resumen de los últimos `dias` días cerrados.
 *
 * Va día a día en vez de una sola consulta con GROUP BY por dos razones: el
 * histograma se construye en JS (SQLite no tiene percentiles), y así cada
 * consulta queda acotada a un día aunque se pida un backfill de 90.
 */
async function runRollup(dias: number) {
  const hoyInicio = startOfDayUTC(Date.now())
  const ahora = new Date()
  let filasLeidas = 0
  let filasEscritas = 0

  for (let i = 1; i <= dias; i++) {
    const desde = hoyInicio - i * 86_400_000
    const hasta = desde + 86_400_000

    const rows = await db
      .select({
        monitorId: monitorChecks.monitorId,
        at: monitorChecks.at,
        ok: monitorChecks.ok,
        responseMs: monitorChecks.responseMs,
      })
      .from(monitorChecks)
      .where(and(gte(monitorChecks.at, new Date(desde)), lt(monitorChecks.at, new Date(hasta))))

    filasLeidas += rows.length
    if (rows.length === 0) continue

    const checks: CheckRow[] = rows.map((r) => ({
      monitorId: r.monitorId,
      at: r.at.getTime(),
      ok: Boolean(r.ok),
      responseMs: r.responseMs,
    }))

    for (const agg of aggregateChecks(checks)) {
      await db
        .insert(monitorDaily)
        .values({
          monitorId: agg.monitorId,
          day: agg.day,
          total: agg.total,
          ok: agg.ok,
          sumMs: agg.sumMs,
          latencyHist: serializeHist(agg.hist),
          computedAt: ahora,
        })
        .onConflictDoUpdate({
          target: [monitorDaily.monitorId, monitorDaily.day],
          set: {
            total: agg.total,
            ok: agg.ok,
            sumMs: agg.sumMs,
            latencyHist: serializeHist(agg.hist),
            computedAt: ahora,
          },
        })
      filasEscritas++
    }
  }

  // La retención de `monitor_checks` es de 90 días (uptime-check), así que un
  // resumen más viejo que eso ya no se puede recalcular y /status no lo pinta.
  const corte = new Date(hoyInicio - 120 * 86_400_000).toISOString().slice(0, 10)
  await db.delete(monitorDaily).where(lt(monitorDaily.day, corte))

  return { dias, filasLeidas, filasEscritas }
}

function pedirDias(url: URL): number {
  const crudo = Number(url.searchParams.get('days'))
  if (!Number.isFinite(crudo) || crudo < 1) return DIAS_POR_DEFECTO
  return Math.min(Math.floor(crudo), DIAS_MAX)
}

export const GET: APIRoute = conRegistro('monitor-rollup', async ({ request, url }) => {
  if (!cronSecretOk(request.headers.get('authorization'))) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    return new Response(JSON.stringify(await runRollup(pedirDias(url))), { status: 200 })
  } catch (err) {
    console.error('[monitor-rollup]', err)
    return new Response(JSON.stringify({ error: 'rollup fallido' }), { status: 500 })
  }
})
// Disparo manual desde el panel (mismo patrón que uptime-check): es la vía para
// el backfill inicial, `PUT /api/cron/monitor-rollup?days=90`.
export const PUT: APIRoute = async ({ request, url }) => {
  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  if (!session || (login && !isAllowedLogin(login))) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    return new Response(JSON.stringify(await runRollup(pedirDias(url))), { status: 200 })
  } catch (err) {
    console.error('[monitor-rollup]', err)
    return new Response(JSON.stringify({ error: 'rollup fallido' }), { status: 500 })
  }
}
