// Canal de la presentación de sustentación. Vive aparte de `lib/present` a
// propósito, y conviene entender por qué antes de "unificarlos".
//
// El bus de `lib/present` NO está acoplado a reveal.js: transporta un snapshot
// de escalares y podría haber servido. Lo que sí está acoplado es la SESIÓN.
// `createSession` exige un deck real (`deck.id`, `deck.slideCount`, y lanza si
// no tiene slides), y `PresentSession` guarda `deckId`/`deckTitle`. La
// sustentación no es un deck: es una página de este mismo repo, sin fila en
// Turso. Meterla ahí con un deck sintético (`id: 0`) pondría una mentira en el
// modelo de datos y la haría aparecer como una presentación fantasma en
// `listLiveSessions()` y en /admin/presentaciones.
//
// Así que se reutiliza la INFRAESTRUCTURA (el almacén, el generador de PIN, el
// TTL) y se duplica solo la capa de sesión, que son unas veinte líneas. Cero
// modificaciones a `lib/present`, que ya funciona en producción.
//
// El espacio de PIN sí es COMPARTIDO: `pinLibre` comprueba las dos familias de
// claves. Sin eso, una sustentación y una presentación de deck podrían emitir
// el mismo PIN y el público de una acabaría en la otra.

import { serverEnv } from '../env'
import { presentStore, PresentStoreError } from '../present/store'
import { generatePin, normalizePin } from '../present/pin'
import { isReservedSegment } from '../present/reserved'
import { SESSION_TTL_SECONDS } from '../present/session'
import { normalizarPinPresentador, pinDesdeBytes, sonDistintos } from './pin-presentador'

/** Mismo TTL que una presentación normal: seis horas. */
export const SUSTENTACION_TTL_SECONDS = SESSION_TTL_SECONDS

const KEY_SESSION = (id: string) => `sust:s:${id}`
const KEY_PIN = (pin: string) => `sust:pin:${pin}`
/** Claves de `lib/present`, solo para no repetir un PIN suyo. */
const KEY_PIN_PRESENT = (pin: string) => `present:pin:${pin}`
/**
 * Puntero a la sesión en curso. Aquí no hace falta el índice de sesiones vivas
 * que lleva `lib/present`: solo se sustenta una vez, y lo que de verdad hay que
 * poder hacer es RECUPERAR la sesión si el canvas se recarga a mitad de charla.
 * Sin esto, un F5 emitiría un PIN nuevo y dejaría al público mirando el viejo,
 * que es el peor momento posible para descubrirlo.
 */
const KEY_ACTUAL = 'sust:actual'

export const channelFor = (sessionId: string) => `sust:ch:${sessionId}`

export type SustentacionSession = {
  id: string
  pin: string
  /** Índice del beat actual. La presentación decide qué significa. */
  beat: number
  /** Título corto del beat, para la vista de seguidor. */
  titulo: string
  /** Dato destacado opcional. Un string, nunca estructura. */
  dato: string | null
  version: number
  createdAt: number
  /** Cuándo cambió algo por última vez (beat, título o dato). */
  updatedAt: number
  /**
   * Cuándo empezó el beat ACTUAL. No es lo mismo que `updatedAt`: reenviar el
   * dato destacado del beat 7 sin salir de él actualiza uno y no el otro. Es lo
   * que hace que el cronómetro del control remoto mida el beat y no el último
   * toque, que es la única lectura útil mientras hablo.
   */
  beatIniciadoEn: number
}

/**
 * Lo que viaja por el bus y lo que ve cualquiera con el PIN. Deliberadamente
 * plano: índice, título y un dato. Nada de estructura de slides - si mañana la
 * presentación cambia de motor, este contrato no se entera.
 */
export type BeatSnapshot = {
  sessionId: string
  pin: string
  beat: number
  titulo: string
  dato: string | null
  version: number
}

