import type { APIRoute } from 'astro'
import { clientIp } from '../../../lib/device-info'
import { formatearMonto, type Moneda } from '../../../data/tarifario'
import { sendPush } from '../../../lib/notify'
import { recordSecurityEvent } from '../../../lib/security/events'
import { ErrorEncargo } from '../../../lib/cotiza/db'
import { aceptarPorCliente, decidirPorCliente, encargoPorToken } from '../../../lib/cotiza/enlace'

// Lo que el cliente hace desde su enlace (RF-224): POST { accion: 'aceptar' |
// 'decidir', ... }. Pública: el token ES la autorización, como en /c/ y en
// /propuesta/. Sin cifras desde el navegador: el monto de cada adicional y el
// precio son los que ya están guardados.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    // Precios y datos personales: nunca en ninguna caché.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/** Rastro de auditoría sin el token: la ruta del rastro no debe abrir el enlace. */
function rastro(request: Request, ruleId: string, statusCode: number): Promise<void> {
  return recordSecurityEvent({
    classification: { category: 'propuesta', severity: 'low', ruleId },
    ip: clientIp(request.headers),
    method: 'POST',
    path: '/api/acuerdo/:token',
    userAgent: request.headers.get('user-agent'),
    country: request.headers.get('x-vercel-ip-country'),
    statusCode,
  })
}

export const POST: APIRoute = async ({ params, request }) => {
  let d: Record<string, unknown>
  try {
    const b = await request.json()
    d = b && typeof b === 'object' ? (b as Record<string, unknown>) : {}
  } catch {
    return json(400, { error: 'solicitud inválida' })
  }

  const e = await encargoPorToken(params.token)
  // "No existe" y "no disponible" responden igual.
  if (!e) return json(404, { error: 'enlace no disponible' })
  const m = (v: number) => formatearMonto(v, e.moneda as Moneda)

  try {
    if (d.accion === 'aceptar') {
      const f = await aceptarPorCliente(e, d)
      await rastro(request, 'cotiza.cliente_acepto', 200)
      await sendPush('Cotiza: propuesta aceptada', `${f.aceptadoPor} aceptó "${f.titulo}" por ${m(f.precio ?? 0)}.`, { priority: 4, tags: 'white_check_mark' })
      return json(200, { ok: true })
    }
    if (d.accion === 'decidir') {
      const a = await decidirPorCliente(e, d)
      await rastro(request, a.estado === 'aprobado' ? 'cotiza.cliente_aprobo' : 'cotiza.cliente_rechazo', 200)
      await sendPush(
        a.estado === 'aprobado' ? 'Cotiza: adicional aprobado' : 'Cotiza: adicional rechazado',
        `${a.decididoNombre} ${a.estado === 'aprobado' ? 'aprobó' : 'rechazó'} "${a.descripcion.slice(0, 120)}" (${m(a.monto)}) en "${e.titulo}".`,
        { priority: a.estado === 'aprobado' ? 4 : 3, tags: a.estado === 'aprobado' ? 'moneybag' : 'x' }
      )
      return json(200, { ok: true })
    }
    return json(400, { error: 'acción desconocida' })
  } catch (err) {
    if (err instanceof ErrorEncargo) return json(err.status, { error: err.message })
    throw err
  }
}
