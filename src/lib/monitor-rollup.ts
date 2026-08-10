// Resumen diario de sondeos, precalculado. Módulo puro: sin BD, sin efectos.
//
// El problema que resuelve: /status agregaba 90 días de `monitor_checks` en
// CADA render (unas 200k filas por visita) y sacaba el p95 con una window
// function que ordena la partición entera. En producción lo tapaba el cache de
// 300s del CDN; en cuanto una prueba de carga le pegó sin CDN por delante, se
// agotó la cuota de lecturas de Turso (ago 2026). Con una fila por monitor y
// día, la misma página lee ~720 filas.
//
// Los contadores (total/ok/suma de ms) son exactos y aditivos, así que el
// agregado de 30 o 90 días es la suma de los días. La latencia no: un percentil
// no se puede sumar. Por eso cada día guarda además un HISTOGRAMA de latencias,
// que sí es aditivo, y el p95 del periodo sale del histograma sumado.

/**
 * Cotas superiores de los cubos de latencia, en ms. La última es el desborde.
 *
 * Están apretadas donde vive la latencia real de estos monitores (100-1000 ms)
 * y espaciadas en la cola, porque la precisión de un p95 solo importa donde cae
 * el p95. El error del percentil está acotado por el ancho de su cubo.
 */
export const HIST_BOUNDS = [
  50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000, 10_000, Infinity,
] as const

export type Hist = number[]

export const emptyHist = (): Hist => new Array(HIST_BOUNDS.length).fill(0)

/** Índice del cubo al que pertenece una latencia. */
export function bucketIndex(ms: number): number {
  for (let i = 0; i < HIST_BOUNDS.length; i++) if (ms <= HIST_BOUNDS[i]) return i
  return HIST_BOUNDS.length - 1
}

/** Suma una medición al histograma, in situ. Ignora lo que no sea un número. */
export function addToHist(hist: Hist, ms: number | null | undefined): void {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return
  hist[bucketIndex(ms)]++
}

/** Suma histogramas cubo a cubo. Devuelve uno nuevo. */
export function mergeHists(hists: Hist[]): Hist {
  const out = emptyHist()
  for (const h of hists) {
    for (let i = 0; i < out.length && i < h.length; i++) out[i] += h[i] || 0
  }
  return out
}

/**
 * Percentil aproximado a partir del histograma, interpolando dentro del cubo
 * donde cae el rango buscado. Devuelve null si no hay muestras.
 *
 * En el cubo de desborde no hay techo que interpolar, así que se devuelve su
 * cota inferior: preferimos quedarnos cortos y decir ">=10s" a inventar un
 * número grande que nadie puede verificar.
 */
export function quantileFromHist(hist: Hist, q = 0.95): number | null {
  const total = hist.reduce((s, n) => s + (n || 0), 0)
  if (total === 0) return null
  const rank = q * total
  let acumulado = 0
  for (let i = 0; i < hist.length; i++) {
    const n = hist[i] || 0
    if (n === 0) continue
    if (acumulado + n >= rank) {
      const inferior = i === 0 ? 0 : HIST_BOUNDS[i - 1]
      const superior = HIST_BOUNDS[i]
      if (!Number.isFinite(superior)) return Math.round(inferior)
      // Posición del rango dentro de este cubo, de 0 a 1.
      const fraccion = (rank - acumulado) / n
      return Math.round(inferior + (superior - inferior) * fraccion)
    }
    acumulado += n
  }
  return Math.round(HIST_BOUNDS[hist.length - 2] ?? 0)
}

/** Serializa para la columna `latency_hist`. */
export const serializeHist = (hist: Hist): string => JSON.stringify(hist)

/**
 * Lee la columna `latency_hist`. Ante cualquier basura devuelve un histograma
 * vacío en vez de lanzar: una fila corrupta debe costar el p95 de ese día, no
 * la página entera.
 */
export function parseHist(raw: string | null | undefined): Hist {
  if (!raw) return emptyHist()
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return emptyHist()
    const out = emptyHist()
    for (let i = 0; i < out.length && i < parsed.length; i++) {
      const n = Number(parsed[i])
      out[i] = Number.isFinite(n) && n >= 0 ? n : 0
    }
    return out
  } catch {
    return emptyHist()
  }
}

/** Clave de día en UTC ('YYYY-MM-DD'), la misma que usa `date(at,'unixepoch')`. */
export const dayKeyUTC = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Inicio del día UTC al que pertenece un instante. */
export const startOfDayUTC = (ms: number): number => Date.parse(`${dayKeyUTC(ms)}T00:00:00.000Z`)

export type CheckRow = { monitorId: number; at: number; ok: boolean; responseMs: number | null }
export type DailyAgg = {
  monitorId: number
  day: string
  total: number
  ok: number
  sumMs: number
  hist: Hist
}

/**
 * Agrupa sondeos crudos en un resumen por monitor y día. Lo usan tanto el cron
 * (para escribir la tabla) como /status (para el día en curso, que todavía no
 * tiene fila), y por eso vive aquí y no dentro de ninguno de los dos: si cada
 * uno contara a su manera, el día de hoy y el de ayer dejarían de ser
 * comparables en la misma gráfica.
 *
 * `at` en milisegundos.
 */
export function aggregateChecks(rows: CheckRow[]): DailyAgg[] {
  const porClave = new Map<string, DailyAgg>()
  for (const row of rows) {
    const day = dayKeyUTC(row.at)
    const clave = `${row.monitorId}|${day}`
    let agg = porClave.get(clave)
    if (!agg) {
      agg = { monitorId: row.monitorId, day, total: 0, ok: 0, sumMs: 0, hist: emptyHist() }
      porClave.set(clave, agg)
    }
    agg.total++
    if (row.ok) agg.ok++
    if (typeof row.responseMs === 'number' && Number.isFinite(row.responseMs)) {
      agg.sumMs += row.responseMs
      addToHist(agg.hist, row.responseMs)
    }
  }
  return [...porClave.values()]
}
