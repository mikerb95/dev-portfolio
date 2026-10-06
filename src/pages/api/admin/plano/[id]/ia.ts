import type { APIRoute } from 'astro'
import { recordAdminEvent } from '../../../../../lib/security/events'
import {
  cargarReglas,
  configDe,
  esEditable,
  guardarConfig,
  guardarConversacion,
  guardarRevision,
  hoyCO,
  propuesta,
  sumarGastoIa,
} from '../../../../../lib/plano/db'
import { aplicarSalidaChat, ESQUEMA_CHAT, promptChat, type SalidaChat } from '../../../../../lib/plano/ia/chat'
import { IaNoDisponible, pedirJson } from '../../../../../lib/plano/ia/motor'
import { ESQUEMA_REVISION, filtrarRevision, PROMPT_REVISION, propuestaEnTexto, type SalidaRevision } from '../../../../../lib/plano/ia/revision'
import { armarPropuesta, PropuestaVacia } from '../../../../../lib/plano/propuesta'

// IA de Plano: "del chat al plano" y "el cliente difícil". La sesión de admin
// la impone el middleware; la demo solo permite GET, así que aquí no llega.
// Cada llamada cuesta centavos y se suma al gasto de la propuesta.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  const p = Number.isInteger(id) ? await propuesta(id) : null
  if (!p) return json(404, { error: 'propuesta no encontrada' })

  let data: Record<string, unknown> = {}
  try {
    data = ((await request.json()) as Record<string, unknown>) ?? {}
  } catch {
    return json(400, { error: 'JSON inválido' })
  }
  const hoy = hoyCO()

  try {
    if (data.modo === 'chat') {
      if (!esEditable(p)) return json(409, { error: 'la propuesta ya fue aceptada' })
      const conversacion = typeof data.conversacion === 'string' ? data.conversacion.trim().slice(0, 40_000) : ''
      if (conversacion.length < 40) return json(400, { error: 'la conversación es muy corta' })
      await guardarConversacion(p.id, conversacion)
      const { datos, costo } = await pedirJson<SalidaChat>({
        system: promptChat(),
        usuario: `<conversacion>\n${conversacion}\n</conversacion>`,
        esquema: ESQUEMA_CHAT,
      })
      await sumarGastoIa(p.id, costo)
      const r = aplicarSalidaChat(datos, conversacion, configDe(p), hoy)
      await guardarConfig(p.id, r.config)
      await recordAdminEvent(request, 'plano.ia')
      return json(200, { ok: true, ...r, costoUsd: costo })
    }

    if (data.modo === 'revision') {
      let snapshot
      try {
        snapshot = armarPropuesta(configDe(p), await cargarReglas(), hoy)
      } catch (e) {
        if (e instanceof PropuestaVacia) return json(422, { error: 'la propuesta no tiene componentes' })
        throw e
      }
      const { datos, costo } = await pedirJson<SalidaRevision>({
        system: PROMPT_REVISION,
        usuario: `<propuesta>\n${propuestaEnTexto(snapshot)}\n</propuesta>`,
        esquema: ESQUEMA_REVISION,
      })
      await sumarGastoIa(p.id, costo)
      const revision = filtrarRevision(datos, snapshot.cifras, hoy)
      await guardarRevision(p.id, revision)
      await recordAdminEvent(request, 'plano.ia')
      return json(200, { ok: true, revision, costoUsd: costo })
    }
  } catch (e) {
    if (e instanceof IaNoDisponible) return json(e.motivo === 'sin_clave' ? 503 : 502, { error: e.message })
    throw e
  }

  return json(400, { error: 'modo desconocido' })
}
