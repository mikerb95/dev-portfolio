// Calendario de Plano: días hábiles, quincenas y ciclos de pago de empresas.
//
// Todas las fechas viajan como texto 'YYYY-MM-DD' y se operan como fechas
// LOCALES a mediodía. festivos-co.ts lee con getters locales, así que una fecha
// construida y leída en local da el mismo día en el navegador de Bogotá y en
// la función de Vercel (UTC). Mediodía y no medianoche: ningún desfase de zona
// horaria alcanza a cambiar el día.
//
// Módulo PURO e isomorfo.

import { diaInhabil, habilAnterior } from '../festivos-co'

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export function esFechaISO(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = ISO.exec(v)
  if (!m) return false
  const d = desdeISO(v)
  return aISO(d) === v
}

export function desdeISO(iso: string): Date {
  const m = ISO.exec(iso)
  if (!m) throw new Error(`fecha inválida: ${iso}`)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
}

export function aISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function sumarDias(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Primer día hábil en o después de la fecha. */
export function habilEnODespues(iso: string): string {
  let d = desdeISO(iso)
  for (let i = 0; i < 15 && diaInhabil(d); i++) d = sumarDias(d, 1)
  return aISO(d)
}

/** Suma `n` días hábiles (sin sábados, domingos ni festivos). n = 0 devuelve el hábil en o después. */
export function sumarHabiles(iso: string, n: number): string {
  let d = desdeISO(habilEnODespues(iso))
  let faltan = Math.max(0, Math.ceil(n))
  while (faltan > 0) {
    d = sumarDias(d, 1)
    if (!diaInhabil(d)) faltan--
  }
  return aISO(d)
}

/** Días hábiles entre dos fechas (sin contar la primera). */
export function habilesEntre(desde: string, hasta: string): number {
  let d = desdeISO(desde)
  const fin = desdeISO(hasta)
  let n = 0
  for (let i = 0; i < 3660 && d < fin; i++) {
    d = sumarDias(d, 1)
    if (!diaInhabil(d)) n++
  }
  return n
}

function ultimoDiaDelMes(anio: number, mes0: number): number {
  return new Date(anio, mes0 + 1, 0, 12).getDate()
}

/**
 * La quincena en o después de la fecha: el 15 o el último día del mes, corridos
 * al hábil ANTERIOR (así es como pagan las empresas a sus empleados: si el 15
 * cae domingo, la plata llega el viernes 13). Si ese hábil anterior queda antes
 * de la fecha pedida, se pasa a la quincena siguiente.
 */
export function quincenaEnODespues(iso: string): string {
  const d = desdeISO(iso)
  let anio = d.getFullYear()
  let mes = d.getMonth()
  for (let i = 0; i < 6; i++) {
    for (const dia of [15, ultimoDiaDelMes(anio, mes)]) {
      const pago = habilAnterior(new Date(anio, mes, dia, 12))
      if (aISO(pago) >= iso) return aISO(pago)
    }
    mes++
    if (mes > 11) {
      mes = 0
      anio++
    }
  }
  return iso
}

export type CicloEmpresa = {
  /** Día del mes hasta el que la empresa recibe cuentas para el ciclo (1-28). */
  corteDia: number
  /** Días calendario que tarda en pagar después del corte. */
  diasPago: number
}

export type PagoEmpresa = { radicarAntesDe: string; pagoEstimado: string }

/**
 * Con una cuenta lista en `listaEl`, cuándo hay que radicarla y cuándo paga la
 * empresa: el corte del mes si todavía no pasó, el del mes siguiente si sí.
 */
export function cicloEmpresa(listaEl: string, ciclo: CicloEmpresa): PagoEmpresa {
  const d = desdeISO(listaEl)
  const dia = Math.min(Math.max(1, Math.round(ciclo.corteDia)), 28)
  let corte = new Date(d.getFullYear(), d.getMonth(), dia, 12)
  if (corte < d) corte = new Date(d.getFullYear(), d.getMonth() + 1, dia, 12)
  const radicar = habilAnterior(corte)
  const pago = habilEnODespues(aISO(sumarDias(corte, Math.max(0, Math.round(ciclo.diasPago)))))
  return { radicarAntesDe: aISO(radicar), pagoEstimado: pago }
}

/** Suma meses calendario conservando el día (o el último del mes si no existe). */
export function sumarMeses(iso: string, n: number): string {
  const d = desdeISO(iso)
  const objetivo = new Date(d.getFullYear(), d.getMonth() + n, 1, 12)
  const dia = Math.min(d.getDate(), ultimoDiaDelMes(objetivo.getFullYear(), objetivo.getMonth()))
  return aISO(new Date(objetivo.getFullYear(), objetivo.getMonth(), dia, 12))
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** "jueves 15 de octubre de 2026". */
export function fechaLarga(iso: string): string {
  const d = desdeISO(iso)
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

/** "15 oct 2026". */
export function fechaCorta(iso: string): string {
  const d = desdeISO(iso)
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
}
