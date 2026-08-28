import type { APIRoute } from 'astro'
import { clientIp } from '../../../lib/ratelimit'
import { ejecutarComando, parseComando } from '../../../lib/sustentacion/control'

/**
 * Control remoto de la sustentación: el teléfono manda, el canvas obedece.
 *
 *   POST { pin, accion: "siguiente"|"anterior"|"ir", beat?, clienteId, seq }
 *
 * Es PÚBLICO por diseño, igual que `/beat`. La credencial es el PIN de
 * PRESENTADOR y nada más: esto tiene que abrirse en el navegador de un celular
 * con 5G irregular, sin login, sin OAuth y sin cookie de sesión que renovar a
 * mitad de la charla. Todo lo que sostiene esa decisión está en `control.ts`:
 * el PIN largo derivado por HMAC, el rate limit por IP y el cupo de intentos
 * fallidos.
 *
 * La respuesta lleva SIEMPRE la posición absoluta, también cuando el comando se
 * descartó por duplicado. Un teléfono que no vio la respuesta y reintenta no
 * necesita saber qué pasó con su comando: necesita saber en qué beat estamos.
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const POST: APIRoute = async ({ request }) => {
  let bruto: unknown
  try {
    bruto = await request.json()
  } catch {
    return json(400, { error: 'cuerpo inválido' })
  }

  const parseo = parseComando(bruto)
  if (!parseo.ok) return json(400, { error: parseo.error })

  const r = await ejecutarComando(parseo.comando, clientIp(request))
  if (!r.ok) return json(r.status, { error: r.error })

  return json(200, { ...r.estado, aplicado: r.aplicado, motivo: r.motivo ?? null })
}
