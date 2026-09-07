import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db'
import { cronRuns, monitorDaily, monitors, securityEvents, webVitals } from '../db/schema'
import { dayKeyUTC } from './monitor-rollup'
import { safeQuery } from './safe-query'

// Cifras agregadas del propio sitio para la cinta del hero, con la serie que
// hay detrás de cada una.
//
// Sustituye a la lista de tecnologías que había ahí: un portafolio que se
// presenta como ingeniería de sistemas puede enseñar el sistema en vez de
// enumerar herramientas. Cada cifra tiene una página pública que la sostiene,
// y por eso viaja con su `href`: la cinta es un índice de lo verificable, no
// una decoración.
//
// La serie no es adorno: una cifra agregada esconde justo lo interesante (si
// el 99,99% viene de treinta días planos o de veintinueve perfectos y uno
// roto). El panel que se abre al apuntar enseña esa forma, y por eso cada
// consulta trae el desglose y el total se suma en memoria: es la misma lectura,
// no una consulta más.
//
// Reparto con la card "Ahora" del bento (`/api/now`), que está a media pantalla
// de distancia: esa card cuenta lo ÚLTIMO que pasó (este deploy, este sondeo),
// esto cuenta la MAGNITUD acumulada y su evolución. Ninguna cifra se repite.
//
// Coste: Turso factura filas ESCANEADAS. Ninguna consulta de aquí toca
// `monitor_checks` (el uptime sale del resumen diario ya calculado por el cron)
// y las dos que barren por tiempo van acotadas con LIMIT sobre su índice de
// fecha. La cinta está en la portada: es la ruta más visitada del sitio y la
// que menos puede permitirse una consulta cara.

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const VENTANA_DIAS = 30
const VENTANA_HORAS = 24
// Muestras de LCP que se traen para el percentil y el histograma. Con 24 h de
// tráfico normal no se llega a este techo; existe para que una punta de visitas
// no convierta la portada en un scan de miles de filas.
const MUESTRAS_LCP = 500
// Techo de corridas de cron leídas. Con los crons actuales son ~270 al día;
// el margen absorbe que se añadan más sin que la portada se vuelva cara.
const MAX_CRON_RUNS = 800

/** Un día de la serie. `valor` es null cuando ese día no dejó ningún registro. */
export type PuntoDia = { dia: string; valor: number | null; total: number }
/** Una hora de la serie de crons, con el reparto entre corridas verdes y rojas. */
export type PuntoHora = { hora: number; ok: number; total: number }

export type Pulso = {
  /** Fracción 0..1 de sondeos correctos en la ventana, o null si no hay datos. */
  uptime: number | null
  /** Sondeos ejecutados en la ventana. */
  sondeos: number
  /** Ventana en días de las series diarias. */
  ventanaDias: number
  /** Uptime diario, del más antiguo al más reciente. `valor` es la fracción 0..1. */
  serieUptime: PuntoDia[]
  /** Peticiones hostiles clasificadas por el micro-SIEM en la ventana. */
  eventos: number
  /** Eventos por día, del más antiguo al más reciente. */
  serieEventos: PuntoDia[]
  /** Ejecuciones de cron en las últimas 24 h. */
  crons: { ok: number; total: number }
  /** Corridas por hora, de la más antigua a la más reciente. */
  serieCrons: PuntoHora[]
  /** p75 de LCP en milisegundos sobre las últimas 24 h, o null sin muestras. */
  lcpP75: number | null
  /** Muestras crudas de LCP en ms, para el histograma del panel. */
  muestrasLcp: number[]
}

/**
 * Percentil por el método del más cercano por rango (el mismo criterio que usa
 * Web Vitals para reportar p75). Puro y exportado para poder probarlo sin base:
 * un percentil mal calculado en la portada es una cifra falsa sobre el propio
 * sitio, que es justo lo que esta cinta existe para no ser.
 */
