import type { APIRoute } from 'astro'
import { presentStore } from '../../lib/present/store'
import {
  acotar,
  destinoTrasReporte,
  esEntero,
  esFresco,
  mover,
  parsearActual,
  parsearForma,
  POS_INICIAL,
  POS_MAX,
  techo,
  type Actual,
  type Origen,
} from '../../lib/presentacion/estado'
import {
  desplazamientoPedido,
  mover as moverScroll,
  parsearPeticion,
  type Peticion,
} from '../../lib/presentacion/desplazamiento'
import { debeArrancar, parsearInicio } from '../../lib/presentacion/cronometro'
import { parsearEspejo, type Espejo } from '../../lib/presentacion/espejo'

/**
 * Estado del control remoto de `/final.html`, que no se toca ni se edita.
 *
 *   GET                             -> { destino, actual, viva, scroll }
 *   GET ?q=destino                  -> { destino, scroll, espejo, inicio, ahora }
 *                                      (lo que sondea la pantalla y los seguidores)
 *   POST { accion: siguiente|anterior } -> mueve el destino    (el mando)
 *   POST { accion: reiniciar-cronometro } -> borra el arranque   (la isla)
 *   POST { accion: subir|bajar }    -> desplaza el iframe del beat (el mando)
 *   POST { destino: N }             -> salto directo           (el mando)
 *   POST { pos, total, intro, outro, scroll, origen }
 *                                   -> la pantalla publica dónde está de verdad
 *
 * UNA CLAVE POR ESCRITOR. El mando escribe `destino` y `scroll`; la pantalla
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
/**
 * El desplazamiento pedido para el iframe de la diapositiva, con la
 * diapositiva a la que pertenece. Clave aparte y no un campo del destino por
 * la misma razón que separa a las otras dos: el destino también lo escribe la
 * pantalla (para acotarlo y para adoptar un movimiento ajeno), y meterlo ahí
 * haría que cada reporte borrara el scroll que el pulgar acababa de pedir.
 */
const K_SCROLL = 'presentacion:scroll'
/**
 * La URL de la página viva del beat, para que la sala vea la que el ponente
 * está tocando. La escribe `/present-admin` con el mismo POST con el que ya
 * publica su posición: es la pantalla del sistema, así que no hay escritor
 * nuevo. Clave aparte por lo mismo que el scroll.
 */
const K_ESPEJO = 'presentacion:espejo'
/**
 * Cuándo arrancó la sustentación, en el reloj del servidor. La escribe el
 * SERVIDOR y nadie más, una sola vez, en el primer movimiento que saca la
 * presentación de su primera diapositiva. Vive aquí y no en el navegador
 * porque una recarga a mitad de charla es un escenario contemplado, y un
 * cronómetro que se pone a cero justo ahí sería peor que no tenerlo.
 */
const K_INICIO = 'presentacion:inicio'
/**
 * El canal de la sala. Sigue la convención de `present:ch:<id>` que ya usan
 * las presentaciones con deck, con `final` como identificador fijo: aquí no
 * hay sesiones, solo hay una charla.
 *
 * Publicar aquí es lo que permite que N asistentes sigan la presentación sin
 * sondear: se suscriben a Upstash DIRECTAMENTE con un token de solo lectura,
 * así que después de cargar la página no vuelven a tocar Vercel. Sin esto, con
 * la sala compartiendo el WiFi del salón, el paraguas de 600 peticiones por
 * minuto y por IP empezaría a bloquear a partir del cuarto asistente.
 */
const CANAL = 'present:ch:final'
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

const leerScroll = async (): Promise<Peticion | null> =>
  parsearPeticion(await presentStore().get(K_SCROLL))

