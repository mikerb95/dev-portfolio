import type { APIRoute } from 'astro'
import { getRoom, recordBehavior } from '../../../../../lib/fingerprint'
import { clientIp } from '../../../../../lib/device-info'
import { enforceLimit } from '../../../../../lib/security/ratelimit-durable'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Heartbeat de comportamiento (mouse/tecleo/orientación). Baja frecuencia
// esperada (cliente lo llama cada pocos segundos), límite generoso.
export const POST: APIRoute = async ({ params, request }) => {
  const roomId = params.room
  if (!roomId) return json(400, { error: 'sala requerida' })

  const room = await getRoom(roomId)
  if (!room) return json(404, { error: 'sala no encontrada o expirada' })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const deviceHash = typeof body.hash === 'string' ? body.hash.slice(0, 128) : null
  if (!deviceHash) return json(400, { error: 'hash requerido' })

  // Límite por dispositivo (sala+hash), no por IP: en un evento decenas de
  // dispositivos comparten la IP NAT y cada uno late cada ~4s. Escopar por IP
  // bloquearía latidos legítimos; por dispositivo cada uno tiene su presupuesto.
  const decision = await enforceLimit(`fp:beat:${roomId}:${deviceHash}`, { limit: 30, windowMs: 60_000, deferUntil: 0.7 })
  if (!decision.allowed) return json(429, { error: 'demasiados envíos' })

  await recordBehavior({ roomId, deviceHash, behaviorSig: body.behavior ?? {} })
  return json(200, { ok: true })
}
