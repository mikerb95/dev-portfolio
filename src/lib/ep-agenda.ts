// Monitor de la agenda del instructor de etapa productiva (Microsoft Bookings).
//
// POR QUÉ EXISTE: la página pública de Bookings del CSF solo enseña huecos
// libres en el instante en que alguien la abre, y a la fecha (28 oct 2026) no
// se había conseguido agendar ninguna de las reuniones de la etapa (entregas de
// bitácora y visitas). La respuesta del instructor fue "revíselo con
// frecuencia". Esto lo revisa cada minuto, avisa en cuanto aparece un espacio
// y deja constancia de cuántos se ofrecieron y cuánto duraron libres.
//
// La API es la misma que consume la página de reserva: un POST anónimo, sin
// cookies ni login, que devuelve tramos de disponibilidad. No hace falta un
// navegador ni un modelo de IA: la pregunta "¿hay un hueco?" se responde con
// una comparación.
//
// Módulo PURO (sin BD, sin red, sin reloj propio) para poder probar las
// decisiones con un reloj de mentira, y para que /ep lo importe en el
// navegador. La parte con BD y red vive en `ep-agenda-db.ts`.

/** Colombia no tiene horario de verano: el desfase es fijo todo el año. */
const DESFASE_BOGOTA_MS = 5 * 3_600_000
const MIN_MS = 60_000
const DIA_MS = 86_400_000

export const NEGOCIO = 'ReservasEtapaProductivaCSF@sena.edu.co'
export const URL_RESERVA = `https://bookings.cloud.microsoft/book/${NEGOCIO}/`
const API = `https://bookings.cloud.microsoft/BookingsService/api/V1/bookingBusinessesc2/${NEGOCIO}/`
export const URL_DISPONIBILIDAD = `${API}GetStaffAvailability`
export const URL_SERVICIOS = `${API}services`

// Identificadores sacados de las peticiones reales de la página de reserva
// (28 oct 2026). El de staff es el del GRUPO de personal, no el del instructor:
// es el que la página manda y el único con el que la API responde con tramos.
export const SERVICIO_ID = 'bb1a61eb-69f4-41ad-b7f4-4cc2f72ec435'
export const GRUPO_STAFF_ID = 'c92e306b-aa55-4002-aff8-00e95fb7a563'

/** Tramo de horario agendable de un día de la semana (0 = domingo), en minutos desde la medianoche. */
export type Ventana = { dia: number; inicioMin: number; finMin: number }

export type ConfigServicio = {
  ventanas: Ventana[]
  duracionMin: number
  intervaloMin: number
  /** Hasta cuánto antes de la cita se puede reservar (P8D). */
  anticipacionMaxMin: number
  /** Cuánto antes de la cita se cierra la reserva (PT12H). */
  anticipacionMinMin: number
}

/**
 * La configuración tal como estaba el 28 oct 2026. Se usa mientras no se haya
 * leído la real, o si la lectura falla: mejor vigilar con un horario de ayer
 * que no vigilar.
 */
export const CONFIG_POR_DEFECTO: ConfigServicio = {
  ventanas: [
    { dia: 2, inicioMin: 480, finMin: 720 },
    { dia: 3, inicioMin: 480, finMin: 720 },
    { dia: 4, inicioMin: 480, finMin: 570 },
    { dia: 4, inicioMin: 630, finMin: 720 },
  ],
  duracionMin: 30,
  intervaloMin: 30,
  anticipacionMaxMin: 8 * 1440,
  anticipacionMinMin: 12 * 60,
}

// ---------------------------------------------------------------------------
// Hora de Bogotá
// ---------------------------------------------------------------------------

/** Día de la semana y minuto del día en Bogotá. */
export function enBogota(ms: number): { dia: number; minuto: number } {
  const d = new Date(ms - DESFASE_BOGOTA_MS)
  return { dia: d.getUTCDay(), minuto: d.getUTCHours() * 60 + d.getUTCMinutes() }
}

/** Medianoche de Bogotá del día que contiene `ms`. */
export function medianocheBogota(ms: number): number {
  return Math.floor((ms - DESFASE_BOGOTA_MS) / DIA_MS) * DIA_MS + DESFASE_BOGOTA_MS
}

