import type { APIRoute } from 'astro'
import { escenario, type Conversacion } from './_estado'

// Pregunta al analista del micro-SIEM y transmite lo que hace, en vivo, como
// Server-Sent Events. Protegido por el middleware de /api/admin.
//
// Solo existe en `astro dev`: la Agent SDK levanta el binario de Claude Code
// como subproceso y eso no cabe en una función de Vercel (ni debería: el
// agente es una herramienta del administrador, en su máquina). La guarda con
// `import.meta.env.DEV` además deja fuera del build de producción el import
// del motor, así que la SDK no se empaqueta.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const POST: APIRoute = async ({ request }) => {
  if (!import.meta.env.DEV) return json(404, { error: 'El analista solo corre en local (npm run dev).' })

  const body = await request.json().catch(() => ({}))
  const pregunta = typeof body?.pregunta === 'string' ? body.pregunta.trim().slice(0, 500) : ''
  if (!pregunta) return json(400, { error: 'Falta la pregunta.' })

  const estado = escenario()
  if (estado.ocupado) return json(409, { error: 'El analista ya está respondiendo otra pregunta.' })

  const motor = import.meta.env.DEV ? await import('../../../../../agents/analista-siem/motor') : null
  if (!motor) return json(404, { error: 'El analista solo corre en local.' })

  // Una conversación sigue viva entre preguntas (mismos seudónimos, misma
  // sesión del agente). `nueva: true` la reinicia.
  const previa = body?.nueva ? null : estado.conversacion
  const conversacion: Conversacion = previa ?? { seudonimos: new motor.Seudonimos(), sesion: undefined }
  estado.conversacion = conversacion
  estado.ocupado = true

  const encoder = new TextEncoder()
  const abort = new AbortController()
  request.signal.addEventListener('abort', () => abort.abort(), { once: true })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let abierto = true
      const enviar = (evento: unknown) => {
        if (!abierto) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evento)}\n\n`))
        } catch {
          abierto = false
        }
      }
      try {
        conversacion.sesion = await motor.consultar({
          pregunta,
          sesion: conversacion.sesion,
          seudonimos: conversacion.seudonimos as InstanceType<typeof motor.Seudonimos>,
          formato: 'pantalla',
          emitir: enviar,
          // La decisión llega por /api/admin/analista/decision. Si la pestaña
          // se cierra con un bloqueo pendiente, se niega: nunca se aprueba
          // nada por omisión.
          aprobar: () =>
            new Promise<boolean>((resolve) => {
              estado.pendiente = resolve
              abort.signal.addEventListener('abort', () => resolve(false), { once: true })
            }),
          signal: abort.signal,
        })
      } catch (err) {
        enviar({ tipo: 'error', mensaje: err instanceof Error ? err.message : String(err) })
      } finally {
        estado.pendiente?.(false)
        estado.pendiente = null
        estado.ocupado = false
        abierto = false
        try {
          controller.close()
        } catch {
          // Ya cerrado por el cliente.
        }
      }
    },
    cancel() {
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  })
}
