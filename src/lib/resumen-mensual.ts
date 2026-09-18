// Resumen mensual de lo que sale del bolsillo: infraestructura, suscripciones de
// trabajo y costos de vida. Módulo PURO: recibe filas ya leídas y devuelve el
// resumen, así el cálculo se prueba sin base de datos.
//
// La pregunta que responde es "¿cuánto me toca pagar ESTE mes?", no "¿cuánto
// cuesta en promedio?". Por eso un anual aparece completo en el mes en que
// renueva y en ningún otro: prorratearlo esconde justo los meses pesados, que
// son los que hay que ver venir. El promedio también se devuelve, pero como
// referencia (equivalenteMensualUSD), no como el total.
import { monthlyEquivalent, toBaseUSD, type Rates } from './money'
import { fechaISOEnColombia } from './fecha-co'
import { CYCLE_MONTHS, type LivingCategory, type LivingCycle } from './vida'

export interface ServicioFila {
  id: number
  name: string
  category: string
  provider: string | null
  cost: number | null
  currency: string | null
  billingCycle: string | null
  renewalDate: Date | null
  active: boolean | null
  payer: string | null
  createdAt: Date | null
}

export interface FijoFila {
  id: number
  name: string
  category: LivingCategory
  amount: number
  currency: string
  cycle: LivingCycle
  anchorMonth: number | null
  dueDay: number | null
  active: boolean
  createdAt: Date | null
}

export interface GastoFila {
  id: number
  periodo: string
  livingCostId: number | null
  category: LivingCategory
  description: string
  amount: number
  currency: string
  spentOn: string | null
}

export type MotivoCargo = 'mensual' | 'renovacion' | 'sin_fecha' | 'uso' | 'pago_unico'

export interface LineaCargo {
  id: number
  nombre: string
  categoria: string
  proveedor: string | null
  monto: number
  moneda: string
  montoUSD: number | null
  ciclo: string
  motivo: MotivoCargo
  reembolsable: boolean
}

export interface SeccionCargos {
  lineas: LineaCargo[]
  totalUSD: number
  equivalenteMensualUSD: number
  // Parte del total que adelanto yo pero me devuelve un cliente.
  reembolsableUSD: number
}

export interface LineaFijo {
  id: number
  nombre: string
  categoria: LivingCategory
  ciclo: LivingCycle
  dia: number | null
  presupuesto: number
  moneda: string
  presupuestoUSD: number | null
  // Lo pagado de verdad en el periodo; null mientras no haya registro.
  realUSD: number | null
  estado: 'pagado' | 'pendiente'
}

export interface LineaGasto {
  id: number
  descripcion: string
  categoria: LivingCategory
  monto: number
  moneda: string
  montoUSD: number | null
  fecha: string | null
}

export interface SeccionVida {
  fijos: LineaFijo[]
  variables: LineaGasto[]
  presupuestoUSD: number
  realUSD: number
  pendienteUSD: number
  // Lo que cuesta el mes: lo pagado + lo que falta por pagar de los fijos.
  totalUSD: number
  equivalenteMensualUSD: number
  porCategoria: { categoria: LivingCategory; presupuestoUSD: number; realUSD: number }[]
}

export interface ResumenMensual {
  periodo: string
  infra: SeccionCargos
  suscripciones: SeccionCargos
  vida: SeccionVida
  totalUSD: number
  equivalenteMensualUSD: number
  monedasSinTasa: string[]
}

export interface EntradaResumen {
  servicios: ServicioFila[]
  fijos: FijoFila[]
  gastos: GastoFila[]
  rates: Rates
}

// ── Periodos ────────────────────────────────────────────────────────────────

/** Mes en curso en Colombia, 'YYYY-MM'. En UTC, el 30 a las 20:00 ya sería el mes siguiente. */
export const periodoActual = (now = new Date()): string => fechaISOEnColombia(now).slice(0, 7)