export const GET: APIRoute = async ({ url }) => {
  try {
    // La pantalla sondea dos veces por segundo durante toda la charla y solo
    // necesita el destino. Pedir de paso el `actual` que ella misma escribió
    // duplicaría las lecturas del almacén sin darle nada.
    if (url.searchParams.get('q') === 'destino') {
      // Un número más en un viaje que ya se hacía: la pantalla sondea esto dos
      // veces por segundo y de aquí saca también hasta dónde desplazar el
      // iframe. Lo pedido para OTRA diapositiva vale 0, que es la vuelta
      // arriba automática al cambiar de beat.
      const [destino, pedido] = await Promise.all([leerDestino(), leerScroll()])
      return json(200, { destino, scroll: desplazamientoPedido(pedido, destino) })
    }
    const [destino, actual, pedido] = await Promise.all([
      leerDestino(),
      leerActual(),
      leerScroll(),
    ])
    // El mando necesita el desplazamiento PEDIDO, no solo el real: es lo que
    // decide si el botón de bajar sigue encendido. Misma regla que con el
    // destino del mazo, los topes se comparan contra la intención y se acotan
    // contra la realidad que publica la pantalla.
    return json(200, {
      destino,
      actual,
      viva: esFresco(actual, Date.now()),
      scroll: desplazamientoPedido(pedido, destino),
    })
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
    intro?: unknown
    outro?: unknown
    scroll?: unknown
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

      // La forma del mazo es opcional y se valida aparte: si viene rota se
      // descarta sola y la posición sigue publicándose igual. El control de la
      // presentación no puede depender de que las notas cuadren.
      const actual: Actual = {
        pos,
        total,
        ts: Date.now(),
        ...parsearForma(cuerpo.intro, cuerpo.outro, total),
        // La geometría del iframe viaja con la posición y `parsearActual` la
        // valida al leerla. Se guarda tal cual para no duplicar esa regla.
        ...(cuerpo.scroll === undefined ? {} : { scroll: cuerpo.scroll as Actual['scroll'] }),
      }
      await presentStore().set(K_ACTUAL, JSON.stringify(actual), TTL_SEGUNDOS)

      const previo = await leerDestino()
      const destino = destinoTrasReporte(previo, actual, origen)
      if (destino !== previo) await guardarDestino(destino)
      return json(200, { destino, actual })
    }

    // ── El mando ────────────────────────────────────────────────────────────
    const [previo, actual] = await Promise.all([leerDestino(), leerActual()])
    const tope = techo(actual, Date.now())

    // Desplazar la página que hay dentro del beat. El paso lo calcula el
    // SERVIDOR sobre la geometría que publicó la pantalla, igual que el
    // destino se acota contra el techo real del mazo: el teléfono solo dice
    // arriba o abajo y no sabe nada de la página que hay dentro del iframe.
    if (cuerpo.accion === 'subir' || cuerpo.accion === 'bajar') {
      const pedido = await leerScroll()
      const siguiente = moverScroll(pedido, previo, cuerpo.accion === 'bajar' ? 1 : -1, actual?.scroll)
      // Sin nada que desplazar no se escribe nada. No es un error: la pantalla
      // pudo cambiar de diapositiva entre el toque y su llegada.
      if (siguiente && siguiente.y !== desplazamientoPedido(pedido, previo)) {
        await presentStore().set(K_SCROLL, JSON.stringify(siguiente), TTL_SEGUNDOS)
      }
      return json(200, {
        destino: previo,
        actual,
        viva: esFresco(actual, Date.now()),
        scroll: siguiente ? siguiente.y : desplazamientoPedido(pedido, previo),
      })
    }

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
    // topó con el final, en vez de decir "ok" a ciegas. El desplazamiento va
    // con ella porque cambiar de diapositiva lo devuelve a cero sin escribir
    // nada, y el mando tiene que enterarse en el mismo fotograma.
    const pedido = await leerScroll()
    return json(200, {
      destino,
      actual,
      viva: esFresco(actual, Date.now()),
      scroll: desplazamientoPedido(pedido, destino),
    })
  } catch (e) {
    return error(e)
  }
}
