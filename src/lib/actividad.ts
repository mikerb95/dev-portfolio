// Reglas de la actividad de GitHub que publica /log: cómo se agrupan los
// commits en sesiones de trabajo profundo, en qué día cae cada uno y qué tipo
// de cambio es. Módulo puro e isomorfo: lo usan el endpoint
// /api/github/activity (que calcula las cifras) y el reloj de /log (que las
// dibuja). Que los dos lados corran exactamente la misma función es lo que
// garantiza que las horas del reloj sumen lo mismo que la cifra de arriba.

export const MINUTO_MS = 60_000
export const DIA_MS = 86_400_000

/**
 * Resolución con la que se publica la hora de un commit. Las cifras necesitan
 * la hora de TODOS los commits, también los de repos privados, pero no hace
 * falta publicarla al segundo: cinco minutos bastan para dibujar la sesión y
 * no dejan casar un punto con un commit concreto de otro sitio.
 */
export const MARCA_MS = 5 * MINUTO_MS

/** Dos commits separados por hasta 90 min pertenecen a la misma sesión. */
export const HUECO_SESION_MIN = 90

/**
 * Minutos que cada sesión suma antes de su primer commit: el primer commit
 * llega después de un rato de trabajo, no al sentarse. También es el mínimo de
 * una sesión de un solo commit.
 */
export const PREVIO_SESION_MIN = 30

/**
 * Colombia no tiene horario de verano: UTC-5 fijo todo el año. Los días del
 * reloj, la racha y el gráfico se cuentan en hora de Bogotá, que es donde se
 * trabaja; contarlos en UTC partía la noche en dos (un commit a las 8 p. m.
 * caía en el día siguiente).
 */
export const DESFASE_BOGOTA_MS = -5 * 3_600_000

export const redondearMarca = (t: number) => Math.round(t / MARCA_MS) * MARCA_MS

/** Índice de día (entero) en hora de Bogotá. Días consecutivos, índices consecutivos. */
export const diaBogota = (t: number) => Math.floor((t + DESFASE_BOGOTA_MS) / DIA_MS)

/** Instante UTC en que empieza el día `dia` de Bogotá. */
export const inicioDiaBogota = (dia: number) => dia * DIA_MS - DESFASE_BOGOTA_MS

/** Hora del día (0-24, con decimales) en Bogotá. */
export const horaBogota = (t: number) => (t - inicioDiaBogota(diaBogota(t))) / 3_600_000

export type Sesion = {
  /** Primer commit de la sesión (sin los 30 min previos). */
  inicio: number
  /** Último commit de la sesión. */
  fin: number
  commits: number
}

/** Agrupa marcas de tiempo en sesiones: un hueco de más de 90 min corta. */
export function agruparSesiones(marcas: number[]): Sesion[] {
  const orden = marcas.filter(Number.isFinite).sort((a, b) => a - b)
  const sesiones: Sesion[] = []
  for (const t of orden) {
    const ultima = sesiones.at(-1)
    if (ultima && (t - ultima.fin) / MINUTO_MS <= HUECO_SESION_MIN) {
      ultima.fin = t
      ultima.commits++
    } else {
      sesiones.push({ inicio: t, fin: t, commits: 1 })
    }
  }
  return sesiones
}

export const minutosSesion = (s: Sesion) => (s.fin - s.inicio) / MINUTO_MS + PREVIO_SESION_MIN

/** Una sesión cuenta en una ventana si terminó dentro de ella. */
export const cuentaEnVentana = (s: Sesion, ahora: number, ventanaMs: number) => s.fin >= ahora - ventanaMs

export const redondearHoras = (h: number) => Math.round(h * 10) / 10

export function horasEnVentana(sesiones: Sesion[], ahora: number, ventanaMs: number): number {
  const min = sesiones
    .filter((s) => cuentaEnVentana(s, ahora, ventanaMs))
    .reduce((acc, s) => acc + minutosSesion(s), 0)
  return redondearHoras(min / 60)
}

export type DeepWork = { weekHours: number; monthHours: number; sessions: number }

export function trabajoProfundo(marcas: number[], ahora: number): DeepWork {
  const sesiones = agruparSesiones(marcas)
  return {
    weekHours: horasEnVentana(sesiones, ahora, 7 * DIA_MS),
    monthHours: horasEnVentana(sesiones, ahora, 30 * DIA_MS),
    sessions: sesiones.length,
  }
}

/**
 * Días seguidos con al menos un commit hasta hoy. Si hoy todavía no hay
 * ninguno la racha no se corta: se cuenta desde ayer (el día no ha terminado).
 */
export function racha(marcas: number[], ahora: number): { dias: number; desde: number | null } {
  const activos = new Set(marcas.map(diaBogota))
  const hoy = diaBogota(ahora)
  let dia = activos.has(hoy) ? hoy : hoy - 1
  let dias = 0
  while (activos.has(dia) && dias < 60) {
    dias++
    dia--
  }
  return { dias, desde: dias > 0 ? dia + 1 : null }
}

/** Actividad por día de Bogotá de los últimos `dias` días, el último es hoy. */
export function porDia(marcas: number[], ahora: number, dias = 14): number[] {
  const hoy = diaBogota(ahora)
  const cuenta = new Array<number>(dias).fill(0)
  for (const t of marcas) {
    const i = dias - 1 - (hoy - diaBogota(t))
    if (i >= 0 && i < dias) cuenta[i]++
  }
  return cuenta
}

// ── Tipo de cambio ─────────────────────────────────────────────────────────

export const TIPOS = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore', 'otro'] as const
export type TipoCommit = (typeof TIPOS)[number]

// Prefijos de Conventional Commits que no tienen tipo propio en la bitácora:
// se agrupan con el más cercano en vez de abrir una categoría de un commit.
const ALIAS: Record<string, TipoCommit> = {
  feature: 'feat',
  bugfix: 'fix',
  hotfix: 'fix',
  tests: 'test',
  doc: 'docs',
  style: 'chore',
  ci: 'chore',
  build: 'chore',
  deps: 'chore',
  revert: 'otro',
}

export type CommitLeido = { tipo: TipoCommit; alcance: string | null; texto: string; rompe: boolean }

/**
 * Lee la primera línea de un commit como Conventional Commit. Lo que no sigue
 * la convención queda como "otro" con el mensaje entero: se muestra tal cual,
 * sin adivinar un tipo.
 */
export function leerCommit(mensaje: string): CommitLeido {
  const m = /^([a-z]+)(?:\(([^)]{1,40})\))?(!)?:\s*(.+)$/i.exec(mensaje.trim())
  if (!m) return { tipo: 'otro', alcance: null, texto: mensaje.trim(), rompe: false }
  const prefijo = m[1].toLowerCase()
  const tipo = (TIPOS as readonly string[]).includes(prefijo) ? (prefijo as TipoCommit) : ALIAS[prefijo]
  if (!tipo) return { tipo: 'otro', alcance: null, texto: mensaje.trim(), rompe: false }
  return { tipo, alcance: m[2]?.trim() || null, texto: m[4].trim(), rompe: m[3] === '!' }
}
