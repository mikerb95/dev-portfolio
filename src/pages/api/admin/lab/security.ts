import type { APIRoute } from 'astro'
import { desc } from 'drizzle-orm'
import { db } from '../../../../db'
import { securityFindings } from '../../../../db/schema'
import { countOpenBySeverity, FINDING_STATUSES } from '../../../../lib/lab/findings'
import { setFindingStatus } from '../../../../lib/lab/findings-store'

// Hallazgos de seguridad/accesibilidad para el panel LAB (protegido por el
// middleware admin). GET lista + resumen; PATCH marca resuelto/aceptado/reabre.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const GET: APIRoute = async () => {
  const rows = await db
    .select()
    .from(securityFindings)
    // Abiertos primero; dentro, los más recientes arriba.
    .orderBy(securityFindings.status, desc(securityFindings.lastSeenAt))

  const summary = {
    open: countOpenBySeverity(rows),
    total: rows.length,
    resolved: rows.filter((r) => r.status === 'resolved').length,
    accepted: rows.filter((r) => r.status === 'accepted').length,
  }

  return json(200, { summary, findings: rows })
}

export const PATCH: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const id = Number(body.id)
  const status = body.status
  if (!Number.isInteger(id) || !FINDING_STATUSES.includes(status as never)) {
    return json(400, { error: 'id y status (open|resolved|accepted) requeridos' })
  }

  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null
  const ok = await setFindingStatus(id, status as 'open' | 'resolved' | 'accepted', note)
  if (!ok) return json(404, { error: 'hallazgo no encontrado' })

  return json(200, { ok: true })
}
