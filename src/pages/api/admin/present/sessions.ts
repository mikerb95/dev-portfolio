import type { APIRoute } from 'astro'
import { getDeck, touchDeckSession } from '../../../../lib/present/decks'
import { createSession, listLiveSessions } from '../../../../lib/present/session'
import { storeReadiness } from '../../../../lib/present/store'
import { recordSecurityEvent } from '../../../../lib/security/events'
import { clientIp } from '../../../../lib/device-info'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const GET: APIRoute = async () => {
  const sessions = await listLiveSessions()
  // Sin el secreto del presentador: este endpoint alimenta el listado del
  // panel, y el secreto solo lo entrega la página del control remoto.
  return json(200, sessions.map(({ presenterSecret, ...rest }) => rest))
}

export const POST: APIRoute = async ({ request }) => {
  const readiness = storeReadiness()
  if (!readiness.ok) return json(503, { error: readiness.reason })

  let deckId: number
  try {
    const body = (await request.json()) as { deckId?: unknown }
    deckId = Number(body.deckId)
  } catch {
    return json(400, { error: 'cuerpo inválido' })
  }
  if (!Number.isInteger(deckId)) return json(400, { error: 'deckId inválido' })

  const deck = await getDeck(deckId)
  if (!deck) return json(404, { error: 'deck no encontrado' })
  if (deck.slideCount < 1) {
    return json(409, { error: 'el deck no tiene slides: vuelve a subir el archivo' })
  }

  try {
    const session = await createSession({ id: deck.id, title: deck.title, slideCount: deck.slideCount })
    await touchDeckSession(deck.id).catch(() => {})

    // Abrir una sesión publica un PIN en la raíz del dominio: queda en el
    // micro-SIEM como cualquier otra acción con superficie pública.
    recordSecurityEvent({
      ip: clientIp(request.headers),
      classification: {
        category: 'admin_action',
        severity: 'low',
        ruleId: 'present.session_created',
      },
      method: 'POST',
      path: `/api/admin/present/sessions#deck-${deck.id}`,
      userAgent: request.headers.get('user-agent'),
      statusCode: 201,
    })

    return json(201, {
      sessionId: session.id,
      pin: session.pin,
      state: session.state,
      totalSlides: session.totalSlides,
      deckTitle: session.deckTitle,
    })
  } catch (err) {
    console.error('[present] no se pudo crear la sesión', err)
    return json(503, { error: 'no se pudo crear la sesión: revisa la conexión con Redis' })
  }
}
