// Datos para "encaje con tu vida": gasto mensual reciente y trabajo ya
// comprometido. Solo servidor. El cálculo vive en encaje.ts (puro).

import { and, eq, inArray, ne } from 'drizzle-orm'
import { db } from '../../db'
import { livingCosts, livingExpenses, propuestas, propuestaVersiones } from '../../db/schema'
import { CYCLE_MONTHS, type LivingCycle } from '../vida'
import { gastoPromedio, type Trabajo } from './encaje'
import type { Snapshot } from './tipos'

function periodosAnteriores(hoy: string, n: number): string[] {
  let anio = Number(hoy.slice(0, 4))
  let mes = Number(hoy.slice(5, 7))
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    mes--
    if (mes === 0) {
      mes = 12
      anio--
    }
    out.push(`${anio}-${String(mes).padStart(2, '0')}`)
  }
  return out
}

/**
 * Promedio de los últimos tres meses cerrados de gastos reales; si no hay
 * gastos anotados, la suma mensualizada de los fijos activos. Fail-open:
 * sin datos devuelve null y la tarjeta lo dice.
 */
export async function gastoMensualReciente(hoy: string): Promise<number | null> {
  try {
    const periodos = periodosAnteriores(hoy, 3)
    const filas = await db
      .select({ periodo: livingExpenses.periodo, amount: livingExpenses.amount, currency: livingExpenses.currency })
      .from(livingExpenses)
      .where(inArray(livingExpenses.periodo, periodos))
    const porMes = periodos.map((p) => filas.filter((f) => f.periodo === p && f.currency === 'COP').reduce((t, f) => t + f.amount, 0))
    const real = gastoPromedio(porMes)
    if (real) return real
    const fijos = await db
      .select({ amount: livingCosts.amount, cycle: livingCosts.cycle, currency: livingCosts.currency })
      .from(livingCosts)
      .where(eq(livingCosts.active, true))
    const mensual = fijos.filter((f) => f.currency === 'COP').reduce((t, f) => t + f.amount / (CYCLE_MONTHS[f.cycle as LivingCycle] ?? 1), 0)
    return mensual > 0 ? Math.round(mensual) : null
  } catch {
    return null
  }
}

/** Propuestas aceptadas o convertidas (menos la actual), como trabajos fechados. */
export async function trabajosComprometidos(excluirId: number): Promise<Trabajo[]> {
  try {
    const ps = await db
      .select({ id: propuestas.id, titulo: propuestas.titulo, version: propuestas.aceptadaVersion })
      .from(propuestas)
      .where(and(inArray(propuestas.estado, ['aceptada', 'convertida']), ne(propuestas.id, excluirId)))
      .limit(30)
    const out: Trabajo[] = []
    for (const p of ps) {
      if (!p.version) continue
      const [v] = await db
        .select({ snapshot: propuestaVersiones.snapshot })
        .from(propuestaVersiones)
        .where(and(eq(propuestaVersiones.propuestaId, p.id), eq(propuestaVersiones.version, p.version)))
        .limit(1)
      if (!v) continue
      const s = JSON.parse(v.snapshot) as Snapshot
      const ini = s.hitos.find((h) => h.id === 'firma')?.fecha
      const fin = s.hitos.find((h) => h.id === 'publicacion')?.fecha
      if (ini && fin) out.push({ nombre: p.titulo, inicio: ini, fin, horas: s.horas[1] })
    }
    return out
  } catch {
    return []
  }
}
