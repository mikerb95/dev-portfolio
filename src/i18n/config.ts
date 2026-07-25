// Fuente única de verdad de qué idiomas existen. Todo lo demás (rutas,
// diccionarios, formato) deriva de aquí — nunca se repite la lista en otro
// archivo.

export const LOCALES = ['es', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'es'

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}
