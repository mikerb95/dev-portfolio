// Lectura de variables de entorno del servidor.
//
// El repo convive con dos convenciones: `import.meta.env` (db/index.ts,
// crypto.ts) y `process.env` (notify.ts, payments/checkout.ts). No son
// equivalentes: en el dev server de Astro el .env se carga en import.meta.env
// y NO en process.env, mientras que en Vercel las variables del proyecto
// llegan por process.env. Leer solo una de las dos produce el peor bug posible
// —funciona en un entorno y falla silenciosamente en el otro—, así que este
// helper mira ambas.

/**
 * Valor de una variable de entorno del servidor, o undefined si no está en
 * ninguna de las dos fuentes. Nunca lanza: quien llama decide si la ausencia
 * es fatal (503) o simplemente desactiva una función opcional.
 */
export function serverEnv(name: string): string | undefined {
  const fromVite = (import.meta.env as Record<string, string | undefined>)?.[name]
  if (fromVite) return fromVite
  const fromNode = typeof process !== 'undefined' ? process.env?.[name] : undefined
  return fromNode || undefined
}
