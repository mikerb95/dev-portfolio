// Envío de notificaciones (email vía Resend, push vía ntfy.sh).
// Ambos canales son opcionales: si faltan sus variables de entorno, se omiten
// silenciosamente (no-op) y se reporta `skipped`, sin romper el flujo del cron.

const env = (k: string): string | undefined =>
  // En endpoints de Astro/Vercel las env vars del servidor están en process.env.
  (typeof process !== 'undefined' ? process.env?.[k] : undefined) ?? undefined

export type NotifyResult = { channel: 'email' | 'push'; ok: boolean; skipped?: boolean; error?: string }

/**
 * Prepara un valor para un header HTTP. Los headers son ByteStrings (Latin-1):
 * un emoji rompe `fetch` con un TypeError. Quitamos símbolos/emoji (≥ U+2000) y
 * codificamos el resto UTF-8→latin1 para que el receptor (ntfy) lo lea como UTF-8
 * y conserve los acentos.
 */
function headerSafe(s: string): string {
  const stripped = Array.from(s)
    .filter((ch) => (ch.codePointAt(0) ?? 0) < 0x2000)
    .join('')
    .trim()
  return String.fromCharCode(...new TextEncoder().encode(stripped))
}

/** Envía un email vía la API REST de Resend. No-op si falta configuración. */
export async function sendEmail(subject: string, text: string, html?: string): Promise<NotifyResult> {
  const apiKey = env('RESEND_API_KEY')
  const to = env('ALERT_EMAIL_TO')
  const from = env('ALERT_EMAIL_FROM') ?? 'alertas@codebymike.tech'
  if (!apiKey || !to) return { channel: 'email', ok: false, skipped: true }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: to.split(',').map((s) => s.trim()), subject, text, html: html ?? undefined }),
    })
    if (!res.ok) return { channel: 'email', ok: false, error: `Resend ${res.status}: ${await res.text().catch(() => '')}` }
    return { channel: 'email', ok: true }
  } catch (e) {
    return { channel: 'email', ok: false, error: e instanceof Error ? e.message : 'error' }
  }
}

/** Envía un push al teléfono vía ntfy.sh. No-op si falta NTFY_TOPIC. */
export async function sendPush(title: string, message: string, opts?: { priority?: number; tags?: string; click?: string }): Promise<NotifyResult> {
  const topic = env('NTFY_TOPIC')
  if (!topic) return { channel: 'push', ok: false, skipped: true }
  const base = env('NTFY_SERVER') ?? 'https://ntfy.sh'
  const headers: Record<string, string> = { Title: title }
  if (opts?.priority) headers.Priority = String(opts.priority)
  if (opts?.tags) headers.Tags = opts.tags
  if (opts?.click) headers.Click = opts.click
  const token = env('NTFY_TOKEN')
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers,
      body: message,
    })
    if (!res.ok) return { channel: 'push', ok: false, error: `ntfy ${res.status}` }
    return { channel: 'push', ok: true }
  } catch (e) {
    return { channel: 'push', ok: false, error: e instanceof Error ? e.message : 'error' }
  }
}