/** Lunes 00:00 de Bogotá de la semana que contiene `ms`. */
export function lunesBogota(ms: number): number {
  const m = medianocheBogota(ms)
  const dia = enBogota(m).dia
  return m - ((dia + 6) % 7) * DIA_MS
}

/** "2026-10-28T08:00:00" leído como hora de Bogotá. */
export function desdeLocalBogota(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s)
  if (!m) return NaN
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) + DESFASE_BOGOTA_MS
}

/** Inverso de `desdeLocalBogota`, en el formato que la API espera. */
export function aLocalBogota(ms: number): string {
  return new Date(ms - DESFASE_BOGOTA_MS).toISOString().slice(0, 19)
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "mar 11 nov, 8:00", en hora de Bogotá. Propio y no Intl: sale igual en Node y en cualquier navegador. */
export function fmtCita(ms: number): string {
  const d = new Date(ms - DESFASE_BOGOTA_MS)
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}, ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Lectura de las respuestas de Bookings
// ---------------------------------------------------------------------------

/** Duración ISO 8601 de las que usa Bookings ("P8D", "PT12H", "PT30M", "P1DT2H") a minutos. */
export function duracionAMin(s: unknown): number | null {
  if (typeof s !== 'string') return null
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(s)
  if (!m || s === 'P' || s === 'PT') return null
  return (+(m[1] ?? 0)) * 1440 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0))
}

const NUM_DIA: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

/** Busca la primera aparición de una clave en cualquier nivel del JSON. */
function buscar(o: unknown, clave: string): unknown {
  if (Array.isArray(o)) {
    for (const v of o) {
      const r = buscar(v, clave)
      if (r !== undefined) return r
    }
  } else if (o && typeof o === 'object') {
    const rec = o as Record<string, unknown>
    if (clave in rec) return rec[clave]
    for (const v of Object.values(rec)) {
      const r = buscar(v, clave)
      if (r !== undefined) return r
    }
  }
  return undefined
}

/**
 * Configuración del servicio desde la respuesta de `services`.
 *
 * Se busca por clave y no por ruta fija: la respuesta anida el servicio en una
 * estructura que Microsoft no documenta, y lo que importa es que las claves
 * conserven su nombre. Si falta algo esencial devuelve null y el llamador sigue
 * con la configuración anterior.
 */
export function parseConfig(json: unknown): ConfigServicio | null {
  const ventanasRaw = buscar(json, 'bookingServiceWindows')
  const max = duracionAMin(buscar(json, 'maximumAdvance'))
  const min = duracionAMin(buscar(json, 'minimumLeadTime'))
  const intervalo = duracionAMin(buscar(json, 'timeSlotInterval'))
  const duracion = duracionAMin(buscar(json, 'defaultDuration'))
  if (!Array.isArray(ventanasRaw) || max === null || min === null) return null

  const ventanas: Ventana[] = []
  for (const w of ventanasRaw) {
    for (const h of (w as { bookableHours?: unknown[] })?.bookableHours ?? []) {
      const { day, timeSlots } = h as { day?: string; timeSlots?: { start?: number; end?: number }[] }
      const dia = NUM_DIA[String(day).toLowerCase()]
      if (dia === undefined) continue
      for (const t of timeSlots ?? []) {
        if (typeof t.start === 'number' && typeof t.end === 'number' && t.end > t.start) {
          ventanas.push({ dia, inicioMin: t.start, finMin: t.end })
        }
      }
    }
  }
  if (ventanas.length === 0) return null

  const duracionMin = duracion && duracion > 0 ? duracion : CONFIG_POR_DEFECTO.duracionMin
  return {
    ventanas,
    duracionMin,
    intervaloMin: intervalo && intervalo > 0 ? intervalo : duracionMin,
    anticipacionMaxMin: max,
    anticipacionMinMin: min,
  }
}

export type Tramo = { status: string; inicio: number; fin: number }

/**
 * Tramos de disponibilidad desde la respuesta de `GetStaffAvailability`.
 *
 * Devuelve null si la respuesta no tiene la forma esperada o viene vacía: una
 * respuesta vacía no significa "todo libre", significa que algo cambió, y
 * tratarla como todo libre dispararía 22 avisos falsos de golpe.
 */
