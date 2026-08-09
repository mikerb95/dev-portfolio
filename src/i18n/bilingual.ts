// Campos bilingües para los módulos de datos de `/docs`
// (`documentacion.ts`, `iteraciones*.ts`, `testing.ts`, `vyv.ts`).
//
// Esos módulos son la fuente de verdad de la documentación de ingeniería: los
// `.astro` de /docs solo renderizan, ninguna cifra se escribe a mano allí. Para
// traducirlos sin duplicar los archivos (cinco módulos que cambian en cada
// iteración se desincronizarían en semanas) cada campo de texto acepta dos
// formas:
//
//   titulo: 'Listado de proyectos'                        ← solo español
//   titulo: { es: 'Listado de proyectos', en: 'Project listing' }
//
// `tx()` resuelve ambas. Un campo que todavía no se tradujo se muestra en
// español en la versión inglesa, nunca vacío - la misma regla que se aplica al
// contenido en base de datos (`pickLocalized`). Así la traducción de /docs
// avanza fichero a fichero sin que ninguna página quede rota en el intermedio.

import { DEFAULT_LOCALE, type Locale } from './config'

/** Un texto que puede estar solo en español o tener su par en inglés. */
export type Bilingual = string | { es: string; en: string }

/** Igual que `Bilingual` pero para campos opcionales. */
export type BilingualOptional = Bilingual | undefined

/** Resuelve un campo bilingüe al idioma pedido, cayendo al español. */
export function tx(value: Bilingual, locale: Locale): string
export function tx(value: BilingualOptional, locale: Locale): string | undefined
export function tx(value: BilingualOptional, locale: Locale): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  if (locale === DEFAULT_LOCALE) return value.es
  // Una traducción vacía cuenta como ausente: se prefiere el español legible a
  // un hueco en la página.
  return value.en.trim() === '' ? value.es : value.en
}

/** Resuelve una lista de campos bilingües. */
export function txAll(values: readonly Bilingual[], locale: Locale): string[] {
  return values.map((v) => tx(v, locale))
}

/**
 * ¿Qué porcentaje de los campos de un módulo tiene traducción? Se usa en el
 * propio /docs para reportar honestamente cuánto está traducido en vez de
 * aparentar una versión inglesa completa. Recorre en profundidad y cuenta
 * cualquier valor que sea `string` (sin traducir) u objeto `{es, en}`.
 */
export function translationCoverage(data: unknown): { translated: number; total: number } {
  let translated = 0
  let total = 0

  const walk = (node: unknown): void => {
    if (node === null || node === undefined) return
    if (typeof node === 'string') {
      total++
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>
      // Un par bilingüe cuenta como UN campo traducido, no como dos strings.
      if (typeof obj.es === 'string' && typeof obj.en === 'string' && Object.keys(obj).length === 2) {
        total++
        translated++
        return
      }
      Object.values(obj).forEach(walk)
    }
  }

  walk(data)
  return { translated, total }
}
