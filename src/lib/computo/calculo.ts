// Cálculo del costo de cómputo de Vercel y del precio a cobrar al cliente.
//
// Módulo PURO e isomorfo: sin BD, sin node:crypto, sin fetch. Lo importan tres
// sitios que no pueden discrepar entre sí:
//   1. el cron que cierra el periodo y escribe la cifra que se factura,
//   2. la tabla del panel que muestra el consumo en curso,
//   3. el simulador del navegador con el que se cotiza a un cliente nuevo.
// Si el simulador tuviera su propia aritmética, cotizaríamos con un número y
// cobraríamos con otro, y la diferencia solo se vería al reclamar una factura.
//
// Todas las cantidades de entrada son ENTEROS acumulados en unidades pequeñas
// (ms, bytes, conteos) y no fracciones ya convertidas a horas o gigabytes: los
// lotes de telemetría se suman miles de veces antes de llegar aquí, y sumar
// flotantes pequeños arrastra error. La conversión a la unidad de facturación
// se hace una sola vez, al final.

/** Dimensiones que factura Vercel y que sabemos medir por proyecto. */
export const DIMENSIONES = [
  'cpuActiva',
  'memoria',
  'invocaciones',
  'transferencia',
  'transferenciaOrigen',
  'edgeRequests',
] as const

export type Dimension = (typeof DIMENSIONES)[number]

/**
 * Consumo acumulado de un proyecto en un periodo.
 *
 * `gbMs` es memoria aprovisionada por duración (GB * ms) y no se puede derivar
 * de `cpuMs`: Vercel cobra la memoria por tiempo de PARED y la CPU por tiempo
 * ACTIVO. Una función que espera 900 ms a una base de datos consume memoria
 * esos 900 ms y casi nada de CPU, y esa es justamente la forma de la mayoría
 * de los handlers de un sitio de cliente.
 */
export interface UsoComputo {
  /** CPU activa acumulada, en milisegundos. */
  cpuMs: number
  /** Memoria aprovisionada por duración, en GB-milisegundo. */
  gbMs: number
  /** Invocaciones de función. */
  invocaciones: number
  /** Fast Data Transfer: bytes que salen de la red de Vercel al visitante. */
  transferenciaBytes: number
  /** Fast Origin Transfer: bytes entre la función y el edge. */
  transferenciaOrigenBytes: number
  /** Peticiones atendidas por el edge, incluidas las que no llegan a función. */
  edgeRequests: number
}

/** Uso en cero. Punto de partida para acumular. */
export const usoVacio = (): UsoComputo => ({
  cpuMs: 0,
  gbMs: 0,
  invocaciones: 0,
  transferenciaBytes: 0,
  transferenciaOrigenBytes: 0,
  edgeRequests: 0,
})

/** Suma consumos. Devuelve uno nuevo; no muta las entradas. */
export function sumarUso(...usos: Partial<UsoComputo>[]): UsoComputo {
  const total = usoVacio()
  for (const uso of usos) {
    total.cpuMs += num(uso.cpuMs)
    total.gbMs += num(uso.gbMs)
    total.invocaciones += num(uso.invocaciones)
    total.transferenciaBytes += num(uso.transferenciaBytes)
    total.transferenciaOrigenBytes += num(uso.transferenciaOrigenBytes)
    total.edgeRequests += num(uso.edgeRequests)
  }
  return total
}

/**
 * Precios de Vercel, en USD por unidad de facturación.
 *
 * NO se codifican valores fijos en el código a propósito: viven en la tabla
 * `compute_rates` con una fecha de vigencia, porque un periodo de hace tres
 * meses tiene que recalcularse con la tarifa que regía entonces. Si Vercel
 * sube el precio de la CPU, la factura de marzo no puede cambiar sola.
 */
