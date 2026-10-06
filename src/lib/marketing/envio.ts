// Armado y envío de los correos de una campaña. Solo-servidor.
//
// Un correo por persona (cada uno lleva su propio enlace de baja), pero en
// una sola llamada a la API batch de Resend por lote: la API limita a unas
// 2 peticiones por segundo y 50 correos uno a uno no caben cómodos ahí.

import { renderEmail, renderText, SITE_URL, ACCENT, escapeHtml } from '../email'
import { serverEnv } from '../env'
import { cuerpoAHtml, cuerpoATexto, urlSegura, type CampanaContenido } from './contenido'
import { tokenBaja } from './tokens'

export const remitenteMarketing = (): string =>
  serverEnv('MARKETING_EMAIL_FROM') ?? 'Mike de CodeByMike <novedades@codebymike.net>'

// `c` (la campaña) solo sirve para contar desde qué correo se dio de baja la
// gente; el token no la cubre porque falsearla no le da nada a nadie.
export const urlBaja = (suscriptorId: number, secreto: string, campanaId: number): string =>
  `${SITE_URL}/novedades/baja?s=${suscriptorId}&t=${tokenBaja(suscriptorId, secreto)}&c=${campanaId}`

/** Endpoint que recibe el POST de "baja con un clic" de Gmail y Yahoo (RFC 8058). */
export const urlBajaUnClic = (suscriptorId: number, secreto: string, campanaId: number): string =>
  `${SITE_URL}/api/marketing/baja?s=${suscriptorId}&t=${tokenBaja(suscriptorId, secreto)}&c=${campanaId}`

export type CorreoArmado = {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  reply_to?: string
  headers: Record<string, string>
}

/** Correo listo para Resend. `baja` null = prueba al admin (sin enlace real). */
export function armarCorreo(c: CampanaContenido, para: string, baja: { web: string; unClic: string } | null): CorreoArmado {
  const boton = c.botonTexto && urlSegura(c.botonUrl) ? { label: c.botonTexto, url: urlSegura(c.botonUrl)! } : undefined
  const enlaceBaja = baja?.web ?? `${SITE_URL}/novedades`
  const pie =
    `Recibes este correo porque te suscribiste a las novedades de CodeByMike.<br>` +
    `<a href="${escapeHtml(enlaceBaja)}" style="color:#6f6f7a;">Darme de baja</a> · ` +
    `<a href="${SITE_URL}" style="color:#9a9aa4;">codebymike.net</a>`
  const headers: Record<string, string> = {}
  if (baja) {
    headers['List-Unsubscribe'] = `<${baja.unClic}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }
  return {
    from: remitenteMarketing(),
    to: [para],
    subject: c.asunto,
    html: renderEmail({
      preheader: c.preheader || c.asunto,
      heading: c.titulo,
      blocks: cuerpoAHtml(c.cuerpo, ACCENT),
      button: boton,
      label: 'Novedades',
      footer: pie,
    }),
    text: [
      renderText(c.titulo, cuerpoATexto(c.cuerpo), boton),
      '',
      `Para no recibir más estos correos: ${enlaceBaja}`,
    ].join('\n'),
    reply_to: serverEnv('PORTAL_EMAIL_REPLY_TO') ?? undefined,
    headers,
  }
}

export type ResultadoLote = { ok: true; ids: (string | null)[] } | { ok: false; error: string; skipped?: boolean }

/**
 * Envía un lote con la API batch. La llave de idempotencia la pone quien
 * llama (el id del lote): si la función muere tras enviar y antes de anotar,
 * reintentar el mismo lote con la misma llave no duplica nada en Resend
 * (guarda la llave 24 h).
 */
export async function enviarLote(correos: CorreoArmado[], llave: string): Promise<ResultadoLote> {
  const apiKey = serverEnv('RESEND_API_KEY')
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY no configurada', skipped: true }
  try {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': llave },
      body: JSON.stringify(correos),
    })
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}` }
    const body = (await res.json().catch(() => ({}))) as { data?: { id?: string }[] }
    return { ok: true, ids: correos.map((_, i) => body.data?.[i]?.id ?? null) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error de red' }
  }
}
