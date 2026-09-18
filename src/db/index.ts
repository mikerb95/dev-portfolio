import { AsyncLocalStorage } from 'node:async_hooks'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { serverEnv } from '../lib/env'
import { isLocalDbUrl } from '../lib/db-target'
import * as schema from './schema'

/**
 * Destino de la base, con `process.env` GANANDO a `import.meta.env`, al revés
 * que `serverEnv`. La inversión es deliberada y solo aplica aquí: el dev server
 * de Vite ya volcó el .env en `import.meta.env`, así que con la precedencia
 * normal una variable puesta en la línea de comandos no tendría ningún efecto y
 * `npm run dev:carga` seguiría hablando con Turso. Poder redirigir la base sin
 * editar el .env es lo que hace posible que las pruebas de carga corran contra
 * la sqld local (ver lib/db-target.ts).
 */
const dbEnv = (name: string): string | undefined =>
  (typeof process !== 'undefined' ? process.env?.[name] : undefined) || serverEnv(name)

const realUrl = dbEnv('TURSO_DATABASE_URL') as string

type Db = ReturnType<typeof drizzle<typeof schema>>

/**
 * El cliente se crea en la primera consulta, no al importar el módulo.
 *
 * No es una optimización: `createClient` lanza si la URL es `undefined`, así
 * que crearlo arriba convertía "no hay credenciales" en "este módulo no se
 * puede ni importar". El middleware importa `db`, y Astro importa el
 * middleware para prerenderizar, de modo que el build entero moría en un
 * entorno sin `TURSO_DATABASE_URL` aunque ninguna página prerenderizada
 * consulte nada (el middleware sale por `context.isPrerendered` antes de
 * tocar la base). Con la creación diferida, un entorno sin credenciales
 * construye igual y solo falla quien de verdad consulta, que es donde el
 * fail-open de seguridad ya sabe atrapar el error.
 */
let realDbInstance: Db | null = null
const realDbClient = (): Db => {
  realDbInstance ??= drizzle(
    createClient({
      url: realUrl,
      authToken: dbEnv('TURSO_AUTH_TOKEN'),
    }),
    { schema }
  )
  return realDbInstance
}

/** ¿La base real de este proceso es una instancia local (sqld/archivo)? */
export const realDbIsLocal = isLocalDbUrl(realUrl)

// Base de la demo pública del panel: MISMO esquema, datos ficticios, instancia
// aparte. El aislamiento es por construcción - un request en modo demo no tiene
// forma de alcanzar la base real, ni por un `where` olvidado ni por una ruta
// nueva que nadie recordó filtrar. Si no está configurada, la demo no existe
// (mismo patrón no-op que notify.ts): degradar es preferible a improvisar.
const demoUrl = dbEnv('TURSO_DEMO_URL')

export const demoAvailable = demoUrl !== undefined && demoUrl !== ''

// Diferido por el mismo motivo que la base real; `demoAvailable` sigue siendo
// un dato de import porque solo mira si la variable existe, no abre nada.
let demoDbInstance: Db | null = null
const demoDbClient = (): Db | null => {
  if (!demoAvailable) return null
  demoDbInstance ??= drizzle(
    createClient({ url: demoUrl as string, authToken: dbEnv('TURSO_DEMO_AUTH_TOKEN') }),
    { schema }
  )
  return demoDbInstance
}

// El AsyncLocalStorage vive en `globalThis` y no en el módulo A PROPÓSITO.
// El dev server re-evalúa este archivo cada vez que se toca, y cada copia
// traería su propia instancia: el middleware abriría el contexto en una y la
// página lo leería en otra, con lo que `activeDb()` no vería store y la demo
// pasaría a leer la base REAL. Sin un error, sin un aviso, con los datos de
// clientes de verdad pintados en el panel público de demostración.
//
// No es teórico: reproducido 20 de 20 veces tocando este archivo mientras
// corría `astro dev`. En producción el módulo se evalúa una sola vez y esto no
// cambia nada; lo que arregla es que en desarrollo el aislamiento se pueda
// verificar de verdad, en vez de depender de que nadie edite un fuente
// mientras la suite corre.
const contextos = globalThis as typeof globalThis & {
  __demoContext?: AsyncLocalStorage<true>
}
const demoContext = (contextos.__demoContext ??= new AsyncLocalStorage<true>())

/**
 * Corre `fn` con todas las lecturas apuntando a la base de demo. El contexto se
 * propaga por async/await, así que basta envolver el request en el middleware:
 * los 88 módulos que importan `db` no se enteran.
 */
export function runInDemoContext<T>(fn: () => T): T {
  if (!demoAvailable) return fn()
  return demoContext.run(true, fn)
}

/** ¿Este request corre en modo demo? */
export const inDemoContext = (): boolean => demoContext.getStore() === true

const activeDb = (): Db => (demoContext.getStore() ? demoDbClient() ?? realDbClient() : realDbClient())

/**
 * `db` resuelve su destino en cada acceso, no al importar. Los métodos se
 * devuelven ligados a su instancia real: si se llamaran con `this` apuntando al
 * proxy, drizzle perdería su estado interno.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const target = activeDb()
    const value = Reflect.get(target, prop, target)
    return typeof value === 'function' ? value.bind(target) : value
  },
  has: (_target, prop) => Reflect.has(activeDb(), prop),
})