export function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null
  const orden = [...valores].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * orden.length) - 1
  return orden[Math.min(Math.max(idx, 0), orden.length - 1)]
}

/**
 * Trunca hacia abajo, NO redondea.
 *
 * 20.303 sondeos buenos de 20.304 son un 99,9951% que `toFixed(2)` convierte en
 * "100,00%": la cinta acabaría afirmando que no ha fallado nada cuando sí falló
 * algo. Un indicador de disponibilidad que redondea a su favor no es un
 * indicador. Mismo criterio para el LCP: se enseña el peor valor del intervalo.
 */
export function truncar(valor: number, decimales: number): number {
  const factor = 10 ** decimales
  return Math.floor(valor * factor) / factor
}

/**
 * Rellena los días sin fila de la ventana con `valor: null`.
 *
 * Un día en el que no se sondeó nada NO es un día al 100%: es un hueco, y el
 * panel lo pinta como hueco. Colapsar la serie a los días que sí tienen datos
 * dibujaría treinta barras seguidas y perfectas sobre un mes con un agujero de
 * tres semanas, que es exactamente la mentira que un gráfico de disponibilidad
 * no puede contar (el sitio tuvo uno real entre agosto y septiembre de 2026).
 */
export function rellenarDias(
  filas: { dia: string; valor: number | null; total: number }[],
  ahora: number,
  dias: number,
): PuntoDia[] {
  const porDia = new Map(filas.map((f) => [f.dia, f]))
  const serie: PuntoDia[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const dia = dayKeyUTC(ahora - i * DAY_MS)
    serie.push(porDia.get(dia) ?? { dia, valor: null, total: 0 })
  }
  return serie
}

/**
 * Agrupa corridas sueltas en las últimas `horas` casillas horarias.
 *
 * La hora es la distancia a "ahora" y no la hora del reloj: la casilla más a la
 * derecha es siempre la hora en curso, así el panel se lee igual a las 3 de la
 * madrugada que a mediodía.
 */
export function agruparHoras(
  filas: { at: number; ok: boolean }[],
  ahora: number,
  horas: number,
): PuntoHora[] {
  const serie: PuntoHora[] = Array.from({ length: horas }, (_, i) => ({
    hora: horas - 1 - i,
    ok: 0,
    total: 0,
  }))
  for (const f of filas) {
    const atras = Math.floor((ahora - f.at) / HOUR_MS)
    if (atras < 0 || atras >= horas) continue
    const casilla = serie[horas - 1 - atras]
    casilla.total++
    if (f.ok) casilla.ok++
  }
  return serie
}

/**
 * Reparte las muestras en los tramos que definen los `cortes` (en ms).
 *
 * Devuelve un conteo por tramo, incluido el tramo abierto por encima del último
 * corte. Los cortes que usa el panel son los umbrales reales de Web Vitals, no
 * una división bonita: un histograma de rendimiento cuyas divisiones no
 * coinciden con los umbrales del estándar no deja ver lo único que importa, que
 * es de qué lado del umbral cae la mayoría.
 */
export function histograma(muestras: number[], cortes: number[]): number[] {
  const conteo = new Array(cortes.length + 1).fill(0)
  for (const m of muestras) {
    let tramo = cortes.length
    for (let i = 0; i < cortes.length; i++) {
      if (m < cortes[i]) {
        tramo = i
        break
      }
    }
    conteo[tramo]++
  }
  return conteo
}

