#!/usr/bin/env node
// API de Claude FALSA para los e2e del analista (e2e/analista.spec.ts), del
// asesor público (e2e/asesor-vivo.spec.ts) y del asistente del dashboard
// (e2e/asistente.spec.ts).
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

// Asesor público de la burbuja (e2e/asesor-vivo.spec.ts). Sin streaming, como
// el motor real (lib/asesor/motor.ts). Una pregunta con "cuánto" pide
// calcular_precio y la respuesta copia la cifra que devolvió el tarifario, así
// pasa la guardia de cifras como pasaría una respuesta buena de verdad.
function guionAsesor(mensajes) {
  const ultimo = mensajes.at(-1)
  const resultado = Array.isArray(ultimo?.content) ? ultimo.content.find((b) => b.type === 'tool_result') : null
  if (resultado) {
    const crudo = typeof resultado.content === 'string' ? resultado.content : resultado.content[0].text
    // El de preparar_whatsapp es una frase, no JSON: el botón ya está visible.
    if (crudo.startsWith('Listo')) return { stop: 'end_turn', bloques: [texto('Listo: toca el botón para enviarle esto a Mike.')] }
    const r = JSON.parse(crudo)
    return { stop: 'end_turn', bloques: [texto(`El plan ${r.plan} cuesta desde ${r.desde}.`)] }
  }
  const pregunta = typeof ultimo?.content === 'string' ? ultimo.content : ''
  // "avanzar": prepara el WhatsApp (e2e/asesor-vivo.spec.ts, del asesor a Plano).
  if (/avanzar/i.test(pregunta)) {
    return { stop: 'tool_use', bloques: [uso(`toolu_asesor_${Date.now()}`, 'preparar_whatsapp', { necesidad: 'Una tienda en línea para mi marca de ropa' })] }
  }
  if (/cu[aá]nto/i.test(pregunta)) {
    return { stop: 'tool_use', bloques: [uso(`toolu_asesor_${Date.now()}`, 'calcular_precio', { tipo: 'plan', plan: 'negocio' })] }
  }
  return { stop: 'end_turn', bloques: [texto('Respuesta de prueba del asesor, sin precios.')] }
}

// Asistente del dashboard (e2e/asistente.spec.ts). Se reconoce porque es el
// único que trae la herramienta crear_cuenta_cobro.
//  - "cuenta de cobro": busca el cliente con `clientes` y propone la cuenta; al
//    volver la decisión, confirma con el número que devolvió el servidor.
//  - "leído": busca el mensaje con `mensajes` y propone marcarlo como leído
//    (tarjeta de antes y después de la fase 5).
//  - cualquier otra pregunta: consulta `vencimientos` y responde con un enlace.
function resultadoDe(mensaje) {
  const r = Array.isArray(mensaje?.content) ? mensaje.content.find((b) => b.type === 'tool_result') : null
  if (!r) return null
  const crudo = typeof r.content === 'string' ? r.content : r.content?.[0]?.text
  try {
    return { error: !!r.is_error, datos: JSON.parse(crudo) }
  } catch {
    return { error: !!r.is_error, datos: null, texto: crudo }
  }
}

function guionAsistente(mensajes) {
  const primera = typeof mensajes[0]?.content === 'string' ? mensajes[0].content : ''
  const ultimo = mensajes.at(-1)
  const r = resultadoDe(ultimo)
  if (/le[ií]do/i.test(primera)) {
    if (!r) return { stop: 'tool_use', bloques: [uso(`toolu_asis_${Date.now()}`, 'mensajes', {})] }
    if (r.datos?.formulario) {
      const m = r.datos.formulario.find((x) => x.escritoPorTerceros?.nombre === 'Remitente E2E')
      return { stop: 'tool_use', bloques: [uso(`toolu_asis_${Date.now()}`, 'marcar_mensaje_leido', { mensajeIds: [m.id] })] }
    }
    if (r.error) return { stop: 'end_turn', bloques: [texto('Entendido, lo dejo sin leer.')] }
    return { stop: 'end_turn', bloques: [texto(`Listo: ${r.datos.resumen}. [Ver mensajes](${r.datos.enlace}).`)] }
  }
  if (!/cuenta de cobro/i.test(primera)) {
    if (!r) return { stop: 'tool_use', bloques: [uso(`toolu_asis_${Date.now()}`, 'vencimientos', { tipo: 'dominios' })] }
    return {
      stop: 'end_turn',
      bloques: [texto(`Tienes **${r.datos.total}** dominios por vencer.\n\n- Revisa la lista completa en [Dominios](/admin/domains).\n- Este enlace no debe salir: [afuera](https://ejemplo.com).`)],
    }
  }
  if (!r) return { stop: 'tool_use', bloques: [texto('Busco al cliente.'), uso(`toolu_asis_${Date.now()}`, 'clientes', {})] }
  if (r.datos?.clientes) {
    const c = r.datos.clientes.find((x) => x.nombre === 'Cliente E2E Asistente')
    return {
      stop: 'tool_use',
      bloques: [
        uso(`toolu_asis_${Date.now()}`, 'crear_cuenta_cobro', {
          clienteId: c.id,
          conceptos: [{ descripcion: 'Hito 2 de prueba', cantidad: 1, valorUnitario: 1200000 }],
          concepto: 'Desarrollo del hito 2 de prueba',
        }),
      ],
    }
  }
  if (r.error) return { stop: 'end_turn', bloques: [texto('Entendido, no la creo. ¿Qué le cambio?')] }
  return { stop: 'end_turn', bloques: [texto(`Listo: la **${r.datos.numero}** quedó en borrador. [Ábrela aquí](${r.datos.enlace}).`)] }
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
    if (peticion.tools?.some((t) => t.name === 'calcular_precio')) {
      const { stop, bloques } = guionAsesor(peticion.messages ?? [])
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(
        JSON.stringify({
          id: `msg_e2e_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          model: peticion.model,
          content: bloques,
          stop_reason: stop,
          stop_sequence: null,
          usage: { input_tokens: 900, output_tokens: 60, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        })
      )
    }
    const esAsistente = peticion.tools?.some((t) => t.name === 'crear_cuenta_cobro')
    const { stop, bloques } = (esAsistente ? guionAsistente : guion)(peticion.messages ?? [])
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
