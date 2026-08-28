// Almacén efímero de las sesiones de presentación (Redis, vía REST de Upstash).
//
// Por qué Redis y no Turso, teniendo Turso delante: el estado vivo de una
// sesión es lo contrario de lo que una base relacional hace bien - se escribe
// una vez por cambio de slide, se lee desde cada dispositivo del salón, no
// tiene historia que conservar y debe desaparecer solo. Un TTL es exactamente
// eso; emularlo en SQL sería una tabla más un cron de barrido para guardar algo
// que no queremos guardar.
//
// Dos roles, UNA base por defecto:
//
//   · `state` - el PIN, el slide actual, los contadores.
//   · `bus`   - solo pub/sub. Su token de SOLO LECTURA viaja al navegador del
//     público para que cada espectador se suscriba DIRECTAMENTE a Upstash.
//
// El diseño original pedía dos bases de Redis separadas, porque el JSON de la
// sesión guardaba el secreto del presentador y el token público lo habría
// leído. Ese secreto ya no se guarda: se deriva del id de sesión con HMAC (ver
// `session.ts`), así que lo único que hay en Redis es el snapshot que el
// público ya recibe por el PIN. Con eso, lo peor que puede hacer alguien con
// el token público es leer por qué slide vamos - que es literalmente lo que
// está viendo proyectado - y una sola base alcanza.
//
// Las variables `PRESENT_BUS_*` siguen existiendo y ganan cuando están
// puestas: separar el bus deja de ser un requisito de seguridad, pero sigue
// siendo útil si algún día el pub/sub de una charla concurrida conviene que no
// comparta cuota con el estado.
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
  /**
   * `SET key value NX EX ttl`: escribe solo si la clave no existía y responde
   * si ganó. Es la única primitiva ATÓMICA del almacén, y existe por el
   * control remoto de la sustentación: un botón pulsado dos veces por mala
   * señal manda dos veces el mismo comando, y con `get`+`set` las dos copias
   * pueden leer "no visto" antes de que ninguna escriba. Aquí solo una gana.
   */
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>
  /**
   * `INCR` + `EXPIRE` en la primera vez: contador con ventana. Sostiene el
   * rate limit de los endpoints de sustentación, que no pueden usar el limiter
   * durable porque ese vive en Turso y esto tiene que funcionar aunque Turso
   * esté con la cuota agotada.
   */
  incr(key: string, ttlSeconds: number): Promise<number>
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
      // El MOTIVO importa y antes se tiraba. Un `403` a secas puede ser un
      // token revocado, una base borrada o un token de SOLO LECTURA intentando
      // escribir, y las tres se arreglan de forma distinta; averiguarlo sin el
      // texto de Upstash exige adivinar delante de un panel que no dice nada.
      //
      // Se sanea antes de propagarlo porque este mensaje llega hasta endpoints
      // PÚBLICOS (`/api/sustentacion/comando` lo devuelve en su 503): se quitan
      // las URLs, que es lo único que Upstash repite del entorno. El token no
      // viaja nunca en el cuerpo del error, solo en la cabecera que enviamos.
      const detalle = await res
        .text()
        .then((t) => {
          const cuerpo = t.trim().slice(0, 200)
          try {
            const j = JSON.parse(cuerpo) as { error?: string }
            return typeof j.error === 'string' ? j.error : cuerpo
          } catch {
            return cuerpo
          }
        })
        .catch(() => '')
      const limpio = detalle.replace(/https?:\/\/\S+/g, '<url>').trim()
      throw new PresentStoreError(
        limpio ? `Redis respondió ${res.status}: ${limpio}` : `Redis respondió ${res.status}`
      )
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
    async setNx(key, value, ttlSeconds) {
      // Upstash devuelve "OK" si escribió y null si la clave ya existía.
      const r = await upstashCommand(stateUrl, stateToken, [
        'SET',
        key,
        value,
        'EX',
        Math.max(1, Math.floor(ttlSeconds)),
        'NX',
      ])
      return r === 'OK'
    },
    async incr(key, ttlSeconds) {
      const n = Number(await upstashCommand(stateUrl, stateToken, ['INCR', key]))
      // El EXPIRE solo en el primer golpe de la ventana: refrescarlo en cada
      // petición convertiría la ventana fija en una deslizante infinita, y
      // quien martillea el endpoint nunca dejaría que caducara su contador.
      if (n === 1) {
        await upstashCommand(stateUrl, stateToken, [
          'EXPIRE',
          key,
          Math.max(1, Math.floor(ttlSeconds)),
        ])
      }
      return n
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
    async setNx(key, value, ttlSeconds) {
      // JS es de un solo hilo: entre el `alive` y el `set` no corre nadie más,
      // así que esto es tan atómico como el `SET NX` de Redis.
      if (alive(key)) return false
      data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
      return true
    },
    async incr(key, ttlSeconds) {
      const actual = alive(key)
      const n = Number(actual?.value ?? 0) + 1
      data.set(key, {
        value: String(n),
        // La ventana la fija el primer golpe, igual que el EXPIRE de Upstash.
        expiresAt: actual?.expiresAt ?? Date.now() + ttlSeconds * 1000,
      })
      return n
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

/**
 * Resolución del bus. `PRESENT_BUS_*` manda si está puesta; si no, se usa la
 * misma base del estado con las variables que la integración de Upstash ya
 * inyecta sola (`KV_REST_API_READ_ONLY_TOKEN` es el token de solo lectura que
 * Upstash documenta precisamente para clientes web). Así el caso normal (una
 * base, la que crea el Marketplace) funciona sin configurar nada a mano.
 */
const busUrl = () =>
  serverEnv('PRESENT_BUS_REST_URL') ||
  serverEnv('KV_REST_API_URL') ||
  serverEnv('UPSTASH_REDIS_REST_URL')
// El bus PUBLICA, así que también necesita escritura: mismo orden y por la
// misma razón que `credencialesEstado`.
const busWriteToken = () =>
  serverEnv('PRESENT_BUS_REST_TOKEN') ||
  serverEnv('KV_REST_API_TOKEN') ||
  serverEnv('UPSTASH_REDIS_REST_TOKEN')
const busReadonlyToken = () =>
  serverEnv('PRESENT_BUS_READONLY_TOKEN') || serverEnv('KV_REST_API_READ_ONLY_TOKEN')

/** Credenciales del bus para el navegador, o null si no está configurado. */
export function busCredentials(): BusCredentials | null {
  const url = busUrl()
  const readonlyToken = busReadonlyToken()
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
  const url = busUrl()
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * Credenciales de ESCRITURA de la base de estado, y en qué orden se buscan.
 *
 * Puro y exportado para poder probarlo: la resolución es lo que falló una vez
 * en producción y el síntoma era indistinguible de una base caída.
 *
 * EL ORDEN IMPORTA, y esta es la razón. La integración de Upstash en el
 * Marketplace de Vercel inyecta las credenciales de la MISMA base con dos
 * nombres, y no son equivalentes:
 *
 *   · `KV_REST_API_TOKEN`            lectura y ESCRITURA.
 *   · `KV_REST_API_READ_ONLY_TOKEN`  solo lectura, para el navegador.
 *   · `UPSTASH_REDIS_REST_TOKEN`     depende de cómo se creara.
 *
 * En producción, `UPSTASH_REDIS_REST_TOKEN` resultó ser de SOLO LECTURA. El
 * fallo era de los caros de encontrar: las lecturas iban bien, así que el panel
 * y los seguidores parecían sanos, y solo al abrir la sesión saltaba un
 * `NOPERM ... 'incr'` que se leía como "Redis caído".
 *
 * Por eso manda el par `KV_REST_API_*`: es el único que la integración
 * DOCUMENTA como de escritura. El par `UPSTASH_*` queda de respaldo, para
 * despliegues configurados a mano donde sea el único que existe.
 *
 * La URL y el token viajan SIEMPRE en pareja. Mezclarlos apuntaría el token de
 * una base a la URL de otra, que es el mismo `NOPERM` con otra causa y aún más
 * difícil de ver.
 */
export function credencialesEstado(): { url: string; token: string } | null {
  const kvUrl = serverEnv('KV_REST_API_URL')
  const kvToken = serverEnv('KV_REST_API_TOKEN')
  if (kvUrl && kvToken) return { url: kvUrl, token: kvToken }

  const upUrl = serverEnv('UPSTASH_REDIS_REST_URL')
  const upToken = serverEnv('UPSTASH_REDIS_REST_TOKEN')
  if (upUrl && upToken) return { url: upUrl, token: upToken }

  return null
}

export function presentStore(): PresentStore {
  if (cached) return cached

  const estado = credencialesEstado()
  const stateUrl = estado?.url
  const stateToken = estado?.token
  const bus = busUrl()
  const busToken = busWriteToken()

  if (stateUrl && stateToken && bus && busToken) {
    cached = upstashStore(stateUrl.replace(/\/+$/, ''), stateToken, {
      url: bus.replace(/\/+$/, ''),
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
 * de Vercel tiene su propia copia del estado. Se corta al CREAR la sesión -
 * antes de proyectar nada - y no en mitad de la charla.
 */
export function storeReadiness(): { ok: boolean; reason?: string } {
  const store = presentStore()
  if (store.kind === 'upstash') return { ok: true }

  const onVercel = Boolean(serverEnv('VERCEL'))
  if (onVercel) {
    return {
      ok: false,
      reason:
        'Redis no está configurado: faltan KV_REST_API_URL y KV_REST_API_TOKEN (o el par UPSTASH_REDIS_REST_*). ' +
        'Sin ellas el estado vive en la memoria de cada instancia y el público vería slides distintos.',
    }
  }
  return { ok: true }
}
