import type { APIRoute } from 'astro'
import type { Locale } from '../../../../i18n'
import { enlaceWhatsapp, leerDesde, validarMensajeMike, visitantePresente } from '../../../../lib/asesor/vivo'
import { anexar, mensajesDesde, porId, tomar } from '../../../../lib/asesor/vivo-db'
import { formatPhone } from '../../../../lib/phone'
import { recordAdminEvent } from '../../../../lib/security/events'

// Lado de Mike del asesor en vivo (lib/asesor/vivo.ts). Protegido por el
// middleware de /api/admin y vetado en modo demo.
//
// GET: sondeo de la pantalla de la conversación (todo lo nuevo, de cualquier autor).
// POST: Mike escribe. El primer mensaje toma la conversación y calla al asesor.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const leerId = (valor: string | undefined) => {
  const n = Number(valor)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export const GET: APIRoute = async ({ params, url }) => {
  const id = leerId(params.id)
  if (!id) return json(404, { error: 'No existe.' })
  const conv = await porId(id)
  if (!conv) return json(404, { error: 'Esa conversación ya no existe (se borran a las 48 h).' })
  const mensajes = await mensajesDesde(id, leerDesde(url.searchParams.get('desde')))
  return json(200, {
    estado: conv.estado,
    presente: visitantePresente(conv.vistoVisitante, new Date()),
    telefono: conv.telefono ? { texto: formatPhone(conv.telefono), enlace: enlaceWhatsapp(conv.telefono, conv.locale as Locale) } : null,
    mensajes: mensajes.map((m) => ({ id: m.id, autor: m.autor, texto: m.texto, creado: m.creado.getTime() })),
  })
}

export const POST: APIRoute = async ({ params, request }) => {
  const id = leerId(params.id)
  if (!id) return json(404, { error: 'No existe.' })
  const texto = validarMensajeMike(await request.json().catch(() => null))
  if (!texto) return json(400, { error: 'Escribe algo (máximo 2.000 caracteres).' })
  const conv = await porId(id)
  if (!conv) return json(404, { error: 'Esa conversación ya no existe (se borran a las 48 h).' })
  if (conv.estado !== 'mike') {
    await tomar(id)
    await recordAdminEvent(request, 'asesor.conversacion_tomada')
  }
  const ok = await anexar(id, [{ autor: 'mike', texto }])
  if (!ok) return json(409, { error: 'La conversación llegó al tope de mensajes. Sigue por WhatsApp.' })
  return json(201, { ok: true })
}
