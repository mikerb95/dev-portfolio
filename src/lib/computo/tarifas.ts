// Tarifas de Vercel vigentes por fecha. Módulo puro.
//
// Por qué versionadas y en BD en vez de constantes en el código: recalcular un
// periodo cerrado tiene que dar siempre el mismo número. Si las tarifas fueran
// constantes, el día que Vercel cambie un precio, todas las facturas pasadas
// que se vuelvan a abrir en el panel mostrarían una cifra distinta a la que se
// le cobró al cliente, y no habría forma de saber cuál era la buena.

import type { TarifasComputo } from './calculo'

/**
 * Tarifas de arranque, con las que se siembra `compute_rates`.
 *
 * IMPORTANTE: son un punto de partida, no una fuente de verdad. Los precios de
 * Vercel cambian y dependen de la región. Antes de emitir la primera factura
 * hay que contrastarlas contra https://vercel.com/docs/pricing y corregir la
 * fila vigente desde el panel. El campo `fuente` de cada fila existe para
 * anotar de dónde salió el número y cuándo se verificó.
 */
export const TARIFAS_INICIALES: TarifasComputo = {
  cpuActivaHora: 0.128,
  memoriaGbHora: 0.0106,
  invocacionesMillon: 0.6,
  transferenciaGb: 0.15,
  transferenciaOrigenGb: 0.06,
  edgeRequestsMillon: 2,
}

/** Fila de tarifas tal como sale de `compute_rates`. */
export interface FilaTarifas extends TarifasComputo {
  /** Fecha desde la que rige, en ISO YYYY-MM-DD. */
  vigenteDesde: string
  fuente?: string | null
}

/**
 * Tarifas que regían en una fecha dada.
 *
 * Elige la vigencia más reciente que no sea posterior a la fecha. Si no hay
 * ninguna anterior (el periodo es más viejo que la primera fila cargada) cae a
 * las iniciales en vez de devolver null: un cálculo con tarifas aproximadas es
 * corregible, una página en blanco a mitad de un cierre de mes no.
 */
export function tarifasVigentes(filas: FilaTarifas[], fechaISO: string): TarifasComputo {
  const aplicables = filas
    .filter((f) => f.vigenteDesde <= fechaISO)
    .sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1))
  return aplicables[0] ?? TARIFAS_INICIALES
}

/** Etiquetas de las dimensiones para el panel y para el desglose al cliente. */
export const ETIQUETAS_DIMENSION = {
  cpuActiva: 'CPU activa',
  memoria: 'Memoria aprovisionada',
  invocaciones: 'Invocaciones',
  transferencia: 'Transferencia al visitante',
  transferenciaOrigen: 'Transferencia función-edge',
  edgeRequests: 'Peticiones al edge',
} as const
