import type { APIRoute } from 'astro'
import { recordAdminEvent } from '../../../../../lib/security/events'
import {
  borrarBorrador,
  cancelarCampana,
  dispararCampana,
  enviarPrueba,
  guardarCampana,
  procesarCola,
} from '../../../../../lib/marketing/db'
import { leerContenido, json } from './_comun'

// Una campaña: editar (PUT, solo borrador), borrar (DELETE, solo borrador) y
// acciones (POST {accion}: prueba, disparar, cancelar).

const idDe = (p: string | undefined): number | null => {
  const n = Number(p)
  return Number.isInteger(n) && n > 0 ? n : null
}

export const PUT: APIRoute = async ({ params, request }) => {
  const id = idDe(params.id)
  if (!id) return json(400, { error: 'id inválido' })
  const contenido = await leerContenido(request)
  if (!contenido) return json(400, { error: 'JSON inválido' })
  const r = await guardarCampana(id, contenido)
  if (!r.ok) return json(422, { error: 'No se pudo guardar', errores: r.errores })
  return json(200, { ok: true, id })
}

export const DELETE: APIRoute = async ({ params, request }) => {
  const id = idDe(params.id)
  if (!id) return json(400, { error: 'id inválido' })
  if (!(await borrarBorrador(id))) return json(409, { error: 'Solo se borra un borrador.' })
  await recordAdminEvent(request, 'marketing.campana_borrada')
  return json(200, { ok: true })
}

export const POST: APIRoute = async ({ params, request }) => {
  const id = idDe(params.id)
  if (!id) return json(400, { error: 'id inválido' })
  let accion: unknown
  try {
    accion = ((await request.json()) as { accion?: unknown }).accion
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  if (accion === 'prueba') {
    const r = await enviarPrueba(id)
    return r.ok ? json(200, { ok: true, para: r.para }) : json(502, { error: r.error })
  }

  if (accion === 'disparar') {
    const r = await dispararCampana(id)
    if (!r.ok) return json(409, { error: r.error })
    await recordAdminEvent(request, 'marketing.campana_disparada')
    // Primer lote en el acto si la franja legal está abierta; si no, lo
    // tomará el cron cuando abra. procesarCola ya sabe decir que no.
    const cola = await procesarCola().catch(() => null)
    return json(200, { ok: true, encolados: r.encolados, cola })
  }

  if (accion === 'cancelar') {
    if (!(await cancelarCampana(id))) return json(409, { error: 'Esta campaña ya terminó.' })
    await recordAdminEvent(request, 'marketing.campana_cancelada')
    return json(200, { ok: true })
  }

  return json(400, { error: 'acción desconocida' })
}
