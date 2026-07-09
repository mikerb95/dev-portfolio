// Rate limiter de dos capas para endpoints públicos y el paraguas global.
//
//  Capa 1 (memoria, por instancia): barata, corta ráfagas locales sin tocar la
//  DB. Si el contador local ya supera el límite, se bloquea sin consultar Turso.
//  Capa 2 (durable, Turso): estado compartido entre instancias. Solo se consulta
//  cuando el contador local entra en la "zona de peligro" (deferUntil), para no
//  escribir en la DB en cada request. Fail-open: si Turso no responde en
//  `timeoutMs`, se permite el request (nunca tumbamos el sitio por el limiter).
//
// Ventana fija (coincide con el esquema `rate_limit_buckets`: key/count/resetAt).
// Ver docs/plan-security-observability.md.

import { sql } from 'drizzle-orm'
import { db } from '../../db'
import { rateLimitBuckets } from '../../db/schema'

export type RateDecision = {
  allowed: boolean
  count: number
  limit: number
  /** true si la decisión consultó la capa durable (para métricas/tests). */
  durable: boolean
}

export type EnforceOptions = {
  limit: number
  windowMs: number
  /**
   * Fracción del límite [0,1) a partir de la cual se consulta la capa durable.
   * 0 → siempre consulta (endpoints de baja frecuencia). 0.8 → solo cuando el
   * contador local llega al 80% (paraguas global de alto tráfico).
   */
  deferUntil?: number
  /** Presupuesto de latencia de la consulta durable antes de fail-open. */
  timeoutMs?: number
}

// ── Capa 1: contador en memoria (ventana fija) ──────────────────────────────

type MemBucket = { count: number; resetAt: number }
const mem = new Map<string, MemBucket>()
const MEM_MAX_KEYS = 20_000

/** Incrementa y devuelve el estado local de la clave. Poda perezosa. */
export function memHit(key: string, windowMs: number, now = Date.now()): MemBucket {
  if (mem.size > MEM_MAX_KEYS) {
    for (const [k, b] of mem) if (now >= b.resetAt) mem.delete(k)
    if (mem.size > MEM_MAX_KEYS) mem.clear()
  }
  const b = mem.get(key)
  if (!b || now >= b.resetAt) {
    const fresh = { count: 1, resetAt: now + windowMs }
    mem.set(key, fresh)
    return fresh
  }
  b.count++
  return b
}

// ── Núcleo de decisión (puro, testeable) ────────────────────────────────────

/**
 * Decide si consultar la capa durable dado el estado local.
 * - Si el contador local ya supera el límite → bloqueo inmediato, sin DB.
 * - Si el contador local no alcanza la compuerta (limit*deferUntil) → permitir
 *   barato, sin DB.
 * - En otro caso → hay que consultar la capa durable.
 */
export function planDurableConsult(
  localCount: number,
  limit: number,
  deferUntil: number
): 'block' | 'allow' | 'consult' {
  if (localCount > limit) return 'block'
  const gate = Math.max(0, Math.floor(limit * clamp01(deferUntil)))
  if (localCount <= gate) return 'allow'
  return 'consult'
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(Math.max(n, 0), 0.99) : 0)

// ── Capa 2: contador durable en Turso (upsert atómico) ──────────────────────

/**
 * Incrementa atómicamente el contador durable de la clave y devuelve el total
 * dentro de la ventana. Un único UPSERT: si la ventana expiró, reinicia a 1.
 * Trabaja en segundos Unix (mismo formato que el resto del esquema Drizzle).
 */
async function durableHit(key: string, windowMs: number, now = Date.now()): Promise<number> {
  const nowSec = Math.floor(now / 1000)
  const resetSec = nowSec + Math.ceil(windowMs / 1000)
  const rows = await db
    .insert(rateLimitBuckets)
    .values({ key, count: 1, resetAt: new Date(resetSec * 1000) })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        count: sql`case when ${rateLimitBuckets.resetAt} <= ${nowSec} then 1 else ${rateLimitBuckets.count} + 1 end`,
        resetAt: sql`case when ${rateLimitBuckets.resetAt} <= ${nowSec} then ${resetSec} else ${rateLimitBuckets.resetAt} end`,
      },
    })
    .returning({ count: rateLimitBuckets.count })
  return rows[0]?.count ?? 1
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

/**
 * Punto de entrada: aplica el límite de dos capas a `key`. NUNCA lanza.
 * Devolver `allowed=false` significa "excede el límite".
 */
export async function enforceLimit(key: string, opts: EnforceOptions): Promise<RateDecision> {
  const { limit, windowMs, deferUntil = 0, timeoutMs = 150 } = opts
  const now = Date.now()
  const local = memHit(key, windowMs, now)

  const plan = planDurableConsult(local.count, limit, deferUntil)
  if (plan === 'block') return { allowed: false, count: local.count, limit, durable: false }
  if (plan === 'allow') return { allowed: true, count: local.count, limit, durable: false }

  try {
    const count = await withTimeout(durableHit(key, windowMs, now), timeoutMs)
    return { allowed: count <= limit, count, limit, durable: true }
  } catch {
    // Fail-open: si la capa durable falla, no bloqueamos por ella.
    return { allowed: true, count: local.count, limit, durable: false }
  }
}

/** Solo para tests: limpia el estado en memoria entre casos. */
export function _resetMem(): void {
  mem.clear()
}
