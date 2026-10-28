// Parte con red y BD del monitor de la agenda de etapa productiva. Las
// decisiones (qué está libre, qué cambió, cuándo consultar) son puras y viven
// en `ep-agenda.ts`. Solo servidor.
import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { db } from '../db'
import { appSettings, epAgendaEpisodios } from '../db/schema'
import { sendPush } from './notify'
import {
  AVISO_APRENDICES,
  CONFIG_POR_DEFECTO,
  RETRASO_PUBLICO_MIN,
  URL_DISPONIBILIDAD,
  URL_RESERVA,
  URL_SERVICIOS,
  cuerpoDisponibilidad,
  fmtCita,
  parseConfig,
  parseDisponibilidad,
  calendario,
  resumenSemanas,
  vistaPublica,
  type Apertura,
  type Cierre,
  type ConfigServicio,
  type Episodio,
  type EstadoAgenda,
  type Semana,
  type SemanaCalendario,
  type Tramo,
} from './ep-agenda'

const CLAVE_ESTADO = 'ep_agenda_estado'


/** El horario del instructor cambia rara vez: releerlo en cada consulta sería otra llamada lenta por minuto. */
const RELEER_CONFIG_MS = 6 * 3_600_000
// cron-job.org corta a los 30 s. Bookings tarda ~11 s en responder; con 20 s
// de tope queda margen para escribir y responder aunque Microsoft vaya lento.
// La configuración (3 a 10 s medidos) se pide EN PARALELO con la
// disponibilidad, nunca antes: en serie las dos podían pasar de 30 s.
const TIMEOUT_DISPONIBILIDAD_MS = 20_000
const TIMEOUT_CONFIG_MS = 20_000

async function leerClave(clave: string): Promise<string | null> {
  const [fila] = await db.select().from(appSettings).where(eq(appSettings.key, clave)).limit(1)
  return fila?.value ?? null
}

export async function leerEstado(): Promise<EstadoAgenda | null> {
  const raw = await leerClave(CLAVE_ESTADO)
  if (!raw) return null
  try {
    const e = JSON.parse(raw) as EstadoAgenda
    return e && typeof e.libres === 'object' && e.config ? e : null
  } catch {
    return null
  }
}

export async function guardarEstado(estado: EstadoAgenda): Promise<void> {
  const value = JSON.stringify(estado)
  const ahora = new Date()
  await db
    .insert(appSettings)
    .values({ key: CLAVE_ESTADO, value, updatedAt: ahora })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: ahora } })
}

/** Configuración del servicio, o null si Bookings no respondió algo legible. */
export async function leerConfigBookings(): Promise<ConfigServicio | null> {
  try {
    const res = await fetch(URL_SERVICIOS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(TIMEOUT_CONFIG_MS),
    })
    if (!res.ok) return null
    return parseConfig(await res.json())
  } catch {
    return null
  }
}

/** Tramos de disponibilidad entre `ahora` y el final de la ventana de reserva. */
export async function consultarBookings(
  config: ConfigServicio,
  ahora: number
): Promise<{ tramos: Tramo[] } | { error: string }> {
  try {
    const res = await fetch(URL_DISPONIBILIDAD, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpoDisponibilidad(ahora, ahora + config.anticipacionMaxMin * 60_000),
      signal: AbortSignal.timeout(TIMEOUT_DISPONIBILIDAD_MS),
    })
    if (!res.ok) return { error: `Bookings HTTP ${res.status}` }
    const tramos = parseDisponibilidad(await res.json())
    return tramos ? { tramos } : { error: 'respuesta sin tramos' }
  } catch (e) {
    return { error: e instanceof Error ? e.name === 'TimeoutError' ? 'Bookings tardó más de 20 s' : e.message : 'error' }
  }
}

/**
 * Configuración para la PRÓXIMA consulta: la guardada si es reciente, si no la
 * de Bookings, y como último recurso la que ya había. La consulta en curso usa
 * la anterior, para poder pedir las dos cosas a la vez.
 */
export async function refrescarConfig(previo: EstadoAgenda | null, ahora: number): Promise<{ config: ConfigServicio; leidaEn?: number }> {
  if (previo?.configLeidaEn && ahora - previo.configLeidaEn < RELEER_CONFIG_MS) {
    return { config: previo.config, leidaEn: previo.configLeidaEn }
  }
  const leida = await leerConfigBookings()
  if (leida) return { config: leida, leidaEn: ahora }
  return { config: previo?.config ?? CONFIG_POR_DEFECTO, leidaEn: previo?.configLeidaEn }
}

