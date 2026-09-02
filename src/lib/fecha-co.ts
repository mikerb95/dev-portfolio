// Fechas en zona de Colombia. Módulo PURO y sin dependencias.
//
// Existe porque en Vercel el proceso corre en UTC, y `Intl` sin `timeZone` usa
// la zona del servidor. Formatear así adelanta un día todo lo que ocurra
// después de las 19:00 hora de Colombia (UTC-5), que es exactamente cuando se
// emiten las cuentas de cobro y se marcan las facturas.
//
// La trampa es que hay DOS clases de fecha y los errores son OPUESTOS, así que
// arreglar una sola produce la otra:
//
//  · INSTANTES (emisión, pago, creación): un momento real en la línea de
//    tiempo. Se guardan como instante y se FORMATEAN en América/Bogotá.
//  · FECHAS DE CALENDARIO (vencimiento, periodo de un servicio, fecha de un
//    hito): vienen de un <input type="date"> como 'YYYY-MM-DD' y no son un
//    instante, son un día del calendario que alguien eligió. `new Date()` las
//    interpreta como medianoche UTC, que en Bogotá es el día ANTERIOR. Por eso
//    se ANCLAN a medianoche colombiana al entrar, y solo entonces formatearlas
//    en Bogotá devuelve el día correcto.
//
// Estrategia alternativa, válida y usada en el sitio público (ver
// src/pages/notes/index.astro): dejar la fecha de calendario en UTC y
// formatearla también en UTC. Sirve cuando el dato nace de un fichero y nunca
// se compara con un instante. Aquí no vale, porque `dueAt` se compara con
// `now` para marcar vencimientos.

export const TZ_COLOMBIA = 'America/Bogota'

// Colombia no aplica horario de verano desde 1993, así que el desfase es fijo
// y se puede escribir literal sin que caduque.
const OFFSET_COLOMBIA = '-05:00'

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Convierte lo que llega de un formulario en un instante.
 *
 * 'YYYY-MM-DD' se ancla a medianoche EN COLOMBIA, no en UTC. Cualquier otra
 * cosa se parsea tal cual (ya trae zona). Una fecha inválida devuelve null y
 * nunca un `Invalid Date`, que se propagaría en silencio hasta la base de datos
 * y reventaría al leerlo, lejos de aquí.
 */
export function parseFechaCalendario(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const raw = v.trim()

  if (!SOLO_FECHA.test(raw)) {
    const instante = new Date(raw)
    return Number.isNaN(instante.getTime()) ? null : instante
  }

  const d = new Date(`${raw}T00:00:00${OFFSET_COLOMBIA}`)
  if (Number.isNaN(d.getTime())) return null

  // Un día inexistente NO lanza: JS lo desborda en silencio y '2026-02-30' se
  // convierte en el 2 de marzo. Guardar una fecha que nadie escribió es peor
  // que rechazarla, así que se comprueba que sobreviva el viaje de ida y vuelta.
  return fechaISOEnColombia(d) === raw ? d : null
}

const fmtISO = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: TZ_COLOMBIA,
})

/** El día del calendario colombiano al que pertenece un instante ('YYYY-MM-DD'). */
export const fechaISOEnColombia = (d: Date): string => fmtISO.format(d)

/** Crea un formateador ya fijado a la zona de Colombia. */
export const formatterCO = (opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('es-CO', { ...opts, timeZone: TZ_COLOMBIA })

const fmtLarga = formatterCO({ day: '2-digit', month: 'long', year: 'numeric' })
const fmtCorta = formatterCO({ day: '2-digit', month: 'short', year: 'numeric' })

/** '01 de septiembre de 2026'. Para el cuerpo de un documento. */
export const formatFechaLarga = (d: Date | null | undefined): string => (d ? fmtLarga.format(d) : '')

/** '01 sept 2026'. Para listados y tablas. */
export const formatFechaCorta = (d: Date | null | undefined): string => (d ? fmtCorta.format(d) : '-')
