import type { APIRoute } from 'astro'
import { clientIp } from '../../../lib/device-info'
import { serverEnv } from '../../../lib/env'
import { sendPush } from '../../../lib/notify'
import { recordSecurityEvent } from '../../../lib/security/events'
import {
  COTIZA_COOKIE,
  COTIZA_TTL_SEG,
  cierraLaPuerta,
  decidirIntento,
  firmarAccesoCotiza,
  pinBienFormado,
} from '../../../lib/cotiza/acceso'
import {
  cerrarPuerta,
  leerFrenos,
  leerPin,
  limpiarFallosIp,
  pinCorrecto,
  registrarFallo,
} from '../../../lib/cotiza/pin-db'

/**
 * Cambia el PIN de Cotiza por la cookie `cotiza_acceso` (RF-220).
 *
 *   POST { pin: "1234" } -> 200 + cookie | 403 | 429 | 503
 *
 * Falla CERRADA en todo lo que decide si se abre: sin poder leer el PIN o los
 * frenos, 503. El registro en el micro-SIEM y el aviso a ntfy son lo único
 * fail-open, y aun así se esperan: en una función serverless una promesa
 * suelta puede morir al congelarse la instancia.
 */

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  })

const NO_DISPONIBLE = 'El acceso con PIN no está disponible ahora. Entra con GitHub.'

function registrar(request: Request, ip: string | null, ok: boolean): Promise<void> {
  return recordSecurityEvent({
    ip,
    classification: ok
      ? { category: 'admin_action', severity: 'low', ruleId: 'cotiza.pin_access' }
      : { category: 'auth_probing', severity: 'medium', ruleId: 'cotiza.pin_failed' },
    method: 'POST',
    path: '/api/cotiza/pin',
    userAgent: request.headers.get('user-agent'),
    statusCode: ok ? 200 : 403,
  })
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const secreto = serverEnv('AUTH_SECRET')
  if (!secreto) return json(503, { error: NO_DISPONIBLE })

  let bruto: unknown
  try {
    bruto = await request.json()
  } catch {
    return json(400, { error: 'Solicitud inválida.' })
  }
  const pin = (bruto as { pin?: unknown } | null)?.pin
  // Un PIN mal formado no es un intento de adivinar: no gasta frenos ni llega a scrypt.
  if (!pinBienFormado(pin)) return json(400, { error: 'El PIN son 4 dígitos.' })

  const ip = clientIp(request.headers)
  const claveIp = ip ?? 'sin-ip'

  let guardado
  let frenos
  try {
    ;[guardado, frenos] = await Promise.all([leerPin(), leerFrenos(claveIp)])
  } catch {
    return json(503, { error: NO_DISPONIBLE })
  }
  if (!guardado) return json(503, { error: 'El acceso con PIN no está configurado. Entra con GitHub.' })

  const decision = decidirIntento(frenos)
  if (decision.tipo === 'puerta_cerrada') {
    return json(
      429,
      { error: 'El acceso con PIN está suspendido por demasiados intentos. Entra con GitHub o espera.' },
      { 'Retry-After': String(decision.reintentarEnSeg) }
    )
  }
  if (decision.tipo === 'ip_frenada') {
    return json(429, { error: 'Demasiados intentos. Espera 15 minutos.' }, { 'Retry-After': '900' })
  }

  if (!(await pinCorrecto(pin, guardado))) {
    let globales = 0
    try {
      globales = await registrarFallo(claveIp)
      if (cierraLaPuerta(globales)) {
        await cerrarPuerta()
        await sendPush(
          'Cotiza: acceso con PIN suspendido',
          'Hubo 10 intentos fallidos de PIN en la última hora. La entrada con PIN queda apagada una hora; GitHub sigue funcionando. Si no eras tú, cambia el PIN en Ajustes.',
          { priority: 4, tags: 'lock' }
        )
      }
    } catch {
      // Si no se pudo contar el fallo, el intento igual se rechaza. Lo que se
      // pierde es el freno de este fallo, no la seguridad de este intento.
    }
    await registrar(request, ip, false)
    return json(403, { error: 'PIN incorrecto.' })
  }

  try {
    await limpiarFallosIp(claveIp)
  } catch {
    // Accesorio: los fallos viejos de esta IP vencen solos en 15 minutos.
  }

  cookies.set(COTIZA_COOKIE, firmarAccesoCotiza(secreto, guardado.version), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: COTIZA_TTL_SEG,
  })

  await registrar(request, ip, true)
  // Cada entrada con PIN me avisa: si alguien más lo sabe, me entero en el
  // momento y no al revisar el SIEM. Prioridad baja, sin sonido insistente.
  await sendPush('Cotiza: entrada con PIN', 'Alguien acaba de entrar a Cotiza con el PIN. Si no fuiste tú, cámbialo en Ajustes.', {
    priority: 2,
    tags: 'key',
  })

  return json(200, { ok: true })
}
