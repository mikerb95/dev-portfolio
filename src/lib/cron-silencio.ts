// Detector de crons en silencio: el interruptor de hombre muerto de la bitácora.
//
// POR QUÉ EXISTE: `cron_runs` hizo visible el calendario real de las tareas
// programadas, pero seguía dependiendo de que alguien abriera la página. Un
// cron que se cae no falla: desaparece, y lo que desaparece no dispara nada.
// Pasó dos veces ya. La primera, tres semanas de sondeos perdidos que se
// encontraron mirando el historial. La segunda, el 7 sep 2026: al vencer el
// dominio viejo, los dos jobs de cron-job.org quedaron apuntando a un host sin
// DNS, el scheduler los deshabilitó solo, y el sitio se quedó sin sondeos cada
// 5 min y sin micro-SIEM sin un solo error en ninguna parte.
//
// Módulo PURO a propósito (sin BD, sin reloj propio, sin red): la parte que
// merece pruebas es la decisión "esto lleva demasiado tiempo callado", y esa
// solo se prueba bien con un reloj de mentira.

export type OrigenCron = 'vercel' | 'cron-job.org'

export type CronVigilado = {
  job: string
  /** Intervalo declarado entre ejecuciones, en minutos. */
  cadaMin: number
  origen: OrigenCron
}

export type Silencio = {
  job: string
  origen: OrigenCron
  cadaMin: number
  toleranciaMin: number
  /** Minutos desde la última ejecución, o `null` si no hay ninguna en la ventana consultada. */
  silencioMin: number | null
}

/** Estado que sobrevive entre ejecuciones, para no repetir el mismo aviso. */
export type EstadoSilencio = {
  /** job → epoch en ms del último aviso enviado por este episodio. */
  avisados: Record<string, number>
}

const MIN_MS = 60_000

/** Un aviso repetido cada 24 h mientras el silencio siga: recuerda sin agotar. */
export const RE_AVISO_MIN = 24 * 60

// Tope de holgura por encima del intervalo. Sin él, el triple de un cron diario
// serían tres días, y un backup que lleva dos sin correr ya es noticia.
const TOPE_EXTRA_MIN = 12 * 60

/**
 * Cuánto silencio se tolera antes de gritar.
 *
 * El triple del intervalo: aguanta dos ejecuciones perdidas seguidas (una puede
 * ser un despliegue a mitad de camino o el jitter del scheduler) y salta a la
 * tercera. Con el tope, un diario avisa a las 36 h y no a los tres días.
 */
export function toleranciaMin(cadaMin: number): number {
  return Math.min(cadaMin * 3, cadaMin + TOPE_EXTRA_MIN)
}

/**
 * El job más estricto gana cuando hay varios disparadores para el mismo
 * endpoint.
 *
 * `uptime-check` está declarado dos veces: diario desde Vercel y cada 5 min
 * desde cron-job.org. Vigilar el laxo sería no enterarse justamente del caso
 * que ya ocurrió - el disparador rápido muerto y el diario tapando el hueco.
 */
export function vigiladosUnicos(vigilados: readonly CronVigilado[]): CronVigilado[] {
  const porJob = new Map<string, CronVigilado>()
  for (const v of vigilados) {
    const previo = porJob.get(v.job)
    if (!previo || v.cadaMin < previo.cadaMin) porJob.set(v.job, v)
  }
  return [...porJob.values()]
}

/**
 * Ventana de bitácora que hay que leer para poder juzgar a todos: la tolerancia
 * más larga, más un margen.
 *
 * Existe para que la consulta sea un rango sobre el índice de fecha y no un
 * escaneo de la tabla entera: Turso factura filas escaneadas, y esto corre solo.
 */
export function ventanaMin(vigilados: readonly CronVigilado[]): number {
  const unicos = vigiladosUnicos(vigilados)
  if (unicos.length === 0) return 0
  return Math.max(...unicos.map((v) => toleranciaMin(v.cadaMin))) + TOPE_EXTRA_MIN
}

/**
 * Los que llevan callados más de lo que se les tolera.
 *
 * Un job sin ninguna ejecución en la ventana entra igual, con `silencioMin` en
 * `null`: no se sabe cuánto lleva callado, solo que es más que la ventana. Ese
 * caso cubre también al cron que está declarado en el catálogo pero que nunca
 * se dio de alta en ningún disparador, que es un silencio tan real como el otro.
 */
export function jobsEnSilencio(
  vigilados: readonly CronVigilado[],
  ultimas: ReadonlyMap<string, Date>,
  ahora: Date
): Silencio[] {
  const fuera: Silencio[] = []
  for (const v of vigiladosUnicos(vigilados)) {
    const tolerancia = toleranciaMin(v.cadaMin)
    const ultima = ultimas.get(v.job)
    const silencioMin = ultima ? Math.floor((ahora.getTime() - ultima.getTime()) / MIN_MS) : null
    if (silencioMin !== null && silencioMin <= tolerancia) continue
    fuera.push({
      job: v.job,
      origen: v.origen,
      cadaMin: v.cadaMin,
      toleranciaMin: tolerancia,
      silencioMin,
    })
  }
  // Primero el que lleva más tiempo callado; el que nunca apareció, arriba del todo.
  return fuera.sort((a, b) => (b.silencioMin ?? Infinity) - (a.silencioMin ?? Infinity))
}

/**
 * Filtra los silencios que toca avisar y devuelve el estado a guardar.
 *
 * Un job que se recupera desaparece del estado, así que si vuelve a callarse el
 * aviso sale inmediato en vez de esperar a la ventana de re-aviso. Es la misma
 * idea que el `delete` del dedup de SSL en `uptime-check`.
 */
export function decidirAvisos(
  silencios: readonly Silencio[],
  previo: EstadoSilencio,
  ahora: Date
): { avisos: Silencio[]; estado: EstadoSilencio } {
  const avisos: Silencio[] = []
  const avisados: Record<string, number> = {}
  for (const s of silencios) {
    const ultimoAviso = previo.avisados[s.job]
    const toca = !ultimoAviso || ahora.getTime() - ultimoAviso >= RE_AVISO_MIN * MIN_MS
    if (toca) avisos.push(s)
    avisados[s.job] = toca ? ahora.getTime() : ultimoAviso
  }
  return { avisos, estado: { avisados } }
}

/** Lee el estado guardado sin confiar en él: es JSON de la BD, no un tipo. */
export function parseEstado(raw: string | null | undefined): EstadoSilencio {
  if (!raw) return { avisados: {} }
  try {
    const v = JSON.parse(raw) as { avisados?: unknown }
    if (!v || typeof v !== 'object' || typeof v.avisados !== 'object' || v.avisados === null) {
      return { avisados: {} }
    }
    const avisados: Record<string, number> = {}
    for (const [job, at] of Object.entries(v.avisados as Record<string, unknown>)) {
      if (typeof at === 'number' && Number.isFinite(at)) avisados[job] = at
    }
    return { avisados }
  } catch {
    return { avisados: {} }
  }
}

/** Frase de alerta, en el mismo tono que las de monitores. */
export function describirSilencio(s: Silencio): string {
  const cuanto =
    s.silencioMin === null
      ? 'sin ninguna ejecución registrada'
      : s.silencioMin >= 120
        ? `callado ${Math.round(s.silencioMin / 60)}h`
        : `callado ${s.silencioMin}min`
  const esperado = s.cadaMin >= 1440 ? 'diario' : `cada ${s.cadaMin}min`
  return `⏱ cron ${s.job} ${cuanto} (${esperado}, ${s.origen})`
}
