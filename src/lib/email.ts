// Email transaccional del portal de clientes (Resend).
//
// notify.ts ya habla con Resend, pero solo sabe escribirme A MÍ (destinatario
// fijo en ALERT_EMAIL_TO): sirve para alertas de infraestructura. Esto es otra
// cosa — correo a terceros, con la marca puesta y contenido que el cliente va a
// juzgar. Misma API, distinto propósito y distinto remitente.
//
// No-op si falta RESEND_API_KEY: en local no se envía nada y el flujo sigue
// (los endpoints devuelven el enlace en dev para poder probar sin buzón).

const env = (k: string): string | undefined => (typeof process !== 'undefined' ? process.env?.[k] : undefined) ?? undefined

export const SITE_URL = (env('AUTH_URL') ?? 'https://codebymike.tech').replace(/\/$/, '')

export type MailResult = { ok: boolean; skipped?: boolean; error?: string; id?: string }

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** ¿Está configurado el envío de correo? El admin lo muestra para no invitar a ciegas. */
export const emailConfigured = (): boolean => !!env('RESEND_API_KEY')

export async function sendMail(params: {
  to: string | string[]
  subject: string
  html: string
  text: string
  replyTo?: string
}): Promise<MailResult> {
  const apiKey = env('RESEND_API_KEY')
  if (!apiKey) return { ok: false, skipped: true }

  const from = env('PORTAL_EMAIL_FROM') ?? 'CodeByMike <portal@codebymike.tech>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        reply_to: params.replyTo ?? env('PORTAL_EMAIL_REPLY_TO') ?? undefined,
      }),
    })
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text().catch(() => '')}` }
    const body = (await res.json().catch(() => ({}))) as { id?: string }
    return { ok: true, id: body.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error' }
  }
}

// ── Plantilla ───────────────────────────────────────────────────────────────
// HTML de email: tablas y estilos inline, sin flexbox ni clases. Outlook sigue
// renderizando con Word y se come casi todo lo moderno. Fondo claro a propósito
// (el sitio es oscuro, pero un email oscuro se rompe en la mitad de los
// clientes de correo y acaba con texto negro sobre negro).

const BRAND = '#0a0a0d'
const ACCENT = '#0891a0' // cyan del sitio, oscurecido para contraste sobre blanco

type Button = { label: string; url: string }

/** Envuelve el contenido en la plantilla de marca. `blocks` son párrafos HTML. */
export function renderEmail(params: {
  preheader: string
  heading: string
  blocks: string[]
  button?: Button
  footNote?: string
}): string {
  const { preheader, heading, blocks, button, footNote } = params
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e9;">
<tr><td style="background:${BRAND};padding:22px 32px;">
<span style="color:#ffffff;font-size:16px;font-weight:600;letter-spacing:-.01em;">CodeByMike</span>
<span style="color:#8a8a95;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding-left:10px;">Portal de clientes</span>
</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 18px;font-size:21px;line-height:1.3;color:#0a0a0d;font-weight:600;letter-spacing:-.02em;">${escapeHtml(heading)}</h1>
${blocks.map((b) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3f3f4a;">${b}</p>`).join('\n')}
${
  button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;"><tr><td style="border-radius:8px;background:${ACCENT};">
<a href="${escapeHtml(button.url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(button.label)}</a>
</td></tr></table>
<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:#8a8a95;">Si el botón no funciona, copia este enlace:<br><span style="color:${ACCENT};word-break:break-all;">${escapeHtml(button.url)}</span></p>`
    : ''
}
${footNote ? `<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid #ececf1;font-size:12px;line-height:1.5;color:#8a8a95;">${footNote}</p>` : ''}
</td></tr>
</table>
<p style="max-width:560px;margin:18px auto 0;font-size:11px;line-height:1.5;color:#9a9aa4;text-align:center;">
Enviado por CodeByMike · <a href="${SITE_URL}" style="color:#9a9aa4;">codebymike.tech</a>
</p>
</td></tr>
</table>
</body>
</html>`
}

/** Versión en texto plano. No es opcional: sin ella el spam score sube. */
export const renderText = (heading: string, lines: string[], button?: Button): string =>
  [heading, '', ...lines, ...(button ? ['', `${button.label}: ${button.url}`] : []), '', '—', 'CodeByMike · codebymike.tech'].join('\n')

// ── Correos concretos ───────────────────────────────────────────────────────

export function sendInvitationEmail(params: {
  to: string
  clientName: string
  url: string
  expiresHours: number
}): Promise<MailResult> {
  const heading = 'Tu acceso al portal de clientes'
  const blocks = [
    `Hola: te doy acceso al portal de <strong>${escapeHtml(params.clientName)}</strong>, donde vas a poder seguir el estado de los proyectos, revisar y pagar facturas, consultar documentos y escribirme directamente.`,
    'Para empezar, define tu contraseña:',
  ]
  return sendMail({
    to: params.to,
    subject: 'Tu acceso al portal de CodeByMike',
    html: renderEmail({
      preheader: 'Define tu contraseña y entra al portal',
      heading,
      blocks,
      button: { label: 'Definir mi contraseña', url: params.url },
      footNote: `Este enlace caduca en ${params.expiresHours} horas y solo puede usarse una vez. Si no esperabas esta invitación, ignora el correo.`,
    }),
    text: renderText(
      heading,
      [
        `Te doy acceso al portal de ${params.clientName}: estado de proyectos, facturas, documentos y mensajería.`,
        `El enlace caduca en ${params.expiresHours} horas y es de un solo uso.`,
      ],
      { label: 'Definir mi contraseña', url: params.url }
    ),
  })
}

export function sendResetEmail(params: { to: string; url: string; expiresMinutes: number }): Promise<MailResult> {
  const heading = 'Restablece tu contraseña'
  return sendMail({
    to: params.to,
    subject: 'Restablece tu contraseña del portal',
    html: renderEmail({
      preheader: 'Enlace para elegir una contraseña nueva',
      heading,
      blocks: ['Recibimos una solicitud para restablecer la contraseña de tu cuenta del portal. Elige una nueva aquí:'],
      button: { label: 'Elegir contraseña nueva', url: params.url },
      footNote: `El enlace caduca en ${params.expiresMinutes} minutos y solo puede usarse una vez. Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando y nadie ha entrado a tu cuenta.`,
    }),
    text: renderText(
      heading,
      ['Solicitud de restablecimiento de contraseña.', `El enlace caduca en ${params.expiresMinutes} minutos.`, 'Si no fuiste tú, ignora este correo.'],
      { label: 'Elegir contraseña nueva', url: params.url }
    ),
  })
}

/** Notificación genérica del portal (factura, mensaje, hito, documento). */
export function sendNotificationEmail(params: {
  to: string
  subject: string
  heading: string
  blocks: string[]
  button?: Button
  footNote?: string
}): Promise<MailResult> {
  return sendMail({
    to: params.to,
    subject: params.subject,
    html: renderEmail({
      preheader: params.subject,
      heading: params.heading,
      blocks: params.blocks,
      button: params.button,
      footNote: params.footNote ?? `Puedes ajustar qué avisos recibes por correo en <a href="${SITE_URL}/portal/cuenta" style="color:${ACCENT};">tu cuenta</a>.`,
    }),
    text: renderText(
      params.heading,
      params.blocks.map((b) => b.replace(/<[^>]+>/g, '')),
      params.button
    ),
  })
}

export { escapeHtml }
