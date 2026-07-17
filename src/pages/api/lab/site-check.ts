import type { APIRoute } from 'astro'
import { clientIp } from '../../../lib/ratelimit'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'
import { normalizeTarget, diagnosticSuite } from '../../../lib/diagnostics'
import { assertPublicHost } from '../../../lib/ssrf-guard'

export const prerender = false

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

// Endpoint público: cualquier visitante puede analizar un dominio de su elección.
// A diferencia de /api/admin/monitors/diagnose.ts (protegido por auth), aquí hay que
// mitigar abuso (rate limit por IP) y SSRF (rechazar hosts que resuelven a IPs privadas).
export const POST: APIRoute = async ({ request }) => {
  const { allowed } = await enforceLimit(`site-check:${clientIp(request)}`, { limit: 5, windowMs: 60_000 })
  if (!allowed) return json({ error: 'Demasiadas solicitudes, intenta de nuevo en un minuto' }, 429)

  let input: string | undefined
  try {
    const body = await request.json()
    input = body?.target ?? body?.url
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  const target = normalizeTarget(input)
  if (!target) return json({ error: 'Dominio o URL inválida' }, 400)

  try {
    await assertPublicHost(target.hostname)
  } catch {
    return json({ error: 'Ese dominio no se puede analizar' }, 400)
  }

  const suite = diagnosticSuite(target)
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
