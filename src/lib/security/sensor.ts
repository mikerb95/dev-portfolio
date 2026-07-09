// Sensor: pega el clasificador (puro) con el registro (DB) y la extracción de
// metadatos de request. Es el punto que llaman el middleware y el 404.
//
// FASE 0 = solo observación: clasificamos y registramos, pero NO bloqueamos.
// El enforcement (rate limit + blocklist) llega en fases posteriores. Así se
// despliega un WAF de verdad: primero `log`, luego `enforce`, con datos reales
// para calibrar las reglas y no bloquear tráfico legítimo por un falso positivo.

import { clientIp } from '../device-info'
import { classify, type Classification, type Severity } from './classify'
import { recordSecurityEvent } from './events'

export type ObserveInput = {
  method: string
  /** pathname sin query. */
  path: string
  /** query string sin el '?' inicial. */
  query?: string
  headers: Headers
  statusCode?: number | null
  action?: 'logged' | 'rate_limited' | 'blocked' | 'honeypot'
}

/**
 * Clasifica el request y, si es hostil, dispara el registro (sin esperarlo).
 * Devuelve la clasificación (o null) de forma síncrona para que el llamador
 * pueda reaccionar. NUNCA lanza: cualquier fallo = sin observación (fail-open).
 *
 * `waitUntil`, si se pasa (Vercel lo expone en el contexto), mantiene viva la
 * escritura tras enviar la respuesta sin bloquearla.
 */
export function observeRequest(
  input: ObserveInput,
  waitUntil?: (p: Promise<unknown>) => void
): Classification | null {
  let classification: Classification | null = null
  try {
    classification = classify({
      method: input.method,
      path: input.path,
      query: input.query,
      userAgent: input.headers.get('user-agent'),
    })
    if (!classification) return null

    const promise = recordSecurityEvent({
      classification,
      ip: clientIp(input.headers),
      method: input.method,
      path: input.path,
      query: input.query ?? null,
      userAgent: input.headers.get('user-agent'),
      country: input.headers.get('x-vercel-ip-country'),
      asn: input.headers.get('x-vercel-ip-as-number'),
      statusCode: input.statusCode ?? null,
      action: input.action ?? (classification.category === 'honeypot' ? 'honeypot' : 'logged'),
    })
    if (waitUntil) waitUntil(promise)
    else void promise
  } catch {
    // Fail-open.
  }
  return classification
}

export type EnforcementEvent = {
  category: string
  severity: Severity
  ruleId: string
  action: 'rate_limited' | 'blocked'
  statusCode: number
  method: string
  path: string
  query?: string
  headers: Headers
}

/**
 * Registra un evento de enforcement (bloqueo o rate limit) reutilizando la
 * extracción de metadatos del request. Fire-and-forget, nunca lanza.
 */
export function recordEnforcementEvent(e: EnforcementEvent): void {
  try {
    void recordSecurityEvent({
      classification: { category: e.category, severity: e.severity, ruleId: e.ruleId },
      ip: clientIp(e.headers),
      method: e.method,
      path: e.path,
      query: e.query ?? null,
      userAgent: e.headers.get('user-agent'),
      country: e.headers.get('x-vercel-ip-country'),
      asn: e.headers.get('x-vercel-ip-as-number'),
      statusCode: e.statusCode,
      action: e.action,
    })
  } catch {
    // Fail-open.
  }
}
