import type { APIRoute } from 'astro'
import { recordAdminEvent } from '../../../../lib/security/events'
import { problemaDePin } from '../../../../lib/cotiza/acceso'
import { borrarPin, guardarPin, reabrirPuerta } from '../../../../lib/cotiza/pin-db'

/**
 * Administra el PIN de Cotiza (RF-220). Solo con sesión completa: esta ruta no
 * está entre las que abre el PIN, y aun así se rechaza explícitamente quien
 * llegue con él, por si algún día alguien ensancha esa lista sin mirar aquí.
 *
 *   POST   { pin: "4827" }        fija o cambia el PIN (invalida las cookies viejas)
 *   POST   { accion: "reabrir" }  reabre la puerta tras un cierre por intentos
 *   DELETE                        quita el PIN y con él la puerta
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.cotizaPin) return json(403, { error: 'requiere la sesión completa del panel' })

  let bruto: unknown
  try {
    bruto = await request.json()
  } catch {
    return json(400, { error: 'cuerpo inválido' })
  }
  const cuerpo = (bruto ?? {}) as { pin?: unknown; accion?: unknown }

  if (cuerpo.accion === 'reabrir') {
    await reabrirPuerta()
    await recordAdminEvent(request, 'cotiza.puerta_reabierta')
    return json(200, { ok: true })
  }

  const problema = problemaDePin(cuerpo.pin)
  if (problema) return json(400, { error: problema })
  await guardarPin(cuerpo.pin as string)
  await recordAdminEvent(request, 'cotiza.pin_cambiado')
  return json(200, { ok: true })
}

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (locals.cotizaPin) return json(403, { error: 'requiere la sesión completa del panel' })
  await borrarPin()
  await recordAdminEvent(request, 'cotiza.pin_quitado')
  return json(200, { ok: true })
}
