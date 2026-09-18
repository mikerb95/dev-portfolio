import type { APIRoute } from 'astro'
import { desc } from 'drizzle-orm'
import { db } from '../../../../db'
import { loadTestRuns } from '../../../../db/schema'

/**
 * Últimas corridas de carga para el panel LAB (protegido por el middleware
 * admin). No devuelve `rawJson`: son cientos de KB por corrida y la página no
 * lo usa, solo los escalones ya normalizados.
 */
export const GET: APIRoute = async () => {
  const rows = await db
    .select({
      id: loadTestRuns.id,
      tool: loadTestRuns.tool,
      scenario: loadTestRuns.scenario,
      target: loadTestRuns.target,
      vusMax: loadTestRuns.vusMax,
      durationS: loadTestRuns.durationS,
      requests: loadTestRuns.requests,
      rps: loadTestRuns.rps,
      p50: loadTestRuns.p50,
      p95: loadTestRuns.p95,
      p99: loadTestRuns.p99,
      avgMs: loadTestRuns.avgMs,
      maxMs: loadTestRuns.maxMs,
      errorRatePct: loadTestRuns.errorRatePct,
      checksPassed: loadTestRuns.checksPassed,
      checksFailed: loadTestRuns.checksFailed,
      thresholdsOk: loadTestRuns.thresholdsOk,
      sustainedRps: loadTestRuns.sustainedRps,
      breakingPointRps: loadTestRuns.breakingPointRps,
      recoveredAfterS: loadTestRuns.recoveredAfterS,
      stepsJson: loadTestRuns.stepsJson,
      findingsJson: loadTestRuns.findingsJson,
      ranAt: loadTestRuns.ranAt,
      createdAt: loadTestRuns.createdAt,
    })
    .from(loadTestRuns)
    .orderBy(desc(loadTestRuns.ranAt))
    .limit(30)

  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
