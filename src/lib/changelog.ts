// Changelog público (/changelog): de los commits de main a semanas legibles.
//
// Módulo PURO: sin red ni base, para poder probarlo entero. La lectura de
// GitHub vive en changelog-github.ts.
//
// Qué se publica: solo lo que un visitante entiende como cambio del sitio
// (feat, fix, perf). Lo interno (chore, ci, refactor, test, docs, merges) no
// sale. Y un commit cuyo mensaje roce algo sensible se descarta entero en vez
// de recortarse: el repo es público, pero la página lo pone en un escaparate,
// y un nombre de variable de entorno o una ruta señuelo no tienen por qué
// estar a un clic de la portada.

export type TipoCambio = 'feat' | 'fix' | 'perf'

export const TIPOS_VISIBLES: readonly TipoCambio[] = ['feat', 'fix', 'perf']

export type CommitCrudo = { sha: string; mensaje: string; fecha: string }

export type Cambio = { tipo: TipoCambio; alcance: string | null; titulo: string; sha: string; fecha: string }

export type Semana = {
  /** Lunes de la semana (YYYY-MM-DD, hora de Bogotá). */
  inicio: string
  cambios: Cambio[]
  conteo: Record<TipoCambio, number>
}

// Conventional commits: `tipo(alcance)!: título`. Solo la primera línea.
const PATRON = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/

const SENSIBLE = [
  /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/, // nombres de variables de entorno (CRON_SECRET, TURSO_AUTH_TOKEN)
  /\b(secret|secreto|token|password|contraseña|api[ _-]?key|credencial)/i,
  /\b(honeypot|señuelo|trampa|wp-login|xmlrpc)/i, // nada de manual de ataque (OPSEC)
  /(^|[^\w])\.(env|git)\b/i, // archivos ocultos: el \b no sirve delante de un punto
  /\b\d{1,3}(\.\d{1,3}){3}\b/, // una IP
]

export function esSensible(mensaje: string): boolean {
  return SENSIBLE.some((p) => p.test(mensaje))
}

/** Lee la primera línea de un commit. Null si no es un cambio publicable. */
export function leerCommit(c: CommitCrudo): Cambio | null {
  const linea = c.mensaje.split('\n')[0]!.trim()
  const m = PATRON.exec(linea)
  if (!m) return null
  const tipo = m[1]!.toLowerCase()
  if (!(TIPOS_VISIBLES as readonly string[]).includes(tipo)) return null
  if (esSensible(c.mensaje)) return null
  const titulo = m[3]!.trim()
  if (!titulo) return null
  return {
    tipo: tipo as TipoCambio,
    alcance: m[2]?.trim() || null,
    titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1),
    sha: c.sha,
    fecha: c.fecha,
  }
}

const BOGOTA_MS = -5 * 3_600_000 // Colombia no tiene horario de verano

/** Lunes (YYYY-MM-DD) de la semana de una fecha, en hora de Bogotá. */
export function lunesDe(fechaIso: string): string {
  const local = new Date(new Date(fechaIso).getTime() + BOGOTA_MS)
  const dia = (local.getUTCDay() + 6) % 7 // 0 = lunes
  local.setUTCDate(local.getUTCDate() - dia)
  return local.toISOString().slice(0, 10)
}

/**
 * Agrupa por semana, de la más reciente a la más vieja. Dentro de cada semana,
 * el título repetido sale una vez (el auto-commit genera a veces el mismo
 * mensaje para dos cambios seguidos) y los cambios van del más nuevo al más viejo.
 */
export function agruparPorSemana(commits: CommitCrudo[], maxSemanas = 8): Semana[] {
  const porSemana = new Map<string, Cambio[]>()
  const vistos = new Map<string, Set<string>>()
  const ordenados = [...commits].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))
  for (const c of ordenados) {
    const cambio = leerCommit(c)
    if (!cambio) continue
    const semana = lunesDe(cambio.fecha)
    const clave = cambio.titulo.toLowerCase()
    const titulos = vistos.get(semana) ?? new Set<string>()
    if (titulos.has(clave)) continue
    titulos.add(clave)
    vistos.set(semana, titulos)
    const lista = porSemana.get(semana) ?? []
    lista.push(cambio)
    porSemana.set(semana, lista)
  }
  return [...porSemana.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, maxSemanas)
    .map(([inicio, cambios]) => ({
      inicio,
      cambios,
      conteo: {
        feat: cambios.filter((c) => c.tipo === 'feat').length,
        fix: cambios.filter((c) => c.tipo === 'fix').length,
        perf: cambios.filter((c) => c.tipo === 'perf').length,
      },
    }))
}
