// Festivos de Colombia y días inhábiles. Módulo PURO e isomorfo: lo usa el
// script de /ep en el navegador para avisar cuando un hito de la etapa
// productiva cae en un día en el que no hay a quién entregarle nada, así que
// no puede importar `node:crypto` ni `../db`.
//
// Tres familias de festivos, y las tres se calculan, no se listan: una tabla
// escrita a mano caduca cada 31 de diciembre.

/** Festivos de fecha fija (mes 1-12, día). */
const FIJOS: [mes: number, dia: number, nombre: string][] = [
  [1, 1, 'Año Nuevo'],
  [5, 1, 'Día del Trabajo'],
  [7, 20, 'Grito de Independencia'],
  [8, 7, 'Batalla de Boyacá'],
  [12, 8, 'Inmaculada Concepción'],
  [12, 25, 'Navidad'],
]

/** Festivos que la Ley 51 de 1983 ("Ley Emiliani") corre al lunes siguiente. */
const EMILIANI: [mes: number, dia: number, nombre: string][] = [
  [1, 6, 'Reyes Magos'],
  [3, 19, 'San José'],
  [6, 29, 'San Pedro y San Pablo'],
  [8, 15, 'Asunción de la Virgen'],
  [10, 12, 'Día de la Raza'],
  [11, 1, 'Todos los Santos'],
  [11, 11, 'Independencia de Cartagena'],
]

/**
 * Festivos móviles, como desplazamiento en días desde el Domingo de Pascua.
 * Los tres positivos ya vienen con el corrimiento de la Ley Emiliani
 * incorporado (por eso +43 y no +39): caen siempre en lunes.
 */
const DESDE_PASCUA: [offset: number, nombre: string][] = [
  [-3, 'Jueves Santo'],
  [-2, 'Viernes Santo'],
  [43, 'Ascensión del Señor'],
  [64, 'Corpus Christi'],
  [71, 'Sagrado Corazón'],
]

const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Clave local `YYYY-MM-DD`. No usa toISOString: eso convierte a UTC y en
 *  Colombia (UTC-5) devolvería el día anterior. */
export const claveFecha = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Domingo de Pascua por el algoritmo gregoriano anónimo (Meeus/Jones/Butcher). */
export function domingoDePascua(anio: number): Date {
  const a = anio % 19
  const b = Math.floor(anio / 100)
  const c = anio % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(anio, mes - 1, dia)
}

/** Corre la fecha al lunes siguiente si no cae ya en lunes. */
function alLunesSiguiente(d: Date): Date {
  const dow = d.getDay()
  return dow === 1 ? d : addDays(d, (8 - dow) % 7)
}

const cache = new Map<number, Map<string, string>>()

/** Festivos de un año como mapa `YYYY-MM-DD` → nombre. */
export function festivosDe(anio: number): Map<string, string> {
  const enCache = cache.get(anio)
  if (enCache) return enCache

  const mapa = new Map<string, string>()
  for (const [mes, dia, nombre] of FIJOS) mapa.set(claveFecha(new Date(anio, mes - 1, dia)), nombre)
  for (const [mes, dia, nombre] of EMILIANI) {
    mapa.set(claveFecha(alLunesSiguiente(new Date(anio, mes - 1, dia))), nombre)
  }
  const pascua = domingoDePascua(anio)
  for (const [offset, nombre] of DESDE_PASCUA) mapa.set(claveFecha(addDays(pascua, offset)), nombre)

  cache.set(anio, mapa)
  return mapa
}

/** Nombre del festivo si esa fecha lo es, `null` si no. */
export function esFestivo(d: Date): string | null {
  return festivosDe(d.getFullYear()).get(claveFecha(d)) ?? null
}

export interface Inhabil {
  /** 'festivo' | 'domingo' | 'sabado' */
  tipo: 'festivo' | 'domingo' | 'sabado'
  motivo: string
}

/**
 * Por qué no se puede entregar ese día, o `null` si es hábil. El sábado cuenta
 * como inhábil: el centro de formación no recibe evidencias en fin de semana,
 * que es justamente lo que el aviso quiere evitar.
 */
export function diaInhabil(d: Date): Inhabil | null {
  const festivo = esFestivo(d)
  if (festivo) return { tipo: 'festivo', motivo: `Festivo: ${festivo}` }
  const dow = d.getDay()
  if (dow === 0) return { tipo: 'domingo', motivo: 'Cae domingo' }
  if (dow === 6) return { tipo: 'sabado', motivo: 'Cae sábado' }
  return null
}

/** Último día hábil en o antes de `d`. Retrocede como máximo 10 días. */
export function habilAnterior(d: Date): Date {
  let cursor = new Date(d)
  for (let i = 0; i < 10 && diaInhabil(cursor); i++) cursor = addDays(cursor, -1)
  return cursor
}
