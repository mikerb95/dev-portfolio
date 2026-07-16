import type { APIRoute } from 'astro'
import { uploadDocument, type Category } from '../../../../lib/portal/documents'
import { requireRole } from '../../../../lib/portal/session'
import { audit } from '../../../../lib/portal/audit'
import { clientIp } from '../../../../lib/device-info'
import { enforceLimit } from '../../../../lib/security/ratelimit-durable'
import { sendPush } from '../../../../lib/notify'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const CATEGORIES: readonly string[] = ['contrato', 'entregable', 'acta', 'otro']

/**
 * Subida de documentos por el cliente (contratos firmados, insumos).
 *
 * `factura` no está entre las categorías que puede elegir: las facturas las
 * emito yo, y dejar que un cliente suba algo etiquetado como tal invitaría a
 * confusión sobre qué documento es el bueno.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireRole(context, ['owner', 'member'])
  if (auth.response) return auth.response
  const { session } = auth

  const { allowed } = await enforceLimit(`portal-upload:${session.user.id}`, { limit: 20, windowMs: 60 * 60_000 })
  if (!allowed) return json(429, { error: 'Has subido muchos archivos seguidos. Espera un momento.' })

  let form: FormData
  try {
    form = await context.request.formData()
  } catch {
    return json(400, { error: 'Petición inválida.' })
  }

  const file = form.get('file')
  if (!(file instanceof File)) return json(400, { error: 'No se recibió ningún archivo.' })

  const rawCategory = String(form.get('category') ?? 'otro')
  const category = (CATEGORIES.includes(rawCategory) ? rawCategory : 'otro') as Category

  const projectId = Number(form.get('projectId'))

  // uploadDocument valida tamaño, MIME y que el proyecto sea del cliente; el
  // clientId sale de la sesión y no del formulario.
  const result = await uploadDocument({
    clientId: session.client.id,
    projectId: Number.isInteger(projectId) ? projectId : null,
    title: String(form.get('title') ?? ''),
    category,
    file,
    uploadedBy: 'client',
    uploadedByUserId: session.user.id,
    visibleToClient: true,
  })

  if (!result.ok) return json(400, { error: result.error })

  audit({
    clientId: session.client.id,
    clientUserId: session.user.id,
    action: 'document.upload',
    entity: 'document',
    entityId: result.document.id,
    detail: result.document.title,
    ip: clientIp(context.request.headers),
  })

  sendPush(
    `Documento de ${session.client.company ?? session.client.name}`,
    `${result.document.title} (${category})`,
    { priority: 3, tags: 'paperclip' }
  ).catch(() => {})

  return json(201, { ok: true, id: result.document.id })
}
