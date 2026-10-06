// Encaje con tu vida: qué significa una propuesta para Mike, no para el cliente.
//
// Dos preguntas: cuántos meses de gastos cubre lo que entra (con lo que
// queda después de retenciones estimadas) y en qué semanas choca con el
// trabajo que ya está comprometido. La segunda sale de las otras propuestas
// aceptadas: sus hitos fechados dicen cuántas horas por semana ya están
// tomadas.
//
// Módulo PURO e isomorfo: el servidor junta los datos y el navegador recalcula
// al mover la fecha de inicio.

import { aISO, desdeISO } from './fechas'

export type Trabajo = {
  /** Nombre para mostrar ("Tienda de Toledo"). */
  nombre: string
  inicio: string
  fin: string
  horas: number
}

export type SemanaCarga = {
  /** Lunes de la semana, 'YYYY-MM-DD'. */
  lunes: string
  /** Horas ya comprometidas por otros trabajos. */
  ocupadas: number
  /** Horas que pondría esta propuesta. */
  nueva: number
  capacidad: number
  /** Nombres de los trabajos que caen esa semana. */
  trabajos: string[]
}

export type Encaje = {
  /** Gasto mensual promedio de los últimos meses (null si no hay datos). */
  gastoMensual: number | null
  /** Meses de gasto que cubre el ingreso neto estimado de la propuesta. */
  mesesCubiertos: number | null
  semanas: SemanaCarga[]
  /** Semanas en que se pasa de la capacidad. */
  choques: number
  /** Primera fecha de inicio (lunes) en que la propuesta cabe sin pasar de la capacidad, si la actual choca. */
  inicioSugerido: string | null
}

function lunesDe(iso: string): string {
  const d = desdeISO(iso)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return aISO(d)
}

function sumarSemanas(iso: string, n: number): string {
  const d = desdeISO(iso)
  d.setDate(d.getDate() + n * 7)
  return aISO(d)
}

/** Reparte las horas de un trabajo por igual entre sus semanas. */
export function horasPorSemana(t: Trabajo): Map<string, number> {
  const out = new Map<string, number>()
  const desde = lunesDe(t.inicio)
  const hasta = lunesDe(t.fin < t.inicio ? t.inicio : t.fin)
  const semanas: string[] = []
  for (let s = desde, i = 0; s <= hasta && i < 260; s = sumarSemanas(s, 1), i++) semanas.push(s)
  const porSemana = t.horas / Math.max(semanas.length, 1)
  for (const s of semanas) out.set(s, porSemana)
  return out
}

function cargas(otros: Trabajo[], nueva: Trabajo, capacidad: number): SemanaCarga[] {
  const mapaNueva = horasPorSemana(nueva)
  const semanas = [...mapaNueva.keys()]
  return semanas.map((lunes) => {
    let ocupadas = 0
    const nombres: string[] = []
    for (const t of otros) {
      const h = horasPorSemana(t).get(lunes)
      if (h) {
        ocupadas += h
        nombres.push(t.nombre)
      }
    }
    const r = (x: number) => Math.round(x * 10) / 10
    return { lunes, ocupadas: r(ocupadas), nueva: r(mapaNueva.get(lunes) ?? 0), capacidad, trabajos: nombres }
  })
}

export type DatosEncaje = {
  /** Lo que neto le entra a Mike por la propuesta. */
  ingresoNeto: number
  gastoMensual: number | null
  otros: Trabajo[]
  nueva: Trabajo
  capacidad: number
}

export function calcularEncaje(d: DatosEncaje): Encaje {
  const semanas = cargas(d.otros, d.nueva, d.capacidad)
  const choques = semanas.filter((s) => s.ocupadas + s.nueva > s.capacidad + 0.001).length
  let inicioSugerido: string | null = null
  if (choques > 0) {
    // Busca el primer lunes, en las próximas 26 semanas, en que la misma
    // propuesta corrida no choca con nada.
    const duracion = desdeISO(d.nueva.fin).getTime() - desdeISO(d.nueva.inicio).getTime()
    for (let k = 1; k <= 26; k++) {
      const inicio = sumarSemanas(lunesDe(d.nueva.inicio), k)
      const finD = new Date(desdeISO(inicio).getTime() + duracion)
      const corrida = { ...d.nueva, inicio, fin: aISO(finD) }
      if (cargas(d.otros, corrida, d.capacidad).every((s) => s.ocupadas + s.nueva <= s.capacidad + 0.001)) {
        inicioSugerido = inicio
        break
      }
    }
  }
  const meses = d.gastoMensual && d.gastoMensual > 0 ? Math.round((d.ingresoNeto / d.gastoMensual) * 10) / 10 : null
  return { gastoMensual: d.gastoMensual, mesesCubiertos: meses, semanas, choques, inicioSugerido }
}

/** Promedio de gasto de los meses con datos (ignora los meses en cero). */
export function gastoPromedio(porMes: readonly number[]): number | null {
  const con = porMes.filter((x) => x > 0)
  if (!con.length) return null
  return Math.round(con.reduce((a, b) => a + b, 0) / con.length)
}
