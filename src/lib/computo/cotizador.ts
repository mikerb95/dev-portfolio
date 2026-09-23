// Cotizador de hosting fijo para un cliente nuevo. Módulo PURO e isomorfo: el
// servidor pinta el primer resultado y el navegador recalcula con el mismo
// archivo al mover un control.
//
// En Hobby el cómputo no cuesta dinero, así que la cuota que se le cobra al
// cliente no puede salir de "lo que gasta más margen": daría cero. Responde
// otras dos preguntas. Si su tráfico CABE en la cuota gratis junto a lo que ya
// hay en la cuenta, y cuánto costaría hospedarlo en Pro, que es lo que el uso
// comercial exige. El precio sugerido cubre ese día: su cómputo a tarifa Pro
// con margen, o su parte del asiento Pro si el cómputo son centavos.

import { DIMENSIONES, calcularCobro, enUnidades, unidadDe, type Cobro, type Dimension, type TarifasComputo, type UsoComputo } from './calculo'
import { ETIQUETAS_DIMENSION, TARIFAS_INICIALES } from './tarifas'
import { CUOTA_HOBBY } from './cuota'
import { VERCEL } from '../infra-stack'

/** Precio del asiento Pro, del mismo catálogo que simula `/admin/infra`. */
export const ASIENTO_PRO_USD = VERCEL.planes.find((p) => p.id === 'pro')?.baseUsd ?? 0

/**
 * Estimación en las unidades en que piensa quien cotiza.
 *
 * No reutiliza `Estimacion` de `calculo.ts` porque esa parte de las
 * invocaciones: un sitio estático tiene cero invocaciones y aun así gasta
 * transferencia y peticiones al edge en cada visita, que es justo la cuota que
 * se agota primero en un sitio con muchas imágenes.
 */
export interface EstimacionVisitas {
  /** Páginas vistas al mes. */
  visitasMes: number
  /** Porcentaje de visitas que pasan por una función (SSR, API). 0 = sitio estático. */
  pctSsr: number
  /** Peticiones al edge por visita: HTML, CSS, JS, imágenes, fuentes. */
  peticionesPorVisita: number
  /** Peso total que descarga el visitante por visita, en KB. */
  kbPorVisita: number
  /** Peso del HTML que genera la función, en KB. */
  kbHtml: number
  /** CPU activa por render, en ms. */
  cpuMsPorRender: number
  /** Duración de pared por render (incluye esperar a la base), en ms. */
  duracionMsPorRender: number
  /** Memoria de la función. En Hobby es fija: 2048. */
  memoriaMb: number
}

export interface CondicionesCotizacion {
  margenPct: number
  /** Entre cuántos clientes se reparte el asiento Pro. */
  clientesPorAsiento: number
}

export const PLANTILLAS: { id: string; nombre: string; descripcion: string; estimacion: EstimacionVisitas }[] = [
  {
    id: 'landing',
    nombre: 'Landing estática',
    descripcion: 'Una página prerenderizada con formulario de contacto. Ninguna visita despierta una función.',
    estimacion: { visitasMes: 3_000, pctSsr: 0, peticionesPorVisita: 25, kbPorVisita: 1_500, kbHtml: 40, cpuMsPorRender: 0, duracionMsPorRender: 0, memoriaMb: 2048 },
  },
  {
    id: 'ssr',
    nombre: 'Sitio SSR pequeño',
    descripcion: 'Astro en modo servidor: cada página se renderiza en una función y consulta una base.',
    estimacion: { visitasMes: 5_000, pctSsr: 100, peticionesPorVisita: 20, kbPorVisita: 1_200, kbHtml: 60, cpuMsPorRender: 25, duracionMsPorRender: 180, memoriaMb: 2048 },
  },
  {
    id: 'tienda',
    nombre: 'Tienda o app con API',
    descripcion: 'Catálogo con imágenes, carrito y API propia. Más visitas y más trabajo por visita.',
    estimacion: { visitasMes: 20_000, pctSsr: 100, peticionesPorVisita: 35, kbPorVisita: 2_500, kbHtml: 80, cpuMsPorRender: 60, duracionMsPorRender: 400, memoriaMb: 2048 },
  },
]

export const CONDICIONES_INICIALES: CondicionesCotizacion = { margenPct: 30, clientesPorAsiento: 4 }

