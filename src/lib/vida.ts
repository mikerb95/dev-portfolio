// Costos de vida: catálogo y validación de entrada. Módulo PURO (sin BD ni
// node:*), para que lo compartan los endpoints, las páginas y los tests.
import { CURRENCIES } from './money'

export const LIVING_CATEGORIES = [
  'vivienda', 'servicios', 'alimentacion', 'transporte', 'salud', 'seguros',
  'educacion', 'suscripciones', 'deudas', 'ocio', 'otros',
] as const
export type LivingCategory = (typeof LIVING_CATEGORIES)[number]

export const LIVING_CATEGORY_LABELS: Record<LivingCategory, string> = {
  vivienda: 'Vivienda',
  servicios: 'Servicios públicos',
  alimentacion: 'Alimentación',
  transporte: 'Transporte',
  salud: 'Salud',
  seguros: 'Seguros',
  educacion: 'Educación',
  suscripciones: 'Suscripciones',
  deudas: 'Deudas y créditos',
  ocio: 'Ocio',
  otros: 'Otros',
}

export const LIVING_CYCLES = ['monthly', 'bimonthly', 'quarterly', 'annual'] as const
export type LivingCycle = (typeof LIVING_CYCLES)[number]

export const LIVING_CYCLE_LABELS: Record<LivingCycle, string> = {
  monthly: 'Mensual',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  annual: 'Anual',
}

/** Meses entre dos cobros de cada ciclo. */
export const CYCLE_MONTHS: Record<LivingCycle, number> = {
  monthly: 1, bimonthly: 2, quarterly: 3, annual: 12,
}

const PERIODO = /^(\d{4})-(0[1-9]|1[0-2])$/
const FECHA = /^\d{4}-\d{2}-\d{2}$/

export const esPeriodo = (v: unknown): v is string => typeof v === 'string' && PERIODO.test(v)

export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string }

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

// Un monto de cero se acepta (un mes sin consumo de gas existe), uno negativo
// no: los reembolsos no son un gasto de vida y restarlos escondería el gasto.
const monto = (v: unknown): number | null => {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

const entero = (v: unknown, min: number, max: number): number | null => {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

const moneda = (v: unknown): string =>
  typeof v === 'string' && (CURRENCIES as readonly string[]).includes(v) ? v : 'COP'

export interface FijoInput {
  name: string
  category: LivingCategory
  amount: number
  currency: string
  cycle: LivingCycle
  anchorMonth: number | null
  dueDay: number | null
  active: boolean
  notes: string | null
}

/** Valida el cuerpo de alta/edición de un gasto fijo. */
export function normalizarFijo(body: Record<string, unknown>): Resultado<FijoInput> {
  const name = texto(body.name, 120)
  if (!name) return { ok: false, error: 'El nombre es requerido.' }
  if (!LIVING_CATEGORIES.includes(body.category as LivingCategory)) {
    return { ok: false, error: 'Categoría inválida.' }
  }
  const amount = monto(body.amount)
  if (amount == null) return { ok: false, error: 'El monto debe ser un número mayor o igual a cero.' }
  const cycle = (LIVING_CYCLES.includes(body.cycle as LivingCycle) ? body.cycle : 'monthly') as LivingCycle
  const anchorMonth = entero(body.anchorMonth, 1, 12)
  // Sin mes ancla un cobro anual no se puede ubicar en el calendario, y el
  // resumen tendría que adivinar. Mejor exigirlo al guardar que prorratear en
  // silencio para siempre.
  if (cycle !== 'monthly' && anchorMonth == null) {
    return { ok: false, error: 'Indica en qué mes cae el cobro.' }
  }
  return {
    ok: true,
    value: {
      name,
      category: body.category as LivingCategory,
      amount,
      currency: moneda(body.currency),
      cycle,
      anchorMonth: cycle === 'monthly' ? null : anchorMonth,
      dueDay: entero(body.dueDay, 1, 31),
      active: body.active === undefined ? true : !!body.active,
      notes: texto(body.notes, 500),
    },
  }
}

export interface GastoInput {
  periodo: string
  livingCostId: number | null
  category: LivingCategory
  description: string
  amount: number
  currency: string
  spentOn: string | null
  notes: string | null
}

/** Valida el cuerpo de alta/edición de un gasto real del mes. */
export function normalizarGasto(body: Record<string, unknown>): Resultado<GastoInput> {
  if (!esPeriodo(body.periodo)) return { ok: false, error: 'Periodo inválido (YYYY-MM).' }
  const description = texto(body.description, 200)
  if (!description) return { ok: false, error: 'La descripción es requerida.' }
  if (!LIVING_CATEGORIES.includes(body.category as LivingCategory)) {
    return { ok: false, error: 'Categoría inválida.' }
  }
  const amount = monto(body.amount)
  if (amount == null) return { ok: false, error: 'El monto debe ser un número mayor o igual a cero.' }
  const spentOn = typeof body.spentOn === 'string' && FECHA.test(body.spentOn) ? body.spentOn : null
  const livingCostId = entero(body.livingCostId, 1, Number.MAX_SAFE_INTEGER)
  return {
    ok: true,
    value: {
      periodo: body.periodo,
      livingCostId,
      category: body.category as LivingCategory,
      description,
      amount,
      currency: moneda(body.currency),
      spentOn,
      notes: texto(body.notes, 500),
    },
  }
}
