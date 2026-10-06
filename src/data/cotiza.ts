// Tarifas y cupos de Cotiza (docs/plan-cotiza.md). Fuente única: la vista, el
// motor de la Fase 1 y la IA de la Fase 3 leen de aquí, nunca de cifras
// escritas en un `.astro` ni en un prompt.
//
// Módulo puro: lo importan el servidor y el navegador.

export type NivelConsultoria = 'documental' | 'operativa' | 'analitica' | 'estrategica'

export type Nivel = { id: NivelConsultoria; nombre: string; horaCop: number; ejemplos: string }

/**
 * Hora en pesos por nivel. Mike dio el rango (6 oct 2026): $60.000 a $80.000
 * según la complejidad, y $50.000 para presentaciones y revisión de
 * documentos. El reparto 60/70/80 entre los tres niveles altos está pendiente
 * de que lo confirme.
 */
export const NIVELES: Nivel[] = [
  { id: 'documental', nombre: 'Documental', horaCop: 50_000, ejemplos: 'Presentaciones, revisión de documentos' },
  { id: 'operativa', nombre: 'Operativa', horaCop: 60_000, ejemplos: 'Procedimientos, apoyo puntual en compras o proveedores' },
  { id: 'analitica', nombre: 'Analítica', horaCop: 70_000, ejemplos: 'Costeo de importaciones, análisis de fletes, indicadores' },
  {
    id: 'estrategica',
    nombre: 'Estratégica',
    horaCop: 80_000,
    ejemplos: 'Optimización de procesos, cadena de suministro, reducción de costos de envío',
  },
]

/** En dólares hay una sola tarifa para cualquier asesoría. No es una conversión de los pesos. */
export const HORA_USD = 35

export type Cupos = {
  reuniones: number
  minutosPorReunion: number
  rondasDeCambios: number
  horario: { desde: string; hasta: string; dias: string }
  respuestaDiasHabiles: number
  recargoUrgencia: number
  diasParaCorregirResumen: number
}

/** Cupos incluidos por defecto en cada encargo (aprobados por Mike el 6 oct 2026). */
export const CUPOS_POR_DEFECTO: Cupos = {
  reuniones: 2,
  minutosPorReunion: 45,
  rondasDeCambios: 2,
  horario: { desde: '08:00', hasta: '18:00', dias: 'lunes a viernes' },
  respuestaDiasHabiles: 1,
  recargoUrgencia: 0.5,
  diasParaCorregirResumen: 1,
}

export type MontoCotiza = { COP: number; USD: number }

export type ReglasCotiza = {
  /** Colchón de coordinación sobre las horas de la propuesta (0.15 = 15 %). */
  colchon: number
  /** Redondeo hacia arriba del precio de la propuesta (regla general de tarifas). */
  redondeo: MontoCotiza
  /**
   * Redondeo de los adicionales. Más fino que el de la propuesta: subir media
   * hora de reunión de $25.000 a $50.000 sería cobrar el doble por redondear.
   * Propuesta, pendiente de que Mike la confirme.
   */
  redondeoAdicional: MontoCotiza
  /** Precio mínimo de un encargo. Pendiente de Mike: 0 = sin mínimo. */
  minimo: MontoCotiza
  /** Las reuniones de más se cobran en bloques de estos minutos (propuesta, pendiente). */
  bloqueReunionMin: number
  /** Minutos de gracia antes de que una reunión incluida cuente como larga. */
  graciaReunionMin: number
  validezDias: number
}

export const REGLAS_COTIZA: ReglasCotiza = {
  colchon: 0.15,
  redondeo: { COP: 50_000, USD: 50 },
  redondeoAdicional: { COP: 5_000, USD: 5 },
  minimo: { COP: 0, USD: 0 },
  bloqueReunionMin: 30,
  graciaReunionMin: 5,
  validezDias: 15,
}

/**
 * Horas por entregable con regla fija (docs/plan-cotiza.md). Mike: una
 * presentación le toma 1 o 2 horas según diapositivas, anexos y documentos de
 * base. La regla de la revisión de documentos es propuesta, pendiente.
 */
export const HORAS_ENTREGABLE = {
  presentacion: {
    basica: { horas: 1, maxDiapositivas: 10, maxDocumentosFuente: 3 },
    completa: { horas: 2 },
    /** Por encima de este número de diapositivas, una hora más por cada bloque. */
    grandeDesde: 20,
    bloqueDiapositivas: 10,
  },
  revision: { documentosPorHora: 3, paginasPorDocumento: 20 },
} as const
