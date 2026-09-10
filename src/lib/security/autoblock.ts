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
import { securityEvents, blockedIps, adminSessions } from '../../db/schema'
import { blockIp, blockIpEscalated, isAllowlisted } from './blocklist'

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
    // Escalado de TTL por reincidencia compartido con el bloqueo inline de
    // honeypots (ver blockIpEscalated). Fila persistente aunque haya expirado.
    await blockIpEscalated({ ip: d.ip, reason: d.reason, ruleId: d.ruleId, source: 'auto' }, now).catch(() => {})
  }

  return { candidates: candidates.length, blocked: toApply.length, overflow }
}

export type BulkBlockResult = {
  candidates: number
  blocked: number
  skipped: number
  overflow: number
  /** IPs descartadas por ser del operador o de una sesión admin (ver `protectedIps`). */
  spared: number
}

/** Ventana por defecto del bloqueo masivo: 7 días. */
const BULK_WINDOW_MS = 7 * 24 * 60 * 60_000

export type BulkSelection = {
  toApply: string[]
  candidates: number
  skipped: number
  overflow: number
  spared: number
}

/**
 * Decisión pura del bloqueo masivo: de las IPs candidatas descarta las propias
 * (`protectedIps`: la del operador y las de sesiones admin) y las de la
 * allowlist, aparta las ya bloqueadas (skipped) y recorta al `capacity`
 * disponible bajo el tope (el resto es overflow). Testeable sin tocar la DB.
 *
 * `protectedIps` es la salvaguarda que faltaba: la allowlist es una env var que
 * hay que mantener a mano y que con IP residencial dinámica envejece en días,
 * así que no basta para garantizar que el operador no se bloquee a sí mismo.
 */
export function selectBulkBlockIps(
  ips: string[],
  opts: {
    alreadyBlocked: Set<string>
    capacity: number
    allowlisted?: (ip: string) => boolean
    protectedIps?: Set<string>
  }
): BulkSelection {
  const isAllowed = opts.allowlisted ?? (() => false)
  const isProtected = (ip: string) => opts.protectedIps?.has(ip) ?? false
  const propias = ips.filter((ip) => !!ip && (isProtected(ip) || isAllowed(ip)))
  const candidates = ips.filter((ip) => !!ip && !isProtected(ip) && !isAllowed(ip))
  const pending = candidates.filter((ip) => !opts.alreadyBlocked.has(ip))
  const skipped = candidates.length - pending.length
  const toApply = pending.slice(0, Math.max(0, opts.capacity))
  return {
    toApply,
    candidates: candidates.length,
    skipped,
    overflow: pending.length - toApply.length,
    spared: new Set(propias).size,
  }
}

/**
 * Bloqueo masivo manual desde el panel: bloquea TODAS las IPs con eventos de
 * seguridad en la ventana (por defecto 7 d), sin importar la severidad. Es la
 * respuesta "de golpe" a un ataque en curso.
 *
 * Salvaguardas (igual que el auto-block):
 *  - Excluye eventos sintéticos de enforcement (category='blocklist'): son hits
 *    de IPs ya bloqueadas, no ataques nuevos.
 *  - Excluye las IPs propias: la del operador que pulsa el botón (`selfIp`) y
 *    las de cualquier sesión admin viva. El micro-SIEM registra también eventos
 *    legítimos del panel (cuenta_cobro.created, consultas de la bóveda...), así
 *    que "toda IP con eventos" incluía al admin: el 10-sep-2026 este botón se
 *    bloqueó a sí mismo y dejó el sitio en 403 desde la única IP que importaba.
 *  - Respeta allowlist (vía blockIp) y bloqueos ya vigentes (no re-cuenta).
 *  - Respeta el tope de bloqueos activos (maxActiveBlocks); el resto = overflow.
 *  - TTL fijo elegido por el operador (24 h o 1 semana), no escalonado.
 */
export async function blockAllAttackerIps(
  ttlSec: number,
  now = new Date(),
  options?: { windowMs?: number; maxActiveBlocks?: number; selfIp?: string | null }
): Promise<BulkBlockResult> {
  const windowMs = options?.windowMs ?? BULK_WINDOW_MS
  const maxActiveBlocks = options?.maxActiveBlocks ?? DEFAULTS.maxActiveBlocks
  const since = new Date(now.getTime() - windowMs)

  // IPs distintas con eventos en la ventana, excluyendo el ruido de enforcement.
  const rows = await db
    .select({ ip: securityEvents.ip })
    .from(securityEvents)
    .where(
      and(
        gte(securityEvents.at, since),
        sql`${securityEvents.ip} is not null`,
        sql`${securityEvents.category} <> 'blocklist'`
      )
    )
    .groupBy(securityEvents.ip)

  const ips = rows.map((r) => r.ip).filter((ip): ip is string => !!ip)

  // Bloqueos activos: para excluirlos del recuento y para el tope.
  const active = await db
    .select({ ip: blockedIps.ip })
    .from(blockedIps)
    .where(sql`${blockedIps.expiresAt} > ${Math.floor(now.getTime() / 1000)}`)
  const alreadyBlocked = new Set(active.map((a) => a.ip))

  const { toApply, candidates, skipped, overflow, spared } = selectBulkBlockIps(ips, {
    alreadyBlocked,
    capacity: maxActiveBlocks - active.length,
    allowlisted: isAllowlisted,
    protectedIps: await ownIps(options?.selfIp),
  })

  let blocked = 0
  for (const ip of toApply) {
    const ok = await blockIp(
      { ip, reason: 'bloqueo masivo desde panel', ruleId: 'manual.block-all', ttlSec, source: 'manual' },
      now
    ).catch(() => false)
    if (ok) blocked++
  }

  return { candidates, blocked, skipped, overflow, spared }
}

/**
 * IPs que son del propio operador y por tanto nunca se bloquean en masa: la del
 * request que dispara el botón más las de las sesiones admin no revocadas (las
 * de `admin_sessions`, que solo se crean tras GitHub OAuth + allowlist de
 * logins, así que una IP ahí es por definición mía y no de un atacante).
 *
 * Fail-safe al contrario que el resto del módulo: si la consulta falla, se
 * devuelve al menos `selfIp`. Aquí el fallo peligroso no es dejar pasar a un
 * atacante, es quedarme fuera de mi propio panel.
 */
async function ownIps(selfIp?: string | null): Promise<Set<string>> {
  const out = new Set<string>()
  if (selfIp) out.add(selfIp)
  try {
    const rows = await db
      .select({ ip: adminSessions.ip })
      .from(adminSessions)
      .where(sql`${adminSessions.ip} is not null and ${adminSessions.revokedAt} is null`)
    for (const r of rows) if (r.ip) out.add(r.ip)
  } catch {
    // Se queda con selfIp: mejor proteger una sola IP que ninguna.
  }
  return out
}
