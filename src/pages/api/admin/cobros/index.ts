import type { APIRoute } from 'astro'
import { buildWhatsAppMessage, isValidExpiry, DEFAULT_EXPIRY } from '../../../../lib/cobros'
import { historyToken, phoneRef } from '../../../../lib/cobros-crypto'
import { createCobro, listCobros } from '../../../../lib/cobros-db'
import { normalizePhone, waLink } from '../../../../lib/phone'
import { isValidIdempotencyKey } from '../../../../lib/payments'
import { clientIp } from '../../../../lib/ratelimit'
import { enforceLimit } from '../../../../lib/security/ratelimit-durable'
import { recordSecurityEvent } from '../../../../lib/security/events'

// Crea y lista cobros de campo. Protegido por la sesión admin en el middleware
// (ver src/middleware.ts): aquí ya no hay que revalidar quién eres.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

// Mismos límites que el checkout público: la pasarela es la misma.
const MIN_CENTS = 1_000_00
const MAX_CENTS = 5_000_000_00

/** GET /api/admin/cobros?open=1 — lista para la vista de pendientes. */
export const GET: APIRoute = async ({ url }) => {
  const onlyOpen = url.searchParams.get('open') === '1'
  const cobros = await listCobros(30, onlyOpen)
  return json(200, { cobros })
}

/** POST /api/admin/cobros — crea el cobro y devuelve el mensaje listo para WhatsApp. */
export const POST: APIRoute = async ({ request, url }) => {
  // Aunque la ruta ya exige sesión admin, el límite acota el daño de una sesión
  // robada y atrapa un bug de la UI que dispare cobros en bucle.
  const { allowed } = await enforceLimit(`cobros:${clientIp(request)}`, { limit: 20, windowMs: 3_600_000 })
  if (!allowed) return json(429, { error: 'demasiados cobros creados, espera un momento' })

  const secret = process.env.COBRO_HISTORY_SECRET
  if (!secret) {
    // Sin secreto no hay link de histórico. Se falla en vez de mandar un mensaje
    // con un link roto o, peor, un histórico sin credencial.
    return json(503, { error: 'falta COBRO_HISTORY_SECRET en el entorno' })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const amountCents = Number(body.amountCents)
  if (!Number.isInteger(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return json(400, { error: `el monto debe estar entre $1.000 y $5.000.000` })
  }

  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : null)
  if (!phone) return json(400, { error: 'teléfono inválido (ej: 310 464 1228)' })

  if (!isValidIdempotencyKey(body.idempotencyKey)) {
    return json(400, { error: 'idempotencyKey requerida' })
  }

  const expiry = isValidExpiry(body.expiry) ? body.expiry : DEFAULT_EXPIRY
  const concept =
    typeof body.concept === 'string'
      ? body.concept.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 120) || null
      : null

  const { payment, replayed, conflict, client } = await createCobro({
    amountCents,
    phone,
    concept,
    expiry,
    idempotencyKey: body.idempotencyKey,
  })

  // Misma clave con otro monto: conflicto explícito, nunca un cobro silencioso
  // por el valor de un intento anterior.
  if (conflict) return json(409, { error: conflict, reference: payment.reference })

  const payUrl = new URL(`/c/${payment.shortCode}`, url.origin).toString()
  const historyUrl = new URL(
    `/mis-pagos?r=${phoneRef(phone, secret)}&t=${historyToken(phone, secret)}`,
    url.origin,
  ).toString()

  const mensaje = buildWhatsAppMessage({
    clientName: client?.name ?? null,
    amountCents: payment.amountCents,
    concept,
    payUrl,
    historyUrl,
    expiresAt: payment.expiresAt,
  })

  void recordSecurityEvent({
    classification: { category: 'cobro', severity: 'low', ruleId: 'cobro.created' },
    ip: clientIp(request),
    method: 'POST',
    path: '/api/admin/cobros',
    query: null,
    userAgent: request.headers.get('user-agent'),
    country: request.headers.get('x-vercel-ip-country'),
    asn: request.headers.get('x-vercel-ip-as-number'),
    statusCode: replayed ? 200 : 201,
    action: 'logged',
  })

  return json(replayed ? 200 : 201, {
    replayed,
    cobro: {
      reference: payment.reference,
      shortCode: payment.shortCode,
      amountCents: payment.amountCents,
      status: payment.status,
      expiresAt: payment.expiresAt,
      concept,
    },
    client: client ?? null,
    payUrl,
    historyUrl,
    mensaje,
    waUrl: waLink(phone, mensaje),
  })
}
