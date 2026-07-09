// Registro de eventos de seguridad (el "sensor" del micro-SIEM). El middleware
// y el 404 llaman a recordSecurityEvent tras clasificar un request hostil.
//
// Garantías (ver docs/plan-security-observability.md):
//  - Fire-and-forget: registrar NUNCA bloquea ni retrasa la respuesta y NUNCA
//    lanza (fail-open). Un fallo de Turso se traga silenciosamente.
//  - Dedupe de ráfagas: un scan de 500 rutas del mismo origen no genera 500
//    inserts. Colapsamos por (ip+ruleId) en una ventana de 1s, acumulando hits
//    en una sola fila. Esto acota el coste de escritura bajo ataque.

import { sql } from 'drizzle-orm'
import { db } from '../../db'
import { securityEvents } from '../../db/schema'
import type { Severity } from './classify'
import { hashIp, truncate } from './redact'

const IP_SALT = import.meta.env.SECURITY_IP_SALT as string | undefined

// Más laxo que Classification: `category` es texto libre en el esquema, así que
// el enforcement (bloqueos, rate limit) puede registrar categorías sintéticas
// que no son firmas del clasificador (p.ej. 'blocklist', 'api_abuse').
export type EventClassification = {
  category: string
  severity: Severity
  ruleId: string
}

export type SecurityEventInput = {
  classification: EventClassification
  ip?: string | null
  method?: string
  path: string
  query?: string | null
  userAgent?: string | null
  country?: string | null
  asn?: string | null
  statusCode?: number | null
  action?: 'logged' | 'rate_limited' | 'blocked' | 'honeypot'
}

// Ventana de deduplicación por (ip+ruleId). Mapa en memoria por instancia:
// clave → { id de la fila abierta, timestamp de la primera escritura }.
const DEDUPE_MS = 1_000
const DEDUPE_MAX_KEYS = 5_000
const dedupe = new Map<string, { rowId: number; at: number }>()

function pruneDedupe(now: number): void {
  if (dedupe.size <= DEDUPE_MAX_KEYS) return
  for (const [k, v] of dedupe) if (now - v.at >= DEDUPE_MS) dedupe.delete(k)
  if (dedupe.size > DEDUPE_MAX_KEYS) dedupe.clear()
}

/** Construye los valores de fila a partir del input (parte pura del registro). */
export function buildEventRow(input: SecurityEventInput, at: Date) {
  const { classification: c } = input
  return {
    at,
    ip: truncate(input.ip, 64),
    ipHash: hashIp(input.ip, IP_SALT),
    method: truncate(input.method, 12),
    path: truncate(input.path, 512)!,
    query: truncate(input.query, 200),
    userAgent: truncate(input.userAgent, 300),
    country: truncate(input.country, 8),
    asn: truncate(input.asn, 32),
    category: c.category,
    severity: c.severity,
    action: input.action ?? 'logged',
    statusCode: input.statusCode ?? null,
    ruleId: c.ruleId,
    hits: 1,
  }
}

/**
 * Registra un evento de seguridad sin bloquear el request. Devuelve una promesa
 * que SIEMPRE resuelve (nunca rechaza) por si el llamador quiere encadenar con
 * context.waitUntil; lo normal es no esperarla.
 */
export async function recordSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    const now = Date.now()
    const at = new Date(now)
    const key = `${input.ip ?? 'unknown'}:${input.classification.ruleId}`

    pruneDedupe(now)
    const open = dedupe.get(key)
    if (open && now - open.at < DEDUPE_MS) {
      // Ráfaga: incrementa hits en la fila abierta en vez de insertar otra.
      await db
        .update(securityEvents)
        .set({ hits: sql`${securityEvents.hits} + 1` })
        .where(sql`${securityEvents.id} = ${open.rowId}`)
      return
    }

    const row = buildEventRow(input, at)
    const inserted = await db.insert(securityEvents).values(row).returning({ id: securityEvents.id })
    const rowId = inserted[0]?.id
    if (typeof rowId === 'number') dedupe.set(key, { rowId, at: now })
  } catch {
    // Fail-open: el sensor jamás tumba el request.
  }
}

/** Solo para tests: limpia el estado de deduplicación entre casos. */
export function _resetDedupe(): void {
  dedupe.clear()
}