export function sumarMeses(periodo: string, n: number): string {
  const [y, m] = periodo.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

const mesDe = (periodo: string): number => Number(periodo.slice(5, 7))

/** Primer instante del mes siguiente en Colombia: lo creado desde ahí no existía en el periodo. */
export const finDePeriodo = (periodo: string): Date =>
  new Date(`${sumarMeses(periodo, 1)}-01T00:00:00-05:00`)

/** ¿Un cobro cada `cadaMeses` meses, anclado en `ancla`, cae en el mes `mes`? */
export function caeEnMes(cadaMeses: number, ancla: number, mes: number): boolean {
  if (cadaMeses <= 1) return true
  return (((mes - ancla) % cadaMeses) + cadaMeses) % cadaMeses === 0
}

// La fecha de renovación de project_services entra por `new Date('YYYY-MM-DD')`
// (medianoche UTC) o viene de RDAP como instante UTC. Leer el mes en UTC es lo
// que devuelve el día que se escribió; en hora de Colombia, un "1 de marzo"
// caería en febrero.
const periodoUTC = (d: Date): string => d.toISOString().slice(0, 7)

// ── Secciones ───────────────────────────────────────────────────────────────

function cargoDelMes(s: ServicioFila, periodo: string): { motivo: MotivoCargo; monto: number } | null {
  const cost = s.cost
  if (cost == null || !Number.isFinite(cost)) return null
  const ancla = s.renewalDate ? s.renewalDate.getUTCMonth() + 1 : null
  switch (s.billingCycle ?? 'monthly') {
    case 'monthly':
      return { motivo: 'mensual', monto: cost }
    // "Por uso" con un monto cargado es la estimación del consumo mensual. Sin
    // monto no hay nada que sumar, y se omite en vez de inventar.
    case 'usage':
      return { motivo: 'uso', monto: cost }
    case 'quarterly':
    case 'annual': {
      const cada = s.billingCycle === 'annual' ? 12 : 3
      if (ancla == null) return { motivo: 'sin_fecha', monto: monthlyEquivalent(cost, s.billingCycle) }
      return caeEnMes(cada, ancla, mesDe(periodo)) ? { motivo: 'renovacion', monto: cost } : null
    }
    case 'one_time':
      return s.renewalDate && periodoUTC(s.renewalDate) === periodo ? { motivo: 'pago_unico', monto: cost } : null
    default:
      return null // free
  }
}

function seccionCargos(servicios: ServicioFila[], periodo: string, rates: Rates, sinTasa: Set<string>): SeccionCargos {
  const lineas: LineaCargo[] = []
  let totalUSD = 0
  let equivalenteMensualUSD = 0
  let reembolsableUSD = 0

  for (const s of servicios) {
    const moneda = s.currency ?? 'USD'
    const reembolsable = s.payer === 'client_reimbursable'

    const equivalente = s.billingCycle === 'usage' ? (s.cost ?? 0) : monthlyEquivalent(s.cost, s.billingCycle)
    const equivalenteUSD = toBaseUSD(equivalente, moneda, rates)
    if (equivalenteUSD != null) equivalenteMensualUSD += equivalenteUSD

    const cargo = cargoDelMes(s, periodo)
    if (!cargo) continue
    const montoUSD = toBaseUSD(cargo.monto, moneda, rates)
    if (montoUSD == null) sinTasa.add(moneda)
    else {
      totalUSD += montoUSD
      if (reembolsable) reembolsableUSD += montoUSD
    }
    lineas.push({
      id: s.id,
      nombre: s.name,
      categoria: s.category,
      proveedor: s.provider,
      monto: cargo.monto,
      moneda,
      montoUSD,
      ciclo: s.billingCycle ?? 'monthly',
      motivo: cargo.motivo,
      reembolsable,
    })
  }

  // Lo que renueva este mes va primero: es lo que se sale del patrón.
  const peso = (l: LineaCargo) => (l.motivo === 'renovacion' || l.motivo === 'pago_unico' ? 0 : 1)
  lineas.sort((a, b) => peso(a) - peso(b) || (b.montoUSD ?? 0) - (a.montoUSD ?? 0))
  return { lineas, totalUSD, equivalenteMensualUSD, reembolsableUSD }
}

function seccionVida(fijos: FijoFila[], gastos: GastoFila[], periodo: string, rates: Rates, sinTasa: Set<string>): SeccionVida {
  const usd = (monto: number, moneda: string): number | null => {
    const v = toBaseUSD(monto, moneda, rates)
    if (v == null) sinTasa.add(moneda)
    return v
  }

  const delPeriodo = gastos.filter((g) => g.periodo === periodo)
  const pagosPorFijo = new Map<number, GastoFila[]>()
  for (const g of delPeriodo) {
    if (g.livingCostId == null) continue
    const lista = pagosPorFijo.get(g.livingCostId) ?? []
    lista.push(g)
    pagosPorFijo.set(g.livingCostId, lista)
  }

  const cat = new Map<LivingCategory, { presupuestoUSD: number; realUSD: number }>()
  const acumular = (c: LivingCategory, campo: 'presupuestoUSD' | 'realUSD', v: number) => {
    const fila = cat.get(c) ?? { presupuestoUSD: 0, realUSD: 0 }
    fila[campo] += v
    cat.set(c, fila)
  }

  const lineasFijos: LineaFijo[] = []
  const fijosDelMes = new Set<number>()
  let presupuestoUSD = 0
  let pendienteUSD = 0
  let equivalenteMensualUSD = 0

  for (const f of fijos) {
    const cada = CYCLE_MONTHS[f.cycle] ?? 1
    const eq = toBaseUSD(f.amount / cada, f.currency, rates)
    if (eq != null) equivalenteMensualUSD += eq

    // normalizarFijo exige el mes ancla a todo ciclo no mensual; si aun así
    // falta, no se sabe cuándo cae y se omite antes que cobrarlo cada mes.
    if (cada > 1 && f.anchorMonth == null) continue
    if (!caeEnMes(cada, f.anchorMonth ?? 1, mesDe(periodo))) continue
    fijosDelMes.add(f.id)

    const presupuesto = usd(f.amount, f.currency)
    if (presupuesto != null) {
      presupuestoUSD += presupuesto
      acumular(f.category, 'presupuestoUSD', presupuesto)
    }
    const pagos = pagosPorFijo.get(f.id)
    let realUSD: number | null = null
    if (pagos) {
      realUSD = pagos.reduce((s, g) => s + (usd(g.amount, g.currency) ?? 0), 0)
    } else if (presupuesto != null) {
      pendienteUSD += presupuesto
    }
    lineasFijos.push({
      id: f.id,
      nombre: f.name,
      categoria: f.category,
      ciclo: f.cycle,
      dia: f.dueDay,
      presupuesto: f.amount,
      moneda: f.currency,
      presupuestoUSD: presupuesto,
      realUSD,
      estado: pagos ? 'pagado' : 'pendiente',
    })
  }

  // Todo gasto real cuenta, aunque apunte a un fijo que no tocaba este mes (un
  // bimestral pagado tarde) o a uno ya borrado: el dinero salió igual.
  let realUSD = 0
  const variables: LineaGasto[] = []
  for (const g of delPeriodo) {
    const montoUSD = usd(g.amount, g.currency)
    if (montoUSD != null) {
      realUSD += montoUSD
      acumular(g.category, 'realUSD', montoUSD)
    }
    if (g.livingCostId != null && fijosDelMes.has(g.livingCostId)) continue
    variables.push({
      id: g.id,
      descripcion: g.description,
      categoria: g.category,
      monto: g.amount,
      moneda: g.currency,
      montoUSD,
      fecha: g.spentOn,
    })
  }

  lineasFijos.sort((a, b) => (a.dia ?? 99) - (b.dia ?? 99) || a.nombre.localeCompare(b.nombre))
  variables.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || b.id - a.id)

  return {
    fijos: lineasFijos,
    variables,
    presupuestoUSD,
    realUSD,
    pendienteUSD,
    totalUSD: realUSD + pendienteUSD,
    equivalenteMensualUSD,
    porCategoria: [...cat.entries()]
      .map(([categoria, v]) => ({ categoria, ...v }))
      .sort((a, b) => Math.max(b.presupuestoUSD, b.realUSD) - Math.max(a.presupuestoUSD, a.realUSD)),
  }
}

