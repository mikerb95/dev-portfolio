// Reloj de la hackatón en hora de Bogotá (RF-045).
//
// Colombia está en UTC-5 todo el año (sin horario de verano), así que basta un
// desfase fijo y no hace falta Intl con zona horaria, que además se comporta
// distinto entre navegadores viejos. Puro: el "ahora" siempre entra por
// parámetro, para poder probarlo y para simular otra hora con ?hora=HH:MM.

import { DIA_EVENTO, HITOS, PRIORIDADES_CRITICAS, type Bloque } from '../../data/hackaton'
import type { Tarea } from './tablero'

const DESFASE_MS = -5 * 60 * 60 * 1000

export interface MomentoBogota {
  /** AAAA-MM-DD en Bogotá. */
  fecha: string
  /** Minutos desde la medianoche de Bogotá (con fracción). */
  minuto: number
  esDiaEvento: boolean
}

export function momentoBogota(ahora: Date): MomentoBogota {
  const local = new Date(ahora.getTime() + DESFASE_MS)
  const fecha = local.toISOString().slice(0, 10)
  const minuto = local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60
  return { fecha, minuto, esDiaEvento: fecha === DIA_EVENTO }
}

/** Instante UTC de una hora del día del evento en Bogotá. */
export function instanteEvento(minuto: number): Date {
  return new Date(Date.parse(`${DIA_EVENTO}T00:00:00-05:00`) + minuto * 60_000)
}

/** Convierte "HH:MM" en un instante del día del evento (para simular la hora). */
export function horaSimulada(texto: string | null): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto ?? '')
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh > 23 || mm > 59) return null
  return instanteEvento(hh * 60 + mm)
}

/** "8:30 a.m.", "12:30 p.m.", "5:00 p.m.". */
export function formatoHora(minuto: number): string {
  const total = Math.round(minuto)
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  const sufijo = hh < 12 ? 'a.m.' : 'p.m.'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${sufijo}`
}

/** Bloque en curso: el último que empezó y aún no termina. Los hitos puntuales no cuentan. */
export function bloqueEnCurso(bloques: Bloque[], minuto: number): number {
  let idx = -1
  bloques.forEach((b, i) => {
    if (b.fin > b.inicio && minuto >= b.inicio && minuto < b.fin) idx = i
  })
  return idx
}

/** "2 h 05 min", "12 min 30 s", o null si ya pasó. */
export function cuentaRegresiva(ahora: Date, objetivo: Date): string | null {
  const ms = objetivo.getTime() - ahora.getTime()
  if (ms <= 0) return null
  const s = Math.floor(ms / 1000)
  const dias = Math.floor(s / 86_400)
  const horas = Math.floor((s % 86_400) / 3600)
  const min = Math.floor((s % 3600) / 60)
  const seg = s % 60
  if (dias > 0) return `${dias} d ${horas} h`
  if (horas > 0) return `${horas} h ${String(min).padStart(2, '0')} min`
  return `${min} min ${String(seg).padStart(2, '0')} s`
}

/**
 * Tareas Requisito o Imprescindible sin hacer, cuando faltan menos de 90
 * minutos para el congelamiento (14:15) del día del evento. Después del
 * congelamiento el aviso sigue: lo que no se hizo sigue sin estar.
 */
export function prioritariasEnRiesgo(tareas: Tarea[], m: MomentoBogota): Tarea[] {
  if (!m.esDiaEvento) return []
  if (m.minuto < HITOS.congelamiento - HITOS.margenAvisoMin) return []
  return tareas.filter((t) => PRIORIDADES_CRITICAS.includes(t.prioridad) && t.estado !== 'hecha')
}
