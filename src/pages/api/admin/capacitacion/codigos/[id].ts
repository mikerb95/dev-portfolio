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

  void recordSecurityEvent({
    classification: {
      category: 'capacitacion',
      severity: revokedAt ? 'medium' : 'low',
      ruleId: revokedAt ? 'capacitacion.code_revoked' : 'capacitacion.code_restored',
    },
    ip: clientIp(request),
    method: 'PUT',
    path: `/api/admin/capacitacion/codigos/${id}`,
    query: null,
    userAgent: request.headers.get('user-agent'),
    country: request.headers.get('x-vercel-ip-country'),
    asn: request.headers.get('x-vercel-ip-as-number'),
    statusCode: 200,
    action: 'logged',
  })

  return json(200, guardado)
}
