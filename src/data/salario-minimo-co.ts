// Valores legales de nómina en Colombia, por año. Módulo de datos puro: lo
// importa src/lib/sena-remuneracion.ts, que corre en el navegador desde /ep,
// así que no puede importar nada con efectos.
//
// El auxilio de conectividad digital (Ley 2088 de 2021, art. 10) vale lo mismo
// que el de transporte y tiene sus mismos efectos salariales, por eso no lleva
// columna propia: cambia el nombre, no el monto.
//
// TODO(2027): agregar SMMLV y auxilio de 2027 cuando salgan los decretos de
// diciembre de 2026. Mientras falten, `valoresDelAnio` reutiliza 2026 y marca
// el tramo como provisional, que es lo que ve el aprendiz en el desglose.

export interface ValoresAnio {
  /** Salario mínimo mensual legal vigente, en pesos. */
  smmlv: number
  /** Auxilio de transporte (o de conectividad digital), mensual, en pesos. */
  auxilio: number
  /** Norma que fija cada valor, para citarla en el desglose. */
  fuenteSmmlv: string
  fuenteAuxilio: string
}

export const VALORES_POR_ANIO: Record<number, ValoresAnio> = {
  2025: {
    smmlv: 1_423_500,
    auxilio: 200_000,
    fuenteSmmlv: 'Decreto 1572 de 2024',
    fuenteAuxilio: 'Decreto 1573 de 2024',
  },
  2026: {
    smmlv: 1_750_905,
    auxilio: 249_095,
    fuenteSmmlv: 'Decreto 1469 de 2025',
    fuenteAuxilio: 'Decreto 1470 de 2025',
  },
}

/** Aportes a seguridad social a cargo del trabajador, sobre el apoyo de sostenimiento. */
export const APORTE_SALUD = 0.04
export const APORTE_PENSION = 0.04

/** Intereses anuales sobre las cesantías (Ley 52 de 1975). */
export const TASA_INTERESES_CESANTIAS = 0.12
