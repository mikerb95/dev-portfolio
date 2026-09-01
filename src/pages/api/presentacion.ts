import type { APIRoute } from 'astro'
import { presentStore } from '../../lib/present/store'

/**
 * Estado mínimo para controlar `/final.html` a distancia sin tocarlo.
 *
 *   GET  -> { pos } diapositiva en la que debe estar la presentación.
 *   POST { accion: "siguiente" | "anterior" } -> mueve `pos` una posición.
 *   POST { pos: N } -> fija `pos` (lo usa la página pública para corregir).
 *
 * POSICIÓN ABSOLUTA, no comandos. La primera versión guardaba "último comando
 * + contador" y la página aplicaba uno por sondeo: al pulsar tres veces
 * seguidas se perdían dos, porque entre dos sondeos solo cabe un evento. Con
 * una posición, un sondeo perdido no pierde nada - el siguiente trae el
 * destino completo y la página cierra la diferencia entera.
 *
 * El servidor NO sabe cuántas diapositivas hay, y no le hace falta: cuando la
 * presentación llega al final y no puede avanzar más, la propia página manda
 * su posición real con `POST { pos }` y corrige el desvío. Así no hay que
 * mantener aquí un número que vive dentro de `final.html`.
 *
 * Sin PIN, sin sesión, sin admin: es el estado completo del sistema.
 */

const KEY = 'presentacion:pos'
const TTL_SEGUNDOS = 6 * 60 * 60

/** La presentación arranca en su primera diapositiva. */
const POS_INICIAL = 1
/** Tope de cordura: nadie tiene una charla de mil diapositivas. */
const POS_MAX = 999

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

async function leer(): Promise<number> {
  const crudo = await presentStore().get(KEY)
  const n = crudo === null ? NaN : Number(crudo)
  return Number.isInteger(n) ? n : POS_INICIAL
}

const acotar = (n: number) => Math.min(POS_MAX, Math.max(POS_INICIAL, n))

export const GET: APIRoute = async () => {
  try {
    return json(200, { pos: await leer() })
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
  const cuerpo = (bruto ?? {}) as { accion?: unknown; pos?: unknown }

  try {
    let pos: number

    if (cuerpo.pos !== undefined) {
      // Corrección desde la página pública: su posición real manda sobre lo
      // que hubiera aquí, que es lo que deshace el desvío del tope.
      const n = Number(cuerpo.pos)
      if (!Number.isInteger(n)) return json(400, { error: 'pos inválida' })
      pos = acotar(n)
    } else if (cuerpo.accion === 'siguiente' || cuerpo.accion === 'anterior') {
      pos = acotar((await leer()) + (cuerpo.accion === 'siguiente' ? 1 : -1))
    } else {
      return json(400, { error: 'acción desconocida' })
    }

    await presentStore().set(KEY, String(pos), TTL_SEGUNDOS)
    return json(200, { pos })
  } catch (e) {
    return json(503, { error: e instanceof Error ? e.message : 'error inesperado' })
  }
}
