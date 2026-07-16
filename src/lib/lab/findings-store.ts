import { eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { securityFindings } from '../../db/schema'
import { fingerprint, type NormalizedFinding } from './findings'

// Persistencia de hallazgos. Separada de findings.ts (puro) porque toca la BD.

export type IngestSummary = { inserted: number; updated: number }

/**
 * Ingiere un lote de hallazgos ya normalizados. Idempotente por fingerprint:
 *  · hallazgo nuevo → fila 'open' con first/lastSeen = ahora.
 *  · hallazgo ya visto → solo refresca lastSeenAt. NO reabre uno resuelto ni
 *    aceptado: si volvió a aparecer estando 'resolved', probablemente el scan
 *    aún no ve el fix desplegado; el humano decide, no el scanner.
 */
export async function ingestFindings(findings: NormalizedFinding[]): Promise<IngestSummary> {
  const now = new Date()
  let inserted = 0
  let updated = 0

  for (const f of findings) {
    const fp = fingerprint(f.source, f.ruleId, f.route)

    const res = await db
      .insert(securityFindings)
      .values({
        fingerprint: fp,
        source: f.source,
        severity: f.severity,
        title: f.title,
        description: f.description,
        route: f.route,
        ruleId: f.ruleId,
        status: 'open',
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: securityFindings.fingerprint,
        set: {
          lastSeenAt: now,
          // La severidad y el título sí pueden cambiar entre corridas (npm sube
          // el rating de una vuln); se refrescan sin tocar el estado.
          severity: f.severity,
          title: f.title,
          description: f.description,
        },
      })
      .returning({ firstSeenAt: securityFindings.firstSeenAt })

    // firstSeenAt === now ⇒ fue un insert; si no, era una fila existente.
    if (res[0]?.firstSeenAt?.getTime() === now.getTime()) inserted++
    else updated++
  }

  return { inserted, updated }
}

/** Marca hallazgos vistos antes de `before` como resueltos: "el scan ya no los ve". */
export async function autoResolveStale(source: string, before: Date): Promise<number> {
  const res = await db
    .update(securityFindings)
    .set({ status: 'resolved', resolvedAt: new Date(), note: 'Ya no aparece en el último scan.' })
    .where(
      sql`${securityFindings.source} = ${source} and ${securityFindings.status} = 'open' and ${securityFindings.lastSeenAt} < ${Math.floor(before.getTime() / 1000)}`
    )
    .returning({ id: securityFindings.id })
  return res.length
}

/** Cambia el estado de un hallazgo desde el panel, con nota opcional. */
export async function setFindingStatus(
  id: number,
  status: 'open' | 'resolved' | 'accepted',
  note: string | null
): Promise<boolean> {
  const res = await db
    .update(securityFindings)
    .set({
      status,
      note,
      resolvedAt: status === 'open' ? null : new Date(),
    })
    .where(eq(securityFindings.id, id))
    .returning({ id: securityFindings.id })
  return res.length > 0
}
