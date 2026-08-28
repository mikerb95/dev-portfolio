// Canal INVERSO de la sustentación: del celular hacia el canvas.
//
// El canal directo (canvas → asistentes) ya existe en `bus.ts`. Este módulo es
// el otro sentido: el teléfono manda "siguiente" y el canvas obedece. Reutiliza
// entera la capa de sesión de `bus.ts` (mismo id, mismo TTL de seis horas,
// mismo almacén, mismo bus de publicación) y no duplica ni una línea de ella.
//
// Tres invariantes gobiernan todo lo que hay aquí, y las tres vienen del mismo
// escenario: un teléfono con 5G irregular, en mitad de la sustentación.
//
//  1. EL SERVIDOR MANDA POSICIÓN ABSOLUTA. El comando es relativo
//     ("siguiente"), la respuesta y lo que viaja al bus nunca lo son: dicen
//     "beat 7". Un mensaje perdido no descoloca a nadie, porque el siguiente
//     ciclo trae la posición completa y no un incremento que aplicar sobre un
//     estado que quizá ya no coincide.
//
//  2. IDEMPOTENCIA POR RECLAMO ATÓMICO. Cada comando trae `clienteId` y un
//     contador `seq`. El servidor RECLAMA la pareja (cliente, seq) con un
//     `SET NX` antes de tocar nada: el segundo toque del botón encuentra la
//     clave ocupada y se va sin avanzar. Un contador leído-y-escrito con
//     `get`+`set` no serviría: las dos copias del mismo comando pueden leer
//     "no visto" antes de que ninguna escriba, y entonces el beat salta dos.
//
//  3. SOLO REDIS. Ni una consulta a Turso en todo el camino. La base principal
//     puede estar con la cuota de lecturas agotada el día de la sustentación y
//     el control remoto tiene que seguir funcionando igual.

import { presentStore, PresentStoreError } from '../present/store'
import {
  esPinPresentador,
  getSesion,
  persistirYPublicar,
  sesionActual,
  SUSTENTACION_TTL_SECONDS,
  type SustentacionSession,
} from './bus'
import { BEAT_PRIMERO, BEAT_ULTIMO, beatDelGuion } from './guion'
import { normalizarPinPresentador } from './pin-presentador'

// ── Claves ──────────────────────────────────────────────────────────────────

/** Reclamo de un comando concreto. Su existencia ES la marca de "ya aplicado". */
const KEY_RECLAMO = (sid: string, cid: string, seq: number) => `sust:cmd:${sid}:${cid}:${seq}`
/** Último `seq` aceptado de un cliente, para descartar lo que llega tarde. */
const KEY_SEQ = (sid: string, cid: string) => `sust:seq:${sid}:${cid}`
const KEY_RL_IP = (ventana: number, ip: string) => `sust:rl:ip:${ventana}:${ip}`
const KEY_RL_FALLOS = (ventana: number, ip: string) => `sust:rl:fail:${ventana}:${ip}`
const KEY_RL_SESION = (ventana: number, sid: string) => `sust:rl:s:${ventana}:${sid}`

// ── Rate limit ──────────────────────────────────────────────────────────────
//
// Contadores con ventana fija en Redis, NO el limiter durable de
// `lib/security/ratelimit-durable.ts`: ese vive en Turso, y el requisito es
// justamente que la sustentación no dependa de la base principal. Ventana fija
// y no deslizante porque un `INCR` con `EXPIRE` es una operación y media,
// mientras que una ventana deslizante son varias por comando - y esto corre en
// el camino crítico del avance de diapositiva.

const VENTANA_MS = 10_000
/** Un pulgar nervioso no pasa de aquí; un script sí. */
const LIMITE_IP = 40
const LIMITE_SESION = 60

const VENTANA_FALLOS_MS = 60_000
/**
 * PINs incorrectos por IP y minuto. Es la defensa real contra la fuerza bruta
 * sobre el PIN de presentador: con 10 intentos por minuto, recorrer una
 * milésima del espacio de 31¹⁰ llevaría más de un millón de años.
 */
const LIMITE_FALLOS = 10

