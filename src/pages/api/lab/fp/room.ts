import type { APIRoute } from 'astro'
import QRCode from 'qrcode'
import { createRoom } from '../../../../lib/fingerprint'
import { clientIp } from '../../../../lib/device-info'
import { enforceLimit } from '../../../../lib/security/ratelimit-durable'

const SITE_URL = import.meta.env.AUTH_URL ?? 'https://codebymike.tech'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Crear salas es una acción de bajo tráfico y pública: límite generoso pero
// real, para que nadie inunde la tabla fp_rooms.
export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request.headers) ?? 'unknown'
  const decision = await enforceLimit(`fp:room:${ip}`, { limit: 10, windowMs: 60_000, deferUntil: 0 })
  if (!decision.allowed) return json(429, { error: 'demasiadas salas creadas, espera un momento' })

  const { id, expiresAt } = await createRoom()
  const joinUrl = `${SITE_URL}/lab/fingerprint/${id}`
  const qrSvg = await QRCode.toString(joinUrl, { type: 'svg', margin: 1, width: 320 })

  return json(201, { id, expiresAt, joinUrl, qrSvg })
}
