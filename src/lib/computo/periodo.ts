// Aritmética de periodos de facturación. Módulo puro.
//
// Todo se calcula en UTC y no en hora de Colombia, aunque el cliente sea
// colombiano: las horas de `compute_usage_hourly` se guardan en UTC porque las
// funciones corren en varias regiones, y mezclar zonas al cerrar el mes movería
// cinco horas de consumo de una factura a otra. La conversión a hora local se
// hace solo al PINTAR, nunca al sumar.

/** Clave de periodo: mes ISO, `YYYY-MM`. */
export type ClavePeriodo = string

const CLAVE_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export const esClaveValida = (clave: string): boolean => CLAVE_RE.test(clave)

/** Periodo al que pertenece un instante. */
export function clavePeriodo(fecha: Date | number): ClavePeriodo {
  return new Date(fecha).toISOString().slice(0, 7)
}

/** Primer día del periodo, en ISO `YYYY-MM-DD`. Es lo que consulta `tarifasVigentes`. */
export const inicioISO = (clave: ClavePeriodo): string => `${clave}-01`

/** Rango semiabierto [desde, hasta) del periodo, en epoch ms. */
export function rangoPeriodo(clave: ClavePeriodo): { desde: number; hasta: number } {
  const [anio, mes] = clave.split('-').map(Number)
  return {
    desde: Date.UTC(anio, mes - 1, 1),
    // Mes 12 desborda a enero del año siguiente, que es justo lo que hace
    // Date.UTC con un índice de mes fuera de rango. No hay caso especial.
    hasta: Date.UTC(anio, mes, 1),
  }
}

/** Periodo anterior. `2026-01` devuelve `2025-12`. */
export function periodoAnterior(clave: ClavePeriodo): ClavePeriodo {
  const { desde } = rangoPeriodo(clave)
  return clavePeriodo(desde - 1)
}

/**
 * ¿El periodo ya terminó? Un periodo en curso no se puede cerrar: le faltan
 * horas por llegar, y la telemetría de la última hora puede tardar en subir.
 */
export function periodoCerrable(clave: ClavePeriodo, ahora: number): boolean {
  return rangoPeriodo(clave).hasta <= ahora
}

/** Los `n` periodos hasta el actual, del más viejo al más nuevo. */
export function ultimosPeriodos(ahora: number, n: number): ClavePeriodo[] {
  const claves: ClavePeriodo[] = []
  let clave = clavePeriodo(ahora)
  for (let i = 0; i < n; i++) {
    claves.unshift(clave)
    clave = periodoAnterior(clave)
  }
  return claves
}
