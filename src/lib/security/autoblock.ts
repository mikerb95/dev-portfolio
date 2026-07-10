// Auto-block: convierte eventos hostiles registrados en bloqueos temporales.
// Corre en el cron (NO inline en el request) para no escribir en el camino
// caliente y para poder aplicar salvaguardas globales (tope, allowlist, cap).
//
// Salvaguardas (ver docs/plan-security-observability.md):
//  - TTL escalonado por reincidencia (1h → 24h → 7d), nunca eterno.
//  - Allowlist respetada por blockIp (nunca bloquea al admin ni rangos de confianza).
//  - Tope de bloqueos activos: si se supera, NO se bloquea más y se marca overflow
//    (un ataque distribuido se maneja en capa 0 / WAF, no llenando la tabla).

import { and, gte, sql } from 'drizzle-orm'
import { db } from '../../db'
import { securityEvents, blockedIps } from '../../db/schema'
import { blockIp, escalatedTtlSec, isAllowlisted } from './blocklist'

export type AutoBlockOptions = {
  /** Ventana (min) para contar honeypots. Un solo hit basta para bloquear. */
  honeypotWindowMin?: number
  /** Ventana (min) para contar eventos de severidad alta/crítica. */
  highWindowMin?: number
  /** Nº de eventos high/critical en la ventana que dispara bloqueo. */
  highThreshold?: number
  /** Tope de IPs bloqueadas activas simultáneas. */
  maxActiveBlocks?: number
}

const DEFAULTS = {
  honeypotWindowMin: 30,
  highWindowMin: 10,
  highThreshold: 8,
  maxActiveBlocks: 500,
} satisfies Required<AutoBlockOptions>

export type IpCandidate = { ip: string; honeypot: number; high: number }
export type BlockDecision = { ip: string; reason: string; ruleId: string }

/**
 * Decide, de forma pura, qué IPs merecen bloqueo. Un honeypot tocado = bloqueo
 * inmediato (intención inequívoca); si no, una ráfaga de eventos high/critical
 * por encima del umbral. Excluye las ya bloqueadas y la allowlist.
 */
export function selectIpsToBlock(
  candidates: IpCandidate[],
  opts: {
    highThreshold: number
    alreadyBlocked: Set<string>
    allowlisted?: (ip: string) => boolean
  }
): BlockDecision[] {
  const isAllowed = opts.allowlisted ?? (() => false)
  const out: BlockDecision[] = []
  for (const c of candidates) {
    if (!c.ip || opts.alreadyBlocked.has(c.ip) || isAllowed(c.ip)) continue
    if (c.honeypot > 0) {
      out.push({ ip: c.ip, reason: 'honeypot tocado', ruleId: 'autoblock.honeypot' })
    } else if (c.high >= opts.highThreshold) {
      out.push({ ip: c.ip, reason: `ráfaga de ${c.high} eventos de alta severidad`, ruleId: 'autoblock.high' })
    }
  }
  return out
}

export type AutoBlockResult = { candidates: number; blocked: number; overflow: number }

/**
 * Ejecuta el auto-block: agrega eventos recientes por IP, decide y aplica los
 * bloqueos respetando el tope. Pensado para llamarse desde el cron. Devuelve un
 * resumen. Lanza solo si la consulta base falla (el cron lo captura).
 */
export async function runAutoBlock(now = new Date(), options?: AutoBlockOptions): Promise<AutoBlockResult> {
  const o = { ...DEFAULTS, ...options }
  const windowMin = Math.max(o.honeypotWindowMin, o.highWindowMin)
  const since = new Date(now.getTime() - windowMin * 60_000)
  const honeypotSince = new Date(now.getTime() - o.honeypotWindowMin * 60_000)
  const highSince = new Date(now.getTime() - o.highWindowMin * 60_000)

  // Agregado por IP: honeypots (en su ventana) y high/critical (en la suya).
  const rows = await db
    .select({
      ip: securityEvents.ip,
      honeypot: sql<number>`coalesce(sum(case when ${securityEvents.category} = 'honeypot' and ${securityEvents.at} >= ${Math.floor(honeypotSince.getTime() / 1000)} then ${securityEvents.hits} else 0 end), 0)`,
      high: sql<number>`coalesce(sum(case when ${securityEvents.severity} in ('high','critical') and ${securityEvents.at} >= ${Math.floor(highSince.getTime() / 1000)} then ${securityEvents.hits} else 0 end), 0)`,
    })
    .from(securityEvents)
    .where(and(gte(securityEvents.at, since), sql`${securityEvents.ip} is not null`))
    .groupBy(securityEvents.ip)

  const candidates: IpCandidate[] = rows
    .filter((r): r is { ip: string; honeypot: number; high: number } => !!r.ip)
    .map((r) => ({ ip: r.ip, honeypot: Number(r.honeypot), high: Number(r.high) }))

  // Bloqueos activos: para excluirlos y para el tope.
  const active = await db
    .select({ ip: blockedIps.ip })
    .from(blockedIps)
    .where(sql`${blockedIps.expiresAt} > ${Math.floor(now.getTime() / 1000)}`)
  const alreadyBlocked = new Set(active.map((a) => a.ip))

  const decisions = selectIpsToBlock(candidates, {
    highThreshold: o.highThreshold,
    alreadyBlocked,
    allowlisted: isAllowlisted,
  })

  const capacity = Math.max(0, o.maxActiveBlocks - active.length)
  const toApply = decisions.slice(0, capacity)
  const overflow = decisions.length - toApply.length

  for (const d of toApply) {
    // Escalado: cuenta bloqueos previos de esa IP (fila persistente aunque
    // haya expirado, hasta que el cron la purgue) para subir el TTL.
    const [prev] = await db
      .select({ hits: blockedIps.hits })
      .from(blockedIps)
      .where(sql`${blockedIps.ip} = ${d.ip}`)
      .limit(1)
    const ttlSec = escalatedTtlSec(prev?.hits ?? 0)
    await blockIp({ ip: d.ip, reason: d.reason, ruleId: d.ruleId, ttlSec, source: 'auto' }, now).catch(() => {})
  }

  return { candidates: candidates.length, blocked: toApply.length, overflow }
}
