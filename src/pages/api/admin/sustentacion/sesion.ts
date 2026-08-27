import type { APIRoute } from 'astro'
import { crearSesion, secretoDeSesion, sesionActual } from '../../../../lib/sustentacion/bus'
import { storeReadiness } from '../../../../lib/present/store'

/**
 * Alta y recuperación de la sesión de sustentación.
 *
 * Va bajo /api/admin porque el que abre la sesión es el presentador, y el
 * middleware ya exige sesión de admin en todo este subárbol (no hay gate
 * paralelo aquí). El secreto sale en la respuesta: quien llega hasta este
 * endpoint ya está autenticado, y es lo que el canvas necesita para publicar
 * beats después contra el endpoint público.
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/** Sesión en curso, para que recargar el canvas no emita un PIN nuevo. */
export const GET: APIRoute = async () => {
  const sesion = await sesionActual()
  if (!sesion) return json(404, { error: 'no hay sesión de sustentación en curso' })
  return json(200, {
    sessionId: sesion.id,
    pin: sesion.pin,
    beat: sesion.beat,
    titulo: sesion.titulo,
    dato: sesion.dato,
    secreto: await secretoDeSesion(sesion.id),
  })
}

export const POST: APIRoute = async ({ request }) => {
  // Se corta ANTES de proyectar nada: con el almacén en memoria, cada instancia
  // de Vercel tendría su propia copia y el público vería beats distintos.
  const readiness = storeReadiness()
  if (!readiness.ok) return json(503, { error: readiness.reason })

  let titulo = 'Sustentación'
  let reusar = true
  try {
    const body = (await request.json()) as { titulo?: unknown; reusar?: unknown }
    if (typeof body.titulo === 'string' && body.titulo.trim()) titulo = body.titulo.trim().slice(0, 120)
    if (body.reusar === false) reusar = false
  } catch {
    // Cuerpo vacío es un alta normal con los valores por defecto.
  }

  // Por defecto se REUTILIZA la sesión viva. Abrir el canvas dos veces (o
  // recargarlo) es lo normal el día de la sustentación; emitir un PIN nuevo
  // cada vez sería la forma más fácil de dejar al público desconectado.
  if (reusar) {
    const viva = await sesionActual()
    if (viva) {
      return json(200, {
        sessionId: viva.id,
        pin: viva.pin,
        beat: viva.beat,
        titulo: viva.titulo,
        dato: viva.dato,
        secreto: await secretoDeSesion(viva.id),
        reutilizada: true,
      })
    }
  }

  try {
    const sesion = await crearSesion(titulo)
    return json(201, {
      sessionId: sesion.id,
      pin: sesion.pin,
      beat: sesion.beat,
      titulo: sesion.titulo,
      dato: sesion.dato,
      secreto: await secretoDeSesion(sesion.id),
      reutilizada: false,
    })
  } catch (e) {
    return json(503, { error: e instanceof Error ? e.message : 'no se pudo crear la sesión' })
  }
}
