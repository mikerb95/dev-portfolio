import type { APIRoute } from 'astro'
import { presentStore } from '../../lib/present/store'
import {
  acotar,
  destinoTrasReporte,
  esEntero,
  esFresco,
  mover,
  parsearActual,
  POS_INICIAL,
  POS_MAX,
  techo,
  type Actual,
  type Origen,
} from '../../lib/presentacion/estado'

/**
 * Estado del control remoto de `/final.html`, que no se toca ni se edita.
 *
 *   GET                             -> { destino, actual, viva }
 *   GET ?q=destino                  -> { destino }            (lo que sondea la pantalla)
 *   POST { accion: siguiente|anterior } -> mueve el destino    (el mando)
 *   POST { destino: N }             -> salto directo           (el mando)
 *   POST { pos, total, origen }     -> la pantalla publica dónde está de verdad
 *
 * DOS CLAVES, UN ESCRITOR CADA UNA. El mando escribe `destino`; la pantalla
 * escribe `actual`. Sin CAS en el almacén, una sola clave compartida podría
 * perder un toque justo cuando la pantalla publica su cambio, que es
 * exactamente el instante en que se vuelve a pulsar. Separarlas hace que esa
 * carrera no exista en el camino caliente. La pantalla toca `destino` solo en
 * dos casos raros y documentados en `estado.ts`: acotarlo contra el total real
 * y adoptar un movimiento ajeno.
 *
 * Sin PIN, sin sesión, sin admin: es el estado completo del sistema, y lo peor
 * que puede hacer alguien que lo encuentre es pasar una diapositiva de algo que
 * ya está proyectado en la pared.
 */

const K_DESTINO = 'presentacion:destino'
const K_ACTUAL = 'presentacion:actual'
const TTL_SEGUNDOS = 6 * 60 * 60

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const error = (e: unknown) =>
  json(503, { error: e instanceof Error ? e.message : 'error inesperado' })

async function leerDestino(): Promise<number> {
  const crudo = await presentStore().get(K_DESTINO)
  const n = crudo === null ? NaN : Number(crudo)
  return Number.isInteger(n) ? acotar(n) : POS_INICIAL
}

async function leerActual(): Promise<Actual | null> {
  return parsearActual(await presentStore().get(K_ACTUAL))
}

const guardarDestino = (n: number) =>
  presentStore().set(K_DESTINO, String(n), TTL_SEGUNDOS)

export const GET: APIRoute = async ({ url }) => {
  try {
    // La pantalla sondea dos veces por segundo durante toda la charla y solo
    // necesita el destino. Pedir de paso el `actual` que ella misma escribió
    // duplicaría las lecturas del almacén sin darle nada.
    if (url.searchParams.get('q') === 'destino') {
      return json(200, { destino: await leerDestino() })
    }
    const [destino, actual] = await Promise.all([leerDestino(), leerActual()])
    return json(200, { destino, actual, viva: esFresco(actual, Date.now()) })
  } catch (e) {
    return error(e)
  }
}

export const POST: APIRoute = async ({ request }) => {
  let bruto: unknown
  try {
    bruto = await request.json()
  } catch {
    return json(400, { error: 'cuerpo inválido' })
  }
  const cuerpo = (bruto ?? {}) as {
    accion?: unknown
    destino?: unknown
    pos?: unknown
    total?: unknown
    origen?: unknown
  }

  try {
    // ── La pantalla publica dónde está de verdad ────────────────────────────
    if (cuerpo.pos !== undefined) {
      const pos = Number(cuerpo.pos)
      const total = Number(cuerpo.total)
      if (!esEntero(pos) || !esEntero(total)) return json(400, { error: 'pos/total inválidos' })
      if (pos < POS_INICIAL || total < POS_INICIAL || total > POS_MAX || pos > total) {
        return json(400, { error: 'pos/total fuera de rango' })
      }
      const origen: Origen =
        cuerpo.origen === 'mando' || cuerpo.origen === 'ajena' || cuerpo.origen === 'latido'
          ? cuerpo.origen
          : 'inicial'

      const actual: Actual = { pos, total, ts: Date.now() }
      await presentStore().set(K_ACTUAL, JSON.stringify(actual), TTL_SEGUNDOS)

      const previo = await leerDestino()
      const destino = destinoTrasReporte(previo, actual, origen)
      if (destino !== previo) await guardarDestino(destino)
      return json(200, { destino, actual })
    }

    // ── El mando ────────────────────────────────────────────────────────────
    const [previo, actual] = await Promise.all([leerDestino(), leerActual()])
    const tope = techo(actual, Date.now())
    let destino: number

    if (cuerpo.destino !== undefined) {
      const n = Number(cuerpo.destino)
      if (!esEntero(n)) return json(400, { error: 'destino inválido' })
      destino = acotar(n, tope)
    } else if (cuerpo.accion === 'siguiente' || cuerpo.accion === 'anterior') {
      destino = mover(previo, cuerpo.accion === 'siguiente' ? 1 : -1, tope)
    } else {
      return json(400, { error: 'acción desconocida' })
    }

    if (destino !== previo) await guardarDestino(destino)
    // El mando pinta la respuesta: sabe al instante si el toque movió algo o
    // topó con el final, en vez de decir "ok" a ciegas.
    return json(200, { destino, actual, viva: esFresco(actual, Date.now()) })
  } catch (e) {
    return error(e)
  }
}
