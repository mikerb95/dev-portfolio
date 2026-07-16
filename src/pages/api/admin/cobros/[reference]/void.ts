import type { APIRoute } from 'astro'
import { voidCobro } from '../../../../../lib/cobros-db'
import { clientIp } from '../../../../../lib/ratelimit'
import { recordSecurityEvent } from '../../../../../lib/security/events'

// Anula un cobro. La transición la valida la máquina de estados de payments
// (created/pending → voided, y approved → voided como reembolso manual);
// si el estado no lo permite, el resultado viene con applied=false.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const POST: APIRoute = async ({ params, request }) => {
  const reference = params.reference
  if (!reference) return json(400, { error: 'referencia requerida' })

  let motivo = 'anulado desde /cobrar'
  try {
    const body = await request.json()
    if (typeof body?.motivo === 'string' && body.motivo.trim()) {
      motivo = body.motivo.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 200)
    }
  } catch {
    // Sin cuerpo: se usa el motivo por defecto.
  }

  const result = await voidCobro(reference, motivo)
  if (!result.ok) return json(404, { error: result.error ?? 'cobro no encontrado' })

  void recordSecurityEvent({
    classification: { category: 'cobro', severity: 'low', ruleId: 'cobro.voided' },
    ip: clientIp(request),
    method: 'POST',
    path: '/api/admin/cobros/void',
    query: null,
    userAgent: request.headers.get('user-agent'),
    country: request.headers.get('x-vercel-ip-country'),
    asn: request.headers.get('x-vercel-ip-as-number'),
    statusCode: 200,
    action: 'logged',
  })

  // 200 aunque no aplique: el llamador necesita saber el estado real, y que un
  // cobro ya rechazado no se pueda anular no es un error del request.
  return json(200, {
    ok: true,
    applied: result.applied,
    status: result.statusAfter,
    motivo: result.applied ? null : `el cobro está en estado "${result.statusAfter}" y no se puede anular`,
  })
}
