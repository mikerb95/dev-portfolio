// Datos de la bitácora de /log: en qué proyectos se fue el mes, qué tipo de
// cambio es cada commit y qué queda tras un filtro. Módulo puro.

import { TIPOS, leerCommit, type TipoCommit } from '../actividad'

export type ItemFeed = {
  repo: string
  repoFull: string
  message: string
  sha: string
  timestamp: string
  type: 'commit' | 'pr_merged'
}

export type Segmento = { clave: string; n: number; frac: number; privado: boolean }

/** Clave del segmento de lo privado: no puede chocar con un nombre de repo (GitHub no admite espacios). */
export const CLAVE_PRIVADOS = ' privados'

/**
 * Reparto de los commits del mes por proyecto. Lo público va por nombre; lo
 * privado es UN solo segmento sin nombre, con la diferencia entre el total que
 * publica el endpoint y los commits públicos de la lista. Los PR no entran: el
 * total es de commits.
 */
export function mezclaRepos(feed: ItemFeed[], totalCommits: number): Segmento[] {
  const cuenta = new Map<string, number>()
  let publicos = 0
  for (const f of feed) {
    if (f.type !== 'commit') continue
    publicos++
    cuenta.set(f.repo, (cuenta.get(f.repo) ?? 0) + 1)
  }
  const privados = Math.max(0, totalCommits - publicos)
  const total = publicos + privados
  if (total === 0) return []
  const segs: Segmento[] = [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([clave, n]) => ({ clave, n, frac: n / total, privado: false }))
  if (privados > 0) segs.push({ clave: CLAVE_PRIVADOS, n: privados, frac: privados / total, privado: true })
  return segs
}

export type Filtro = { repo: string | null; tipo: TipoCommit | null }

export function tipoDe(f: ItemFeed): TipoCommit | 'pr' {
  return f.type === 'pr_merged' ? 'pr' : leerCommit(f.message).tipo
}

export function filtrar(feed: ItemFeed[], filtro: Filtro): ItemFeed[] {
  return feed.filter(
    (f) => (!filtro.repo || f.repo === filtro.repo) && (!filtro.tipo || tipoDe(f) === filtro.tipo),
  )
}

/** Commits por tipo dentro de un proyecto (o de todos), en el orden fijo de TIPOS. Sin los tipos vacíos. */
export function conteoTipos(feed: ItemFeed[], repo: string | null): { tipo: TipoCommit; n: number }[] {
  const cuenta = new Map<TipoCommit, number>()
  for (const f of feed) {
    if (f.type !== 'commit' || (repo && f.repo !== repo)) continue
    const t = leerCommit(f.message).tipo
    cuenta.set(t, (cuenta.get(t) ?? 0) + 1)
  }
  return TIPOS.filter((t) => cuenta.has(t)).map((t) => ({ tipo: t, n: cuenta.get(t)! }))
}

/** Lee `?repo=` y `?tipo=` sin fiarse de ellos: solo valen si existen en los datos. */
export function filtroDeUrl(params: URLSearchParams, repos: string[]): Filtro {
  const repo = params.get('repo')
  const tipo = params.get('tipo')
  return {
    repo: repo && repos.includes(repo) ? repo : null,
    tipo: tipo && (TIPOS as readonly string[]).includes(tipo) ? (tipo as TipoCommit) : null,
  }
}

/** Enlace al commit en GitHub. GitHub resuelve el sha corto; solo se enlazan repos públicos. */
export const enlaceCommit = (f: ItemFeed) =>
  f.type === 'commit' && f.sha ? `https://github.com/${f.repoFull}/commit/${f.sha}` : `https://github.com/${f.repoFull}`
