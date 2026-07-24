// Lógica pura para /docs/pipeline-en-vivo: normaliza la respuesta cruda de la
// API de Actions/Deployments de GitHub (y de nuestras propias tablas) a un
// vocabulario común de "estado" que ya usa el resto de /docs/testing
// (ok | fail | warn | skip | pending). Sin fetch aquí: eso vive en el
// endpoint; este módulo solo transforma datos ya obtenidos.

export type Estado = 'pending' | 'in_progress' | 'ok' | 'fail' | 'skip'

/** Traduce (status, conclusion) de la API de Actions a nuestro vocabulario. */
export function mapRunEstado(status: string | null, conclusion: string | null): Estado {
  if (status === 'queued' || status === 'waiting') return 'pending'
  if (status === 'in_progress') return 'in_progress'
  if (status !== 'completed') return 'pending'
  switch (conclusion) {
    case 'success':
      return 'ok'
    case 'skipped':
    case 'neutral':
      return 'skip'
    case 'cancelled':
      return 'skip'
    default:
      // failure, timed_out, action_required, startup_failure, stale
      return 'fail'
  }
}

export type GhStep = { name: string; status: string; conclusion: string | null; number: number }
export type GhJob = { name: string; status: string; conclusion: string | null; steps: GhStep[]; html_url: string | null }

export type JobResumen = { nombre: string; estado: Estado; pasos: { nombre: string; estado: Estado }[] }

export function normalizeJob(job: GhJob): JobResumen {
  return {
    nombre: job.name,
    estado: mapRunEstado(job.status, job.conclusion),
    pasos: (job.steps ?? [])
      // Los pasos de infraestructura (checkout, setup-node) no aportan nada
      // al relato: solo interesan los que tienen nombre propio del pipeline.
      .filter((s) => s.status === 'in_progress' || s.status === 'completed')
      .map((s) => ({ nombre: s.name, estado: mapRunEstado(s.status, s.conclusion) })),
  }
}

export type WorkflowResumen = {
  id: string
  nombre: string
  estado: Estado
  url: string | null
  jobs: JobResumen[]
}

/**
 * ¿Sigue "vivo" el último run conocido? Un run completado hace más de
 * `staleMinutes` deja de considerarse actividad en curso: la página vuelve
 * al modo simulado en vez de mostrar para siempre el resultado de hace tres
 * horas como si fuera lo que está pasando ahora mismo.
 */
export function esRunVivo(
  run: { status: string | null; updatedAt: string | Date | null } | null,
  ahora: number,
  staleMinutes = 12
): boolean {
  if (!run) return false
  if (run.status !== 'completed') return true
  if (!run.updatedAt) return false
  const t = new Date(run.updatedAt).getTime()
  if (Number.isNaN(t)) return false
  return ahora - t < staleMinutes * 60_000
}

export type MonitoresResumen = { ok: number; total: number }

export function estadoOperacion(m: MonitoresResumen): Estado {
  if (m.total === 0) return 'pending'
  if (m.ok === m.total) return 'ok'
  if (m.ok === 0) return 'fail'
  return 'skip' // parcial: ni todo sano ni todo caído, se pinta como "atención" (skip = amarillo/neutral aquí)
}

export type PipelineLiveStages = {
  push: { estado: Estado; ts: string | null }
  workflows: WorkflowResumen[]
  deploy: { estado: Estado; detalle: string | null; url: string | null }
  verify: { estado: Estado; healthOk: boolean | null }
  operacion: { estado: Estado; monitoresOk: number; monitoresTotal: number }
}

/** Estado global del pipeline: el peor estado entre push/workflows/deploy/verify. */
export function estadoGlobal(stages: Pick<PipelineLiveStages, 'push' | 'workflows' | 'deploy' | 'verify'>): Estado {
  const estados = [stages.push.estado, ...stages.workflows.map((w) => w.estado), stages.deploy.estado, stages.verify.estado]
  if (estados.some((e) => e === 'in_progress')) return 'in_progress'
  if (estados.some((e) => e === 'fail')) return 'fail'
  if (estados.every((e) => e === 'ok' || e === 'skip')) return 'ok'
  return 'pending'
}
