import type { APIRoute } from 'astro'
import { aceptar } from '../../../../lib/plano/aceptacion'
import { json, leerJson, propuestaPublica, rastro } from '../../../../lib/plano/endpoint'
import { leerEleccion } from '../../../../lib/plano/publico'

// Aceptación electrónica (Ley 527 de 1999): nombre, documento y la casilla de
// "acepto", más el total que el cliente vio. El servidor recalcula y, si
// cuadra, congela la versión elegida y guarda la constancia.

export const POST: APIRoute = async ({ params, request }) => {
  const p = await propuestaPublica(params.token)
  if (!p) return json(404, { error: 'propuesta no encontrada' })
  const d = await leerJson(request)
  const nombre = typeof d.nombre === 'string' ? d.nombre.trim().replace(/\s+/g, ' ').slice(0, 120) : ''
  const documento = typeof d.documento === 'string' ? d.documento.trim().replace(/\s+/g, '').slice(0, 30) : ''
  const precioVisto = Number(d.precioVisto)
  if (nombre.length < 5 || !nombre.includes(' ')) return json(400, { error: 'Escribe tu nombre completo.' })
  if (!/^[0-9A-Za-z.-]{5,30}$/.test(documento)) return json(400, { error: 'Escribe tu número de cédula o NIT.' })
  if (d.acepto !== true) return json(400, { error: 'Marca la casilla de aceptación.' })
  if (!Number.isFinite(precioVisto)) return json(400, { error: 'Recarga la página e inténtalo otra vez.' })

  const r = await aceptar(p, leerEleccion(d.eleccion), { nombre, documento, precioVisto })
  rastro(request, r.ok ? 'propuesta.aceptada' : 'propuesta.aceptacion_rechazada', r.ok ? 200 : r.status)
  if (!r.ok) return json(r.status, { error: r.error })
  return json(200, { ok: true, version: r.version, constancia: r.huella })
}
