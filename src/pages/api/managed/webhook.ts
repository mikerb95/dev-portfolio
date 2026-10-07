import type { APIRoute } from 'astro'
import { SinApiKey } from '../../../lib/analista/credencial'
import { serverEnv } from '../../../lib/env'
import { clienteVigia } from '../../../lib/vigia/cliente'
import { procesarSesion } from '../../../lib/vigia/sesion'

// Avisos de Claude Managed Agents (Anthropic → nosotros). Se registra a mano
// en la Console (Manage → Webhooks); no hay API para eso.
//
// Público por naturaleza: lo que lo protege es la firma. `unwrap()` del SDK
// verifica los headers `webhook-*` con ANTHROPIC_WEBHOOK_SIGNING_KEY y rechaza
// avisos de más de ~5 min. Sin clave configurada no se procesa nada: un aviso
// que no se puede verificar no se distingue de uno inventado.
//
// El cuerpo del aviso es delgado (tipo + ID). El estado se lee de la API, así
// que un aviso duplicado o fuera de orden solo vuelve a leer lo mismo.

const SESION = new Set(['session.status_idled', 'session.status_terminated'])

export const POST: APIRoute = async ({ request }) => {
  const clave = serverEnv('ANTHROPIC_WEBHOOK_SIGNING_KEY')
  if (!clave) return new Response('webhook sin configurar', { status: 503 })

  let client
  try {
    client = clienteVigia()
  } catch (e) {
    if (e instanceof SinApiKey) return new Response('sin API key', { status: 503 })
    throw e
  }

  // El cuerpo CRUDO: re-serializar el JSON cambia los bytes y rompe la firma.
  const cuerpo = await request.text()
  let evento
  try {
    evento = client.beta.webhooks.unwrap(cuerpo, { headers: Object.fromEntries(request.headers), key: clave })
  } catch {
    return new Response('firma inválida', { status: 400 })
  }

  if (!SESION.has(evento.data.type)) return new Response(null, { status: 204 })

  try {
    await procesarSesion(client, evento.data.id)
    return new Response(null, { status: 204 })
  } catch (e) {
    // Un 5xx hace que Anthropic reintente (hasta tres veces). Si el último
    // intento también falla el aviso se pierde; el detector de silencio de
    // cron_runs es quien lo nota.
    console.error('[vigia/webhook]', e)
    return new Response('error procesando la sesión', { status: 500 })
  }
}
