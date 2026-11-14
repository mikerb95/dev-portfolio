import type { APIRoute } from 'astro'
import { clientIp } from '../../../lib/device-info'
import { recordSecurityEvent } from '../../../lib/security/events'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'
import { CABECERA_TOKEN, llaveDe } from '../../../lib/hackaton/acceso'
import { escribirTablero, leerTablero } from '../../../lib/hackaton/store'
import { ErrorTablero } from '../../../lib/hackaton/tablero'
import { validarOperacion } from '../../../lib/hackaton/validacion'

/**
 * Tablero del equipo para la hackatón def/acc (RF-047).
 *
 *   GET                       -> { estado, version, puedeEditar, llave }
 *   POST { op }               -> { estado, version } | 400 | 401 | 409 | 429 | 503
 *
 * Lectura pública; escritura con sesión de admin o con el token del enlace
 * del equipo en la cabecera x-equipo-token (nunca en la URL de la API: la URL
 * acaba en logs de acceso). La página consulta cada pocos segundos, así que el
 * GET no lleva caché de CDN: un estado de hace cinco minutos en un tablero de
 * un sprint de ocho horas es un tablero equivocado.
 */

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  })

const MINUTO = 60_000

export const GET: APIRoute = async ({ request, cookies }) => {
  const ip = clientIp(request.headers) ?? 'desconocida'
  // Cinco personas consultando cada 4 s detrás del mismo NAT son 75 por minuto.
  const r = await enforceLimit(`hackaton-leer:${ip}`, { limit: 240, windowMs: MINUTO, deferUntil: 0.8 })
  if (!r.allowed) return json(429, { error: 'Demasiadas consultas; espera un momento.' }, { 'Retry-After': '30' })
  try {
    const [{ estado, version }, llave] = await Promise.all([leerTablero(), llaveDe(request, cookies)])
    return json(200, { estado, version, puedeEditar: llave !== null, llave })
  } catch (err) {
    console.error('[hackaton/tablero GET]', err)
    return json(503, { error: 'El tablero no responde ahora. Intenta en un momento.' })
  }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const ip = clientIp(request.headers) ?? 'desconocida'
  const r = await enforceLimit(`hackaton-escribir:${ip}`, { limit: 90, windowMs: MINUTO, deferUntil: 0.5 })
  if (!r.allowed) return json(429, { error: 'Demasiados cambios seguidos; espera un momento.' }, { 'Retry-After': '30' })

  const llave = await llaveDe(request, cookies)
  if (!llave) {
    // Un token presente pero inválido es un intento, no un visitante que
    // olvidó el enlace: va al micro-SIEM con su propio límite, más corto.
    if (request.headers.get(CABECERA_TOKEN)) {
      const fallos = await enforceLimit(`hackaton-token:${ip}`, { limit: 10, windowMs: 10 * MINUTO })
      await recordSecurityEvent({
        ip,
        classification: { category: 'auth_probing', severity: 'medium', ruleId: 'hackaton.token_invalido' },
        method: 'POST',
        path: '/api/hackaton/tablero',
        userAgent: request.headers.get('user-agent'),
        statusCode: fallos.allowed ? 401 : 429,
      })
      if (!fallos.allowed) return json(429, { error: 'Demasiados intentos con un enlace inválido.' }, { 'Retry-After': '600' })
    }
    return json(401, { error: 'Solo lectura: para editar hace falta el enlace del equipo.' })
  }

  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return json(400, { error: 'Cuerpo inválido.' })
  }
  const op = validarOperacion((cuerpo as { op?: unknown } | null)?.op)
  if (!op) return json(400, { error: 'Operación inválida.' })

  try {
    const { estado, version } = await escribirTablero(op)
    if (op.tipo === 'reiniciar') {
      await recordSecurityEvent({
        ip,
        classification: { category: 'hackaton', severity: 'low', ruleId: 'hackaton.reiniciado' },
        method: 'POST',
        path: `/api/hackaton/tablero#${llave}`,
        userAgent: request.headers.get('user-agent'),
        statusCode: 200,
      })
    }
    return json(200, { estado, version })
  } catch (err) {
    if (err instanceof ErrorTablero) return json(409, { error: err.message })
    console.error('[hackaton/tablero POST]', err)
    return json(503, { error: 'No se pudo guardar el cambio. Intenta de nuevo.' })
  }
}
