import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { trainingAccessCodes } from '../../../../../db/schema'
import { generateAccessCode, normalizeAccessCode } from '../../../../../lib/capacitacion/access'
import { listarCodigos } from '../../../../../lib/capacitacion/repo'
import { recordSecurityEvent } from '../../../../../lib/security/events'
import { clientIp } from '../../../../../lib/ratelimit'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const GET: APIRoute = async () => json(200, await listarCodigos())

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData()

  const label = String(form.get('label') ?? '').trim()
  if (!label) return json(400, { error: 'ponle un nombre al grupo (empresa, cohorte, evento)' })

  const diasRaw = Number(form.get('validDays') ?? 180)
  const dias = Number.isFinite(diasRaw) && diasRaw > 0 ? Math.min(diasRaw, 730) : 180
  const maxUsesRaw = Number(form.get('maxUses') ?? 0)
  const maxUses = Number.isFinite(maxUsesRaw) && maxUsesRaw > 0 ? Math.floor(maxUsesRaw) : null

  // Se reintenta ante colisión en vez de confiar en el UNIQUE: el espacio es
  // grande, pero un choque devolvería un 500 en la cara del admin justo cuando
  // está cerrando una capacitación.
  let code = generateAccessCode()
  for (let i = 0; i < 5; i++) {
    const [existe] = await db
      .select({ id: trainingAccessCodes.id })
      .from(trainingAccessCodes)
      .where(eq(trainingAccessCodes.code, normalizeAccessCode(code)))
      .limit(1)
    if (!existe) break
    code = generateAccessCode()
  }

  const now = new Date()
  const [creado] = await db
    .insert(trainingAccessCodes)
    .values({
      // Se guarda normalizado (sin guion) porque así llega siempre desde el
      // formulario público: comparar formatos distintos sería un bug silencioso.
      code: normalizeAccessCode(code),
      label,
      note: String(form.get('note') ?? '').trim() || null,
      expiresAt: new Date(now.getTime() + dias * 24 * 60 * 60 * 1000),
      maxUses,
      createdAt: now,
    })
    .returning()

  void recordSecurityEvent({
    classification: { category: 'capacitacion', severity: 'low', ruleId: 'capacitacion.code_created' },
    ip: clientIp(request),
    method: 'POST',
    path: '/api/admin/capacitacion/codigos',
    query: null,
    userAgent: request.headers.get('user-agent'),
    country: request.headers.get('x-vercel-ip-country'),
    asn: request.headers.get('x-vercel-ip-as-number'),
    statusCode: 201,
    action: 'logged',
  })

  // El código legible solo se devuelve aquí, en la respuesta del alta: es el
  // único momento en que hace falta dictarlo.
  return json(201, { ...creado, codeLegible: code })
}
