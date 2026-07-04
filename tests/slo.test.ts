import { describe, it, expect } from 'vitest'
import { computeSlo, formatMinutes, budgetHealth, type Check } from '../src/lib/slo'

const now = Date.parse('2026-07-04T12:00:00Z')
const DAY = 86_400_000

/** Genera `total` checks dentro de la ventana, de los cuales `failed` fallan. */
function checks(total: number, failed: number, windowDays = 30): Check[] {
  const out: Check[] = []
  const span = windowDays * DAY - 1000
  for (let i = 0; i < total; i++) {
    const at = now - Math.floor((span * i) / Math.max(1, total - 1)) - 1000
    out.push({ at, ok: i >= failed })
  }
  return out
}

describe('computeSlo', () => {
  it('sin datos: budget intacto, sin SLI, cumple por defecto', () => {
    const r = computeSlo([], 99.5, 30, now)
    expect(r.totalChecks).toBe(0)
    expect(r.sliPct).toBeNull()
    expect(r.remainingMinutes).toBe(r.budgetMinutes)
    expect(r.meetsObjective).toBe(true)
  })

  it('100% uptime: SLI 100, budget sin consumir, burn rate 0', () => {
    const r = computeSlo(checks(1000, 0), 99.5, 30, now)
    expect(r.sliPct).toBe(100)
    expect(r.failedChecks).toBe(0)
    expect(r.spentMinutes).toBe(0)
    expect(r.budgetConsumedPct).toBe(0)
    expect(r.burnRate).toBe(0)
    expect(r.meetsObjective).toBe(true)
  })

  it('presupuesto para 99.5% en 30d ≈ 216 min (0.5% de la ventana)', () => {
    const r = computeSlo(checks(1000, 0), 99.5, 30, now)
    // 30d = 43200 min; 0.5% = 216 min.
    expect(r.windowMinutes).toBe(43_200)
    expect(r.budgetMinutes).toBe(216)
  })

  it('fallo exactamente al ritmo del objetivo: burn rate ≈ 1, budget ≈ 0 restante', () => {
    // 0.5% de fallos = justo la fracción permitida por 99.5%.
    const r = computeSlo(checks(1000, 5), 99.5, 30, now)
    expect(r.sliPct).toBeCloseTo(99.5, 1)
    expect(r.burnRate).toBeCloseTo(1, 1)
    expect(r.remainingMinutes).toBeCloseTo(0, 0)
    expect(r.meetsObjective).toBe(true) // 99.5 >= 99.5
  })

  it('el doble de fallos permitidos: burn rate ≈ 2 y presupuesto excedido', () => {
    const r = computeSlo(checks(1000, 10), 99.5, 30, now) // 1% fallo
    expect(r.burnRate).toBeCloseTo(2, 1)
    expect(r.remainingMinutes).toBeLessThan(0)
    expect(r.meetsObjective).toBe(false)
    expect(budgetHealth(r)).toBe('exhausted')
  })

  it('objetivo del 100%: cualquier fallo agota un presupuesto de cero', () => {
    const r = computeSlo(checks(100, 1), 100, 30, now)
    expect(r.budgetMinutes).toBe(0)
    expect(r.budgetConsumedPct).toBe(Infinity)
    expect(r.budgetRemainingPct).toBe(0)
    expect(r.burnRate).toBe(Infinity)
    expect(r.meetsObjective).toBe(false)
  })

  it('ignora checks fuera de la ventana temporal', () => {
    const inside = checks(10, 0, 30)
    const old: Check = { at: now - 60 * DAY, ok: false } // 60 días atrás
    const future: Check = { at: now + DAY, ok: false } // en el futuro
    const r = computeSlo([...inside, old, future], 99.5, 30, now)
    expect(r.totalChecks).toBe(10)
    expect(r.failedChecks).toBe(0)
  })

  it('acepta timestamps como Date o número indistintamente', () => {
    const r = computeSlo([{ at: new Date(now - 1000), ok: true }, { at: now - 2000, ok: false }], 99.5, 30, now)
    expect(r.totalChecks).toBe(2)
    expect(r.okChecks).toBe(1)
  })

  it('umbrales de salud del budget', () => {
    expect(budgetHealth(computeSlo(checks(1000, 0), 99.5, 30, now))).toBe('healthy')
    // ~80% consumido → 20% restante → critical
    expect(budgetHealth(computeSlo(checks(1000, 4), 99.5, 30, now))).toBe('critical')
  })
})

describe('formatMinutes', () => {
  it('compone días, horas y minutos', () => {
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(90)).toBe('1h 30m')
    expect(formatMinutes(1440)).toBe('1d')
    expect(formatMinutes(1455)).toBe('1d 15m')
  })

  it('preserva el signo negativo (presupuesto excedido)', () => {
    expect(formatMinutes(-30)).toBe('-30m')
  })
})
