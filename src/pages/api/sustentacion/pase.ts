import type { APIRoute } from 'astro'
import { clientIp } from '../../../lib/ratelimit'
import { autorizarPorPin } from '../../../lib/sustentacion/control'
import { PASE_COOKIE, PASE_TTL_SEG, firmarPase } from '../../../lib/sustentacion/pase'
import { normalizarPinPresentador } from '../../../lib/sustentacion/pin-presentador'
import { serverEnv } from '../../../lib/env'

/**
 * Cambia el PIN de presentador por un pase para PROYECTAR el escenario.
 *
 *   POST { pin } -> cookie `sustentacion_pase`
 *
 * Es la puerta alternativa a la sesión de admin en `/sustentacion`, y existe
 * para que proyectar no dependa de GitHub OAuth el día de la sustentación (ver
 * la cabecera de `lib/sustentacion/pase.ts`). Cero consultas a Turso: el PIN se
 * deriva por HMAC del id de sesión y la sesión vive en Redis.
 *
 * No abre nada nuevo: quien tiene este PIN ya puede mover la presentación
 * entera desde `/api/sustentacion/comando`. Lo que cambia es desde dónde.
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const POST: APIRoute = async ({ request, cookies }) => {
  let bruto: unknown
  try {
    bruto = await request.json()
  } catch {
    return json(400, { error: 'cuerpo inválido' })
  }

  const pin = normalizarPinPresentador((bruto as { pin?: unknown })?.pin as string | undefined)
  if (!pin) return json(400, { error: 'PIN inválido' })

  // Misma autorización que el comando, con el mismo rate limit y el mismo cupo
  // de intentos fallidos: dos puertas, un solo cupo.
  const auth = await autorizarPorPin(pin, clientIp(request))
  if (!auth.ok) return json(auth.status, { error: auth.error })

  const secreto = serverEnv('PRESENT_SECRET') || serverEnv('AUTH_SECRET')
  if (!secreto) {
    // Sin clave no se puede firmar nada. Se dice claro en vez de emitir un pase
    // que luego no verifique, que parecería un fallo del PIN.
    return json(503, { error: 'falta AUTH_SECRET: no se puede emitir el pase' })
  }

  cookies.set(PASE_COOKIE, firmarPase(secreto, auth.sesion.id), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: PASE_TTL_SEG,
  })

  return json(200, { ok: true, sessionId: auth.sesion.id })
}
