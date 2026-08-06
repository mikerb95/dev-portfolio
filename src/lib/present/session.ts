// Ciclo de vida de una sesión de presentación. Todo lo de aquí es efímero:
// vive en Redis con TTL y desaparece solo. Nada toca Turso.

import { serverEnv } from '../env'
import { generatePin, normalizePin } from './pin'
import { isReservedSegment } from './reserved'
import { applyCommand, type Command, type SessionState } from './state'
import { presentStore, PresentStoreError } from './store'

/**
 * Seis horas. Cubre de sobra una jornada de sustentación con sus retrasos, y
 * es corto de verdad: un PIN abandonado libera su hueco el mismo día, no la
 * semana que viene.
 */
export const SESSION_TTL_SECONDS = 6 * 60 * 60

const KEY_SESSION = (id: string) => `present:s:${id}`
const KEY_PIN = (pin: string) => `present:pin:${pin}`
const KEY_INDEX = 'present:live'

export const channelFor = (sessionId: string) => `present:ch:${sessionId}`

export type PresentSession = {
  id: string
  deckId: number
  deckTitle: string
  pin: string
  state: SessionState
  currentSlide: number
  totalSlides: number
  version: number
  createdAt: number
  startedAt: number | null
  endedAt: number | null
}

/** Lo que ve cualquiera: sin el secreto del presentador. */
export type PublicSnapshot = {
  sessionId: string
  pin: string
  deckTitle: string
  state: SessionState
  currentSlide: number
  totalSlides: number
  version: number
}

export function toPublicSnapshot(s: PresentSession): PublicSnapshot {
  return {
    sessionId: s.id,
    pin: s.pin,
    deckTitle: s.deckTitle,
    state: s.state,
    currentSlide: s.currentSlide,
    totalSlides: s.totalSlides,
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
// No se guarda: se DERIVA del id de sesión con HMAC. La diferencia importa
// porque decide cuántas bases de Redis hace falta pagar. Guardado, el JSON de
// la sesión contenía un secreto, y entonces el token de solo lectura que el
// bus le entrega a cada espectador no podía apuntar a la misma base — de ahí
// las dos bases del diseño original. Derivado, lo que queda en Redis es
// exactamente el `PublicSnapshot` que el público ya recibe por el PIN, más el
// deckId y unas marcas de tiempo. Una sola base, y el token público deja de
// ser un problema aunque lea todas las claves.
//
// El presentador nunca teclea este valor: lo incrusta `/remote/:id`, que ya
// está detrás del gate de admin. Derivarlo significa que esa página lo puede
// recalcular sin tenerlo almacenado en ningún sitio.

let processKey: string | null = null

/**
 * Clave del HMAC. `AUTH_SECRET` es el respaldo porque ya existe en producción
 * y es estable entre instancias, que es la única propiedad que importa aquí:
 * una clave distinta por instancia haría que el comando emitido contra una
 * lambda fuera rechazado por la siguiente. El aleatorio por proceso es para
 * `npm run dev` y los tests, donde solo hay un proceso.
 */
function secretKey(): string {
  const configured = serverEnv('PRESENT_SECRET') || serverEnv('AUTH_SECRET')
  if (configured) return configured
  if (!processKey) processKey = randomHex(32)
  return processKey
}

const HMAC_ALGO = { name: 'HMAC', hash: 'SHA-256' } as const

/**
 * Secreto que autoriza los comandos del control remoto de UNA sesión. El
 * prefijo separa dominios: la misma clave firmando otra cosa en el futuro no
 * puede producir un valor que valga como secreto de presentador.
 */
export async function presenterSecretFor(sessionId: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secretKey()), HMAC_ALGO, false, [
    'sign',
  ])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`present:v1:${sessionId}`))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── Lectura ─────────────────────────────────────────────────────────────────