const ventanaActual = (ms: number) => Math.floor(Date.now() / ms)

async function excede(clave: string, limite: number, ttlSegundos: number): Promise<boolean> {
  const n = await presentStore().incr(clave, ttlSegundos)
  return n > limite
}

// ── Entrada ─────────────────────────────────────────────────────────────────

export type Accion = 'siguiente' | 'anterior' | 'ir'

export type ComandoEntrada = {
  pin: string
  accion: Accion
  beat?: number
  clienteId: string
  seq: number
}

/**
 * Identidad del control remoto. Va a una clave de Redis, así que se restringe
 * a lo que no puede romper una clave ni colarse en otra: sin dos puntos, sin
 * comodines, con tope de longitud. Nunca se construye una clave con texto que
 * no haya pasado por aquí.
 */
const CLIENTE_RE = /^[a-z0-9-]{4,64}$/
/** Un `seq` es un contador de sesión, no una fecha ni un número mágico. */
const SEQ_MAX = 1_000_000

export type ParseoComando =
  | { ok: true; comando: ComandoEntrada }
  | { ok: false; error: string }

/**
 * Parseo defensivo del cuerpo que llega del teléfono. Puro: mismo criterio que
 * `present/state.ts`, para que el control remoto pueda validar antes de gastar
 * una petición y el servidor vuelva a validar igualmente.
 */
export function parseComando(bruto: unknown): ParseoComando {
  if (!bruto || typeof bruto !== 'object') return { ok: false, error: 'cuerpo inválido' }
  const b = bruto as Record<string, unknown>

  const pin = normalizarPinPresentador(typeof b.pin === 'string' ? b.pin : null)
  if (!pin) return { ok: false, error: 'PIN inválido' }

  const accion = b.accion
  if (accion !== 'siguiente' && accion !== 'anterior' && accion !== 'ir') {
    return { ok: false, error: 'acción desconocida' }
  }

  const clienteId = typeof b.clienteId === 'string' ? b.clienteId.toLowerCase() : ''
  if (!CLIENTE_RE.test(clienteId)) return { ok: false, error: 'clienteId inválido' }

  const seq = typeof b.seq === 'number' ? b.seq : Number(b.seq)
  if (!Number.isInteger(seq) || seq < 1 || seq > SEQ_MAX) {
    return { ok: false, error: 'seq inválido' }
  }

  if (accion === 'ir') {
    const beat = typeof b.beat === 'number' ? b.beat : Number(b.beat)
    if (!Number.isInteger(beat) || beat < BEAT_PRIMERO || beat > BEAT_ULTIMO) {
      return { ok: false, error: `beat fuera de rango (${BEAT_PRIMERO}-${BEAT_ULTIMO})` }
    }
    return { ok: true, comando: { pin, accion, beat, clienteId, seq } }
  }

  return { ok: true, comando: { pin, accion, clienteId, seq } }
}

// ── Salida ──────────────────────────────────────────────────────────────────

/**
 * Lo que devuelven `/comando` y `/estado`. Es POSICIÓN ABSOLUTA y completa: el
 * canvas puede pintarse entero desde aquí sin recordar nada de lo anterior, que
 * es lo que permite que un mensaje perdido no deje nada descolocado.
 */
export type EstadoSustentacion = {
  sessionId: string
  beat: number
  titulo: string
  dato: string | null
  version: number
  /** Epoch ms del último cambio de cualquier tipo. */
  actualizadoEn: number
  /** Epoch ms en que empezó el beat actual. Alimenta el cronómetro. */
  beatIniciadoEn: number
  primerBeat: number
  ultimoBeat: number
}

export function aEstado(s: SustentacionSession): EstadoSustentacion {
  return {
    sessionId: s.id,
    beat: s.beat,
    titulo: s.titulo,
    dato: s.dato,
    version: s.version,
    actualizadoEn: s.updatedAt,
    beatIniciadoEn: s.beatIniciadoEn,
    primerBeat: BEAT_PRIMERO,
    ultimoBeat: BEAT_ULTIMO,
  }
}

