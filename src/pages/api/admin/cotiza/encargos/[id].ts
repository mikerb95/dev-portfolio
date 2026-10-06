import type { APIRoute } from 'astro'
import { recordAdminEvent } from '../../../../../lib/security/events'
import {
  ErrorEncargo,
  aceptar,
  cerrar,
  congelar,
  crearAdicionalManual,
  decidirAdicional,
  descartar,
  encargo,
  guardarConfig,
  reabrir,
  registrarReunion,
  registrarRonda,
  registrarSolicitud,
} from '../../../../../lib/cotiza/db'
import { generarEnlace } from '../../../../../lib/cotiza/enlace'

// Acciones sobre un encargo de Cotiza: POST { accion, ...datos }. El navegador
// manda configuración y hechos (qué pidió, cuántos minutos duró la reunión),
// nunca cifras: todo precio lo calcula el servidor con el motor y las tarifas
// congeladas. Qué acción vale en qué estado lo decide lib/cotiza/encargo.ts.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

// Solo las que cambian el acuerdo dejan rastro en el micro-SIEM; anotar la
// bitácora es trabajo de todos los días y llenaría la auditoría de ruido.
const RASTRO: Record<string, string> = {
  congelar: 'cotiza.encargo_congelado',
  aceptar: 'cotiza.encargo_aceptado',
  reabrir: 'cotiza.encargo_reabierto',
  cerrar: 'cotiza.encargo_cerrado',
  descartar: 'cotiza.encargo_descartado',
}

export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) return json(400, { error: 'id inválido' })

  let d: Record<string, unknown>
  try {
    const b = await request.json()
    d = b && typeof b === 'object' ? (b as Record<string, unknown>) : {}
  } catch {
    return json(400, { error: 'cuerpo inválido' })
  }

  const e = await encargo(id)
  if (!e) return json(404, { error: 'encargo no encontrado' })

  try {
    switch (d.accion) {
      case 'guardar':
        await guardarConfig(e, d.config)
        return json(200, { ok: true })
      case 'congelar': {
        const f = await congelar(e)
        await recordAdminEvent(request, RASTRO.congelar)
        return json(200, { ok: true, precio: f.precio, huella: f.huella })
      }
      case 'aceptar':
        await aceptar(e)
        break
      case 'reabrir':
        await reabrir(e)
        break
      case 'cerrar':
        await cerrar(e)
        break
      case 'descartar':
        await descartar(e)
        break
      case 'solicitud':
        return json(201, { ok: true, ...(await registrarSolicitud(e, d)) })
      case 'reunion':
        return json(201, { ok: true, ...(await registrarReunion(e, d)) })
      case 'ronda':
        return json(201, { ok: true, ...(await registrarRonda(e, d)) })
      case 'adicional':
        return json(201, { ok: true, adicional: await crearAdicionalManual(e, d) })
      case 'enlace': {
        const token = await generarEnlace(e)
        await recordAdminEvent(request, 'cotiza.enlace_generado')
        return json(200, { ok: true, ruta: `/acuerdo/${token}` })
      }
      case 'decidir': {
        const a = await decidirAdicional(e, d.adicionalId, d.decision)
        await recordAdminEvent(request, a.estado === 'aprobado' ? 'cotiza.adicional_aprobado' : 'cotiza.adicional_rechazado')
        return json(200, { ok: true, adicional: a })
      }
      default:
        return json(400, { error: 'acción desconocida' })
    }
    await recordAdminEvent(request, RASTRO[d.accion as string])
    return json(200, { ok: true })
  } catch (err) {
    if (err instanceof ErrorEncargo) return json(err.status, { error: err.message })
    throw err
  }
}
