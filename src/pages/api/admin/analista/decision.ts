import type { APIRoute } from 'astro'
import { escenario } from './_estado'

// Aprobar o rechazar el bloqueo que propuso el analista. Protegido por el
// middleware de /api/admin; solo tiene sentido en `astro dev` (ver index.ts).

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const POST: APIRoute = async ({ request }) => {
  if (!import.meta.env.DEV) return json(404, { error: 'El analista solo corre en local.' })
  const body = await request.json().catch(() => ({}))
  const estado = escenario()
  const resolver = estado.pendiente
  if (!resolver) return json(409, { error: 'No hay ningún bloqueo esperando decisión.' })
  estado.pendiente = null
  // Solo un `true` explícito aprueba.
  resolver(body?.aprobado === true)
  return json(200, { ok: true })
}