export interface TarifasComputo {
  /** USD por hora de CPU activa. */
  cpuActivaHora: number
  /** USD por GB-hora de memoria aprovisionada. */
  memoriaGbHora: number
  /** USD por millón de invocaciones. */
  invocacionesMillon: number
  /** USD por GB de Fast Data Transfer. */
  transferenciaGb: number
  /** USD por GB de Fast Origin Transfer. */
  transferenciaOrigenGb: number
  /** USD por millón de peticiones al edge. */
  edgeRequestsMillon: number
}

/**
 * Condiciones pactadas con un cliente. El modelo es pass-through: se le cobra
 * lo que costó más un margen, que es lo único defendible cuando el cliente
 * pide ver de dónde sale la cifra.
 */
export interface TerminosCobro {
  /** Margen sobre el costo, en porcentaje (30 = 30%). */
  margenPct: number
  /**
   * Consumo que no se cobra, por dimensión. Sirve para absorber el ruido de
   * los bots y del propio monitoreo sin discutirlo cada mes con el cliente.
   */
  incluido?: Partial<UsoComputo>
  /** Piso mensual en USD: por debajo de esto se cobra el mínimo. */
  minimoUsd?: number
  /**
   * Corrección medido -> facturado. La telemetría propia es una aproximación
   * (ver `docs/plan-computo-clientes.md`), y este factor es lo que la ancla a
   * la factura real de Vercel del mes anterior. 1 = sin corrección.
   */
  factorReconciliacion?: number
}

/** Una línea del desglose que ve el cliente. */
export interface LineaCosto {
  dimension: Dimension
  /** Cantidad ya convertida a la unidad de facturación. */
  cantidad: number
  unidad: string
  /** Cantidad descontada por la cuota incluida, en la unidad de facturación. */
  incluido: number
  /** Cantidad efectivamente cobrada (cantidad - incluido, nunca negativa). */
  facturable: number
  tarifa: number
  costoUsd: number
}

export interface Cobro {
  lineas: LineaCosto[]
  /** Lo que le cuesta a Vercel, ya reconciliado. */
  costoUsd: number
  /** Costo antes de aplicar el factor de reconciliación. */
  costoMedidoUsd: number
  factorReconciliacion: number
  margenUsd: number
  /** Total a cobrar al cliente, con margen y mínimo aplicados. */
  totalUsd: number
  /** true si el total lo fijó el mínimo pactado y no el consumo. */
  aplicoMinimo: boolean
}

const MS_POR_HORA = 3_600_000
const BYTES_POR_GB = 1_073_741_824
const MILLON = 1_000_000

