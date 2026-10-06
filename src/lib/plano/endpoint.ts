// Piezas comunes de los endpoints públicos de /api/propuesta/<token>. Solo
// servidor.

import { clientIp } from '../ratelimit'
import { recordSecurityEvent } from '../security/events'
import { propuestaPorToken, type Propuesta } from './db'
import { esTokenValido } from './hash'

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    // Precios y datos personales de un cliente: nunca en ninguna caché.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/**
 * La propuesta del token, solo si ya se envió y no está descartada. Se valida
 * la FORMA del token antes de consultar: un sondeo con basura no genera
 * lectura, y la respuesta es la misma para "no existe" que para "no enviada".
 */
export async function propuestaPublica(token: unknown): Promise<Propuesta | null> {
  if (!esTokenValido(token)) return null
  const p = await propuestaPorToken(token)
  if (!p || p.estado === 'borrador' || p.estado === 'descartada' || p.versionActual === 0) return null
  return p
}

export async function leerJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const d = await request.json()
    return d && typeof d === 'object' ? (d as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Rastro en el micro-SIEM con categoría de auditoría. Fire-and-forget. */
export function rastro(request: Request, ruleId: string, statusCode: number) {
  const url = new URL(request.url)
  void recordSecurityEvent({
    classification: { category: 'propuesta', severity: 'low', ruleId },
    ip: clientIp(request),
    method: request.method,
    // Sin el token: la ruta del rastro no debe servir para abrir la propuesta.
    path: url.pathname.replace(/\/propuesta\/[^/]+/, '/propuesta/:token'),
    query: null,
    userAgent: request.headers.get('user-agent'),
    country: request.headers.get('x-vercel-ip-country'),
    asn: request.headers.get('x-vercel-ip-as-number'),
    statusCode,
    action: 'logged',
  })
}