export function parseDisponibilidad(json: unknown): Tramo[] | null {
  const staff = (json as { staffAvailabilityResponse?: unknown[] })?.staffAvailabilityResponse
  if (!Array.isArray(staff)) return null
  const tramos: Tramo[] = []
  for (const s of staff) {
    for (const it of (s as { availabilityItems?: unknown[] })?.availabilityItems ?? []) {
      const { status, startDateTime, endDateTime } = it as {
        status?: string
        startDateTime?: { dateTime?: string }
        endDateTime?: { dateTime?: string }
      }
      // La API responde en la zona que se le pide ("SA Pacific Standard Time",
      // UTC-5), así que las horas se leen como de Bogotá.
      const inicio = desdeLocalBogota(startDateTime?.dateTime ?? '')
      const fin = desdeLocalBogota(endDateTime?.dateTime ?? '')
      if (typeof status !== 'string' || !Number.isFinite(inicio) || !Number.isFinite(fin)) continue
      tramos.push({ status, inicio, fin })
    }
  }
  return tramos.length > 0 ? tramos : null
}

/** Cuerpo del POST de disponibilidad para un rango, tal como lo manda la página de reserva. */
export function cuerpoDisponibilidad(desde: number, hasta: number): string {
  const tz = 'SA Pacific Standard Time'
  return JSON.stringify({
    serviceId: SERVICIO_ID,
    groupStaffIds: [GRUPO_STAFF_ID],
    startDateTime: { dateTime: aLocalBogota(medianocheBogota(desde)), timeZone: tz },
    endDateTime: { dateTime: aLocalBogota(medianocheBogota(hasta) + DIA_MS), timeZone: tz },
  })
}

// ---------------------------------------------------------------------------
// Citas
// ---------------------------------------------------------------------------

