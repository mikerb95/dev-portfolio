import type { APIRoute } from 'astro'
import { db } from '../../../db'
import { ciRuns, monitors } from '../../../db/schema'
import { and, desc, eq } from 'drizzle-orm'
import {
  mapRunEstado,
  normalizeJob,
  esRunVivo,
  estadoOperacion,
  estadoGlobal,
  type GhJob,
  type WorkflowResumen,
} from '../../../lib/lab/pipeline-live'

// Endpoint público (mismo criterio OPSEC que /status: solo agregados) que
// arma el estado "en vivo" de /docs/pipeline-en-vivo combinando tres fuentes
// reales:
//   1. API de Actions de GitHub — jobs/pasos del run más reciente en `main`.
//   2. API de Deployments de GitHub — mismo truco que dast.yml para saber si
//      Vercel ya publicó esa versión, sin necesitar VERCEL_TOKEN.
//   3. Nuestras propias tablas (ci_runs, monitors) para health check y
//      monitoreo continuo, que la API de GitHub no puede contarnos.
//
// Fail-open: cualquier fetch que falle (rate limit, timeout, GitHub caído)
// deja esa parte en null/pending; nunca tira el endpoint entero. El cliente
// interpreta `live: false` como "sin corrida reciente, muestra la simulación".
//
// Cache en memoria del propio proceso (best-effort entre invocaciones de la
// misma instancia serverless, no un cache distribuido) para no gastar la
// cuota de la API de GitHub —60 req/hora sin token— en cada poll de cada
// visitante. GITHUB_API_TOKEN es opcional: sin él el endpoint sigue
// funcionando, solo que con menos margen ante tráfico simultáneo alto.

const REPO = 'mikerb95/dev-portfolio'
const GH_API = 'https://api.github.com'
const CACHE_TTL_MS = 8_000

let cache: { at: number; body: unknown } | null = null

function ghHeaders(): HeadersInit {
  const token = import.meta.env.GITHUB_API_TOKEN
  const h: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function ghJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${GH_API}${path}`, { headers: ghHeaders() })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

type GhRun = {
  id: number
  name: string | null
  status: string | null
  conclusion: string | null
  head_sha: string
  html_url: string
  updated_at: string
  created_at: string
}

// Los 4 workflows que pueden correr para un mismo commit. DAST solo aplica a
// PRs (necesita un preview), así que en un push a main simplemente no aparece
// entre los runs — no es un fallo, es que no le tocaba correr.
const WORKFLOW_LABEL: Record<string, string> = {
  CI: 'CI',
  Security: 'Security',
  Accessibility: 'Accessibility',
  DAST: 'DAST',
}

export const GET: APIRoute = async () => {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return new Response(JSON.stringify(cache.body), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' },
    })
  }

  // 1. Último commit real en main (más rápido que esperar a que ci_runs lo reporte).
  const headCommit = await ghJson<{ sha: string }>(`/repos/${REPO}/commits/main`)
  const sha = headCommit?.sha ?? null

  // 2. Todos los workflow runs disparados por ese commit.
  const runsResp = sha
    ? await ghJson<{ workflow_runs: GhRun[] }>(`/repos/${REPO}/actions/runs?head_sha=${sha}&per_page=10`)
    : null
  const runs = runsResp?.workflow_runs ?? []

  const ciRun = runs.find((r) => r.name === 'CI') ?? null

  // 3. Detalle de jobs/pasos solo del run de CI (es el que tiene el relato
  //    completo: test, build, e2e, verify-production). Pedir jobs de los
  //    otros 3 workflows también gastaría 3x la cuota por poca ganancia: para
  //    ellos basta el estado del run.
  let ciJobs: WorkflowResumen['jobs'] = []
  if (ciRun) {
    const jobsResp = await ghJson<{ jobs: GhJob[] }>(`/repos/${REPO}/actions/runs/${ciRun.id}/jobs`)
    ciJobs = (jobsResp?.jobs ?? []).map(normalizeJob)
  }

  const workflows: WorkflowResumen[] = runs
    .filter((r) => r.name && r.name in WORKFLOW_LABEL)
    .map((r) => ({
      id: r.name!.toLowerCase(),
      nombre: WORKFLOW_LABEL[r.name!],
      estado: mapRunEstado(r.status, r.conclusion),
      url: r.html_url,
      jobs: r.name === 'CI' ? ciJobs : [],
    }))

  const live = esRunVivo(ciRun ? { status: ciRun.status, updatedAt: ciRun.updated_at } : null, now)

  // 4. Deployment de Vercel para ese sha — mismo patrón que dast.yml, sin VERCEL_TOKEN.
  let deploy: { estado: WorkflowResumen['estado']; detalle: string | null; url: string | null } = {
    estado: 'pending',
    detalle: null,
    url: null,
  }
  if (sha) {
    const deployments = await ghJson<{ id: number; environment: string }[]>(
      `/repos/${REPO}/deployments?sha=${sha}&per_page=5`
    )
    const prodDeploy = deployments?.find((d) => d.environment?.toLowerCase().includes('production'))
    if (prodDeploy) {
      const statuses = await ghJson<{ state: string; target_url: string | null; description: string | null }[]>(
        `/repos/${REPO}/deployments/${prodDeploy.id}/statuses`
      )
      const latest = statuses?.[0]
      if (latest) {
        deploy = {
          estado: latest.state === 'success' ? 'ok' : latest.state === 'failure' || latest.state === 'error' ? 'fail' : 'in_progress',
          detalle: latest.description,
          url: latest.target_url,
        }
      }
    }
  }

  // 5. Verificación en producción y monitoreo continuo: nuestras tablas, no GitHub.
  const [lastCiRun] = await db
    .select({ healthOk: ciRuns.healthOk, conclusion: ciRuns.conclusion })
    .from(ciRuns)
    .where(eq(ciRuns.branch, 'main'))
    .orderBy(desc(ciRuns.id))
    .limit(1)

  const verify: { estado: WorkflowResumen['estado']; healthOk: boolean | null } =
    lastCiRun == null
      ? { estado: 'pending', healthOk: null }
      : {
          estado: lastCiRun.conclusion === 'success' ? 'ok' : lastCiRun.conclusion === 'rolled_back' ? 'fail' : 'pending',
          healthOk: lastCiRun.healthOk,
        }

  const activeMonitors = await db
    .select({ lastStatus: monitors.lastStatus })
    .from(monitors)
    .where(and(eq(monitors.active, true), eq(monitors.paused, false)))

  const monitorSummary = {
    ok: activeMonitors.filter((m) => m.lastStatus === 'up').length,
    total: activeMonitors.length,
  }

  const stages = {
    // El push "ya pasó" en cuanto existe un run disparado por él, sin importar
    // cómo termine ese run — lo que este estado cuenta es si el evento
    // ocurrió, no su resultado (eso lo cuentan workflows/deploy/verify).
    push: { estado: (ciRun ? 'ok' : 'pending') as 'ok' | 'pending', ts: ciRun?.created_at ?? null },
    workflows,
    deploy,
    verify,
  }

  const body = {
    live,
    sha,
    shaCorta: sha?.slice(0, 7) ?? null,
    runUrl: ciRun?.html_url ?? null,
    updatedAt: new Date(now).toISOString(),
    stages: {
      ...stages,
      global: estadoGlobal(stages),
      operacion: { estado: estadoOperacion(monitorSummary), ...monitorSummary },
    },
  }

  cache = { at: now, body }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' },
  })
}
