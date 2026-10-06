import type { APIRoute } from 'astro'
import { recordAdminEvent } from '../../../../lib/security/events'
import {
  configDe,
  congelarDesdeConfig,
  crearPropuesta,
  descartar,
  esEditable,
  guardarConfig,
  hoyCO,
  marcarEnviada,
  propuesta,
  PropuestaCerrada,
  reabrir,
} from '../../../../lib/plano/db'
import { configVacia, faltantesEnvio, normalizarConfig, PropuestaVacia } from '../../../../lib/plano/propuesta'

// Propuestas de Plano desde el panel. La sesión de admin la impone el
// middleware (matcher isAdmin), no este archivo. El navegador manda la
// CONFIGURACIÓN, nunca el snapshot ni una cifra: todo lo calculado lo vuelve a
// calcular el servidor al congelar.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    // Lleva datos del cliente (nombre, teléfono, documento): nunca en caché.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const d = await request.json()
    return d && typeof d === 'object' ? (d as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * POST sin acción: crea un borrador (opcionalmente con una configuración).
 * POST ?action=version|send|discard|reopen con `id`: transiciona.
 */
export const POST: APIRoute = async ({ request, url }) => {
  const action = url.searchParams.get('action')
  const data = (await body(request)) ?? {}

  if (!action) {
    const config = data.config ? normalizarConfig(data.config, hoyCO()) : configVacia(hoyCO())
    if (typeof data.titulo === 'string' && !config.titulo) config.titulo = data.titulo.trim().slice(0, 160)
    const p = await crearPropuesta(config)
    await recordAdminEvent(request, 'plano.creada', { statusCode: 201 })
    return json(201, { ok: true, id: p.id })
  }

  const id = Number(data.id ?? url.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return json(400, { error: 'id inválido' })
  const p = await propuesta(id)
  if (!p) return json(404, { error: 'propuesta no encontrada' })

  if (action === 'version' || action === 'send') {
    if (!esEditable(p)) return json(409, { error: 'la propuesta ya fue aceptada' })
    const config = configDe(p)
    if (action === 'send') {
      const faltan = faltantesEnvio(config)
      if (faltan.length) return json(422, { error: 'falta información para enviar', faltan })
    }
    try {
      const { version } = await congelarDesdeConfig(p, config, 'panel')
      if (action === 'send') {
        await marcarEnviada(id)
        await recordAdminEvent(request, 'plano.enviada')
      }
      return json(200, { ok: true, version: version.version, huella: version.huella, enlace: `/propuesta/${p.token}` })
    } catch (e) {
      if (e instanceof PropuestaVacia) return json(422, { error: 'la propuesta no tiene componentes ni plan web' })
      throw e
    }
  }

  if (action === 'discard') {
    const ok = await descartar(id)
    if (ok) await recordAdminEvent(request, 'plano.descartada')
    return ok ? json(200, { ok: true }) : json(409, { error: 'solo se descartan borradores o propuestas enviadas' })
  }

  if (action === 'reopen') {
    return (await reabrir(id)) ? json(200, { ok: true }) : json(409, { error: 'solo se reabre una propuesta descartada' })
  }

  return json(400, { error: 'acción desconocida' })
}

/** Guarda la configuración (autoguardado del constructor). No congela versión. */
export const PATCH: APIRoute = async ({ request, url }) => {
  const data = await body(request)
  if (!data) return json(400, { error: 'JSON inválido' })
  const id = Number(data.id ?? url.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return json(400, { error: 'id inválido' })
  const config = normalizarConfig(data.config, hoyCO())
  try {
    await guardarConfig(id, config)
  } catch (e) {
    if (e instanceof PropuestaCerrada) return json(409, { error: e.message })
    return json(404, { error: e instanceof Error ? e.message : 'no se pudo guardar' })
  }
  return json(200, { ok: true })
}