/**
 * Escribe los cambios en la bitácora. Lanza si la BD falla: el llamador no debe
 * guardar el estado nuevo, para que la siguiente consulta vuelva a ver el mismo
 * cambio en vez de perderlo.
 */
export async function registrarCambios(abiertas: Apertura[], cerradas: Cierre[], ahora: number): Promise<void> {
  const en = new Date(ahora)
  if (abiertas.length > 0) {
    await db.insert(epAgendaEpisodios).values(
      abiertas.map((a) => ({ cita: new Date(a.cita), abiertaEn: en, como: a.como }))
    )
  }
  for (const c of cerradas) {
    await db
      .update(epAgendaEpisodios)
      .set({ cerradaEn: en, cierre: c.cierre })
      .where(and(eq(epAgendaEpisodios.cita, new Date(c.cita)), isNull(epAgendaEpisodios.cerradaEn)))
  }
}

/**
 * Push al dueño al instante y a los aprendices con retraso. El retraso lo
 * aplica ntfy en su servidor, así que todo sale en esta misma corrida. Nunca
 * lanza (sendPush ya es no-op si falta config).
 */
export async function avisarAperturas(abiertas: Apertura[]): Promise<void> {
  if (abiertas.length === 0) return
  const citas = abiertas.map((a) => a.cita).sort((x, y) => x - y)
  const titulo = citas.length === 1 ? 'Cita libre con el instructor' : `${citas.length} citas libres con el instructor`
  const lista = citas.map((c) => `- ${fmtCita(c)}`).join('\n')
  const opts = { tags: 'calendar', click: URL_RESERVA }

  await Promise.all([
    sendPush(titulo, `${lista}\n\nReserva en Bookings antes de que alguien la tome.`, { ...opts, priority: 5 }),
    // El mensaje se arma al enviarlo pero llega después: lo dice, para que
    // nadie crea que la cita sigue libre seguro.
    sendPush(titulo, `${lista}\n\nSe abrió hace ${RETRASO_PUBLICO_MIN} min; puede que ya no esté libre. Revisa en Bookings.`, {
      ...opts,
      priority: AVISO_APRENDICES.prioridad,
      topic: AVISO_APRENDICES.topic,
      delay: AVISO_APRENDICES.retraso,
    }),
  ])
}

export type AgendaPublica = {
  ok: true
  revisadoEn: number | null
  inicio: number | null
  /** El último intento falló: la tabla puede estar desactualizada. */
  conError: boolean
  libres: number[]
  semanas: Semana[]
  /** Las semanas de la ventana de reserva, cita por cita, para el calendario. */
  calendario: SemanaCalendario[]
  episodios: Episodio[]
  urlReserva: string
}

/** Tope de filas: aun en los seis meses de etapa son unos cientos; esto acota el peor caso de lectura. */
const MAX_EPISODIOS = 400

/** Lo que /ep publica: solo agregados y horas, nunca quién reservó (no se conoce). */
export async function leerAgendaPublica(ahora: number): Promise<AgendaPublica> {
  const estado = await leerEstado()
  const vacia: AgendaPublica = {
    ok: true, revisadoEn: null, inicio: null, conError: false, libres: [], semanas: [], calendario: [], episodios: [], urlReserva: URL_RESERVA,
  }
  if (!estado) return vacia

  const desde = new Date(estado.inicio - estado.config.anticipacionMaxMin * 60_000)
  const filas = await db
    .select()
    .from(epAgendaEpisodios)
    .where(gte(epAgendaEpisodios.cita, desde))
    .orderBy(desc(epAgendaEpisodios.abiertaEn))
    .limit(MAX_EPISODIOS)

  const todos: Episodio[] = filas.map((f) => ({
    cita: f.cita.getTime(),
    abiertaEn: f.abiertaEn.getTime(),
    como: f.como,
    cerradaEn: f.cerradaEn ? f.cerradaEn.getTime() : null,
    cierre: f.cierre ?? null,
  }))
  const { episodios, libres } = vistaPublica(todos, estado.libres, ahora)

  return {
    ...vacia,
    revisadoEn: estado.revisadoEn,
    inicio: estado.inicio,
    conError: Boolean(estado.error),
    libres,
    semanas: resumenSemanas(episodios, estado.config, estado.inicio, ahora),
    calendario: calendario(episodios, libres, estado.config, estado.inicio, ahora),
    episodios,
  }
}
