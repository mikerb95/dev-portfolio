// Lista de bloqueo por IP con TTL obligatorio. El middleware la consulta en el
// camino caliente, así que la cacheamos en memoria (TTL corto) para no ir a
// Turso en cada request. Fail-open: si la lectura falla, NO se bloquea a nadie.
//
// Salvaguardas contra auto-DoS y contra dejar fuera al admin:
//  - Allowlist (SECURITY_IP_ALLOWLIST) nunca se bloquea, ni manual ni auto.
//  - TTL obligatorio: los bloqueos expiran solos; el cron purga los vencidos.
//  - Escalado de reincidencia: 1h → 24h → 7d (lo aplica el cron en Fase 2).
// Ver docs/plan-security-observability.md.

import { and, gt, sql } from 'drizzle-orm'
import { db } from '../../db'
import { blockedIps } from '../../db/schema'

const CACHE_TTL_MS = 30_000

// Escalones de TTL por reincidencia (segundos).
export const BLOCK_TTL_STEPS_SEC = [3600, 86_400, 604_800] as const

/** IPs que NUNCA se bloquean (la del admin, rangos de confianza). */
function allowlist(): Set<string> {
  const raw = (import.meta.env.SECURITY_IP_ALLOWLIST as string | undefined) ?? ''
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

export function isAllowlisted(ip: string | null | undefined): boolean {
  if (!ip) return false
  return allowlist().has(ip)
}

// Cache por instancia del conjunto de IPs bloqueadas vigentes.
let cache: { ips: Set<string>; fetchedAt: number } = { ips: new Set(), fetchedAt: 0 }

/** Fuerza relectura en la próxima consulta (la usa el panel al bloquear/desbloquear). */
export function invalidateBlocklistCache(): void {
  cache = { ips: new Set(), fetchedAt: 0 }
}

async function activeBlockedSet(now = Date.now()): Promise<Set<string>> {
  if (now - cache.fetchedAt < CACHE_TTL_MS) return cache.ips
  const rows = await db
    .select({ ip: blockedIps.ip })
    .from(blockedIps)
    .where(gt(blockedIps.expiresAt, new Date(now)))
  cache = { ips: new Set(rows.map((r) => r.ip)), fetchedAt: now }
  return cache.ips
}

/**
 * ¿La IP está bloqueada ahora mismo? Fail-open (false) ante cualquier error, y
 * las IPs de la allowlist nunca cuentan como bloqueadas.
 */
export async function isBlocked(ip: string | null | undefined): Promise<boolean> {
  if (!ip || isAllowlisted(ip)) return false
  try {
    return (await activeBlockedSet()).has(ip)
  } catch {
    return false
  }
}

export type BlockInput = {
  ip: string
  reason?: string
  ruleId?: string
  /** TTL en segundos. Obligatorio en la práctica; por defecto el primer escalón. */
  ttlSec?: number
  source?: 'auto' | 'manual'
}

/**
 * Bloquea (o re-bloquea escalando el TTL) una IP. Respeta la allowlist. Devuelve
 * false si la IP está en la allowlist o es inválida. NUNCA lanza hacia fuera si
 * `swallow` está activo (uso desde el cron).
 */
export async function blockIp(input: BlockInput, now = new Date()): Promise<boolean> {
  const { ip, reason, ruleId, source = 'manual' } = input
  if (!ip || isAllowlisted(ip)) return false
  const ttlSec = input.ttlSec ?? BLOCK_TTL_STEPS_SEC[0]
  const expiresAt = new Date(now.getTime() + ttlSec * 1000)
  await db
    .insert(blockedIps)
    .values({ ip, reason, ruleId, hits: 1, createdAt: now, expiresAt, source })
    .onConflictDoUpdate({
      target: blockedIps.ip,
      set: {
        hits: sql`${blockedIps.hits} + 1`,
        reason: reason ?? sql`${blockedIps.reason}`,
        ruleId: ruleId ?? sql`${blockedIps.ruleId}`,
        expiresAt,
      },
    })
  invalidateBlocklistCache()
  return true
}

/**
 * Bloquea una IP escalando el TTL según sus reincidencias previas (1h → 24h →
 * 7d). Lee los `hits` de la fila persistente (aunque el bloqueo anterior haya
 * expirado, la fila sobrevive hasta que el cron la purga) para elegir el
 * escalón. Es la lógica que compartían el cron (auto-block) y el bloqueo inline
 * de honeypots del middleware: un único punto para no divergir. Respeta la
 * allowlist vía `blockIp`. Puede lanzar (la consulta/insert) → el llamador
 * decide si lo traga (fail-open).
 */
export async function blockIpEscalated(
  input: Omit<BlockInput, 'ttlSec'>,
  now = new Date()
): Promise<boolean> {
  if (!input.ip || isAllowlisted(input.ip)) return false
  const [prev] = await db
    .select({ hits: blockedIps.hits })
    .from(blockedIps)
    .where(sql`${blockedIps.ip} = ${input.ip}`)
    .limit(1)
  return blockIp({ ...input, ttlSec: escalatedTtlSec(prev?.hits ?? 0) }, now)
}

/** Desbloquea una IP (borra la fila). Idempotente. */
export async function unblockIp(ip: string): Promise<void> {
  await db.delete(blockedIps).where(sql`${blockedIps.ip} = ${ip}`)
  invalidateBlocklistCache()
}

/** Bloqueos vigentes (para el panel admin). */
export async function listActiveBlocks(now = Date.now()) {
  return db
    .select()
    .from(blockedIps)
    .where(gt(blockedIps.expiresAt, new Date(now)))
    .orderBy(sql`${blockedIps.createdAt} desc`)
}

/**
 * Escalón de TTL para la n-ésima reincidencia (0-indexado): 1h, 24h, 7d, y de
 * ahí en adelante 7d. Puro y testeable; lo usa el auto-block del cron (Fase 2).
 */
export function escalatedTtlSec(priorHits: number): number {
  const i = Math.min(Math.max(priorHits, 0), BLOCK_TTL_STEPS_SEC.length - 1)
  return BLOCK_TTL_STEPS_SEC[i]!
}