/** Inicios de todas las citas que el horario permite entre `desde` y `hasta` (inclusive). */
export function citasTeoricas(config: ConfigServicio, desde: number, hasta: number): number[] {
  const out: number[] = []
  for (let dia = medianocheBogota(desde); dia <= hasta; dia += DIA_MS) {
    const dow = enBogota(dia).dia
    for (const v of config.ventanas) {
      if (v.dia !== dow) continue
      for (let m = v.inicioMin; m + config.duracionMin <= v.finMin; m += config.intervaloMin) {
        const t = dia + m * MIN_MS
        if (t >= desde && t <= hasta) out.push(t)
      }
    }
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

/**
 * Estados que significan "no se puede reservar". Todo lo demás cuenta como
 * libre: el único estado libre que se ha visto en Graph es AVAILABLE, pero un
 * estado desconocido avisando de más es un falso positivo que se mira y se
 * descarta; avisando de menos es una cita perdida.
 */
const NO_LIBRE = new Set(['BOOKINGSAVAILABILITYSTATUS_BUSY', 'BOOKINGSAVAILABILITYSTATUS_OUT_OF_OFFICE'])

/** Momento desde el que una cita es reservable. */
export const abreEn = (cita: number, config: ConfigServicio) => cita - config.anticipacionMaxMin * MIN_MS
/** Momento en que una cita deja de ser reservable. */
export const cierraEn = (cita: number, config: ConfigServicio) => cita - config.anticipacionMinMin * MIN_MS

/**
 * Citas que alguien podría reservar ahora mismo: dentro de la ventana de
 * anticipación y sin ningún tramo ocupado encima.
 */
export function citasLibres(tramos: Tramo[], config: ConfigServicio, ahora: number): number[] {
  const ocupados = tramos.filter((t) => NO_LIBRE.has(t.status))
  const desde = ahora + config.anticipacionMinMin * MIN_MS
  const hasta = ahora + config.anticipacionMaxMin * MIN_MS
  return citasTeoricas(config, desde, hasta).filter((c) => {
    const fin = c + config.duracionMin * MIN_MS
    return !ocupados.some((t) => t.inicio < fin && t.fin > c)
  })
}

// ---------------------------------------------------------------------------
// Cuándo consultar
// ---------------------------------------------------------------------------

/** Cadencia de fondo (para cancelaciones): el job "ep-agenda" de cron-job.org. */
export const CADA_MIN_FONDO = 10

/**
 * Franjas del job "ep-agenda-aperturas" de cron-job.org, que consulta cada
 * minuto (salvo los múltiplos de 10, que ya cubre el de fondo).
 *
 * POR QUÉ ESTÁ AQUÍ UNA COPIA DEL SCHEDULER: hasta el 28 oct 2026 cron-job.org
 * llamaba cada minuto y el endpoint decidía si consultar. Eran ~35.000 llamadas
 * al mes que respondían "no toca" pero pasaban igual por el middleware y por
 * Turso, y gastaban CPU activa de la cuota gratis de Vercel, que ya iba cerca
 * del límite. Ahora cron-job.org solo llama cuando hay que consultar, y esta
 * copia sirve para dos cosas: decir en /ep cuándo será la próxima revisión, y
 * probar (tests/ep-agenda.test.ts) que las franjas cubren cada apertura y que
 * los dos jobs nunca disparan en el mismo minuto. Si se cambia una, se cambia
 * la otra.
 *
 * Las franjas salen de las dos hipótesis de cuándo abre una cita, porque no se
 * sabe cuál aplica Bookings: exactamente 8 días antes de su hora (lunes a
 * miércoles de 8:00 a 12:00 para el horario actual) o a la medianoche del día
 * que queda a 8 días (lunes a miércoles a las 0:00).
 */
export const FRANJAS_APERTURA = { dias: [1, 2, 3], horas: [0, 8, 9, 10, 11] } as const

/** ¿Revisa algún job en este minuto? */
export function hayRevision(ms: number): boolean {
  const { dia, minuto } = enBogota(ms)
  if (minuto % CADA_MIN_FONDO === 0) return true
  return (FRANJAS_APERTURA.dias as readonly number[]).includes(dia) &&
    (FRANJAS_APERTURA.horas as readonly number[]).includes(Math.floor(minuto / 60))
}

/** Siguiente minuto (exacto) en que revisa algún job, estrictamente después de `ahora`. */
export function proximaRevision(ahora: number): number {
  let t = Math.floor(ahora / MIN_MS) * MIN_MS + MIN_MS
  while (!hayRevision(t)) t += MIN_MS
  return t
}

/** Momentos en que puede abrir una cita, por cualquiera de las dos hipótesis. */
export function momentosDeApertura(cita: number, config: ConfigServicio): number[] {
  const movil = abreEn(cita, config)
  return [movil, medianocheBogota(movil)]
}

// ---------------------------------------------------------------------------
// Cambios entre dos consultas
// ---------------------------------------------------------------------------

export type EstadoAgenda = {
  /** cita (ms, como texto) → cuándo se vio libre por primera vez en este episodio. */
  libres: Record<string, number>
  /** Primera consulta exitosa: desde aquí cuentan las estadísticas. */
  inicio: number
  /** Última consulta exitosa. */
  revisadoEn: number
  /** Último error, para el panel. Se borra al volver a responder. */
  error?: string
  config: ConfigServicio
  configLeidaEn?: number
  /** Estados crudos vistos alguna vez: si aparece uno nuevo, hay que mirarlo. */
  estadosVistos: string[]
}

export type Apertura = { cita: number; como: 'apertura' | 'liberada' | 'previa' }
export type Cierre = { cita: number; cierre: 'ocupada' | 'vencio' }

/**
 * Tolerancia para llamar "apertura" a una cita: si se vio libre hasta 20 min
 * después del momento en que debió abrir, se abrió con la ventana (la consulta
 * de fondo es cada 10). Más tarde que eso, alguien la liberó.
 */
const TOLERANCIA_APERTURA_MIN = 20

/**
 * Compara las citas libres de ahora con las de la consulta anterior.
 *
 * `previo` null significa primera consulta: lo que ya está libre no se abrió
 * ahora, así que se marca como `previa` y no cuenta como apertura.
 */
export function compararLibres(
  previo: Pick<EstadoAgenda, 'libres'> | null,
  libresAhora: number[],
  ahora: number,
  config: ConfigServicio
): { abiertas: Apertura[]; cerradas: Cierre[]; libres: Record<string, number> } {
  const antes = previo?.libres ?? {}
  const ahoraSet = new Set(libresAhora.map(String))
  const abiertas: Apertura[] = []
  const cerradas: Cierre[] = []
  const libres: Record<string, number> = {}

  for (const c of libresAhora) {
    const k = String(c)
    if (k in antes) {
      libres[k] = antes[k]
      continue
    }
    libres[k] = ahora
    const tarde = ahora - abreEn(c, config) > TOLERANCIA_APERTURA_MIN * MIN_MS
    abiertas.push({ cita: c, como: previo === null ? 'previa' : tarde ? 'liberada' : 'apertura' })
  }

  for (const k of Object.keys(antes)) {
    if (ahoraSet.has(k)) continue
    const c = Number(k)
    cerradas.push({ cita: c, cierre: ahora >= cierraEn(c, config) ? 'vencio' : 'ocupada' })
  }

  return { abiertas, cerradas, libres }
}

// ---------------------------------------------------------------------------
// Lo que publica /ep
// ---------------------------------------------------------------------------

export type Episodio = {
  cita: number
  abiertaEn: number
  como: Apertura['como']
  cerradaEn: number | null
  cierre: Cierre['cierre'] | null
}

export type Semana = {
  /** Lunes 00:00 de Bogotá. */
  lunes: number
  /** Citas del horario que ya entraron en la ventana de reserva desde que hay monitor. */
  delHorario: number
  /** De esas, cuántas se vieron libres al menos una vez. */
  seAbrieron: number
  sinAbrirse: number
  /** Mediana de minutos libres de los episodios ya cerrados, o null si no hay. */
  medianaLibreMin: number | null
}

const mediana = (xs: number[]): number | null => {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Resumen por semana de la cita.
 *
 * Solo cuentan las citas que entraron en la ventana de reserva DESPUÉS de que
 * arrancó el monitor: una cita que abrió antes pudo llenarse sin que nadie la
 * viera, y contarla como "sin abrirse" sería acusar sin evidencia. Las que
 * todavía están dentro de la ventana cuentan como "sin abrirse" hasta que se
 * abran: el resumen dice lo que pasó hasta ahora, no lo que pasará.
 */
export function resumenSemanas(episodios: Episodio[], config: ConfigServicio, inicio: number, ahora: number): Semana[] {
  const hasta = ahora + config.anticipacionMaxMin * MIN_MS
  const vigiladas = citasTeoricas(config, inicio, hasta).filter((c) => abreEn(c, config) >= inicio)
  const abiertas = new Set(episodios.map((e) => e.cita))
  const porSemana = new Map<number, Semana & { libres: number[] }>()

  for (const c of vigiladas) {
    const lunes = lunesBogota(c)
    const s = porSemana.get(lunes) ?? { lunes, delHorario: 0, seAbrieron: 0, sinAbrirse: 0, medianaLibreMin: null, libres: [] }
    s.delHorario++
    if (abiertas.has(c)) s.seAbrieron++
    else s.sinAbrirse++
    porSemana.set(lunes, s)
  }
  for (const e of episodios) {
    if (e.cerradaEn === null) continue
    const s = porSemana.get(lunesBogota(e.cita))
    if (s) s.libres.push(Math.round((e.cerradaEn - e.abiertaEn) / MIN_MS))
  }

  return [...porSemana.values()]
    .sort((a, b) => b.lunes - a.lunes)
    .map(({ libres, ...s }) => ({ ...s, medianaLibreMin: mediana(libres) }))
}

/**
 * Retraso de la página pública. El dueño recibe el aviso al instante y los
 * aprendices suscritos a los 10 min; /ep va con el mismo retraso que ellos para
 * no adelantarse: si mostrara la cita al minuto, mirar la página valdría más
 * que suscribirse.
 */
export const RETRASO_PUBLICO_MIN = 10

/**
 * Canal público de los aprendices, además del dueño (que recibe al instante por
 * NTFY_TOPIC). Va fijo en el código y no en una variable de entorno ni en la BD
 * porque no es secreto: es gratis y se comparte con toda la ficha. El retraso
 * coincide con el de /ep (RETRASO_PUBLICO_MIN) y lo aplica el propio ntfy.
 * Vive en el módulo puro porque /ep lo muestra para que la gente se suscriba.
 */
export const AVISO_APRENDICES = { topic: 'sena-agenda-ep', retraso: `${RETRASO_PUBLICO_MIN}m`, prioridad: 4 } as const

/**
 * Lo que /ep puede enseñar ahora. Una cita abierta hace menos del retraso no
 * aparece en ninguna parte, ni como fila ni en el conteo semanal, porque que
 * el "sin abrirse" baje de 19 a 18 ya delata que algo se abrió.
 */
export function vistaPublica(
  episodios: Episodio[],
  libres: Record<string, number>,
  ahora: number
): { episodios: Episodio[]; libres: number[] } {
  const corte = ahora - RETRASO_PUBLICO_MIN * MIN_MS
  return {
    episodios: episodios.filter((e) => e.abiertaEn <= corte),
    libres: Object.entries(libres)
      .filter(([, desde]) => desde <= corte)
      .map(([c]) => Number(c))
      .sort((a, b) => a - b),
  }
}

/**
 * Estado de cada cita en el calendario de /ep:
 * - libre: se puede reservar (ya con el retraso público aplicado).
 * - se-abrio: estuvo libre en algún momento y ya no.
 * - sin-abrir: ya pudo abrirse, con el monitor mirando, y nunca se vio libre.
 * - por-abrir: todavía no entra en la ventana de reserva.
 * - sin-datos: se abrió antes de que existiera el monitor; no se sabe qué pasó.
 */
export type EstadoCelda = 'libre' | 'se-abrio' | 'sin-abrir' | 'por-abrir' | 'sin-datos'

export type SemanaCalendario = {
  lunes: number
  citas: { cita: number; estado: EstadoCelda }[]
  /** Citas de la semana que ya pudieron abrirse con el monitor mirando. */
  vigiladas: number
  /** De esas, cuántas se vieron libres. */
  abiertas: number
}

/**
 * Las semanas que toca la ventana de reserva (la actual y, casi siempre, la
 * siguiente), cita por cita. Recibe los episodios y libres YA filtrados por
 * `vistaPublica`: así el calendario no puede adelantarse al aviso.
 */
export function calendario(
  episodios: Episodio[],
  libres: number[],
  config: ConfigServicio,
  inicio: number,
  ahora: number
): SemanaCalendario[] {
  const conEpisodio = new Set(episodios.map((e) => e.cita))
  const libresSet = new Set(libres)
  const semanas: SemanaCalendario[] = []
  const ultima = lunesBogota(ahora + config.anticipacionMaxMin * MIN_MS)

  for (let lunes = lunesBogota(ahora); lunes <= ultima; lunes += 7 * DIA_MS) {
    const citas = citasTeoricas(config, lunes, lunes + 7 * DIA_MS - 1).map((c) => {
      const abre = abreEn(c, config)
      const estado: EstadoCelda = libresSet.has(c)
        ? 'libre'
        : conEpisodio.has(c)
          ? 'se-abrio'
          : abre > ahora
            ? 'por-abrir'
            : abre < inicio
              ? 'sin-datos'
              : 'sin-abrir'
      return { cita: c, estado }
    })
    const vigiladas = citas.filter((c) => c.estado !== 'por-abrir' && c.estado !== 'sin-datos').length
    const abiertas = citas.filter((c) => c.estado === 'libre' || c.estado === 'se-abrio').length
    semanas.push({ lunes, citas, vigiladas, abiertas })
  }
  return semanas
}

/** "< 1 min", "4 min", "2 h 5 min", "3 d 2 h". */
export function fmtDuracion(min: number): string {
  if (min < 1) return '< 1 min'
  if (min < 60) return `${Math.round(min)} min`
  if (min < 1440) {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return m ? `${h} h ${m} min` : `${h} h`
  }
  const d = Math.floor(min / 1440)
  const h = Math.round((min % 1440) / 60)
  return h ? `${d} d ${h} h` : `${d} d`
}