export async function leerPulso(ahora = Date.now()): Promise<Pulso> {
  const desdeDia = dayKeyUTC(ahora - (VENTANA_DIAS - 1) * DAY_MS)
  const desdeVentana = new Date(ahora - VENTANA_DIAS * DAY_MS)
  const desde24h = new Date(ahora - DAY_MS)

  // Fail-open por consulta y no por bloque: si el micro-SIEM no contesta, la
  // cinta pierde esa señal y conserva las demás. Un dato ausente se omite; la
  // cinta nunca inventa un cero para rellenar el hueco (ver `construirSenales`
  // en pulso-panel.ts, que descarta las señales sin dato).
  const [uptimeFilas, eventosFilas, cronFilas, lcpRows] = await Promise.all([
    safeQuery(
      () =>
        db
          .select({
            dia: monitorDaily.day,
            total: sql<number>`coalesce(sum(${monitorDaily.total}), 0)`,
            ok: sql<number>`coalesce(sum(${monitorDaily.ok}), 0)`,
          })
          .from(monitorDaily)
          .innerJoin(monitors, eq(monitors.id, monitorDaily.monitorId))
          .where(
            and(
              eq(monitors.active, true),
              eq(monitors.paused, false),
              gte(monitorDaily.day, desdeDia),
            ),
          )
          .groupBy(monitorDaily.day),
      [] as { dia: string; total: number; ok: number }[],
      'pulso/uptime',
    ),
    safeQuery(
      () =>
        db
          .select({
            dia: sql<string>`date(${securityEvents.at}, 'unixepoch')`,
            total: sql<number>`coalesce(sum(${securityEvents.hits}), 0)`,
          })
          .from(securityEvents)
          .where(gte(securityEvents.at, desdeVentana))
          .groupBy(sql`1`),
      [] as { dia: string; total: number }[],
      'pulso/siem',
    ),
    safeQuery(
      () =>
        db
          .select({ at: cronRuns.createdAt, ok: cronRuns.ok })
          .from(cronRuns)
          .where(gte(cronRuns.createdAt, desde24h))
          .orderBy(desc(cronRuns.createdAt))
          .limit(MAX_CRON_RUNS),
      [] as { at: Date | null; ok: boolean }[],
      'pulso/crons',
    ),
    safeQuery(
      () =>
        db
          .select({ value: webVitals.value })
          .from(webVitals)
          .where(and(eq(webVitals.metric, 'LCP'), gte(webVitals.createdAt, desde24h)))
          .orderBy(desc(webVitals.createdAt))
          .limit(MUESTRAS_LCP),
      [] as { value: number }[],
      'pulso/lcp',
    ),
  ])

  // Los totales se suman de la propia serie: el desglose ya está en memoria y
  // pedir aparte el agregado sería leer las mismas filas dos veces.
  const sondeos = uptimeFilas.reduce((n, f) => n + Number(f.total), 0)
  const sondeosOk = uptimeFilas.reduce((n, f) => n + Number(f.ok), 0)
  const serieUptime = rellenarDias(
    uptimeFilas.map((f) => ({
      dia: f.dia,
      valor: Number(f.total) > 0 ? Number(f.ok) / Number(f.total) : null,
      total: Number(f.total),
    })),
    ahora,
    VENTANA_DIAS,
  )

  const eventos = eventosFilas.reduce((n, f) => n + Number(f.total), 0)
  const serieEventos = rellenarDias(
    eventosFilas.map((f) => ({ dia: f.dia, valor: Number(f.total), total: Number(f.total) })),
    ahora,
    VENTANA_DIAS,
  )

  const corridas = cronFilas
    .filter((f): f is { at: Date; ok: boolean } => f.at instanceof Date)
    .map((f) => ({ at: f.at.getTime(), ok: f.ok }))
  const serieCrons = agruparHoras(corridas, ahora, VENTANA_HORAS)

  const muestrasLcp = lcpRows.map((r) => r.value)

  return {
    uptime: sondeos > 0 ? sondeosOk / sondeos : null,
    sondeos,
    ventanaDias: VENTANA_DIAS,
    serieUptime,
    eventos,
    serieEventos,
    crons: {
      ok: corridas.filter((c) => c.ok).length,
      total: corridas.length,
    },
    serieCrons,
    lcpP75: percentil(muestrasLcp, 75),
    muestrasLcp,
  }
}
