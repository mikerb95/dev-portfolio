// Reglas de envío de los correos promocionales. Módulo puro (sin BD ni
// node:crypto): lo usan el cron, el panel y sus tests.
//
// Dos leyes colombianas mandan aquí y ninguna es opcional:
//  · Ley 1581 de 2012 (habeas data): solo se escribe a quien autorizó, y cada
//    correo trae cómo dejar de recibirlos. Eso lo resuelven la tabla de
//    suscriptores y el enlace de baja, no este archivo.
//  · Ley 2300 de 2023 ("dejen de fregar"): contacto comercial solo de lunes a
//    viernes de 7:00 a 19:00 y sábados de 8:00 a 15:00, nunca domingos ni
//    festivos, y como mucho una vez por semana por persona. Eso es lo que
//    calcula este módulo. La hora es la de Colombia aunque la función corra
//    en UTC.

import { esFestivo } from '../festivos-co'
import { TZ_COLOMBIA } from '../fecha-co'

/** Días mínimos entre dos promociones a la misma persona. */
export const DIAS_ENTRE_ENVIOS = 7

/**
 * Tope diario por defecto. El plan gratis de Resend da unos 100 correos al
 * día y ese cupo lo comparten el portal (invitaciones, facturas, contraseñas)
 * y las alertas: una campaña no puede comérselo entero y dejar a un cliente
 * sin su enlace de restablecer contraseña.
 */
export const CUPO_DIARIO_DEFECTO = 50

/** Cuántos destinatarios van por llamada a Resend (su batch admite 100). */
export const TAMANO_LOTE = 25

type PartesCO = { anio: number; mes: number; dia: number; diaSemana: number; minutos: number }

const fmtPartes = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ_COLOMBIA,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  weekday: 'short',
  hourCycle: 'h23',
})

const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function partesCO(d: Date): PartesCO {
  const p = Object.fromEntries(fmtPartes.formatToParts(d).map((x) => [x.type, x.value]))
  return {
    anio: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    diaSemana: DIAS[p.weekday as string] ?? 0,
    minutos: Number(p.hour) * 60 + Number(p.minute),
  }
}

export type Ventana = { abierta: true } | { abierta: false; motivo: string }

/**
 * ¿Se puede enviar publicidad en este instante? Franja de la Ley 2300:
 * L-V 7:00-19:00, sábado 8:00-15:00, cerrado domingos y festivos.
 */
export function ventanaLegal(ahora: Date): Ventana {
  const p = partesCO(ahora)
  // esFestivo compara por fecha local: se le pasa la fecha de Colombia
  // construida a mano, no el instante UTC (que a las 20:00 ya es "mañana").
  const festivo = esFestivo(new Date(p.anio, p.mes - 1, p.dia))
  if (festivo) return { abierta: false, motivo: `Festivo (${festivo})` }
  if (p.diaSemana === 0) return { abierta: false, motivo: 'Domingo' }
  const [desde, hasta] = p.diaSemana === 6 ? [8 * 60, 15 * 60] : [7 * 60, 19 * 60]
  if (p.minutos < desde) return { abierta: false, motivo: 'Antes del horario permitido' }
  if (p.minutos >= hasta) return { abierta: false, motivo: 'Después del horario permitido' }
  return { abierta: true }
}

/**
 * Próximo instante en que abre la franja (o `ahora` si ya está abierta).
 * Avanza de a 15 minutos: la franja siempre abre en hora en punto, y diez
 * días cubren el peor caso (puente festivo largo más domingo).
 */
export function proximaApertura(ahora: Date): Date {
  if (ventanaLegal(ahora).abierta) return ahora
  const paso = 15 * 60_000
  let t = Math.ceil(ahora.getTime() / paso) * paso
  const limite = ahora.getTime() + 10 * 86_400_000
  while (t < limite) {
    if (ventanaLegal(new Date(t)).abierta) return new Date(t)
    t += paso
  }
  return new Date(limite)
}

/** ¿Ya pasó la semana desde la última promoción a esta persona? */
export function puedeRecibir(ultimoEnvio: Date | null, ahora: Date): boolean {
  if (!ultimoEnvio) return true
  return ahora.getTime() - ultimoEnvio.getTime() >= DIAS_ENTRE_ENVIOS * 86_400_000
}

/** Cuántos caben hoy: el tope menos lo ya enviado, nunca negativo. */
export function cupoRestante(enviadosHoy: number, tope: number): number {
  return Math.max(0, Math.floor(tope) - enviadosHoy)
}

/** Inicio del día de hoy en Colombia, como instante (para contar el cupo). */
export function inicioDiaCO(ahora: Date): Date {
  const p = partesCO(ahora)
  // Colombia no tiene horario de verano: el día empieza a las 05:00 UTC.
  return new Date(Date.UTC(p.anio, p.mes - 1, p.dia, 5, 0, 0))
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Correo normalizado (minúsculas, sin espacios) o null si no es válido. */
export function normalizarEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const e = v.trim().toLowerCase()
  if (e.length > 200 || !EMAIL_RE.test(e)) return null
  return e
}
