// Motor de chaos engineering: decide si un request debe sufrir un fallo
// inyectado según los flags activos en BD.
//
// Principios de seguridad (el caos jamás puede volverse un incidente real):
//  - Fail-open: si la BD no responde o algo lanza, el request pasa limpio.
//  - TTL obligatorio: ningún flag vive más de MAX_TTL_S; expirado = inerte.
//  - Rutas protegidas: /admin, /api/admin y /api/auth NUNCA reciben caos
//    (siempre puedes entrar al panel y pulsar PÁNICO).
//  - Lectura cacheada (CACHE_MS): sin flags activos el costo por request es
//    una consulta cada pocos segundos por instancia, no una por request.

import { and, eq, gt } from 'drizzle-orm'
import { db } from '../db'
import { chaosFlags } from '../db/schema'

export type ChaosKind = 'latency' | 'error500' | 'kill_service'
export const CHAOS_KINDS: ChaosKind[] = ['latency', 'error500', 'kill_service']

export const CHAOS_KIND_LABELS: Record<ChaosKind, string> = {
  latency: 'Latencia extra',
  error500: 'HTTP 500',
  kill_service: 'Servicio caído (503)',
}

export type ChaosFlag = {
  id: number
  kind: ChaosKind
  targetRoute: string
  param: number | null
  expiresAt: Date
}

export const MAX_TTL_S = 15 * 60
export const MAX_LATENCY_MS = 10_000
const CACHE_MS = 5_000

const PROTECTED_PREFIXES = ['/admin', '/api/admin', '/api/auth']

export const isProtectedRoute = (path: string): boolean =>
  PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))

/** ¿El flag aplica a esta ruta? Coincidencia exacta o prefijo con comodín final. */
export function routeMatches(target: string, path: string): boolean {
  if (target.endsWith('/*')) {
    const prefix = target.slice(0, -2)
    return path === prefix || path.startsWith(`${prefix}/`)
  }
  if (target.endsWith('*')) return path.startsWith(target.slice(0, -1))
  return path === target
}

/** Primer flag vigente que aplica a la ruta (las protegidas nunca reciben caos). */
export function pickChaos(flags: ChaosFlag[], path: string, now = new Date()): ChaosFlag | null {
  if (isProtectedRoute(path)) return null
  return flags.find((f) => f.expiresAt > now && routeMatches(f.targetRoute, path)) ?? null
}

/** Acota el TTL pedido al máximo permitido. Devuelve la fecha de expiración. */
export function clampExpiry(ttlSeconds: number, now = new Date()): Date {
  const ttl = Math.min(Math.max(Math.floor(ttlSeconds) || 0, 5), MAX_TTL_S)
  return new Date(now.getTime() + ttl * 1000)
}

// Cache por instancia de los flags activos.
let cache: { flags: ChaosFlag[]; fetchedAt: number } = { flags: [], fetchedAt: 0 }

/** Fuerza relectura en el próximo request (la usa el panel al crear/apagar flags). */
export const invalidateChaosCache = (): void => {
  cache = { flags: [], fetchedAt: 0 }
}

async function activeFlags(): Promise<ChaosFlag[]> {
  const now = Date.now()
  if (now - cache.fetchedAt < CACHE_MS) return cache.flags
  const rows = await db
    .select()
    .from(chaosFlags)
    .where(and(eq(chaosFlags.active, true), gt(chaosFlags.expiresAt, new Date(now))))
  cache = { flags: rows as ChaosFlag[], fetchedAt: now }
  return cache.flags
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Punto de entrada del middleware. Devuelve una Response si el request debe
 * fallar, o null si debe continuar (aplicando latencia si corresponde).
 * NUNCA lanza: cualquier error interno = sin caos (fail-open).
 */
export async function maybeChaos(path: string): Promise<Response | null> {
  try {
    const flag = pickChaos(await activeFlags(), path)
    if (!flag) return null

    if (flag.kind === 'latency') {
      await sleep(Math.min(flag.param ?? 2000, MAX_LATENCY_MS))
      return null
    }
    const body = { error: 'chaos-injected', kind: flag.kind, flag: flag.id }
    if (flag.kind === 'error500') {
      return new Response(JSON.stringify(body), { status: 500, headers: { 'Content-Type': 'application/json', 'X-Chaos': 'error500' } })
    }
    return new Response(JSON.stringify(body), { status: 503, headers: { 'Content-Type': 'application/json', 'X-Chaos': 'kill_service', 'Retry-After': '60' } })
  } catch {
    return null
  }
}
