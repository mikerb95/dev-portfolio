import type { APIRoute } from 'astro'
import { detalleOrigen } from '../../../../lib/analista/detalle-origen'
import { obtenerEjecucion } from '../../../../lib/analista/ejecuciones'
import { Seudonimos } from '../../../../lib/analista/seudonimos'
import { recordAdminEvent } from '../../../../lib/security/events'
import { esEjecucionSdk, ipSdk } from './_agent-sdk'

// Revela la IP real detrás de un alias del analista, con su detalle, para
// decidir un bloqueo. La pide el botón "Ver IP real" del diálogo de aprobación:
// la pantalla se proyecta, así que la IP no viaja con la propuesta y solo se
// carga si el administrador la pide. El request lleva el análisis y el alias,
// nunca la IP, y el alias solo se resuelve si salió de ESE análisis.
//
// Protegido por el middleware de /api/admin y vetado en modo demo (lib/demo.ts).

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const GET: APIRoute = async ({ request, url }) => {
  const id = url.searchParams.get('id') ?? ''
  const alias = url.searchParams.get('alias') ?? ''
  if (!id || !alias) return json(400, { error: 'Falta el análisis o el origen.' })

  let ip: string | null
  try {
    if (esEjecucionSdk(id)) {
      ip = import.meta.env.DEV ? ipSdk(id, alias) : null
    } else {
      const ejecucion = await obtenerEjecucion(id)
      ip = ejecucion ? Seudonimos.desde(ejecucion.seudonimos).ip(alias) : null
    }
    if (!ip) return json(404, { error: 'Ese origen no salió de este análisis.' })

    const detalle = await detalleOrigen(ip)
    await recordAdminEvent(request, 'analista.ip_revelada', { severity: 'medium' })
    return json(200, detalle)
  } catch {
    return json(503, { error: 'No se pudo leer el detalle. Intenta de nuevo en un momento.' })
  }
}