export async function getSession(sessionId: string): Promise<PresentSession | null> {
  if (!/^[a-f0-9]{32}$/.test(sessionId)) return null
  const raw = await presentStore().get(KEY_SESSION(sessionId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as PresentSession
  } catch {
    return null
  }
}

/**
 * Resuelve el PIN que alguien tecleó o escaneó. Devuelve null tanto si el PIN
 * no tiene forma válida como si no hay sesión: quien llama no debe poder
 * distinguir "PIN inexistente" de "PIN mal escrito" por el tiempo de respuesta
 * ni por el mensaje — es la misma pantalla de "la sesión terminó".
 */
export async function getSessionByPin(rawPin: string): Promise<PresentSession | null> {
  const pin = normalizePin(rawPin)
  if (!pin) return null
  const sessionId = await presentStore().get(KEY_PIN(pin))
  if (!sessionId) return null
  const session = await getSession(sessionId)
  // El puntero del PIN sobrevive un instante a la sesión si algo falló al
  // cerrar: si apunta a la nada, se limpia en el camino.
  if (!session) {
    await presentStore().del(KEY_PIN(pin)).catch(() => {})
    return null
  }
  return session
}

/** Sesiones vivas, para el aviso de "hay una presentación en curso" del panel. */
export async function listLiveSessions(): Promise<PresentSession[]> {
  const store = presentStore()
  const ids = await store.smembers(KEY_INDEX)
  const sessions = await Promise.all(ids.map((id) => getSession(id).catch(() => null)))
  const alive: PresentSession[] = []
  for (const [i, s] of sessions.entries()) {
    // Podado perezoso: el índice no tiene por qué saber que un TTL venció.
    if (!s || s.state === 'ended') {
      await store.srem(KEY_INDEX, ids[i]).catch(() => {})
      continue
    }
    alive.push(s)
  }
  return alive.sort((a, b) => b.createdAt - a.createdAt)
}

// ── Escritura ───────────────────────────────────────────────────────────────

async function persist(session: PresentSession): Promise<void> {
  await presentStore().set(KEY_SESSION(session.id), JSON.stringify(session), SESSION_TTL_SECONDS)
}

export async function createSession(deck: {
  id: number
  title: string
  slideCount: number
}): Promise<PresentSession> {
  if (deck.slideCount < 1) {
    throw new PresentStoreError('el deck no tiene slides: vuelve a subir el archivo')
  }
  const store = presentStore()

  const pin = await generatePin({
    isReserved: isReservedSegment,
    isTaken: (candidate) => store.exists(KEY_PIN(candidate)),
  })

  const session: PresentSession = {
    id: randomHex(16),
    deckId: deck.id,
    deckTitle: deck.title,
    pin,
    state: 'lobby',
    currentSlide: 0,
    totalSlides: deck.slideCount,
    version: 1,
    createdAt: Date.now(),
    startedAt: null,
    endedAt: null,
  }

  // La sesión primero: si el puntero del PIN se escribiera antes y fallara la
  // sesión, ese PIN quedaría reservado durante seis horas apuntando a nada.
  await persist(session)
  await store.set(KEY_PIN(pin), session.id, SESSION_TTL_SECONDS)
  await store.sadd(KEY_INDEX, session.id, SESSION_TTL_SECONDS)

  return session
}

export type CommandOutcome =
  | { ok: true; session: PresentSession; changed: boolean }
  | { ok: false; error: string; status: number }

/**
 * Aplica un comando del control remoto. Es el único camino por el que cambia
 * una sesión, y valida el secreto siempre — aunque el endpoint que llama ya
 * esté detrás de la sesión de admin. Defensa en profundidad: la sesión de admin
 * dice "eres tú", el secreto dice "eres tú y estás en ESTA presentación".
 */
export async function runCommand(
  sessionId: string,
  presenterSecret: string,
  cmd: Command
): Promise<CommandOutcome> {
  const session = await getSession(sessionId)
  if (!session) return { ok: false, error: 'sesión no encontrada o expirada', status: 404 }

  if (!timingSafeEqualStr(await presenterSecretFor(session.id), presenterSecret)) {
    return { ok: false, error: 'no autorizado', status: 403 }
  }

  const result = applyCommand(session, cmd)
  if (!result.ok) return { ok: false, error: result.error, status: 409 }

  if (!result.changed) return { ok: true, session, changed: false }

  const now = Date.now()
  const updated: PresentSession = {
    ...session,
    state: result.state,
    currentSlide: result.currentSlide,
    version: session.version + 1,
    startedAt: session.startedAt ?? (result.state === 'live' ? now : null),
    endedAt: result.state === 'ended' ? now : session.endedAt,
  }

  await persist(updated)

  if (updated.state === 'ended') {
    // Liberar el PIN es parte de terminar, no una tarea de limpieza: el brief
    // pide que la sesión desaparezca y libere su PIN al acabar. La fila de la
    // sesión sobrevive un rato más con estado `ended` para que quien llegue
    // tarde por el enlace directo vea la pantalla de cierre y no un 404 mudo.
    const store = presentStore()
    await store.del(KEY_PIN(updated.pin)).catch(() => {})
    await store.srem(KEY_INDEX, updated.id).catch(() => {})
  }

  // El bus va después de persistir: si el publish falla, el estado ya es
  // correcto y el siguiente snapshot (cada cliente reconsulta) lo corrige. Al
  // revés, un cliente saltaría a un slide que el servidor no tiene.
  await publishSnapshot(updated)

  return { ok: true, session: updated, changed: true }
}

export async function publishSnapshot(session: PresentSession): Promise<void> {
  try {
    await presentStore().publish(channelFor(session.id), JSON.stringify(toPublicSnapshot(session)))
  } catch {
    // El bus es acelerador, no fuente de verdad: los clientes reconsultan el
    // snapshot periódicamente y se curan solos de un mensaje perdido.
  }
}

/**
 * Comparación en tiempo constante sobre strings. No usa `node:crypto` porque
 * este módulo lo importan endpoints que también corren en el runtime de Vercel
 * sin garantía de qué está disponible; la implementación es la misma idea:
 * recorrer siempre todo y acumular diferencias.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Cierra una sesión sin pasar por el secreto (botón "Finalizar" del panel). */
export async function forceEndSession(sessionId: string): Promise<PresentSession | null> {
  const session = await getSession(sessionId)
  if (!session) return null
  const secret = await presenterSecretFor(session.id)
  return (await runCommand(sessionId, secret, { type: 'end' })).ok
    ? await getSession(sessionId)
    : null
}
