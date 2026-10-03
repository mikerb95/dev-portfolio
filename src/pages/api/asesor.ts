import type { APIRoute } from 'astro'
import { db } from '../../db'
import { messages } from '../../db/schema'
import { validarEntrada, type Entrada } from '../../lib/asesor/bucle'
import { AsesorNoDisponible, disponible, responder } from '../../lib/asesor/motor'
import {
  avisoVivo,
  buscarTelefono,
  debePedirNumero,
  enlaceWhatsapp,
  filaNumero,
  motivoAviso,
  PIDE_NUMERO,
  taparTelefonos,
} from '../../lib/asesor/vivo'
import { abrirConversacion, anexar, guardarTelefono, porToken, purgar, type Conversacion } from '../../lib/asesor/vivo-db'
import { sendPush } from '../../lib/notify'
import { formatPhone } from '../../lib/phone'

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

  // El número que pidió el asesor se le pasa a Mike antes de llamar al modelo:
  // si el modelo falla, Mike igual lo tiene.
  if (conv?.pidioNumero && !conv.telefono) await recibirTelefono(entrada, conv)

  // Ningún número de teléfono llega al modelo, pedido o no, en todo el
  // historial: el navegador reenvía los mensajes viejos en cada pregunta.
  const paraModelo: Entrada = {
    ...entrada,
    mensajes: entrada.mensajes.map((m) => (m.rol === 'usuario' ? { ...m, texto: taparTelefonos(m.texto, !!conv?.pidioNumero) } : m)),
  }

  try {
    const r = await responder(paraModelo)
    const vivo = await guardarVivo(entrada, conv, r)
    return json(200, {
      texto: vivo.texto,
      whatsapp: r.whatsapp,
      contacto: r.contacto,
      calculos: r.calculos,
      cifras: r.cifras,
      ...(vivo.conversacion ? { conversacion: vivo.conversacion } : {}),
    })
  } catch (err) {
    if (err instanceof AsesorNoDisponible) return json(503, { error: 'no_disponible' })
    console.error('[asesor]', err instanceof Error ? err.message : err)
    return json(502, { error: 'fallo' })
  }
}

/**
 * Si la última pregunta trae el número que pidió el asesor: lo guarda, lo deja
 * en el buzón del panel como un contacto más y avisa con un botón para
 * escribirle por WhatsApp. Falla abierto.
 */
async function recibirTelefono(e: Entrada, conv: Conversacion): Promise<void> {
  try {
    const telefono = buscarTelefono(e.mensajes.at(-1)!.texto)
    if (!telefono || !(await guardarTelefono(conv.id, telefono))) return
    const ahora = new Date()
    const preguntas = e.mensajes.filter((m) => m.rol === 'usuario').map((m) => m.texto)
    await db
      .insert(messages)
      .values({ ...filaNumero({ id: conv.id, telefono, locale: e.locale, pagina: e.pagina, preguntas }, ahora), createdAt: ahora })
    await sendPush(`Te dejó su WhatsApp: ${formatPhone(telefono)}`, 'Si no alcanzas a entrar al chat, escríbele por WhatsApp.', {
      priority: 4,
      tags: 'iphone',
      click: `https://codebymike.net/admin/asesor/${conv.id}`,
      actions: `view, Escribirle por WhatsApp, ${enlaceWhatsapp(telefono, e.locale)}, clear=true`,
    }).catch(() => {})
  } catch (err) {
    console.error('[asesor/telefono]', err instanceof Error ? err.message : err)
  }
}

/**
 * Guarda la vuelta en la conversación en vivo, o la abre si esta respuesta
 * mostró interés; al abrirla, la respuesta lleva además la pregunta fija por
 * el WhatsApp. Falla abierto: si la base no contesta, la respuesta llega igual
 * (sin la pregunta) y Mike simplemente no se entera.
 */
async function guardarVivo(
  e: Entrada,
  conv: Conversacion | null,
  r: { texto: string; cifras: string[]; whatsapp: string | null; contacto: boolean }
): Promise<{ texto: string; conversacion?: string }> {
  try {
    const pregunta = e.mensajes.at(-1)!.texto
    if (conv) {
      await anexar(conv.id, [
        { autor: 'visitante', texto: pregunta },
        { autor: 'asesor', texto: r.texto },
      ])
      return { texto: r.texto }
    }
    const motivo = motivoAviso(r)
    if (!motivo) return { texto: r.texto }
    const pedir = debePedirNumero(motivo, !!e.contactoDado)
    const texto = pedir ? `${r.texto}\n\n${PIDE_NUMERO[e.locale]}` : r.texto
    await purgar().catch(() => {})
    const { id, token } = await abrirConversacion({
      locale: e.locale,
      pagina: e.pagina,
      motivo,
      pidioNumero: pedir,
      mensajes: [
        ...e.mensajes.map((m) => ({ autor: m.rol === 'usuario' ? ('visitante' as const) : ('asesor' as const), texto: m.texto })),
        { autor: 'asesor', texto },
      ],
    })
    const { titulo, texto: aviso } = avisoVivo({
      motivo,
      locale: e.locale,
      pagina: e.pagina,
      preguntas: e.mensajes.filter((m) => m.rol === 'usuario').map((m) => m.texto),
    })
    await sendPush(titulo, aviso, { priority: 4, tags: 'speech_balloon', click: `https://codebymike.net/admin/asesor/${id}` }).catch(() => {})
    return { texto, conversacion: token }
  } catch (err) {
    console.error('[asesor/vivo]', err instanceof Error ? err.message : err)
    return { texto: r.texto }
  }
}