// ── Resumen ─────────────────────────────────────────────────────────────────

/**
 * Resumen de un mes. Filtra por el estado ACTUAL de cada fila (`active`), así
 * que un servicio dado de baja deja de aparecer también en los meses pasados:
 * no hay historial de bajas. Lo que sí se respeta es la fecha de alta, para que
 * un servicio nuevo no aparezca cobrado en meses en que no existía.
 */
export function resumenMensual(periodo: string, e: EntradaResumen): ResumenMensual {
  const fin = finDePeriodo(periodo)
  const existia = (d: Date | null) => !d || d < fin
  const sinTasa = new Set<string>()

  // Lo que paga el cliente directo no sale de mi cuenta; lo reembolsable sí,
  // aunque vuelva después, y por eso cuenta y se marca aparte.
  const servicios = e.servicios.filter(
    (s) => s.active && s.payer !== 'client_direct' && existia(s.createdAt),
  )
  const infra = seccionCargos(servicios.filter((s) => s.category !== 'subscription'), periodo, e.rates, sinTasa)
  const suscripciones = seccionCargos(servicios.filter((s) => s.category === 'subscription'), periodo, e.rates, sinTasa)
  const vida = seccionVida(e.fijos.filter((f) => f.active && existia(f.createdAt)), e.gastos, periodo, e.rates, sinTasa)

  return {
    periodo,
    infra,
    suscripciones,
    vida,
    totalUSD: infra.totalUSD + suscripciones.totalUSD + vida.totalUSD,
    equivalenteMensualUSD: infra.equivalenteMensualUSD + suscripciones.equivalenteMensualUSD + vida.equivalenteMensualUSD,
    monedasSinTasa: [...sinTasa].sort(),
  }
}

export interface MesProyectado {
  periodo: string
  infraUSD: number
  suscripcionesUSD: number
  vidaUSD: number
  totalUSD: number
}

/** Los `meses` periodos desde `desde`, para ver venir los meses pesados. */
export function proyeccion(desde: string, meses: number, e: EntradaResumen): MesProyectado[] {
  return Array.from({ length: meses }, (_, i) => {
    const r = resumenMensual(sumarMeses(desde, i), e)
    return {
      periodo: r.periodo,
      infraUSD: r.infra.totalUSD,
      suscripcionesUSD: r.suscripciones.totalUSD,
      vidaUSD: r.vida.totalUSD,
      totalUSD: r.totalUSD,
    }
  })
}
