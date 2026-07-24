// Salud del portal de clientes, para que el portal se vigile a sí mismo.
//
// Por qué no basta con monitorear /portal/login: esa página renderiza sin tocar
// la base (sin cookie no hay sesión que resolver), así que un 200 ahí solo
// prueba que el SSR responde. El portal puede estar servido y aun así ser
// inservible — una migración a medias, una tabla renombrada — y el monitor
// seguiría en verde. Un chequeo que no puede fallar cuando el sistema falla no
// es un chequeo, es decoración.
//
// Por eso este módulo ejerce el MISMO join de tres tablas que resuelve una
// sesión real (portal_sessions ⋈ client_users ⋈ clients), con un id imposible:
// no devuelve filas, pero si el esquema está roto, la consulta lanza.
//
// OPSEC: la respuesta es pública (la consume el motor de uptime). No sale de
// aquí ningún conteo de clientes o usuarios, ningún correo, ningún nombre.
// Solo booleanos y milisegundos.

import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { db } from '../../db'
import { clientUsers, clients, portalSessions } from '../../db/schema'

export type HealthCheck = {
  ok: boolean
  ms: number
  error: string | null
}

export type PortalHealth = {
  ok: boolean
  checks: Record<string, HealthCheck>
  ts: string
}

/** Id de sesión que jamás existirá: los reales son un sha-256 en hexadecimal. */
const IMPOSSIBLE_SESSION_ID = '-'

/**
 * Decide el veredicto global a partir de los chequeos.
 *
 * Función pura y separada a propósito: la regla "basta con que uno falle" es lo
 * que decide si el monitor pinta rojo, y merece test propio sin levantar base.
 */
export function healthVerdict(checks: Record<string, HealthCheck>): {
  ok: boolean
  status: 200 | 503
  failed: string[]
} {
  const failed = Object.entries(checks)
    .filter(([, c]) => !c.ok)
    .map(([name]) => name)
  const ok = failed.length === 0
  return { ok, status: ok ? 200 : 503, failed }
}

/** Corre una comprobación midiendo su latencia. Nunca lanza. */
async function timed(fn: () => Promise<unknown>): Promise<HealthCheck> {
  const started = Date.now()
  try {
    await fn()
    return { ok: true, ms: Date.now() - started, error: null }
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: e instanceof Error ? e.message : 'error' }
  }
}

/**
 * Ejerce la cadena de dependencias del portal y devuelve su estado.
 *
 * A diferencia del resto del código de observabilidad, esto NO es fail-open: si
 * algo está roto tiene que decirlo. Un sensor que se calla cuando hay fuego es
 * peor que no tener sensor, porque genera confianza injustificada.
 */
export async function runPortalHealth(now = new Date()): Promise<PortalHealth> {
  const checks: Record<string, HealthCheck> = {}

  checks.db = await timed(() => db.run(sql`select 1`))

  // El mismo join que resuelve una sesión real. Con un id imposible devuelve
  // cero filas en un sistema sano, y lanza si el esquema del portal se rompió.
  checks.session_lookup = await timed(() =>
    db
      .select({ id: portalSessions.id })
      .from(portalSessions)
      .innerJoin(clientUsers, eq(portalSessions.clientUserId, clientUsers.id))
      .innerJoin(clients, eq(clientUsers.clientId, clients.id))
      .where(eq(portalSessions.id, IMPOSSIBLE_SESSION_ID))
      .limit(1)
  )

  return { ok: healthVerdict(checks).ok, checks, ts: now.toISOString() }
}