export function toBeatSnapshot(s: SustentacionSession): BeatSnapshot {
  return {
    sessionId: s.id,
    pin: s.pin,
    beat: s.beat,
    titulo: s.titulo,
    dato: s.dato,
    version: s.version,
  }
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── Secreto del presentador ─────────────────────────────────────────────────
//
// Mismo patrón que `lib/present/session.ts`: se DERIVA del id con HMAC en vez
// de guardarse, así lo único que hay en Redis es el snapshot que el público ya
// recibe por el PIN. El prefijo del mensaje firmado es distinto (`sust:v1:`)
// para que un secreto de sustentación nunca valga como secreto de presentador
// de un deck, ni al revés.

let processKey: string | null = null

function secretKey(): string {
  const configured = serverEnv('PRESENT_SECRET') || serverEnv('AUTH_SECRET')
  if (configured) return configured
  if (!processKey) processKey = randomHex(32)
  return processKey
}

async function hmac(mensaje: string): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(mensaje)))
}

export async function secretoDeSesion(sessionId: string): Promise<string> {
  const sig = await hmac(`sust:v1:${sessionId}`)
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * PIN de PRESENTADOR de una sesión: la credencial que autoriza los comandos
 * del control remoto.
 *
 * Se DERIVA, igual que el secreto, y esa es la decisión que más importa de
 * este archivo. Si se guardara en el JSON de la sesión, estaría en la misma
 * base de Redis que lee el token de SOLO LECTURA que viaja al navegador de
 * cada asistente para suscribirse al bus (ver la cabecera de
 * `present/store.ts`): cualquiera del público podría leer la clave de la
 * sesión y quedarse con el mando. Derivado, en Redis no hay más que el
 * snapshot que el público ya ve proyectado.
 *
 * El prefijo firmado (`sust:pinctl:v1:`) separa dominios: el PIN de
 * presentador de una sesión no puede valer como secreto de esa misma sesión ni
 * al revés, aunque los dos salgan de la misma clave.
 */
export async function pinPresentadorDe(sessionId: string): Promise<string> {
  return pinDesdeBytes(await hmac(`sust:pinctl:v1:${sessionId}`))
}

/**
 * ¿Es este el PIN de presentador de esta sesión? En tiempo constante: el PIN
 * es la única credencial del control remoto, así que comparar con `===` sería
 * regalar, carácter a carácter, por dónde va bien el intento.
 */
export async function esPinPresentador(sessionId: string, bruto: string): Promise<boolean> {
  const candidato = normalizarPinPresentador(bruto)
  if (!candidato) return false
  return timingSafeEqualStr(await pinPresentadorDe(sessionId), candidato)
}

/** Comparación de tiempo constante, copiada de present/session.ts. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── Lectura ─────────────────────────────────────────────────────────────────

export async function getSesion(sessionId: string): Promise<SustentacionSession | null> {
  if (!sessionId) return null
  const raw = await presentStore().get(KEY_SESSION(sessionId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as SustentacionSession
  } catch {
    return null
  }
}

export async function getSesionPorPin(rawPin: string): Promise<SustentacionSession | null> {
  const pin = normalizePin(rawPin)
  if (!pin) return null
  const sessionId = await presentStore().get(KEY_PIN(pin))
  if (!sessionId) return null
  const sesion = await getSesion(sessionId)
  if (!sesion) {
    // Puntero huérfano: la sesión venció antes que él. Se limpia al pasar.
    await presentStore().del(KEY_PIN(pin)).catch(() => {})
    return null
  }
  return sesion
}

// ── Escritura ───────────────────────────────────────────────────────────────

async function persist(s: SustentacionSession): Promise<void> {
  await presentStore().set(KEY_SESSION(s.id), JSON.stringify(s), SUSTENTACION_TTL_SECONDS)
}

export async function crearSesion(titulo = 'Sustentación'): Promise<SustentacionSession> {
  const store = presentStore()

  const pin = await generatePin({
    isReserved: isReservedSegment,
    // Las DOS familias: un PIN vivo en `lib/present` no se puede reemitir aquí.
    isTaken: async (candidate) =>
      (await store.exists(KEY_PIN(candidate))) || (await store.exists(KEY_PIN_PRESENT(candidate))),
  })

  const ahora = Date.now()
  const sesion: SustentacionSession = {
    id: randomHex(16),
    pin,
    beat: 0,
    titulo,
    dato: null,
    version: 1,
    createdAt: ahora,
    updatedAt: ahora,
    beatIniciadoEn: ahora,
  }

  // La invariante de las dos credenciales, comprobada en el único sitio donde
  // se emiten. Si algún día alguien iguala las longitudes de los dos PINs,
  // esto revienta al crear la sesión (antes de proyectar nada) y no delante
  // del jurado con el público controlando la presentación.
  const pinControl = await pinPresentadorDe(sesion.id)
  if (!sonDistintos(pin, pinControl)) {
    throw new PresentStoreError(
      'el PIN de asistente y el de presentador coincidieron: revisa PIN_PRESENTADOR_LONGITUD'
    )
  }

  // La sesión primero, igual que en present: si el puntero del PIN se
  // escribiera antes y fallara la sesión, ese PIN quedaría muerto seis horas.
  await persist(sesion)
  await store.set(KEY_PIN(pin), sesion.id, SUSTENTACION_TTL_SECONDS)
  await store.set(KEY_ACTUAL, sesion.id, SUSTENTACION_TTL_SECONDS)

  return sesion
}

/**
 * La sesión en curso, si la hay. Es lo que permite que recargar el canvas
 * retome la misma sesión y el mismo PIN en vez de emitir otro.
 */
export async function sesionActual(): Promise<SustentacionSession | null> {
  const id = await presentStore().get(KEY_ACTUAL)
  if (!id) return null
  return getSesion(id)
}

export type BeatEntrada = {
  beat: number
  titulo: string
  dato?: string | null
}

export type BeatResultado =
  | { ok: true; snapshot: BeatSnapshot }
  | { ok: false; error: string; status: number }

/** Recorta y normaliza lo que llega del navegador. */
function limpiar(valor: unknown, max: number): string {
  if (typeof valor !== 'string') return ''
  return valor.replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Publica un beat. Persiste primero y publica después, igual que `runCommand`:
 * si el publish falla, el estado ya es correcto y el siguiente snapshot que
 * pida cualquier seguidor lo corrige. Al revés, el bus anunciaría un beat que
 * no está en ninguna parte.
 */
export async function publicarBeat(
  sessionId: string,
  secreto: string,
  entrada: BeatEntrada
): Promise<BeatResultado> {
  const sesion = await getSesion(sessionId)
  if (!sesion) return { ok: false, error: 'sesión no encontrada o expirada', status: 404 }

  if (!timingSafeEqualStr(await secretoDeSesion(sesion.id), secreto)) {
    return { ok: false, error: 'no autorizado', status: 403 }
  }

  if (!Number.isInteger(entrada.beat) || entrada.beat < 0) {
    return { ok: false, error: 'beat inválido', status: 400 }
  }

  const actualizada: SustentacionSession = {
    ...sesion,
    beat: entrada.beat,
    titulo: limpiar(entrada.titulo, 120) || sesion.titulo,
    dato: limpiar(entrada.dato, 200) || null,
    version: sesion.version + 1,
    updatedAt: Date.now(),
  }

  await persist(actualizada)

  try {
    await presentStore().publish(channelFor(actualizada.id), JSON.stringify(toBeatSnapshot(actualizada)))
  } catch {
    // El bus es acelerador, no fuente de verdad: los seguidores reconsultan el
    // snapshot y se curan solos de un mensaje perdido.
  }

  return { ok: true, snapshot: toBeatSnapshot(actualizada) }
}

export { PresentStoreError }
