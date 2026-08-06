// Almacén efímero de las sesiones de presentación (Redis, vía REST de Upstash).
//
// Por qué Redis y no Turso, teniendo Turso delante: el estado vivo de una
// sesión es lo contrario de lo que una base relacional hace bien — se escribe
// una vez por cambio de slide, se lee desde cada dispositivo del salón, no
// tiene historia que conservar y debe desaparecer solo. Un TTL es exactamente
// eso; emularlo en SQL sería una tabla más un cron de barrido para guardar algo
// que no queremos guardar.
//
// Por qué DOS bases y no una:
//
//   · `state` — privada, solo servidor. Guarda el PIN, el slide actual y el
//     secreto del presentador.
//   · `bus`   — solo pub/sub. Su token de SOLO LECTURA viaja al navegador del
//     público para que cada espectador se suscriba DIRECTAMENTE a Upstash.
//
// Esa separación es el punto entero del diseño. Si el bus y el estado
// compartieran base, el token que exponemos al público leería también el
// secreto del presentador. Separados, lo peor que puede hacer alguien con el
// token público es leer por qué slide vamos — que es literalmente lo que está
// viendo proyectado.
//
// Y es lo que evita mantener una conexión SSE abierta por espectador en una
// función de Vercel durante toda la charla: Vercel solo interviene al crear la
// sesión, al dar el snapshot de entrada y en cada comando del control.

import { serverEnv } from '../env'

export interface PresentStore {
  readonly kind: 'upstash' | 'memory'
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  del(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  /** Índice de sesiones vivas. Set y no lista: alta/baja idempotentes. */
  sadd(key: string, member: string, ttlSeconds: number): Promise<void>
  srem(key: string, member: string): Promise<void>
  smembers(key: string): Promise<string[]>
  publish(channel: string, message: string): Promise<void>
  /** Solo el backend en memoria. En Upstash, el navegador se suscribe solo. */
  subscribe?(channel: string, handler: (message: string) => void): () => void
}

export class PresentStoreError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'PresentStoreError'
  }
}

// ── Upstash (REST) ──────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 4_000

async function upstashCommand(
  baseUrl: string,
  token: string,
  command: (string | number)[]
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command.map(String)),
      signal: controller.signal,
    })
    if (!res.ok) {
      // El texto del error de Upstash puede repetir la URL; nunca el token.
      throw new PresentStoreError(`Redis respondió ${res.status}`)
    }
    const body = (await res.json()) as { result?: unknown; error?: string }
    if (body.error) throw new PresentStoreError(`Redis: ${body.error}`)
    return body.result ?? null
  } catch (err) {
    if (err instanceof PresentStoreError) throw err
    throw new PresentStoreError('no se pudo hablar con Redis', err)
  } finally {
    clearTimeout(timer)
  }
}

function upstashStore(stateUrl: string, stateToken: string, bus: { url: string; token: string }): PresentStore {
  return {
    kind: 'upstash',
    async get(key) {
      const r = await upstashCommand(stateUrl, stateToken, ['GET', key])
      return typeof r === 'string' ? r : null
    },
    async set(key, value, ttlSeconds) {
      await upstashCommand(stateUrl, stateToken, ['SET', key, value, 'EX', Math.max(1, Math.floor(ttlSeconds))])
    },
    async del(key) {
      await upstashCommand(stateUrl, stateToken, ['DEL', key])
    },
    async exists(key) {
      const r = await upstashCommand(stateUrl, stateToken, ['EXISTS', key])
      return Number(r) === 1
    },
    async sadd(key, member, ttlSeconds) {
      await upstashCommand(stateUrl, stateToken, ['SADD', key, member])
      // El índice caduca con la sesión más larga que contenga: se refresca en
      // cada alta para que no expire debajo de una presentación en curso.
      await upstashCommand(stateUrl, stateToken, ['EXPIRE', key, Math.max(1, Math.floor(ttlSeconds))])
    },
    async srem(key, member) {
      await upstashCommand(stateUrl, stateToken, ['SREM', key, member])
    },
    async smembers(key) {
      const r = await upstashCommand(stateUrl, stateToken, ['SMEMBERS', key])
      return Array.isArray(r) ? r.map(String) : []
    },
    async publish(channel, message) {
      await upstashCommand(bus.url, bus.token, ['PUBLISH', channel, message])
    },
  }
}

// ── Memoria (dev sin Upstash, y tests) ──────────────────────────────────────

type MemEntry = { value: string; expiresAt: number }

