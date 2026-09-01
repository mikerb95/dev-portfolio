import type { APIRoute } from 'astro'
import { presentStore } from '../../lib/present/store'

/**
 * Estado mínimo para controlar `/final.html` a distancia sin tocarlo.
 *
 *   GET  -> { seq, accion } último comando emitido.
 *   POST { accion: "siguiente" | "anterior" } -> lo guarda y sube `seq`.
 *
 * La página pública (`/presentacion`) hace polling de GET y, cuando `seq`
 * sube, dispara un único `keydown` de flecha dentro del iframe: es la lectura
 * de `seq`, no el valor de `accion` en sí, lo que dice "esto es nuevo".
 *
 * Sin PIN, sin sesión, sin admin: es el estado completo del sistema, a
 * propósito. Nada aquí revela ni cambia datos sensibles, así que no vale la
 * pena la ceremonia que sí tiene `/sustentacion`.
 */

const KEY = 'presentacion:cmd'
const TTL_SEGUNDOS = 6 * 60 * 60

type Estado = { seq: number; accion: 'siguiente' | 'anterior' }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const GET: APIRoute = async () => {
  try {
    const crudo = await presentStore().get(KEY)
    const estado: Estado = crudo ? JSON.parse(crudo) : { seq: 0, accion: 'siguiente' }
    return json(200, estado)
  } catch (e) {
    return json(503, { error: e instanceof Error ? e.message : 'error inesperado' })
  }
}

export const POST: APIRoute = async ({ request }) => {
  let bruto: unknown
  try {
    bruto = await request.json()
  } catch {
    return json(400, { error: 'cuerpo inválido' })
  }

  const accion = (bruto as { accion?: unknown })?.accion
  if (accion !== 'siguiente' && accion !== 'anterior') {
    return json(400, { error: 'acción desconocida' })
  }

  try {
    const store = presentStore()
    const crudo = await store.get(KEY)
    const anterior: Estado = crudo ? JSON.parse(crudo) : { seq: 0, accion: 'siguiente' }
    const estado: Estado = { seq: anterior.seq + 1, accion }
    await store.set(KEY, JSON.stringify(estado), TTL_SEGUNDOS)
    return json(200, estado)
  } catch (e) {
    return json(503, { error: e instanceof Error ? e.message : 'error inesperado' })
  }
}
