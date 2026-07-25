import { DEFAULT_LOCALE, type Locale } from './config'
import es from './es'
import en from './en'

export type Dictionary = typeof es

const DICTIONARIES: Record<Locale, Dictionary> = { es, en }

export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return DICTIONARIES[locale]
}

export * from './config'
export * from './routing'
export * from './format'
