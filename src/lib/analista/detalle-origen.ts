// Detalle de un origen con su IP real, para que el administrador decida un
// bloqueo con algo más que el argumento del agente. Nunca pasa por el modelo:
// lo piden la terminal (después de traducir el alias en el proceso local) y el
// endpoint de revelado del panel, siempre con la IP ya resuelta del lado del
// servidor.
//
// Importa `src/db`: solo servidor.

import { and, eq, gt, notInArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { blockedIps, securityEvents } from '../../db/schema'
import { AUDIT_CATEGORIES } from '../security/audit'
import { isAllowlisted } from '../security/blocklist'

// La misma ventana máxima que pueden pedir las herramientas del agente: con
// menos, el humano decidiría viendo menos de lo que vio el agente.
export const DIAS_DETALLE = 7

export type DetalleOrigen = {
  ip: string
  pais: string | null
  asn: string | null
  eventos: number
  hits: number
  categorias: string[]
  primeraVez: string | null
  ultimaVez: string | null
  /** Bloqueo vigente, si lo hay. */
  bloqueadoHasta: string | null
  /** Veces que ya se bloqueó (la fila de blocked_ips sobrevive a su expiración). */
  bloqueosPrevios: number
  /** En la allowlist: nunca se bloquea. */
  protegido: boolean
}

export async function detalleOrigen(ip: string, ahora = new Date()): Promise<DetalleOrigen> {
  const desde = new Date(ahora.getTime() - DIAS_DETALLE * 86_400_000)
  const [resumen] = await db
    .select({
      eventos: sql<number>`count(*)`,
      hits: sql<number>`coalesce(sum(${securityEvents.hits}), 0)`,
      categorias: sql<string | null>`group_concat(distinct ${securityEvents.category})`,
      pais: sql<string | null>`max(${securityEvents.country})`,
      asn: sql<string | null>`max(${securityEvents.asn})`,
      primeraVez: sql<number | null>`min(${securityEvents.at})`,
      ultimaVez: sql<number | null>`max(${securityEvents.at})`,
    })
    .from(securityEvents)
    // Solo amenazas, como en las herramientas: el rastro de auditoría no cuenta
    // como actividad hostil.
    .where(and(eq(securityEvents.ip, ip), gt(securityEvents.at, desde), notInArray(securityEvents.category, AUDIT_CATEGORIES)))
  const [bloqueo] = await db
    .select({ hasta: blockedIps.expiresAt, veces: blockedIps.hits })
    .from(blockedIps)
    .where(eq(blockedIps.ip, ip))
    .limit(1)

  const iso = (s: number | null | undefined) => (s ? new Date(Number(s) * 1000).toISOString() : null)
  return {
    ip,
    pais: resumen?.pais ?? null,
    asn: resumen?.asn ?? null,
    eventos: Number(resumen?.eventos ?? 0),
    hits: Number(resumen?.hits ?? 0),
    categorias: (resumen?.categorias ?? '').split(',').filter(Boolean),
    primeraVez: iso(resumen?.primeraVez),
    ultimaVez: iso(resumen?.ultimaVez),
    bloqueadoHasta: bloqueo && bloqueo.hasta > ahora ? bloqueo.hasta.toISOString() : null,
    bloqueosPrevios: bloqueo?.veces ?? 0,
    protegido: isAllowlisted(ip),
  }
}
