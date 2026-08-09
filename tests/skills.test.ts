import { describe, it, expect } from 'vitest'
import {
  addDays,
  buildHeatmap,
  computeAchievements,
  computeStreak,
  dayKeyOf,
  diffDays,
  formatMinutes,
  isValidDayKey,
  milestoneProgress,
  minutesByDay,
  startOfWeek,
  totals,
  weeklyGoal,
} from '../src/lib/skills'

const s = (day: string, minutes: number) => ({ day, minutes })

describe('claves de día', () => {
  it('hace aritmética de calendario sin desplazarse por zona horaria', () => {
    expect(addDays('2026-08-08', 1)).toBe('2026-08-09')
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('cruza el cambio de mes y el año bisiesto', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(diffDays('2028-02-27', '2028-03-01')).toBe(3)
  })

  it('resuelve el día en la zona del tracker, no en UTC', () => {
    // 8 de la noche en Bogotá ya es el día siguiente en UTC. Si el tracker
    // usara UTC, esta sesión rompería la racha del día en que se registró.
    expect(dayKeyOf(new Date('2026-08-09T01:30:00Z'))).toBe('2026-08-08')
    expect(dayKeyOf(new Date('2026-08-08T12:00:00Z'))).toBe('2026-08-08')
  })

  it('valida el formato de clave de día', () => {
    expect(isValidDayKey('2026-08-08')).toBe(true)
    expect(isValidDayKey('2026-13-01')).toBe(false)
    expect(isValidDayKey('2026-02-30')).toBe(false)
    expect(isValidDayKey('08/08/2026')).toBe(false)
  })

  it('ancla la semana en lunes', () => {
    expect(startOfWeek('2026-08-08')).toBe('2026-08-03') // sábado -> lunes previo
    expect(startOfWeek('2026-08-03')).toBe('2026-08-03') // lunes -> él mismo
    expect(startOfWeek('2026-08-09')).toBe('2026-08-03') // domingo cierra la semana
  })
})

describe('racha', () => {
  it('cuenta días consecutivos terminando hoy', () => {
    const r = computeStreak(
      [s('2026-08-06', 30), s('2026-08-07', 45), s('2026-08-08', 60)],
      '2026-08-08'
    )
    expect(r.current).toBe(3)
    expect(r.activeToday).toBe(true)
    expect(r.atRisk).toBe(false)
  })

  it('mantiene la racha viva si la última sesión fue ayer, marcándola en riesgo', () => {
    const r = computeStreak([s('2026-08-06', 30), s('2026-08-07', 45)], '2026-08-08')
    expect(r.current).toBe(2)
    expect(r.activeToday).toBe(false)
    expect(r.atRisk).toBe(true)
  })

  it('corta la racha cuando pasan dos días sin sesión', () => {
    const r = computeStreak([s('2026-08-05', 30), s('2026-08-06', 45)], '2026-08-08')
    expect(r.current).toBe(0)
    expect(r.record).toBe(2)
    expect(r.atRisk).toBe(false)
  })

  it('varias sesiones el mismo día cuentan como un solo día de racha', () => {
    const r = computeStreak(
      [s('2026-08-07', 30), s('2026-08-07', 30), s('2026-08-08', 30)],
      '2026-08-08'
    )
    expect(r.current).toBe(2)
  })

  it('conserva el récord histórico aunque la racha actual sea cero', () => {
    const r = computeStreak(
      [s('2026-07-01', 30), s('2026-07-02', 30), s('2026-07-03', 30), s('2026-07-04', 30)],
      '2026-08-08'
    )
    expect(r.current).toBe(0)
    expect(r.record).toBe(4)
    expect(r.lastActive).toBe('2026-07-04')
  })

  it('ignora sesiones de cero minutos al calcular días activos', () => {
    const r = computeStreak([s('2026-08-07', 0), s('2026-08-08', 30)], '2026-08-08')
    expect(r.current).toBe(1)
  })

  it('sin sesiones no hay racha ni récord', () => {
    const r = computeStreak([], '2026-08-08')
    expect(r).toMatchObject({ current: 0, record: 0, lastActive: null, atRisk: false })
  })
})

describe('meta semanal', () => {
  it('solo suma las sesiones de la semana en curso', () => {
    const g = weeklyGoal(
      [s('2026-08-02', 120), s('2026-08-03', 60), s('2026-08-08', 90)],
      '2026-08-08',
      360
    )
    // 2 ago es domingo de la semana anterior: queda fuera.
    expect(g.minutes).toBe(150)
    expect(g.weekStart).toBe('2026-08-03')
    expect(g.pct).toBe(42)
    expect(g.met).toBe(false)
    expect(g.remaining).toBe(210)
  })

  it('marca la meta cumplida y no pasa del 100%', () => {
    const g = weeklyGoal([s('2026-08-05', 600)], '2026-08-08', 360)
    expect(g.met).toBe(true)
    expect(g.pct).toBe(100)
    expect(g.remaining).toBe(0)
    expect(g.paceNeeded).toBe(0)
  })

  it('reparte lo que falta entre los días que quedan, contando hoy', () => {
    // Viernes: quedan viernes, sábado y domingo.
    const g = weeklyGoal([s('2026-08-03', 60)], '2026-08-07', 360)
    expect(g.remaining).toBe(300)
    expect(g.paceNeeded).toBe(100)
  })
})

describe('totales', () => {
  it('agrega minutos, días activos y ventana de 30 días', () => {
    const t = totals(
      [s('2026-06-01', 120), s('2026-07-25', 60), s('2026-08-08', 30), s('2026-08-08', 30)],
      '2026-08-08'
    )
    expect(t.totalMinutes).toBe(240)
    expect(t.sessionCount).toBe(4)
    expect(t.activeDays).toBe(3)
    expect(t.avgPerActiveDay).toBe(80)
    expect(t.last30Minutes).toBe(120) // 25 jul y los dos bloques del 8 ago
    expect(t.firstDay).toBe('2026-06-01')
  })

  it('agrupa minutos por día', () => {
    const map = minutesByDay([s('2026-08-08', 30), s('2026-08-08', 45), s('2026-08-07', 10)])
    expect(map.get('2026-08-08')).toBe(75)
    expect(map.get('2026-08-07')).toBe(10)
  })
})

describe('heatmap', () => {
  it('devuelve una rejilla completa de semanas por 7 días', () => {
    const h = buildHeatmap([s('2026-08-08', 60)], '2026-08-08', 4)
    expect(h.weeks).toHaveLength(4)
    expect(h.weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('la última columna contiene hoy y arranca en lunes', () => {
    const h = buildHeatmap([], '2026-08-08', 4)
    const last = h.weeks[h.weeks.length - 1]
    expect(last[0].day).toBe('2026-08-03')
    expect(last.some((c) => c.day === '2026-08-08')).toBe(true)
  })

  it('marca como futuros los días posteriores a hoy', () => {
    const h = buildHeatmap([], '2026-08-08', 1)
    expect(h.weeks[0].find((c) => c.day === '2026-08-09')?.future).toBe(true)
    expect(h.weeks[0].find((c) => c.day === '2026-08-08')?.future).toBe(false)
  })

  it('los niveles son relativos al mejor día de la ventana', () => {
    const h = buildHeatmap([s('2026-08-04', 25), s('2026-08-05', 100)], '2026-08-08', 1)
    const week = h.weeks[0]
    expect(h.max).toBe(100)
    expect(week.find((c) => c.day === '2026-08-05')?.level).toBe(4)
    expect(week.find((c) => c.day === '2026-08-04')?.level).toBe(1)
    expect(week.find((c) => c.day === '2026-08-06')?.level).toBe(0)
  })
})

describe('progreso del temario', () => {
  const milestones = [
    { area: 'C#', status: 'hecho' as const, completedOn: '2026-08-01' },
    { area: 'C#', status: 'en_curso' as const, completedOn: null },
    { area: 'EF Core', status: 'pendiente' as const, completedOn: null },
    { area: 'EF Core', status: 'pendiente' as const, completedOn: null },
  ]

  it('agrupa por área y calcula porcentajes', () => {
    const p = milestoneProgress(milestones)
    expect(p.total).toBe(4)
    expect(p.done).toBe(1)
    expect(p.pct).toBe(25)
    expect(p.areas.find((a) => a.area === 'C#')).toMatchObject({ total: 2, done: 1, inProgress: 1, pct: 50 })
    expect(p.areas.find((a) => a.area === 'EF Core')?.pct).toBe(0)
  })

  it('un temario vacío no divide por cero', () => {
    expect(milestoneProgress([]).pct).toBe(0)
  })
})

describe('logros derivados', () => {
  const noMilestones: { area: string; status: 'pendiente'; completedOn: null }[] = []

  it('desbloquea el primero con la primera sesión, fechado en ese día', () => {
    const a = computeAchievements([s('2026-07-30', 45)], noMilestones, '2026-08-08', 360)
    expect(a.find((x) => x.code === 'primera-sesion')?.unlockedOn).toBe('2026-07-30')
  })

  it('fecha el umbral de horas en el día en que la suma lo cruzó', () => {
    const sessions = [s('2026-07-01', 300), s('2026-07-02', 200), s('2026-07-03', 200)]
    const a = computeAchievements(sessions, noMilestones, '2026-08-08', 360)
    // 300 + 200 = 500 < 600; el tercer bloque cruza las 10 h.
    expect(a.find((x) => x.code === 'horas-10')?.unlockedOn).toBe('2026-07-03')
    expect(a.find((x) => x.code === 'horas-50')?.unlockedOn).toBeNull()
  })

  it('la racha de 7 se fecha el día en que se completó, no hoy', () => {
    const week = Array.from({ length: 7 }, (_, i) => s(addDays('2026-07-01', i), 30))
    const a = computeAchievements(week, noMilestones, '2026-08-08', 360)
    expect(a.find((x) => x.code === 'racha-7')?.unlockedOn).toBe('2026-07-07')
    expect(a.find((x) => x.code === 'racha-30')?.unlockedOn).toBeNull()
  })

  it('la meta semanal se desbloquea con cualquier semana que la haya alcanzado', () => {
    const a = computeAchievements([s('2026-07-06', 400)], noMilestones, '2026-08-08', 360)
    expect(a.find((x) => x.code === 'meta-semanal')?.unlockedOn).toBe('2026-07-06')
  })

  it('los logros del temario siguen el orden de cierre de los hitos', () => {
    const milestones = [
      { area: 'A', status: 'hecho' as const, completedOn: '2026-07-10' },
      { area: 'A', status: 'hecho' as const, completedOn: '2026-07-05' },
      { area: 'B', status: 'pendiente' as const, completedOn: null },
      { area: 'B', status: 'pendiente' as const, completedOn: null },
    ]
    const a = computeAchievements([], milestones, '2026-08-08', 360)
    expect(a.find((x) => x.code === 'primer-hito')?.unlockedOn).toBe('2026-07-05')
    expect(a.find((x) => x.code === 'medio-temario')?.unlockedOn).toBe('2026-07-10')
    expect(a.find((x) => x.code === 'temario-completo')?.unlockedOn).toBeNull()
  })

  it('sin datos ningún logro queda desbloqueado y los códigos son únicos', () => {
    const a = computeAchievements([], noMilestones, '2026-08-08', 360)
    expect(a.every((x) => x.unlockedOn === null)).toBe(true)
    expect(new Set(a.map((x) => x.code)).size).toBe(a.length)
  })

  it('el progreso de los bloqueados nunca pasa del objetivo', () => {
    const a = computeAchievements([s('2026-08-08', 90)], noMilestones, '2026-08-08', 360)
    expect(a.every((x) => x.progress.current <= x.progress.target)).toBe(true)
  })
})

describe('formato', () => {
  it('escribe minutos en horas legibles', () => {
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(60)).toBe('1h')
    expect(formatMinutes(150)).toBe('2h 30m')
  })
})
