// Motor del tracker de aprendizaje (/admin/aprendizaje). Módulo PURO: no
// importa ../db ni node:*, así que se puede testear sin base de datos y, si
// más adelante conviene recalcular racha y meta en el cliente sin recargar,
// vale tal cual desde un <script> de la página.
//
// Todo el cálculo se hace sobre claves de día 'YYYY-MM-DD', nunca sobre
// timestamps: una racha es un hecho del calendario, no del reloj. La zona es
// fija (Bogotá) porque el servidor corre en UTC y una sesión registrada a las
// 8 de la noche caería en el día siguiente, partiendo la racha justo cuando
// más motiva mantenerla.

export const TRACKER_TZ = 'America/Bogota'

export type DayKey = string // 'YYYY-MM-DD'

export type SkillSessionInput = {
  day: DayKey
  minutes: number
}

export type MilestoneInput = {
  area: string
  status: 'pendiente' | 'en_curso' | 'hecho'
  completedOn?: DayKey | null
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TRACKER_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Día calendario de una fecha en la zona del tracker. 'en-CA' ya da ISO. */
export function dayKeyOf(date: Date = new Date()): DayKey {
  return dayFormatter.format(date)
}

/** Aritmética de calendario en UTC: la clave ya es una fecha sin hora. */
export function addDays(day: DayKey, n: number): DayKey {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function diffDays(from: DayKey, to: DayKey): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

export function isValidDayKey(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const d = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day
}

/** Lunes de la semana a la que pertenece `day`. Semana ISO: lunes a domingo. */
export function startOfWeek(day: DayKey): DayKey {
  const d = new Date(`${day}T00:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7 // 0 = lunes
  return addDays(day, -dow)
}

/** Minutos por día, sumando las sesiones que cayeron en la misma fecha. */
export function minutesByDay(sessions: SkillSessionInput[]): Map<DayKey, number> {
  const map = new Map<DayKey, number>()
  for (const s of sessions) {
    map.set(s.day, (map.get(s.day) ?? 0) + Math.max(0, s.minutes))
  }
  return map
}

export type Streak = {
  current: number
  record: number
  lastActive: DayKey | null
  activeToday: boolean
  /** La racha sigue viva pero hoy aún no hay sesión: es el empujón del día. */
  atRisk: boolean
}

/**
 * Racha con un día de gracia: si la última sesión fue ayer, la racha sigue
 * contando y se marca `atRisk`. Cortarla a las 00:00 del día siguiente
 * castigaría por no haber estudiado todavía en un día que apenas empieza.
 */
export function computeStreak(sessions: SkillSessionInput[], today: DayKey): Streak {
  const days = [...new Set(sessions.filter((s) => s.minutes > 0).map((s) => s.day))].sort()
  if (days.length === 0) {
    return { current: 0, record: 0, lastActive: null, activeToday: false, atRisk: false }
  }

  let record = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = diffDays(days[i - 1], days[i]) === 1 ? run + 1 : 1
    if (run > record) record = run
  }

  const lastActive = days[days.length - 1]
  const gap = diffDays(lastActive, today)
  let current = 0
  if (gap === 0 || gap === 1) {
    current = 1
    for (let i = days.length - 1; i > 0; i--) {
      if (diffDays(days[i - 1], days[i]) !== 1) break
      current++
    }
  }

  return {
    current,
    record: Math.max(record, current),
    lastActive,
    activeToday: gap === 0,
    atRisk: current > 0 && gap === 1,
  }
}

export type HeatmapCell = { day: DayKey; minutes: number; level: 0 | 1 | 2 | 3 | 4; future: boolean }
export type Heatmap = { weeks: HeatmapCell[][]; max: number; from: DayKey; to: DayKey }

/**
 * Rejilla tipo GitHub: columnas = semanas (lunes arriba), alineada de forma
 * que la última columna contenga `today`. Los niveles son cuartiles del máximo
 * de la ventana, no umbrales fijos: 30 min significan cosas distintas en una
 * semana floja que en una intensa.
 */
export function buildHeatmap(sessions: SkillSessionInput[], today: DayKey, weeks = 26): Heatmap {
  const byDay = minutesByDay(sessions)
  const lastMonday = startOfWeek(today)
  const from = addDays(lastMonday, -(weeks - 1) * 7)
  const to = addDays(lastMonday, 6)

  let max = 0
  for (let d = from; diffDays(d, to) >= 0; d = addDays(d, 1)) {
    const m = byDay.get(d) ?? 0
    if (m > max) max = m
  }

  const grid: HeatmapCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: HeatmapCell[] = []
    for (let i = 0; i < 7; i++) {
      const day = addDays(from, w * 7 + i)
      const minutes = byDay.get(day) ?? 0
      col.push({ day, minutes, level: heatLevel(minutes, max), future: diffDays(today, day) > 0 })
    }
    grid.push(col)
  }

  return { weeks: grid, max, from, to }
}

function heatLevel(minutes: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0
  if (max <= 0) return 0
  const ratio = minutes / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

export type WeeklyGoal = {
  weekStart: DayKey
  minutes: number
  goalMinutes: number
  pct: number
  remaining: number
  met: boolean
  /** Minutos/día que faltan para llegar a la meta antes del domingo. */
  paceNeeded: number
}

export function weeklyGoal(
  sessions: SkillSessionInput[],
  today: DayKey,
  goalMinutes: number
): WeeklyGoal {
  const weekStart = startOfWeek(today)
  const weekEnd = addDays(weekStart, 6)
  const minutes = sessions
    .filter((s) => diffDays(weekStart, s.day) >= 0 && diffDays(s.day, weekEnd) >= 0)
    .reduce((acc, s) => acc + Math.max(0, s.minutes), 0)

  const remaining = Math.max(0, goalMinutes - minutes)
  const daysLeft = Math.max(1, diffDays(today, weekEnd) + 1)

  return {
    weekStart,
    minutes,
    goalMinutes,
    pct: goalMinutes > 0 ? Math.min(100, Math.round((minutes / goalMinutes) * 100)) : 0,
    remaining,
    met: goalMinutes > 0 && minutes >= goalMinutes,
    paceNeeded: Math.ceil(remaining / daysLeft),
  }
}

export type Totals = {
  totalMinutes: number
  sessionCount: number
  activeDays: number
  avgPerActiveDay: number
  last30Minutes: number
  firstDay: DayKey | null
}

export function totals(sessions: SkillSessionInput[], today: DayKey): Totals {
  const totalMinutes = sessions.reduce((acc, s) => acc + Math.max(0, s.minutes), 0)
  const days = new Set(sessions.filter((s) => s.minutes > 0).map((s) => s.day))
  const cutoff = addDays(today, -29)
  const last30Minutes = sessions
    .filter((s) => diffDays(cutoff, s.day) >= 0)
    .reduce((acc, s) => acc + Math.max(0, s.minutes), 0)
  const sorted = [...days].sort()

  return {
    totalMinutes,
    sessionCount: sessions.length,
    activeDays: days.size,
    avgPerActiveDay: days.size > 0 ? Math.round(totalMinutes / days.size) : 0,
    last30Minutes,
    firstDay: sorted[0] ?? null,
  }
}

export type AreaProgress = { area: string; total: number; done: number; inProgress: number; pct: number }

export function milestoneProgress(milestones: MilestoneInput[]): {
  areas: AreaProgress[]
  total: number
  done: number
  pct: number
} {
  const byArea = new Map<string, AreaProgress>()
  for (const m of milestones) {
    const entry = byArea.get(m.area) ?? { area: m.area, total: 0, done: 0, inProgress: 0, pct: 0 }
    entry.total++
    if (m.status === 'hecho') entry.done++
    if (m.status === 'en_curso') entry.inProgress++
    byArea.set(m.area, entry)
  }
  const areas = [...byArea.values()].map((a) => ({
    ...a,
    pct: a.total > 0 ? Math.round((a.done / a.total) * 100) : 0,
  }))
  const total = milestones.length
  const done = milestones.filter((m) => m.status === 'hecho').length

  return { areas, total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}

export type Achievement = {
  code: string
  title: string
  description: string
  icon: string
  unlockedOn: DayKey | null
  /** Cuánto falta, en la unidad del logro, para los que siguen bloqueados. */
  progress: { current: number; target: number }
}

/**
 * Los logros se DERIVAN de las sesiones y los hitos, no se persisten. Una
 * tabla de badges desbloqueados se desincroniza en cuanto se borra una sesión
 * mal registrada, y obliga a escribir en cada POST; recalcular sobre datos ya
 * cargados cuesta nada y siempre dice la verdad.
 */
export function computeAchievements(
  sessions: SkillSessionInput[],
  milestones: MilestoneInput[],
  today: DayKey,
  goalMinutes: number
): Achievement[] {
  const sorted = [...sessions].filter((s) => s.minutes > 0).sort((a, b) => a.day.localeCompare(b.day))
  const streak = computeStreak(sessions, today)
  const progress = milestoneProgress(milestones)
  const totalMinutes = sorted.reduce((acc, s) => acc + s.minutes, 0)

  // Día en que la suma acumulada cruzó cada umbral de horas.
  const hourThresholds = [10, 50, 100]
  const crossedOn = new Map<number, DayKey>()
  let acc = 0
  for (const s of sorted) {
    const before = acc
    acc += s.minutes
    for (const h of hourThresholds) {
      if (before < h * 60 && acc >= h * 60) crossedOn.set(h, s.day)
    }
  }

  // Día en que se alcanzó por primera vez una racha de N días.
  const streakReachedOn = (n: number): DayKey | null => {
    const days = [...new Set(sorted.map((s) => s.day))].sort()
    let run = 0
    for (let i = 0; i < days.length; i++) {
      run = i > 0 && diffDays(days[i - 1], days[i]) === 1 ? run + 1 : 1
      if (run >= n) return days[i]
    }
    return null
  }

  // Primera semana en la que se cumplió la meta.
  const weekMet = (): DayKey | null => {
    if (goalMinutes <= 0) return null
    const byWeek = new Map<DayKey, number>()
    for (const s of sorted) {
      const w = startOfWeek(s.day)
      byWeek.set(w, (byWeek.get(w) ?? 0) + s.minutes)
    }
    const hit = [...byWeek.entries()].filter(([, m]) => m >= goalMinutes).map(([w]) => w).sort()
    return hit[0] ?? null
  }

  const doneMilestones = milestones
    .filter((m) => m.status === 'hecho' && m.completedOn)
    .map((m) => m.completedOn as DayKey)
    .sort()

  const nthMilestoneDay = (n: number): DayKey | null => doneMilestones[n - 1] ?? null
  const halfTarget = Math.ceil(progress.total / 2)

  return [
    {
      code: 'primera-sesion',
      title: 'Primera sesión',
      description: 'Registraste tu primer bloque de práctica. Empezar es la parte que casi nadie hace.',
      icon: 'spark',
      unlockedOn: sorted[0]?.day ?? null,
      progress: { current: Math.min(sorted.length, 1), target: 1 },
    },
    {
      code: 'racha-7',
      title: 'Semana sin fallar',
      description: 'Siete días seguidos de práctica.',
      icon: 'flame',
      unlockedOn: streakReachedOn(7),
      progress: { current: Math.min(streak.record, 7), target: 7 },
    },
    {
      code: 'racha-30',
      title: 'Mes sin fallar',
      description: 'Treinta días seguidos. Aquí ya no es motivación, es hábito.',
      icon: 'flame',
      unlockedOn: streakReachedOn(30),
      progress: { current: Math.min(streak.record, 30), target: 30 },
    },
    {
      code: 'meta-semanal',
      title: 'Meta cumplida',
      description: 'Una semana completa alcanzando la meta de horas.',
      icon: 'target',
      unlockedOn: weekMet(),
      progress: { current: weekMet() ? 1 : 0, target: 1 },
    },
    {
      code: 'horas-10',
      title: '10 horas',
      description: 'Diez horas acumuladas de práctica deliberada.',
      icon: 'clock',
      unlockedOn: crossedOn.get(10) ?? null,
      progress: { current: Math.min(totalMinutes, 600), target: 600 },
    },
    {
      code: 'horas-50',
      title: '50 horas',
      description: 'Cincuenta horas. Ya no estás mirando el lenguaje desde afuera.',
      icon: 'clock',
      unlockedOn: crossedOn.get(50) ?? null,
      progress: { current: Math.min(totalMinutes, 3000), target: 3000 },
    },
    {
      code: 'horas-100',
      title: '100 horas',
      description: 'Cien horas: el umbral donde el stack deja de ser "nuevo".',
      icon: 'clock',
      unlockedOn: crossedOn.get(100) ?? null,
      progress: { current: Math.min(totalMinutes, 6000), target: 6000 },
    },
    {
      code: 'primer-hito',
      title: 'Primer hito',
      description: 'Cerraste el primer punto del temario.',
      icon: 'check',
      unlockedOn: nthMilestoneDay(1),
      progress: { current: Math.min(progress.done, 1), target: 1 },
    },
    {
      code: 'medio-temario',
      title: 'Media ruta',
      description: 'La mitad del temario del track, cerrada.',
      icon: 'route',
      unlockedOn: halfTarget > 0 ? nthMilestoneDay(halfTarget) : null,
      progress: { current: progress.done, target: Math.max(halfTarget, 1) },
    },
    {
      code: 'temario-completo',
      title: 'Ruta completa',
      description: 'Todos los hitos del track, cerrados.',
      icon: 'trophy',
      unlockedOn: progress.total > 0 ? nthMilestoneDay(progress.total) : null,
      progress: { current: progress.done, target: Math.max(progress.total, 1) },
    },
  ]
}

export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest}m`
  if (rest === 0) return `${h}h`
  return `${h}h ${rest}m`
}
