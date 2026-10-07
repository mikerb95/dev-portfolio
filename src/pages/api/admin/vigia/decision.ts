import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { vigiaCorridas } from '../../../../db/schema'
import { SinApiKey } from '../../../../lib/analista/credencial'
import { recordAdminEvent } from '../../../../lib/security/events'
import { clienteVigia } from '../../../../lib/vigia/cliente'
import type { Pendiente } from '../../../../lib/vigia/sesion'

// Aprueba o rechaza una herramienta que el vigía pidió usar (fase 4: abrir un
// issue o un PR en GitHub, con la política `always_ask`). Protegido por el
// middleware de /api/admin y vetado en la demo (solo GET).
//
// Solo se confirma un evento que el webhook ya registró como pendiente de ESTA
// corrida: el panel no puede usarse para responder sesiones de otros agentes
// del workspace.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  const sessionId = typeof body?.sessionId === 'string' && /^sesn_[A-Za-z0-9]+$/.test(body.sessionId) ? body.sessionId : ''
  const eventId = typeof body?.eventId === 'string' && /^sevt_[A-Za-z0-9]+$/.test(body.eventId) ? body.eventId : ''
  if (!sessionId || !eventId) return json(400, { error: 'Faltan la sesión o el evento.' })
  // Solo un `true` explícito aprueba.
  const aprobado = body?.aprobado === true
  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim().slice(0, 500) : ''

  const [fila] = await db.select().from(vigiaCorridas).where(eq(vigiaCorridas.sessionId, sessionId)).limit(1)
  const pendientes: Pendiente[] = fila?.pendientes ? JSON.parse(fila.pendientes) : []
  if (!pendientes.some((p) => p.eventId === eventId)) return json(409, { error: 'Esa aprobación ya se decidió o no existe.' })

  let client
  try {
    client = clienteVigia()
  } catch (e) {
    if (e instanceof SinApiKey) return json(503, { error: e.message })
    throw e
  }

  await client.beta.sessions.events.send(sessionId, {
    events: [
      aprobado
        ? { type: 'user.tool_confirmation', tool_use_id: eventId, result: 'allow' }
        : { type: 'user.tool_confirmation', tool_use_id: eventId, result: 'deny', deny_message: motivo || 'Rechazado desde el panel.' },
    ],
  })

  const quedan = pendientes.filter((p) => p.eventId !== eventId)
  await db
    .update(vigiaCorridas)
    .set({
      pendientes: quedan.length ? JSON.stringify(quedan) : null,
      // La sesión retoma el trabajo; el próximo aviso del webhook dirá en qué quedó.
      desenlace: quedan.length ? 'aprobacion' : 'en_curso',
      actualizada: new Date(),
    })
    .where(eq(vigiaCorridas.sessionId, sessionId))

  await recordAdminEvent(request, aprobado ? 'vigia.accion_aprobada' : 'vigia.accion_rechazada', {
    severity: aprobado ? 'medium' : 'low',
  })
  return json(200, { ok: true, quedan: quedan.length })
}
