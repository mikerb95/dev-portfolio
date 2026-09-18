// Lógica pura de las corridas de carga (k6). Sin BD ni red: convierte el
// resumen que ya normalizan los scripts de `lab/k6/` en la fila que guarda la
// tabla `load_test_runs`, y deriva las dos cifras que un jurado pregunta
// primero y que ningún percentil agregado responde: cuánta carga sostiene el
// sistema y a partir de cuánta se rompe.
//
// Se parsea el resumen de los scripts (`lab/k6/resultados/*.json`), no el JSON
// crudo de k6 (`*.raw.json`): la forma cruda cambia entre versiones de k6 y
// mezcla métricas de rampa con las de meseta, que es justo lo que esos scripts
// ya separaron.

export const LOAD_SCENARIOS = ['carga', 'estres'] as const
export type LoadScenario = (typeof LOAD_SCENARIOS)[number]

/**
 * Misma lista que el guardarraíl de `lab/k6/lib/perfil.js`. Está duplicada a
 * propósito y no importada: ese archivo lo ejecuta el runtime de k6 (no Node),
 * no puede cargar TypeScript ni resolver `src/`. La copia se mantiene honesta
 * desde `tests/load-test.test.ts`, que lee el .js y compara ambas listas.
 *
 * Aquí la regla es la última capa, no la primera: si alguien corriera la carga
 * contra producción saltándose el script, el resultado no entra al panel.
 */
export const OBJETIVOS_PROHIBIDOS = ['codebymike.net', 'codebymike.tech', 'dev-portfolio.vercel.app']

/**
 * Umbral de "ya se recuperó". Es el mismo que el propio `estres.js` declara
 * como threshold de la fase de recuperación (`recuperacion_duracion p(95)<1000`),
 * no un número nuevo: si el script considera sana esa fase con p95 bajo 1 s, el
 * panel no puede usar otra vara para decir cuándo volvió.
 */
export const RECUPERACION_P95_MS = 1000

export type LoadStep = {
  /** Carga ofrecida en el escalón: VUs en `carga`, req/s en `estres`. */
  carga: number
  unidad: 'vus' | 'rps'
  n: number
  exitosasRps: number | null
  p50: number | null
  p95: number | null
  p99: number | null
  errorPct: number
  cpuPct: number | null
  heapMb: number | null
  estado: EstadoEscalon
}

export const ESTADOS_ESCALON = ['ok', 'degradado', 'roto'] as const
export type EstadoEscalon = (typeof ESTADOS_ESCALON)[number]

export type ParsedLoadRun = {
  tool: 'k6'
  scenario: LoadScenario
  target: string
  ranAt: Date
  vusMax: number | null
  durationS: number | null
  requests: number | null
  rps: number | null
  p50: number | null
  p95: number | null
  p99: number | null
  avgMs: number | null
  maxMs: number | null
  errorRatePct: number | null
  checksPassed: number | null
  checksFailed: number | null
  thresholdsOk: boolean | null
  /** Mayor throughput exitoso entre los escalones sanos (req/s). */
  sustainedRps: number | null
  /** Carga ofrecida del primer escalón roto (req/s). Null si nunca se rompió. */
  breakingPointRps: number | null
  /** Segundos tras cesar la carga hasta el primer tramo con p95 sano. */
  recoveredAfterS: number | null
  steps: LoadStep[]
  findings: LoadFinding[]
  rawJson: string
}

export type LoadFinding = { id: string; titulo: string; descripcion: string }