/** Por qué un comando llegó y no movió nada. Solo informativo, nunca un error. */
export type MotivoDescarte = 'duplicado' | 'fuera-de-orden' | 'sin-cambio'

export type ResultadoComando =
  | {
      ok: true
      estado: EstadoSustentacion
      /** ¿Movió el beat de verdad? `false` en duplicado, tope o repetición. */
      aplicado: boolean
      motivo?: MotivoDescarte
    }
  | { ok: false; error: string; status: number }

// ── Destino del comando ─────────────────────────────────────────────────────

/**
 * A qué beat lleva un comando desde el actual. Puro y sin efectos, para poder
 * probarlo sin Redis.
 *
 * `siguiente` en el último beat NO termina la sesión, al contrario que el
 * `next` de `lib/present`. Aquí el tope es un tope: pasarse del último beat en
 * mitad del turno de preguntas del jurado y que la presentación se cierre sola
 * sería el peor fallo posible de esta feature. El beat 0 sí es especial: es
 * "aún no he empezado", y cualquier avance entra al primer beat real.
 */
export function beatDestino(actual: number, cmd: ComandoEntrada): number {
  switch (cmd.accion) {
    case 'ir':
      return Math.min(BEAT_ULTIMO, Math.max(BEAT_PRIMERO, cmd.beat ?? actual))
    case 'siguiente':
      return actual < BEAT_PRIMERO ? BEAT_PRIMERO : Math.min(BEAT_ULTIMO, actual + 1)
    case 'anterior':
      // Nunca se vuelve al 0: una vez empezada, la presentación empezó.
      return Math.max(BEAT_PRIMERO, actual - 1)
  }
}

// ── Ejecución ───────────────────────────────────────────────────────────────

/**
 * Aplica un comando del control remoto. Es el único camino por el que el
 * teléfono mueve la presentación.
 *
 * El ORDEN de los pasos es la parte que importa:
 *
 *   1. Rate limit por IP - antes de nada, para que un martilleo no llegue
 *      siquiera a consultar la sesión.
 *   2. Sesión y PIN - un PIN incorrecto quema cupo de fallos y no pasa de aquí.
 *   3. Reclamo atómico del (cliente, seq) - AQUÍ se corta el doble toque.
 *   4. Orden - un comando más viejo que el último aceptado se ignora.
 *   5. Aplicar, persistir y publicar.
 *
 * Los pasos 3 y 4 van DESPUÉS de validar: si un comando malformado quemara su
 * `seq`, el reintento corregido del cliente se descartaría como duplicado.
 */
