import type { APIRoute } from 'astro'
import { enviarAPlano } from '../../../lib/asesor/propuesta'
import { TOKEN_RE } from '../../../lib/asesor/vivo'
import { mensajesDesde, porToken } from '../../../lib/asesor/vivo-db'
import { clientIp } from '../../../lib/ratelimit'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'

// La burbuja avisa aquí cuando el visitante toca "Enviarle esto a Mike"
// (navigator.sendBeacon, así que no espera la respuesta: el enlace a WhatsApp
// se abre igual). Su conversación queda como propuesta en borrador en Plano
// (lib/asesor/propuesta.ts). Público, como el resto del asesor.
//
// Siempre 204 y sin cuerpo: el visitante no tiene nada que hacer con la
// respuesta, y un 404 distinto para un token inválido le diría a un curioso
// cuáles existen. Falla abierto: cualquier error se anota y se calla.

const nada = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

export const POST: APIRoute = async ({ request }) => {
  try {
    const { allowed } = await enforceLimit(`asesor-enviado:${clientIp(request)}`, { limit: 10, windowMs: 600_000 })
    if (!allowed) return nada()
    // sendBeacon puede mandar el cuerpo como texto: se lee como texto y se parsea.
    const cuerpo = JSON.parse((await request.text()).slice(0, 500) || '{}') as { t?: unknown }
    const token = typeof cuerpo.t === 'string' ? cuerpo.t : ''
    if (!TOKEN_RE.test(token)) return nada()
    const conv = await porToken(token)
    if (!conv) return nada()
    await enviarAPlano(conv, await mensajesDesde(conv.id, 0))
  } catch (err) {
    console.error('[asesor/enviado]', err instanceof Error ? err.message : err)
  }
  return nada()
}
