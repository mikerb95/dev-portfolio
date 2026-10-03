import type { APIRoute } from 'astro'
import { leerDesde, validarMensajeVisitante } from '../../../lib/asesor/vivo'
import { anexar, marcarVisto, mensajesDesde, porToken } from '../../../lib/asesor/vivo-db'
import { clientIp } from '../../../lib/ratelimit'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'

// Lado del visitante del asesor en vivo (lib/asesor/vivo.ts). El token viaja en
// un header y no en la URL: así no queda en logs ni en el historial, y es lo
// único que deja leer lo que escribe Mike.
//
// GET: sondeo. Devuelve si Mike ya entró y sus mensajes nuevos.
// POST: mensaje del visitante cuando Mike ya está en la conversación (antes de
// eso las preguntas van al asesor, por /api/asesor).

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const conv = await porToken(request.headers.get('x-asesor-token') ?? '')
    if (!conv) return json(404, { error: 'no_existe' })
    const nuevos = await mensajesDesde(conv.id, leerDesde(url.searchParams.get('desde')), ['mike'])
    await marcarVisto(conv).catch(() => {})
    return json(200, {
      mike: conv.estado === 'mike',
      mensajes: nuevos.map((m) => ({ id: m.id, texto: m.texto })),
    })
  } catch {
    // Sin base no hay nada nuevo que contar; el chat vuelve a preguntar luego.
    return json(503, { error: 'fallo' })
  }
}

export const POST: APIRoute = async ({ request }) => {
  // Una persona escribiendo no manda 60 mensajes en diez minutos.
  const { allowed } = await enforceLimit(`asesor-vivo:${clientIp(request)}`, { limit: 60, windowMs: 600_000 })
  if (!allowed) return json(429, { error: 'limite' })

  const m = validarMensajeVisitante(await request.json().catch(() => null))
  if (!m) return json(400, { error: 'formato' })
  try {
    const conv = await porToken(m.t)
    if (!conv) return json(404, { error: 'no_existe' })
    if (conv.estado !== 'mike') return json(409, { error: 'sin_mike' })
    const ok = await anexar(conv.id, [{ autor: 'visitante', texto: m.texto }])
    if (!ok) return json(429, { error: 'limite' })
    return json(201, { ok: true })
  } catch {
    return json(503, { error: 'fallo' })
  }
}
