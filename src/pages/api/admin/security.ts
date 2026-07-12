import type { APIRoute } from 'astro'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../../db'
import { securityAnomalies } from '../../../db/schema'
import { blockIp, unblockIp, BLOCK_TTL_STEPS_SEC } from '../../../lib/security/blocklist'
import { blockAllAttackerIps } from '../../../lib/security/autoblock'

// TTLs permitidos para el bloqueo masivo: 24 h o 1 semana.
const BULK_TTLS = new Set<number>([86_400, 604_800])

// Mutaciones del panel de seguridad. Protegido por el middleware de /api/admin
// (auth + allowlist), así que aquí no re-validamos sesión.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Validación laxa de IP (IPv4 o IPv6). No es una frontera de seguridad; solo
// evita basura en la tabla.
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  const action = typeof body?.action === 'string' ? body.action : ''

  if (action === 'block') {
    const ip = typeof body.ip === 'string' ? body.ip.trim() : ''
    if (!IP_RE.test(ip)) return json(400, { error: 'IP inválida' })
    const ttlSec = Number.isFinite(body.ttlSec) ? Number(body.ttlSec) : BLOCK_TTL_STEPS_SEC[0]
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : 'bloqueo manual'
    const ok = await blockIp({ ip, reason, ttlSec, source: 'manual' })
    if (!ok) return json(409, { error: 'IP en allowlist o inválida' })
    return json(200, { ok: true })
  }

  if (action === 'unblock') {
    const ip = typeof body.ip === 'string' ? body.ip.trim() : ''
    if (!ip) return json(400, { error: 'IP requerida' })
    await unblockIp(ip)
    return json(200, { ok: true })
  }

  if (action === 'ack') {
    const id = Number(body.id)
    if (!Number.isInteger(id)) return json(400, { error: 'id inválido' })
    await db.update(securityAnomalies).set({ acknowledged: true }).where(eq(securityAnomalies.id, id))
    return json(200, { ok: true })
  }

  return json(400, { error: 'acción desconocida' })
}
