import type { APIRoute } from 'astro'
import { clientIp } from '../../../lib/ratelimit'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'
import { normalizeTarget, diagnosticSuite } from '../../../lib/diagnostics'
import { assertPublicHost } from '../../../lib/ssrf-guard'
import { isLocale, type Locale } from '../../../i18n/config'

// Errores del endpoint en los dos idiomas del sitio: el analizador es público y
// se sirve en /lab/site-check y /en/lab/site-check.
const ERRORS = {
  es: {
    rateLimited: 'Demasiadas solicitudes, intenta de nuevo en un minuto',
    badJson: 'JSON inválido',
    badTarget: 'Dominio o URL inválida',
    blockedTarget: 'Ese dominio no se puede analizar',
  },
  en: {
    rateLimited: 'Too many requests, try again in a minute',
    badJson: 'Invalid JSON',
    badTarget: 'Invalid domain or URL',
    blockedTarget: 'That domain cannot be scanned',
  },
} satisfies Record<Locale, Record<string, string>>

export const prerender = false

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

// Endpoint público: cualquier visitante puede analizar un dominio de su elección.
// A diferencia de /api/admin/monitors/diagnose.ts (protegido por auth), aquí hay que
// mitigar abuso (rate limit por IP) y SSRF (rechazar hosts que resuelven a IPs privadas).
export const POST: APIRoute = async ({ request }) => {
  let input: string | undefined
  let rawLocale: unknown
  let parseFailed = false
  try {
    const body = await request.json()
    input = body?.target ?? body?.url
    rawLocale = body?.locale
  } catch {
    parseFailed = true
  }
  // El idioma llega como campo explícito del body, validado contra la lista
  // cerrada de locales — nunca se deduce del `Referer`.
  const locale: Locale = typeof rawLocale === 'string' && isLocale(rawLocale) ? rawLocale : 'es'
  const E = ERRORS[locale]

  const { allowed } = await enforceLimit(`site-check:${clientIp(request)}`, { limit: 5, windowMs: 60_000 })
  if (!allowed) return json({ error: E.rateLimited }, 429)

  if (parseFailed) return json({ error: E.badJson }, 400)

  const target = normalizeTarget(input)
  if (!target) return json({ error: E.badTarget }, 400)

  try {
    await assertPublicHost(target.hostname)
  } catch {
    return json({ error: E.blockedTarget }, 400)
  }

  const suite = diagnosticSuite(target, locale)
  const enc = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'))
      send({ type: 'start', target, total: suite.length })

      Promise.all(
        suite.map(async (test) => {
          const result = await test.run()
          send({ type: 'result', result })
        }),
      )
        .then(() => {
          send({ type: 'done' })
          controller.close()
        })
        .catch((e) => {
          send({ type: 'error', error: e instanceof Error ? e.message : 'error' })
          controller.close()
        })
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
