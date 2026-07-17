import { AsyncLocalStorage } from 'node:async_hooks'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

const realDb = drizzle(
  createClient({
    url: import.meta.env.TURSO_DATABASE_URL,
    authToken: import.meta.env.TURSO_AUTH_TOKEN,
  }),
  { schema }
)

// Base de la demo pública del panel: MISMO esquema, datos ficticios, instancia
// aparte. El aislamiento es por construcción — un request en modo demo no tiene
// forma de alcanzar la base real, ni por un `where` olvidado ni por una ruta
// nueva que nadie recordó filtrar. Si no está configurada, la demo no existe
// (mismo patrón no-op que notify.ts): degradar es preferible a improvisar.
const demoUrl = import.meta.env.TURSO_DEMO_URL
const demoDb = demoUrl
  ? drizzle(
      createClient({ url: demoUrl, authToken: import.meta.env.TURSO_DEMO_AUTH_TOKEN }),
      { schema }
    )
  : null

export const demoAvailable = demoDb !== null

const demoContext = new AsyncLocalStorage<true>()

/**
 * Corre `fn` con todas las lecturas apuntando a la base de demo. El contexto se
 * propaga por async/await, así que basta envolver el request en el middleware:
 * los 88 módulos que importan `db` no se enteran.
 */
export function runInDemoContext<T>(fn: () => T): T {
  if (!demoDb) return fn()
  return demoContext.run(true, fn)
}

/** ¿Este request corre en modo demo? */
export const inDemoContext = (): boolean => demoContext.getStore() === true

const activeDb = () => (demoContext.getStore() && demoDb ? demoDb : realDb)

/**
 * `db` resuelve su destino en cada acceso, no al importar. Los métodos se
 * devuelven ligados a su instancia real: si se llamaran con `this` apuntando al
 * proxy, drizzle perdería su estado interno.
 */
export const db: typeof realDb = new Proxy({} as typeof realDb, {
  get(_target, prop) {
    const target = activeDb()
    const value = Reflect.get(target, prop, target)
    return typeof value === 'function' ? value.bind(target) : value
  },
  has: (_target, prop) => Reflect.has(activeDb(), prop),
})
