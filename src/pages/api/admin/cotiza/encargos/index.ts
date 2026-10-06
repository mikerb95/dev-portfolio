import type { APIRoute } from 'astro'
import { recordAdminEvent } from '../../../../../lib/security/events'
import { configVacia, normalizarConfig } from '../../../../../lib/cotiza/encargo'
import { crearEncargo } from '../../../../../lib/cotiza/db'

// Alta de un encargo de Cotiza (borrador). La sesión la impone el middleware:
// sesión admin o cookie del PIN (RF-220); esta ruta está entre las que abre.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    // Lleva datos del cliente: nunca en caché.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const POST: APIRoute = async ({ request }) => {
  let bruto: unknown = null
  try {
    bruto = await request.json()
  } catch {
    bruto = null
  }
  const config = bruto && typeof bruto === 'object' ? normalizarConfig(bruto) : configVacia()
  const e = await crearEncargo(config)
  await recordAdminEvent(request, 'cotiza.encargo_creado', { statusCode: 201 })
  return json(201, { ok: true, id: e.id })
}
