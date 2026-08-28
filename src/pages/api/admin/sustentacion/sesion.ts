import type { APIRoute } from 'astro'
import {
  crearSesion,
  pinPresentadorDe,
  secretoDeSesion,
  sesionActual,
  type SustentacionSession,
} from '../../../../lib/sustentacion/bus'
import { formatearPinPresentador } from '../../../../lib/sustentacion/pin-presentador'
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

/**
 * Los DOS PINes de una sesión, en la única respuesta que los lleva juntos.
 *
 *   · `pin`            - de ASISTENTE. Cuatro caracteres, va proyectado y en el
 *     QR. Solo lectura: con él se sigue la presentación, no se mueve.
 *   · `pinPresentador` - de CONTROL. Diez caracteres, derivado por HMAC del id
 *     de sesión (no está guardado en Redis, ver `bus.ts`). Es lo que tecleo en
 *     el celular y lo único que autoriza `/api/sustentacion/comando`.
 *
 * Que el de presentador salga SOLO por aquí es lo que lo mantiene privado: este
 * subárbol está detrás de la sesión de admin en el middleware, mientras que el
 * de asistente aparece en pantalla delante de todo el mundo. Si fueran el mismo
 * valor, cualquiera del público podría mover mi presentación desde su celular.
 */
async function credenciales(sesion: SustentacionSession) {
  const pinPresentador = await pinPresentadorDe(sesion.id)
  return {
    sessionId: sesion.id,
    pin: sesion.pin,
    pinPresentador,
    /** El mismo PIN con guiones, para leerlo y teclearlo sin equivocarse. */
    pinPresentadorLegible: formatearPinPresentador(pinPresentador),
    beat: sesion.beat,
    titulo: sesion.titulo,
    dato: sesion.dato,
    secreto: await secretoDeSesion(sesion.id),
  }
}

/** Sesión en curso, para que recargar el canvas no emita un PIN nuevo. */
export const GET: APIRoute = async () => {
  const sesion = await sesionActual()
  if (!sesion) return json(404, { error: 'no hay sesión de sustentación en curso' })
  return json(200, await credenciales(sesion))
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
      return json(200, { ...(await credenciales(viva)), reutilizada: true })
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