/** Conversión a unidad de facturación, por dimensión. */
const CONVERSION: Record<Dimension, { campo: keyof UsoComputo; divisor: number; unidad: string; tarifa: keyof TarifasComputo }> = {
  cpuActiva: { campo: 'cpuMs', divisor: MS_POR_HORA, unidad: 'h-CPU', tarifa: 'cpuActivaHora' },
  memoria: { campo: 'gbMs', divisor: MS_POR_HORA, unidad: 'GB-h', tarifa: 'memoriaGbHora' },
  invocaciones: { campo: 'invocaciones', divisor: MILLON, unidad: 'M inv', tarifa: 'invocacionesMillon' },
  transferencia: { campo: 'transferenciaBytes', divisor: BYTES_POR_GB, unidad: 'GB', tarifa: 'transferenciaGb' },
  transferenciaOrigen: { campo: 'transferenciaOrigenBytes', divisor: BYTES_POR_GB, unidad: 'GB', tarifa: 'transferenciaOrigenGb' },
  edgeRequests: { campo: 'edgeRequests', divisor: MILLON, unidad: 'M req', tarifa: 'edgeRequestsMillon' },
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * Desglose y total de un periodo.
 *
 * El margen se aplica sobre el costo YA reconciliado y no sobre el medido: el
 * margen es un porcentaje del dinero que realmente sale de mi bolsillo, no de
 * una estimación.
 */
export function calcularCobro(
  uso: Partial<UsoComputo>,
  tarifas: TarifasComputo,
  terminos: TerminosCobro,
): Cobro {
  const total = sumarUso(uso)
  const incluido = sumarUso(terminos.incluido ?? {})

  const lineas: LineaCosto[] = DIMENSIONES.map((dimension) => {
    const { campo, divisor, unidad, tarifa } = CONVERSION[dimension]
    const cantidad = total[campo] / divisor
    const cuota = incluido[campo] / divisor
    const facturable = Math.max(0, cantidad - cuota)
    const precio = num(tarifas[tarifa])
    return {
      dimension,
      cantidad,
      unidad,
      incluido: Math.min(cuota, cantidad),
      facturable,
      tarifa: precio,
      costoUsd: facturable * precio,
    }
  })

  const costoMedidoUsd = lineas.reduce((acc, l) => acc + l.costoUsd, 0)
  const factor = num(terminos.factorReconciliacion) || 1
  const costoUsd = costoMedidoUsd * factor

  const margenPct = Number.isFinite(terminos.margenPct) ? terminos.margenPct : 0
  const conMargen = costoUsd * (1 + margenPct / 100)
  const minimo = num(terminos.minimoUsd)
  const aplicoMinimo = minimo > 0 && conMargen < minimo
  const totalUsd = aplicoMinimo ? minimo : conMargen

  return {
    lineas,
    costoUsd,
    costoMedidoUsd,
    factorReconciliacion: factor,
    margenUsd: totalUsd - costoUsd,
    totalUsd,
    aplicoMinimo,
  }
}

/**
 * Entradas del simulador, en las unidades en las que piensa una persona al
 * cotizar. Nadie sabe cuántos GB-milisegundo consume su sitio; sí sabe cuántas
 * visitas espera al mes.
 */
export interface Estimacion {
  invocacionesMes: number
  /** CPU activa media por invocación, en ms. */
  cpuMsPorInvocacion: number
  /** Duración media de pared por invocación, en ms. */
  duracionMsPorInvocacion: number
  /** Memoria configurada de la función, en MB. */
  memoriaMb: number
  /** Peso medio de la respuesta que llega al visitante, en KB. */
  kbPorRespuesta: number
  /**
   * Peticiones al edge por cada invocación de función. Mayor que 1 porque los
   * estáticos, las imágenes y los assets pegan al edge sin despertar función.
   */
  edgePorInvocacion: number
}

/** Traduce una estimación humana al `UsoComputo` que entiende `calcularCobro`. */
export function usoDesdeEstimacion(e: Estimacion): UsoComputo {
  const inv = num(e.invocacionesMes)
  return {
    cpuMs: inv * num(e.cpuMsPorInvocacion),
    gbMs: inv * num(e.duracionMsPorInvocacion) * (num(e.memoriaMb) / 1024),
    invocaciones: inv,
    transferenciaBytes: inv * num(e.kbPorRespuesta) * 1024,
    // El origin transfer es la respuesta que la función entrega al edge, del
    // mismo orden que lo que sale al visitante salvo compresión y cache.
    transferenciaOrigenBytes: inv * num(e.kbPorRespuesta) * 1024,
    edgeRequests: inv * (num(e.edgePorInvocacion) || 1),
  }
}

/**
 * Factor de corrección a partir de la factura real de Vercel de un periodo ya
 * cerrado. Se acota a un rango sensato: un factor de 0.1 o de 12 no es una
 * medición sesgada, es un dato mal cargado o telemetría caída media semana, y
 * arrastrarlo al mes siguiente estropearía una factura real.
 */
export const FACTOR_MIN = 0.25
export const FACTOR_MAX = 4

export function factorDesdeFactura(medidoUsd: number, realUsd: number): number | null {
  const medido = num(medidoUsd)
  const real = num(realUsd)
  if (medido <= 0 || real <= 0) return null
  const factor = real / medido
  if (factor < FACTOR_MIN || factor > FACTOR_MAX) return null
  return factor
}