/**
 * Backend en proceso. Sirve para `npm run dev` sin credenciales y para los
 * tests, que necesitan un bus real donde dos clientes se vean.
 *
 * No sirve para producción y no pretende disimularlo: en Vercel cada instancia
 * tendría su propia copia y dos espectadores en instancias distintas verían
 * slides distintos. `assertUsableInProduction` lo corta antes de que eso pase.
 */
export function createMemoryStore(): PresentStore {
  const data = new Map<string, MemEntry>()
  const sets = new Map<string, Set<string>>()
  const channels = new Map<string, Set<(m: string) => void>>()

  const alive = (key: string): MemEntry | null => {
    const e = data.get(key)
    if (!e) return null
    if (e.expiresAt <= Date.now()) {
      data.delete(key)
      return null
    }
    return e
  }

  return {
    kind: 'memory',
    async get(key) {
      return alive(key)?.value ?? null
    },
    async set(key, value, ttlSeconds) {
      data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
    },
    async del(key) {
      data.delete(key)
    },
    async exists(key) {
      return alive(key) !== null
    },
    async sadd(key, member) {
      let set = sets.get(key)
      if (!set) {
        set = new Set()
        sets.set(key, set)
      }
      set.add(member)
    },
    async srem(key, member) {
      sets.get(key)?.delete(member)
    },
    async smembers(key) {
      return [...(sets.get(key) ?? [])]
    },
    async publish(channel, message) {
      for (const handler of channels.get(channel) ?? []) {
        try {
          handler(message)
        } catch {
          // Un suscriptor que revienta no debe impedir que los demás reciban.
        }
      }
    },
    subscribe(channel, handler) {
      let set = channels.get(channel)
      if (!set) {
        set = new Set()
        channels.set(channel, set)
      }
      set.add(handler)
      return () => set!.delete(handler)
    },
  }
}

// ── Resolución del backend ──────────────────────────────────────────────────

export type BusCredentials = {
  /** URL REST de la base de bus (la pública). */
  url: string
  /** Token de SOLO LECTURA. Es el único secreto de esta feature que sale al navegador. */
  readonlyToken: string
}

let cached: PresentStore | null = null

/** Credenciales del bus para el navegador, o null si no está configurado. */
export function busCredentials(): BusCredentials | null {
  const url = serverEnv('PRESENT_BUS_REST_URL')
  const readonlyToken = serverEnv('PRESENT_BUS_READONLY_TOKEN')
  if (!url || !readonlyToken) return null
  return { url: url.replace(/\/+$/, ''), readonlyToken }
}

/**
 * Origen del bus, para abrirlo en `connect-src`. La CSP del sitio es
 * `connect-src 'self'`, así que sin esto el navegador bloquearía el
 * EventSource contra Upstash y las tres vistas caerían al modo polling sin que
 * nada lo delatara salvo un error en la consola.
 */
export function presentBusOrigin(): string | null {
  const url = serverEnv('PRESENT_BUS_REST_URL')
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export function presentStore(): PresentStore {
  if (cached) return cached

  const stateUrl = serverEnv('UPSTASH_REDIS_REST_URL')
  const stateToken = serverEnv('UPSTASH_REDIS_REST_TOKEN')
  const busUrl = serverEnv('PRESENT_BUS_REST_URL')
  const busToken = serverEnv('PRESENT_BUS_REST_TOKEN')

  if (stateUrl && stateToken && busUrl && busToken) {
    cached = upstashStore(stateUrl.replace(/\/+$/, ''), stateToken, {
      url: busUrl.replace(/\/+$/, ''),
      token: busToken,
    })
  } else {
    cached = createMemoryStore()
  }
  return cached
}

/** Solo para tests: fuerza un backend concreto. */
export function __setPresentStore(store: PresentStore | null): void {
  cached = store
}

/**
 * ¿Está el almacén en condiciones de sostener una presentación de verdad?
 *
 * El fallback en memoria es cómodo en local y catastrófico en producción, y el
 * fallo sería el peor posible: todo parece funcionar en la pantalla del
 * presentador mientras el público ve el slide equivocado, porque cada instancia
 * de Vercel tiene su propia copia del estado. Se corta al CREAR la sesión —
 * antes de proyectar nada — y no en mitad de la charla.
 */
export function storeReadiness(): { ok: boolean; reason?: string } {
  const store = presentStore()
  if (store.kind === 'upstash') return { ok: true }

  const onVercel = Boolean(serverEnv('VERCEL'))
  if (onVercel) {
    return {
      ok: false,
      reason:
        'Redis no está configurado: faltan UPSTASH_REDIS_REST_URL/TOKEN y PRESENT_BUS_REST_URL/TOKEN. ' +
        'Sin ellas el estado vive en la memoria de cada instancia y el público vería slides distintos.',
    }
  }
  return { ok: true }
}
