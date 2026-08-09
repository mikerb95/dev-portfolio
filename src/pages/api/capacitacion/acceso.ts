import type { APIRoute } from 'astro'
import {
  TRAINING_COOKIE,
  TRAINING_TTL_SEC,
  createTrainingPass,
  isWellFormedCode,
} from '../../../lib/capacitacion/access'
import { canjearCodigo } from '../../../lib/capacitacion/repo'
import { serverEnv } from '../../../lib/env'
import { recordSecurityEvent } from '../../../lib/security/events'
import { clientIp } from '../../../lib/ratelimit'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/**
 * Canje de un código de grupo por un pase firmado.
 *
 * El rate limit por IP lo aplica el middleware (isTrainingAccessPath): el
 * código son ocho caracteres y sin freno se podría barrer el espacio. Aquí
 * solo queda el filtro de forma, que evita ir a la base por cada intento
 * absurdo.
 */
export const POST: APIRoute = async ({ request, cookies, url }) => {
  const secret = serverEnv('TRAINING_ACCESS_SECRET')
  // Sin secreto no se puede firmar nada. A diferencia del resto del sitio esto
  // NO es fail-open: emitir un pase sin firma sería peor que no emitir ninguno.
  if (!secret) return json(503, { error: 'el acceso al banco no está configurado' })

  const form = await request.formData()
  const codigo = String(form.get('codigo') ?? '')

  const registrar = (ok: boolean) =>
    void recordSecurityEvent({
      classification: {
        category: 'capacitacion',
        severity: ok ? 'low' : 'medium',
        ruleId: ok ? 'capacitacion.pass_granted' : 'capacitacion.pass_denied',
      },
      ip: clientIp(request),
      method: 'POST',
      path: '/api/capacitacion/acceso',
      query: null,
      userAgent: request.headers.get('user-agent'),
      country: request.headers.get('x-vercel-ip-country'),
      asn: request.headers.get('x-vercel-ip-as-number'),
      statusCode: ok ? 200 : 401,
      action: 'logged',
    })

  // El mismo mensaje para "mal escrito", "no existe", "vencido" y "revocado":
  // distinguirlos le diría a quien prueba códigos cuáles existen.
  const rechazo = () => {
    registrar(false)
    return json(401, { error: 'ese código no sirve o ya venció' })
  }

  if (!isWellFormedCode(codigo)) return rechazo()

  const fila = await canjearCodigo(codigo)
  if (!fila) return rechazo()

  cookies.set(TRAINING_COOKIE, createTrainingPass(secret, fila.id), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    maxAge: TRAINING_TTL_SEC,
  })

  registrar(true)
  return json(200, { ok: true, grupo: fila.label })
}

/** Salir del banco: borra el pase de este navegador. */
export const DELETE: APIRoute = async ({ cookies }) => {
  cookies.delete(TRAINING_COOKIE, { path: '/' })
  return json(200, { ok: true })
}
