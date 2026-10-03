import type { APIRoute } from 'astro'
import { validarEntrada, type Entrada } from '../../lib/asesor/bucle'
import { AsesorNoDisponible, disponible, responder } from '../../lib/asesor/motor'
import { avisoVivo, motivoAviso } from '../../lib/asesor/vivo'
import { abrirConversacion, anexar, porToken, purgar, type Conversacion } from '../../lib/asesor/vivo-db'
import { sendPush } from '../../lib/notify'

// Asesor público de la burbuja de WhatsApp (docs/plan-asistente.md, capacidad
// 3). El límite por IP lo pone el middleware (isAsesorPath); el tope de gasto
// diario, el motor. Para responder no usa nada guardado: el navegador reenvía
// la conversación. Desde que la persona muestra interés, la conversación se
// guarda además para que Mike la lea y pueda entrar (lib/asesor/vivo.ts).

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/** La burbuja pregunta al abrirse si ofrecer la opción de IA. */
export const GET: APIRoute = async () => json(200, { disponible: await disponible() })

export const POST: APIRoute = async ({ request }) => {
  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return json(400, { error: 'formato' })
  }
  const entrada = validarEntrada(cuerpo)
  if ('error' in entrada) return json(400, entrada)

  // Si Mike ya entró, el asesor no contesta. El navegador normalmente ya lo
  // sabe por el sondeo; esto cubre la pregunta que salió justo antes de
  // enterarse, que se guarda para Mike en vez de perderse.
  let conv: Conversacion | null = null
  if (entrada.conversacion) conv = await porToken(entrada.conversacion).catch(() => null)
  if (conv?.estado === 'mike') {
    await anexar(conv.id, [{ autor: 'visitante', texto: entrada.mensajes.at(-1)!.texto }]).catch(() => {})
    return json(200, { mike: true })
  }

  try {
    const r = await responder(entrada)
    const vivo = await guardarVivo(entrada, conv, r)
    return json(200, {
      texto: r.texto,
      whatsapp: r.whatsapp,
      contacto: r.contacto,
      calculos: r.calculos,
      cifras: r.cifras,
      ...vivo,
    })
  } catch (err) {
    if (err instanceof AsesorNoDisponible) return json(503, { error: 'no_disponible' })
    console.error('[asesor]', err instanceof Error ? err.message : err)
    return json(502, { error: 'fallo' })
  }
}

/**
 * Guarda la vuelta en la conversación en vivo, o la abre si esta respuesta
 * mostró interés. Falla abierto: si la base no contesta, la respuesta llega
 * igual y Mike simplemente no se entera.
 */
async function guardarVivo(
  e: Entrada,
  conv: Conversacion | null,
  r: { texto: string; cifras: string[]; whatsapp: string | null; contacto: boolean }
): Promise<{ conversacion?: string }> {
  try {
    const pregunta = e.mensajes.at(-1)!.texto
    if (conv) {
      await anexar(conv.id, [
        { autor: 'visitante', texto: pregunta },
        { autor: 'asesor', texto: r.texto },
      ])
      return {}
    }
    const motivo = motivoAviso(r)
    if (!motivo) return {}
    await purgar().catch(() => {})
    const { id, token } = await abrirConversacion({
      locale: e.locale,
      pagina: e.pagina,
      motivo,
      mensajes: [
        ...e.mensajes.map((m) => ({ autor: m.rol === 'usuario' ? ('visitante' as const) : ('asesor' as const), texto: m.texto })),
        { autor: 'asesor', texto: r.texto },
      ],
    })
    const { titulo, texto } = avisoVivo({
      motivo,
      locale: e.locale,
      pagina: e.pagina,
      preguntas: e.mensajes.filter((m) => m.rol === 'usuario').map((m) => m.texto),
    })
    await sendPush(titulo, texto, { priority: 4, tags: 'speech_balloon', click: `https://codebymike.net/admin/asesor/${id}` }).catch(() => {})
    return { conversacion: token }
  } catch (err) {
    console.error('[asesor/vivo]', err instanceof Error ? err.message : err)
    return {}
  }
}