export type ParseResult =
  | { ok: true; run: ParsedLoadRun }
  | { ok: false; error: string }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const int = (v: unknown): number | null => {
  const n = num(v)
  return n === null ? null : Math.round(n)
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/**
 * Estado de un escalón a partir de su tasa de error. Misma heurística que
 * `estres.js` aplica en el script; se replica aquí porque `carga.js` no la
 * emite y los dos escenarios tienen que pintarse con el mismo criterio.
 */
export function estadoPorError(errorPct: number): EstadoEscalon {
  if (errorPct >= 20) return 'roto'
  if (errorPct >= 1) return 'degradado'
  return 'ok'
}

/** True si la URL apunta a producción (o a su alias fijo en Vercel). */
export function esObjetivoProhibido(target: string): boolean {
  return OBJETIVOS_PROHIBIDOS.some((d) => target.includes(d))
}

function pasosDeCarga(raw: Record<string, unknown>): LoadStep[] {
  const curva = Array.isArray(raw.curvaCapacidad) ? raw.curvaCapacidad : []
  return curva.map((e) => {
    const c = (e ?? {}) as Record<string, unknown>
    const errorPct = num(c.errorPct) ?? 0
    return {
      carga: num(c.vus) ?? 0,
      unidad: 'vus' as const,
      n: int(c.n) ?? 0,
      exitosasRps: num(c.exitosasRps),
      p50: num(c.p50),
      p95: num(c.p95),
      p99: num(c.p99),
      errorPct,
      cpuPct: num(c.cpuPct),
      heapMb: num(c.heapMb),
      estado: estadoPorError(errorPct),
    }
  })
}

function pasosDeEstres(raw: Record<string, unknown>): LoadStep[] {
  const escalera = Array.isArray(raw.escalera) ? raw.escalera : []
  return escalera.map((e) => {
    const c = (e ?? {}) as Record<string, unknown>
    const errorPct = num(c.errorPct) ?? 0
    // El script ya trae `estado`; se respeta si viene, y si no se deriva. Así
    // una corrida vieja (anterior a ese campo) sigue entrando al panel.
    const estado = ESTADOS_ESCALON.includes(c.estado as EstadoEscalon)
      ? (c.estado as EstadoEscalon)
      : estadoPorError(errorPct)
    return {
      carga: num(c.rpsOfrecido) ?? 0,
      unidad: 'rps' as const,
      n: int(c.n) ?? 0,
      exitosasRps: num(c.exitosasRps),
      p50: num(c.p50),
      p95: num(c.p95),
      p99: num(c.p99),
      errorPct,
      cpuPct: num(c.cpuPct),
      heapMb: num(c.heapMb),
      estado,
    }
  })
}

/**
 * Segundos hasta recuperarse tras cesar la carga. Se lee de la curva por tramos
 * y no del agregado de la fase: el promedio de toda la recuperación mezcla el
 * sistema todavía drenando con el ya recuperado, y por eso no responde "cuánto
 * tardó" (hallazgo H-03 de la corrida de referencia).
 *
 * Null significa "no se recuperó dentro de la ventana medida", que es distinto
 * de 0 ("nunca llegó a degradarse"): quien lea el panel necesita poder
 * distinguirlos.
 */
export function recuperadoEnS(curva: unknown): number | null {
  if (!Array.isArray(curva)) return null
  for (const tramo of curva) {
    const t = (tramo ?? {}) as Record<string, unknown>
    const p95 = num(t.p95)
    const desdeS = num(t.desdeS)
    if (p95 === null || desdeS === null) continue
    // Un tramo sin peticiones no prueba recuperación, solo ausencia de muestra.
    if ((int(t.n) ?? 0) === 0) continue
    if (p95 < RECUPERACION_P95_MS) return desdeS
  }
  return null
}

function hallazgos(raw: Record<string, unknown>): LoadFinding[] {
  if (!Array.isArray(raw.hallazgos)) return []
  return raw.hallazgos
    .map((h) => {
      const o = (h ?? {}) as Record<string, unknown>
      return { id: str(o.id) ?? '', titulo: str(o.titulo) ?? '', descripcion: str(o.descripcion) ?? '' }
    })
    // Los scripts emiten H-01..H-05 vacíos como recordatorio para completarlos a
    // mano; los que siguen sin texto no son hallazgos, son casillas en blanco.
    .filter((h) => h.id !== '' && h.titulo !== '')
}

/**
 * Convierte el resumen de un script de `lab/k6/` en una fila lista para
 * `load_test_runs`. Devuelve un error legible en vez de lanzar: lo llama la
 * ingesta, que tiene que responder 400 con el motivo, no 500.
 */
export function parseK6Summary(input: unknown): ParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'summary debe ser un objeto' }
  }
  const raw = input as Record<string, unknown>

  const scenario = str(raw.escenario)
  if (!scenario || !LOAD_SCENARIOS.includes(scenario as LoadScenario)) {
    return { ok: false, error: `escenario no soportado: ${scenario ?? '(vacío)'}` }
  }

  const target = str(raw.objetivo)
  if (!target) return { ok: false, error: 'objetivo (URL del target) es requerido' }
  if (esObjetivoProhibido(target)) {
    return { ok: false, error: 'objetivo prohibido: la carga nunca corre contra producción' }
  }

  const fecha = str(raw.fecha)
  const ranAt = fecha ? new Date(fecha) : new Date()
  if (Number.isNaN(ranAt.getTime())) return { ok: false, error: 'fecha inválida' }

  const lat = (raw.latenciaMs ?? {}) as Record<string, unknown>
  const rec = (raw.recuperacion ?? {}) as Record<string, unknown>
  const steps = scenario === 'carga' ? pasosDeCarga(raw) : pasosDeEstres(raw)

  const sanos = steps.filter((s) => s.estado === 'ok' && s.exitosasRps !== null)
  const roto = steps.find((s) => s.estado === 'roto')

  return {
    ok: true,
    run: {
      tool: 'k6',
      scenario: scenario as LoadScenario,
      target,
      ranAt,
      vusMax: int(raw.vusMax),
      durationS: int(raw.duracionS),
      requests: int(raw.peticiones),
      rps: num(raw.rps),
      p50: num(lat.p50),
      p95: num(lat.p95),
      p99: num(lat.p99),
      avgMs: num(lat.media),
      maxMs: num(lat.max),
      errorRatePct: num(raw.tasaErrorPct),
      checksPassed: int(raw.checksOk),
      checksFailed: int(raw.checksFallidos),
      thresholdsOk: typeof raw.umbralesCumplidos === 'boolean' ? raw.umbralesCumplidos : null,
      sustainedRps: sanos.length ? Math.max(...sanos.map((s) => s.exitosasRps as number)) : null,
      breakingPointRps: roto && roto.unidad === 'rps' ? roto.carga : null,
      recoveredAfterS: recuperadoEnS(rec.curva),
      steps,
      findings: hallazgos(raw),
      rawJson: JSON.stringify(raw),
    },
  }
}
