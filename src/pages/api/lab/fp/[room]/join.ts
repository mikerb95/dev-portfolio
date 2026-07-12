import type { APIRoute } from 'astro'
import { getRoom, joinDevice } from '../../../../../lib/fingerprint'
import { clientIp } from '../../../../../lib/device-info'
import { enforceLimit } from '../../../../../lib/security/ratelimit-durable'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const POST: APIRoute = async ({ params, request }) => {
  const roomId = params.room
  if (!roomId) return json(400, { error: 'sala requerida' })

  // La demo se usa con muchos dispositivos en la misma wifi/evento (todos
  // comparten la IP pública NAT), así que el límite por IP es holgado. El
  // guardia real contra abuso es el límite de creación de salas (10/min).
  const ip = clientIp(request.headers) ?? 'unknown'
  const decision = await enforceLimit(`fp:join:${ip}`, { limit: 100, windowMs: 60_000, deferUntil: 0.5 })
  if (!decision.allowed) return json(429, { error: 'demasiados intentos, espera un momento' })

  const room = await getRoom(roomId)
  if (!room) return json(404, { error: 'sala no encontrada o expirada' })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const deviceHash = typeof body.hash === 'string' ? body.hash.slice(0, 128) : null
  const entropyBits = typeof body.entropyBits === 'number' ? body.entropyBits : 0
  const libFpHash = typeof body.libFpHash === 'string' ? body.libFpHash.slice(0, 128) : null
  const ownFp = Array.isArray(body.signals) ? body.signals : null

  if (!deviceHash) return json(400, { error: 'hash requerido' })

  const result = await joinDevice({ roomId, deviceHash, ownFp, libFpHash, entropyBits })
  return json(200, result)
}
