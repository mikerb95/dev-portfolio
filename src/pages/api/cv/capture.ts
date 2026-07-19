import type { APIRoute } from 'astro'
import { recordCaptureAttempt } from '../../../lib/cv-downloads'
import { clientIp } from '../../../lib/device-info'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request.headers) ?? 'unknown'
  const decision = await enforceLimit(`cv:capture:${ip}`, { limit: 20, windowMs: 60_000, deferUntil: 0.5 })
  if (!decision.allowed) return json(429, { error: 'demasiados intentos, espera un momento' })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const deviceHash = typeof body.hash === 'string' ? body.hash.slice(0, 128) : null
  const rawBits = typeof body.entropyBits === 'number' && Number.isFinite(body.entropyBits) ? body.entropyBits : 0
  const entropyBits = Math.max(0, Math.min(64, rawBits))
  const libFpHash = typeof body.libFpHash === 'string' ? body.libFpHash.slice(0, 128) : null
  const signals = Array.isArray(body.signals) ? body.signals : null

  // Fail-open: el registro de control nunca debe bloquear a alguien que quiere
  // el CV. Si el hash no llegó (JS falló, bloqueado, etc.) igual damos token.
  const effectiveHash = deviceHash ?? `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`

  try {
    const { token } = await recordCaptureAttempt({
      deviceHash: effectiveHash,
      signals,
      libFpHash,
      entropyBits,
      ip,
      userAgent: request.headers.get('user-agent'),
      referer: request.headers.get('referer'),
    })
    return json(200, { token })
  } catch (e) {
    console.error('cv/capture debug', e)
    // Si la DB falla, igual dejamos pasar la descarga (fail-open) con un token
    // temporal que el endpoint de descarga acepta sin buscarlo en la tabla.
    return json(200, { token: `bypass-${randomToken()}` })
  }
}

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
