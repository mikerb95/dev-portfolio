import type { APIRoute } from 'astro'
import { simular } from '../../../../lib/plano/aceptacion'
import { json, leerJson, propuestaPublica } from '../../../../lib/plano/endpoint'
import { leerEleccion, vistaCliente } from '../../../../lib/plano/publico'

// El cliente movió una perilla: el servidor recalcula desde la versión enviada
// y devuelve la vista del cliente. El navegador no tiene la configuración ni
// las reglas, así que no puede calcular por su cuenta (ni ver las horas).

export const POST: APIRoute = async ({ params, request }) => {
  const p = await propuestaPublica(params.token)
  if (!p) return json(404, { error: 'propuesta no encontrada' })
  if (p.estado !== 'enviada') return json(409, { error: 'esta propuesta ya fue aceptada' })
  const s = await simular(p, leerEleccion(await leerJson(request)))
  if (!s) return json(404, { error: 'propuesta no encontrada' })
  return json(200, { ok: true, vista: vistaCliente(s) })
}
