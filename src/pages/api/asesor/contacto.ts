import type { APIRoute } from 'astro'
import { db } from '../../../db'
import { messages } from '../../../db/schema'
import { aviso, filaMensaje, validarContacto } from '../../../lib/asesor/contacto'
import { sendPush } from '../../../lib/notify'
import { clientIp } from '../../../lib/ratelimit'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'

// Datos que deja una persona en el asesor de la burbuja para que Mike la
// contacte (src/lib/asesor/contacto.ts). Van al buzón del panel, como el
// formulario de /contact, y avisan por ntfy.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const POST: APIRoute = async ({ request }) => {
  // Alguien deja sus datos una vez; cinco envíos en diez minutos ya no es una
  // persona, es alguien llenando el buzón.
  const { allowed } = await enforceLimit(`asesor-contacto:${clientIp(request)}`, { limit: 5, windowMs: 600_000 })
  if (!allowed) return json(429, { error: 'limite' })

  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return json(400, { error: 'formato' })
  }
  const c = validarContacto(cuerpo)
  if ('error' in c) return json(400, c)

  const ahora = new Date()
  await db.insert(messages).values({ ...filaMensaje(c, ahora), createdAt: ahora })

  // No bloquea ni rompe la respuesta: sendPush ya es no-op sin NTFY_TOPIC.
  const { titulo, texto } = aviso(c)
  await sendPush(titulo, texto, { priority: 4, tags: 'robot', click: 'https://codebymike.net/admin/messages' }).catch(() => {})

  return json(201, { ok: true })
}