const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/**
 * Traduce la estimación a consumo mensual.
 *
 * La memoria multiplica renders por duración como si ninguno se solapara: es
 * una cota superior (con concurrencia Fluid dos renders simultáneos pagan la
 * memoria una vez), y para cotizar es mejor pasarse que quedarse corto.
 */
export function usoDesdeVisitas(e: EstimacionVisitas): UsoComputo {
  const visitas = pos(e.visitasMes)
  const renders = visitas * Math.min(100, pos(e.pctSsr)) / 100
  return {
    cpuMs: renders * pos(e.cpuMsPorRender),
    gbMs: renders * pos(e.duracionMsPorRender) * (pos(e.memoriaMb) / 1024),
    invocaciones: renders,
    transferenciaBytes: visitas * pos(e.kbPorVisita) * 1024,
    transferenciaOrigenBytes: renders * pos(e.kbHtml) * 1024,
    // Toda visita pide al menos el HTML, aunque se declare cero.
    edgeRequests: visitas * Math.max(1, pos(e.peticionesPorVisita)),
  }
}

export interface LineaCotizacion {
  dimension: Dimension
  etiqueta: string
  unidad: string
  /** Consumo mensual estimado del cliente. */
  cantidad: number
  cuota: number
  /** Qué parte de la cuota gratis se comería él solo. */
  pctCuota: number
  /** La cuenta a fin de mes con este cliente sumado a lo que ya hay. */
  pctConCuenta: number
  cabe: boolean
}

export interface Cotizacion {
  uso: UsoComputo
  lineas: LineaCotizacion[]
  /** La dimensión en la que este cliente pesa más. */
  manda: Dimension
  cabe: boolean
  /** Su cómputo a tarifa Pro, sin margen. */
  costoPro: Cobro
  /** Su parte del asiento Pro. */
  parteAsientoUsd: number
  /** Cuota mensual sugerida: margen sobre su cómputo o su parte del asiento. */
  sugerida: Cobro
}

/**
 * Cotiza un cliente.
 *
 * `ocupado` es lo que la cuenta ya proyecta consumir este mes, en la unidad de
 * cada dimensión (sale de `estadoCuota(...).dimensiones[].proyectado`). El
 * cliente nuevo suma un mes COMPLETO, así que se compara contra la proyección
 * y no contra lo consumido hasta hoy.
 */
export function cotizar(
  e: EstimacionVisitas,
  condiciones: CondicionesCotizacion,
  ocupado: Partial<Record<Dimension, number>> = {},
  tarifas: TarifasComputo = TARIFAS_INICIALES,
  cuota: Record<Dimension, number> = CUOTA_HOBBY,
): Cotizacion {
  const uso = usoDesdeVisitas(e)
  const cantidades = enUnidades(uso)
  const lineas = DIMENSIONES.map((dimension): LineaCotizacion => {
    const tope = cuota[dimension]
    const cantidad = cantidades[dimension]
    const conCuenta = cantidad + pos(ocupado[dimension])
    return {
      dimension,
      etiqueta: ETIQUETAS_DIMENSION[dimension],
      unidad: unidadDe(dimension),
      cantidad,
      cuota: tope,
      pctCuota: tope > 0 ? (cantidad / tope) * 100 : 0,
      pctConCuenta: tope > 0 ? (conCuenta / tope) * 100 : 0,
      cabe: tope <= 0 || conCuenta <= tope,
    }
  })

  const clientes = Math.max(1, Math.floor(pos(condiciones.clientesPorAsiento)) || 1)
  const parteAsientoUsd = ASIENTO_PRO_USD / clientes
  // La misma función que habría facturado el pass-through: el margen va sobre
  // el costo, y el mínimo es la parte del asiento.
  const costoPro = calcularCobro(uso, tarifas, { margenPct: 0 })
  const sugerida = calcularCobro(uso, tarifas, { margenPct: condiciones.margenPct, minimoUsd: parteAsientoUsd })

  return {
    uso,
    lineas,
    manda: lineas.reduce((a, b) => (b.pctCuota > a.pctCuota ? b : a)).dimension,
    cabe: lineas.every((l) => l.cabe),
    costoPro,
    parteAsientoUsd,
    sugerida,
  }
}
