import type { APIRoute } from 'astro'
import { normalizeTarget, diagnosticSuite } from '../../../../lib/diagnostics'

export const prerender = false

// Ejecuta la batería de diagnósticos y transmite cada resultado (NDJSON) conforme
// termina, para dar sensación de "en vivo". Protegido por el middleware de /api/admin.
export const POST: APIRoute = async ({ request }) => {
  let input: string | undefined
  try {
    const body = await request.json()
    input = body?.target ?? body?.url
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  const target = normalizeTarget(input)
  if (!target) return json({ error: 'Dominio o URL inválida' }, 400)

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

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
