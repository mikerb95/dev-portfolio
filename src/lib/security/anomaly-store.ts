// Persistencia de anomalías con anti-fatiga: una anomalía del mismo `kind` no se
// vuelve a insertar ni a alertar mientras haya una abierta (sin reconocer) de
// menos de 24h. Dedup por `kind` (no por categoría) a propósito: es conservador
// —prevenir fatiga de alertas prima sobre no perder una segunda categoría—, y el
// esquema no guarda categoría. Evita spamear al detectar lo mismo cada hora.

import { and, gte, sql } from 'drizzle-orm'
import { db } from '../../db'
import { securityAnomalies } from '../../db/schema'
import type { Anomaly } from './anomaly'

const DEDUPE_MS = 24 * 3_600_000

/**
 * Inserta las anomalías que no estén ya abiertas y devuelve las realmente
 * nuevas (las que ameritan alerta). Marca `notified=true` en las nuevas.
 */
export async function persistAnomalies(anomalies: Anomaly[], now = new Date()): Promise<Anomaly[]> {
  if (anomalies.length === 0) return []
  const since = new Date(now.getTime() - DEDUPE_MS)

  // Anomalías abiertas recientes (sin reconocer) para deduplicar por kind+cat.
  const open = await db
    .select({ kind: securityAnomalies.kind, detail: securityAnomalies.detail })
    .from(securityAnomalies)
    .where(and(gte(securityAnomalies.at, since), sql`${securityAnomalies.acknowledged} = 0`))

  const openKeys = new Set(open.map((o) => o.kind))

  const fresh = anomalies.filter((a) => !openKeys.has(a.kind))
  if (fresh.length === 0) return []

  await db.insert(securityAnomalies).values(
    fresh.map((a) => ({
      at: now,
      kind: a.kind,
      zScore: a.zScore,
      baseline: a.baseline,
      observed: a.observed,
      detail: a.detail,
      notified: true,
      acknowledged: false,
    }))
  )
  return fresh
}
