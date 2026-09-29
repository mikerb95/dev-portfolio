// Transmisión en vivo (Server-Sent Events) de lo que hace el analista.
//
// Si el navegador se desconecta a mitad (pestaña cerrada, celular sin señal),
// la tarea NO se cancela: el análisis termina y queda guardado en la base, y
// se ve en el historial al volver. Cancelarlo dejaría un análisis a medias ya
// pagado.

export function transmitir(tarea: (enviar: (evento: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder()
  let abierto = true
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (evento: unknown) => {
        if (!abierto) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evento)}\n\n`))
        } catch {
          abierto = false
        }
      }
      try {
        await tarea(enviar)
      } catch (err) {
        enviar({ tipo: 'error', mensaje: err instanceof Error ? err.message : String(err) })
      } finally {
        if (abierto) {
          abierto = false
          try {
            controller.close()
          } catch {
            // Ya cerrado por el cliente.
          }
        }
      }
    },
    cancel() {
      abierto = false
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
