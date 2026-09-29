#!/usr/bin/env node
// API de Claude FALSA para los e2e del analista (e2e/analista.spec.ts).
//
// Los e2e no pueden gastar créditos ni depender de la red, pero sí tienen que
// ejercitar el flujo real: el SDK oficial, el streaming, la pausa ante un
// bloqueo y la reanudación. Este servidor habla el mismo protocolo (SSE de
// /v1/messages) con un guion fijo, y el servidor de pruebas llega aquí por
// ANTHROPIC_BASE_URL (ver playwright.config.ts).
//
// Guion, según cuántos turnos del asistente trae la conversación:
//   0 → pide top_origenes de la última semana
//   1 → propone bloquear origen-01
//   2 → cierra con un veredicto que dice si el bloqueo se aprobó o no
import { createServer } from 'node:http'

const PORT = Number(process.env.FAKE_ANTHROPIC_PORT ?? 4599)

const texto = (t) => ({ type: 'text', text: t })
const uso = (id, name, input) => ({ type: 'tool_use', id, name, input })

function guion(mensajes) {
  const turnos = mensajes.filter((m) => m.role === 'assistant').length
  if (turnos === 0) return { stop: 'tool_use', bloques: [texto('Empiezo por los orígenes más activos.'), uso('toolu_e2e_1', 'top_origenes', { horas: 168 })] }
  if (turnos === 1) {
    return {
      stop: 'tool_use',
      bloques: [uso('toolu_e2e_2', 'bloquear_origen', { origen: 'origen-01', motivo: 'Fuerza bruta persistente contra el login durante toda la semana' })],
    }
  }
  const ultimo = mensajes.at(-1)
  const resultado = Array.isArray(ultimo?.content) ? ultimo.content.find((b) => b.type === 'tool_result') : null
  const rechazado = !!resultado?.is_error
  return {
    stop: 'end_turn',
    bloques: [
      texto(
        [
          rechazado ? 'Veredicto de prueba: bloqueo rechazado, sigo vigilando.' : 'Veredicto de prueba: origen-01 quedó bloqueado.',
          '',
          '## Qué encontré',
          '- origen-01 insistió toda la semana contra el login.',
        ].join('\n')
      ),
    ],
  }
}

function sse(res, evento, datos) {
  res.write(`event: ${evento}\ndata: ${JSON.stringify({ type: evento, ...datos })}\n\n`)
}

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/salud') return res.writeHead(200).end('ok')
  if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) return res.writeHead(404).end()

  let cuerpo = ''
  req.on('data', (c) => (cuerpo += c))
  req.on('end', () => {
    const peticion = JSON.parse(cuerpo)
    const { stop, bloques } = guion(peticion.messages ?? [])
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    sse(res, 'message_start', {
      message: {
        id: `msg_e2e_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model: peticion.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    })
    bloques.forEach((b, index) => {
      if (b.type === 'text') {
        sse(res, 'content_block_start', { index, content_block: { type: 'text', text: '' } })
        sse(res, 'content_block_delta', { index, delta: { type: 'text_delta', text: b.text } })
      } else {
        sse(res, 'content_block_start', { index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } })
        sse(res, 'content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } })
      }
      sse(res, 'content_block_stop', { index })
    })
    sse(res, 'message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 150 } })
    sse(res, 'message_stop', {})
    res.end()
  })
}).listen(PORT, '127.0.0.1', () => console.log(`API de Claude falsa en http://127.0.0.1:${PORT}`))