export async function ejecutarComando(
  cmd: ComandoEntrada,
  ip: string
): Promise<ResultadoComando> {
  const store = presentStore()
  const ttlVentana = Math.ceil(VENTANA_MS / 1000)

  try {
    if (await excede(KEY_RL_IP(ventanaActual(VENTANA_MS), ip), LIMITE_IP, ttlVentana)) {
      return { ok: false, error: 'demasiados comandos, espera un momento', status: 429 }
    }

    const ventanaFallos = ventanaActual(VENTANA_FALLOS_MS)
    const ttlFallos = Math.ceil(VENTANA_FALLOS_MS / 1000)

    const sesion = await sesionActual()
    if (!sesion) return { ok: false, error: 'no hay sesión de sustentación en curso', status: 404 }

    if (!(await esPinPresentador(sesion.id, cmd.pin))) {
      // El fallo se contabiliza; el mensaje no distingue "PIN de asistente" de
      // "PIN inventado", que sería decirle a quien prueba que va bien.
      await excede(KEY_RL_FALLOS(ventanaFallos, ip), LIMITE_FALLOS, ttlFallos)
      return { ok: false, error: 'PIN sin permiso de control', status: 403 }
    }
    if (await excede(KEY_RL_FALLOS(ventanaFallos, ip), LIMITE_FALLOS, ttlFallos)) {
      // Se comprueba también tras un PIN correcto: si esta IP acaba de gastar
      // el cupo probando PINs, acertar el último no la debería premiar.
      return { ok: false, error: 'demasiados intentos, espera un minuto', status: 429 }
    }

    if (
      await excede(KEY_RL_SESION(ventanaActual(VENTANA_MS), sesion.id), LIMITE_SESION, ttlVentana)
    ) {
      return { ok: false, error: 'demasiados comandos en esta sesión', status: 429 }
    }

    // ── Idempotencia ────────────────────────────────────────────────────────
    // El reclamo es lo ÚNICO atómico del camino, y por eso lleva la garantía
    // que pide el requisito: de dos copias del mismo comando, exactamente una
    // gana el `SET NX` y la otra se va sin tocar el beat.
    const gano = await store.setNx(
      KEY_RECLAMO(sesion.id, cmd.clienteId, cmd.seq),
      String(Date.now()),
      SUSTENTACION_TTL_SECONDS
    )
    if (!gano) {
      // No es un error: el teléfono reintentó porque no vio la respuesta. Se le
      // devuelve la posición absoluta, que es exactamente lo que necesita.
      return { ok: true, estado: aEstado(sesion), aplicado: false, motivo: 'duplicado' }
    }

    // ── Orden ───────────────────────────────────────────────────────────────
    // Un `seq` menor o igual al último aceptado es un comando que se quedó
    // atascado en la red y llega ahora, cuando ya no representa nada.
    const ultimoSeq = Number((await store.get(KEY_SEQ(sesion.id, cmd.clienteId))) ?? 0)
    if (cmd.seq <= ultimoSeq) {
      return { ok: true, estado: aEstado(sesion), aplicado: false, motivo: 'fuera-de-orden' }
    }

    const destino = beatDestino(sesion.beat, cmd)
    await store.set(KEY_SEQ(sesion.id, cmd.clienteId), String(cmd.seq), SUSTENTACION_TTL_SECONDS)

    if (destino === sesion.beat) {
      // Tope del guion o "ir" al beat en el que ya estamos. No se publica nada:
      // una versión nueva sin cambio solo serviría para despertar a la sala.
      return { ok: true, estado: aEstado(sesion), aplicado: false, motivo: 'sin-cambio' }
    }

    // El título y el dato de la vista de celular salen del GUION, no del
    // teléfono: el control remoto manda intención, no contenido. Así el
    // asistente ve siempre el texto revisado y no lo que quepa en un JSON.
    const delGuion = beatDelGuion(destino)
    const ahora = Date.now()
    const actualizada: SustentacionSession = {
      ...sesion,
      beat: destino,
      titulo: delGuion?.vista_celular.titulo ?? sesion.titulo,
      dato: delGuion?.vista_celular.dato ?? null,
      version: sesion.version + 1,
      updatedAt: ahora,
      beatIniciadoEn: ahora,
    }

    await persistirYPublicar(actualizada)
    return { ok: true, estado: aEstado(actualizada), aplicado: true }
  } catch (e) {
    // Redis caído. Se dice con claridad y con 503: el canvas conserva el último
    // beat conocido y sigue andando con el teclado (ver el endpoint /estado).
    const detalle = e instanceof PresentStoreError ? e.message : 'error inesperado'
    return { ok: false, error: `no se pudo hablar con Redis: ${detalle}`, status: 503 }
  }
}

// ── Lectura ─────────────────────────────────────────────────────────────────

export type LecturaEstado =
  | { ok: true; estado: EstadoSustentacion }
  | { ok: false; error: string; status: number }

/**
 * El estado actual, para el canvas y los seguidores. Se consulta constantemente
 * (polling de 200-300 ms), así que hace como mucho DOS lecturas de Redis: el
 * puntero de la sesión en curso y la sesión. Con `sessionId` explícito, una.
 */
export async function leerEstado(sessionId?: string | null): Promise<LecturaEstado> {
  try {
    const sesion = sessionId ? await getSesion(sessionId) : await sesionActual()
    if (!sesion) {
      return { ok: false, error: 'no hay sesión de sustentación en curso', status: 404 }
    }
    return { ok: true, estado: aEstado(sesion) }
  } catch (e) {
    const detalle = e instanceof PresentStoreError ? e.message : 'error inesperado'
    return { ok: false, error: `no se pudo hablar con Redis: ${detalle}`, status: 503 }
  }
}
