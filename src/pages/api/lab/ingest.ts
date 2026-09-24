import type { APIRoute } from 'astro'
import { timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { ciRuns, loadTestRuns } from '../../../db/schema'
import { parseK6Summary } from '../../../lib/lab/load-test'
import { isUniqueViolation } from '../../../lib/db-unique'
import { normalizeFinding, parseAxeViolations, parseNpmAudit, parseZapReport } from '../../../lib/lab/findings'
import { autoResolveStale, ingestFindings } from '../../../lib/lab/findings-store'
import { urlSegura } from '../../../lib/safe-url'

const RAMA_RE = /^[\w./-]{1,100}$/

// Recibe artefactos generados por CI (métricas de runs, y a futuro k6/ZAP/Stryker).
// Autenticado por token de máquina (LAB_INGEST_TOKEN), no por sesión: lo llama
// GitHub Actions, no un humano.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function tokenOk(request: Request): boolean {
  const expected = import.meta.env.LAB_INGEST_TOKEN
  if (!expected) return false
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const CONCLUSIONS = ['success', 'failure', 'rolled_back'] as const

export const POST: APIRoute = async ({ request }) => {
  if (!tokenOk(request)) return json(401, { error: 'no autorizado' })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  if (body.kind === 'security_finding') return ingestSecurityFindings(body)
  if (body.kind === 'load_test') return ingestLoadTest(body)

  if (body.kind !== 'ci_run') return json(400, { error: `kind no soportado: ${body.kind}` })

  const sha = typeof body.sha === 'string' ? body.sha.slice(0, 40) : null
  const conclusion = CONCLUSIONS.includes(body.conclusion as never) ? (body.conclusion as string) : null
  if (!sha || !conclusion) return json(400, { error: 'sha y conclusion (success|failure|rolled_back) son requeridos' })

  const num = (v: unknown): number | null => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)

  const [row] = await db
    .insert(ciRuns)
    .values({
      sha,
      // Rama y URL acaban en enlaces e innerHTML del panel y de páginas
      // públicas: se aceptan solo con forma de rama y de URL http(s), no lo que
      // mande quien tenga el token.
      branch: typeof body.branch === 'string' && RAMA_RE.test(body.branch) ? body.branch : null,
      runId: body.runId != null ? String(body.runId) : null,
      url: typeof body.url === 'string' ? urlSegura(body.url) : null,
      conclusion: conclusion as (typeof CONCLUSIONS)[number],
      testsPassed: num(body.testsPassed),
      testsFailed: num(body.testsFailed),
      coveragePct: num(body.coveragePct),
      durationMs: num(body.durationMs),
      healthOk: typeof body.healthOk === 'boolean' ? body.healthOk : null,
      mutationScore: num(body.mutationScore),
      createdAt: new Date(),
    })
    .returning({ id: ciRuns.id })

  return json(201, { ok: true, id: row.id })
}

/**
 * Ingesta de hallazgos de seguridad/accesibilidad. Acepta tres formas de payload
 * (según lo que produzca cada job de CI):
 *  · { kind, findings: [...] }          → hallazgos ya normalizados.
 *  · { kind, source:'npm-audit', report } → salida cruda de `npm audit --json`.
 *  · { kind, source:'axe', pageUrl, violations } → violaciones de axe-core.
 *  · { kind, source:'zap', report } → reporte JSON de OWASP ZAP baseline.
 *
 * Si el lote trae `autoResolve:true` y un `source`, los hallazgos de esa fuente
 * que no aparecieron en este lote se marcan resueltos (el scan ya no los ve).
 */
async function ingestSecurityFindings(body: Record<string, unknown>): Promise<Response> {
  const runAt = new Date()
  let normalized

  if (body.source === 'npm-audit' && body.report) {
    normalized = parseNpmAudit(body.report)
  } else if (body.source === 'axe' && typeof body.pageUrl === 'string') {
    normalized = parseAxeViolations(body.violations, body.pageUrl)
  } else if (body.source === 'zap' && body.report) {
    normalized = parseZapReport(body.report)
  } else if (Array.isArray(body.findings)) {
    normalized = body.findings.map(normalizeFinding).filter((f): f is NonNullable<typeof f> => f !== null)
  } else {
    return json(400, { error: 'payload de security_finding inválido' })
  }

  const summary = await ingestFindings(normalized)

  let autoResolved = 0
  if (body.autoResolve === true && typeof body.source === 'string') {
    autoResolved = await autoResolveStale(body.source, runAt)
  }

  return json(201, { ok: true, ...summary, autoResolved })
}

/**
 * Ingesta de una corrida de carga de k6. El payload es el resumen que ya
 * normaliza `handleSummary` en los scripts de `lab/k6/` (`{ kind, summary }`),
 * no el JSON crudo de k6.
 *
 * Rechaza cualquier corrida cuyo objetivo sea producción. Es la tercera capa
 * del mismo guardarraíl (la primera y la segunda están en `lib/perfil.js`: la
 * URL y la base a la que el target está conectado), y la única que sigue en pie
 * si alguien corre k6 a mano saltándose el script.
 */
async function ingestLoadTest(body: Record<string, unknown>): Promise<Response> {
  const parsed = parseK6Summary(body.summary ?? body.resumen)
  if (!parsed.ok) return json(400, { error: parsed.error })

  const r = parsed.run
  let row: { id: number }
  try {
    ;[row] = await db
      .insert(loadTestRuns)
      .values({
        tool: r.tool,
        scenario: r.scenario,
        target: r.target,
        vusMax: r.vusMax,
        durationS: r.durationS,
        requests: r.requests,
        rps: r.rps,
        p50: r.p50,
        p95: r.p95,
        p99: r.p99,
        avgMs: r.avgMs,
        maxMs: r.maxMs,
        errorRatePct: r.errorRatePct,
        checksPassed: r.checksPassed,
        checksFailed: r.checksFailed,
        thresholdsOk: r.thresholdsOk,
        sustainedRps: r.sustainedRps,
        breakingPointRps: r.breakingPointRps,
        recoveredAfterS: r.recoveredAfterS,
        stepsJson: JSON.stringify(r.steps),
        findingsJson: JSON.stringify(r.findings),
        rawJson: r.rawJson,
        ranAt: r.ranAt,
        createdAt: new Date(),
      })
      .returning({ id: loadTestRuns.id })
  } catch (e) {
    // Reingerir la misma corrida no es un error del que haya que enterarse: el
    // paso de reporte del workflow corre con `always()` y reenvía los resúmenes
    // que el repo versiona cuando el job falla antes de k6. Se responde con la
    // fila que ya existía, igual que un replay de idempotencia en pagos.
    if (!isUniqueViolation(e)) throw e
    const [existente] = await db
      .select({ id: loadTestRuns.id })
      .from(loadTestRuns)
      .where(and(eq(loadTestRuns.scenario, r.scenario), eq(loadTestRuns.ranAt, r.ranAt)))
      .limit(1)
    return json(200, { ok: true, id: existente?.id ?? null, escalones: r.steps.length, duplicate: true })
  }

  return json(201, { ok: true, id: row.id, escalones: r.steps.length })
}
