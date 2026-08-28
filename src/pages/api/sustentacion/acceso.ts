import type { APIRoute } from 'astro'
import { presentStore } from '../../../lib/present/store'
import { clientIp } from '../../../lib/ratelimit'
import {
  ACCESO_COOKIE,
  ACCESO_TTL_SEG,
  contrasenaCorrecta,
  firmarAcceso,
} from '../../../lib/sustentacion/acceso'
import { serverEnv } from '../../../lib/env'

/**
 * Cambia la contraseña de `SUSTENTACION_PASSWORD` por acceso al panel de la
 * sustentación (ver el alcance exacto en `lib/sustentacion/acceso.ts`).
 *
 *   POST { password } -> cookie `sustentacion_acceso`
 *
 * Cero consultas a Turso, como todo lo de la sustentación: la contraseña sale
 * de una variable de entorno y el contador de intentos vive en Redis.
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/**
 * Diez intentos por IP y minuto, en Redis y no en el limitador durable de
 * `lib/security`, que vive en Turso: esta puerta existe justamente para
 * funcionar con la base caída, así que su defensa no puede depender de ella.
 *
 * Es fail-open, como el resto de la observabilidad del repo: si Redis no
 * responde, el intento pasa al control de la contraseña en vez de dejarme
 * fuera de mi propia sustentación. Cubre el tecleo torpe, no un ataque
 * dedicado; lo que acota el daño de esta puerta es su alcance, no su límite.
 */
const VENTANA_MS = 60_000
const LIMITE = 10

async function excedido(ip: string): Promise<boolean> {
  try {
    const ventana = Math.floor(Date.now() / VENTANA_MS)
    const n = await presentStore().incr(
      `sust:rl:acceso:${ventana}:${ip}`,
      Math.ceil(VENTANA_MS / 1000)
    )
    return n > LIMITE
  } catch {
    return false
  }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const esperada = serverEnv('SUSTENTACION_PASSWORD')
  if (!esperada) {
    // Sin variable configurada la puerta no existe. Se dice tal cual: es un
    // fallo de configuración, no una contraseña equivocada, y confundirlos
    // cuesta media hora de intentos delante de nadie.
    return json(503, { error: 'acceso por contraseña no configurado' })
  }

  let bruto: unknown
  try {
    bruto = await request.json()
  } catch {
    return json(400, { error: 'cuerpo inválido' })
  }

  const password = (bruto as { password?: unknown })?.password
  if (typeof password !== 'string' || !password) {
    return json(400, { error: 'falta la contraseña' })
  }

  if (await excedido(clientIp(request))) {
    return json(429, { error: 'demasiados intentos, espera un minuto' })
  }

  if (!contrasenaCorrecta(password, esperada)) {
    return json(403, { error: 'contraseña incorrecta' })
  }

  const secreto = serverEnv('PRESENT_SECRET') || serverEnv('AUTH_SECRET')
  if (!secreto) {
    return json(503, { error: 'falta AUTH_SECRET: no se puede firmar el acceso' })
  }

  cookies.set(ACCESO_COOKIE, firmarAcceso(secreto), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: ACCESO_TTL_SEG,
  })

  return json(200, { ok: true })
}
