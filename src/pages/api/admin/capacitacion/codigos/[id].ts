import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { trainingAccessCodes } from '../../../../../db/schema'
import { recordSecurityEvent } from '../../../../../lib/security/events'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/**
 * Revocar es la operación normal; borrar no existe a propósito. Un código
 * revocado deja de valer de inmediato (los pases ya emitidos se revalidan
 * contra la base en cada request) y conserva el rastro de a qué grupo se le
 * dio y cuántas veces se canjeó.
 */
export const PUT: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  if (!Number.isFinite(id)) return json(400, { error: 'id inválido' })

  const form = await request.formData()
  const accion = String(form.get('accion') ?? 'revocar')

  const [actual] = await db
    .select()
    .from(trainingAccessCodes)
    .where(eq(trainingAccessCodes.id, id))
    .limit(1)
  if (!actual) return json(404, { error: 'código no encontrado' })

  const revokedAt = accion === 'reactivar' ? null : new Date()
  const [guardado] = await db
    .update(trainingAccessCodes)
    .set({ revokedAt })
    .where(eq(trainingAccessCodes.id, id))
    .returning()

  recordSecurityEvent({
    category: 'admin_action',
    severity: revokedAt ? 'medium' : 'low',
    ruleId: revokedAt ? 'capacitacion.codigo_revocado' : 'capacitacion.codigo_reactivado',
    action: 'allowed',
    path: `/api/admin/capacitacion/codigos/${id}`,
    method: 'PUT',
    detail: `código de "${actual.label}" ${revokedAt ? 'revocado' : 'reactivado'}`,
  })

  return json(200, guardado)
}
