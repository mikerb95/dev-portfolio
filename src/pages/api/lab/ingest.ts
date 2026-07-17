import type { APIRoute } from 'astro'
import { timingSafeEqual } from 'node:crypto'
import { db } from '../../../db'
import { ciRuns } from '../../../db/schema'
import { normalizeFinding, parseAxeViolations, parseNpmAudit } from '../../../lib/lab/findings'
import { autoResolveStale, ingestFindings } from '../../../lib/lab/findings-store'

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

  if (body.kind !== 'ci_run') return json(400, { error: `kind no soportado: ${body.kind}` })

  const sha = typeof body.sha === 'string' ? body.sha.slice(0, 40) : null
  const conclusion = CONCLUSIONS.includes(body.conclusion as never) ? (body.conclusion as string) : null
  if (!sha || !conclusion) return json(400, { error: 'sha y conclusion (success|failure|rolled_back) son requeridos' })

  const num = (v: unknown): number | null => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)

  const [row] = await db
    .insert(ciRuns)
    .values({
      sha,
      branch: typeof body.branch === 'string' ? body.branch : null,
      runId: body.runId != null ? String(body.runId) : null,
      url: typeof body.url === 'string' ? body.url : null,
      conclusion: conclusion as (typeof CONCLUSIONS)[number],
      testsPassed: num(body.testsPassed),
      testsFailed: num(body.testsFailed),
      coveragePct: num(body.coveragePct),
      durationMs: num(body.durationMs),
      healthOk: typeof body.healthOk === 'boolean' ? body.healthOk : null,
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
