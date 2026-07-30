// Selección de campo traducido para contenido que vive en base de datos
// (`projects`, `education_milestones`). Módulo puro: sin `../db`, sin
// `node:crypto` — se puede importar desde cualquier lado y testear sin BD.
//
// El contenido en BD se traduce fila por fila y a mano, así que en cualquier
// momento hay filas con traducción y filas sin ella. La regla es explícita:
// **una fila sin traducir se muestra en español, nunca en blanco**. Un título
// vacío en /en/projects/<slug> es peor que un título en el idioma equivocado.
// Ver docs/plan-i18n-en.md §7.

import { DEFAULT_LOCALE, type Locale } from './config'

/**
 * Devuelve el valor del campo en el idioma pedido, cayendo al idioma por
 * defecto si la traducción no existe o está vacía.
 *
 * La convención de nombres es fija: el campo traducido es `<campo>En`
 * (`title` → `titleEn`), igual que las columnas `<campo>_en` del schema.
 *
 * @example
 *   pickLocalized(row, 'title', 'en')  // row.titleEn ?? row.title
 *   pickLocalized(row, 'title', 'es')  // row.title
 */
export function pickLocalized<T extends Record<string, unknown>, K extends string & keyof T>(
  row: T,
  field: K,
  locale: Locale
): T[K] {
  const base = row[field]
  if (locale === DEFAULT_LOCALE) return base

  const translated = row[`${field}En` as keyof T]
  // Se descarta también la cadena vacía y la que es solo espacios: un campo
  // que el admin dejó en blanco cuenta como "sin traducir", no como
  // "traducido a nada". Un `0` o un `false` sí son valores legítimos.
  if (translated === null || translated === undefined) return base
  if (typeof translated === 'string' && translated.trim() === '') return base
  return translated as T[K]
}

/**
 * ¿Esta fila tiene traducción utilizable en ese idioma? Se usa para decidir si
 * el sitemap anuncia la URL `/en/...` de la fila: anunciar una URL en inglés
 * cuyo contenido saldría en español es thin content a ojos de un buscador.
 *
 * `requiredFields` son los campos que hacen a la página realmente traducida —
 * normalmente el título. Un campo secundario sin traducir (una descripción)
 * degrada al español sin invalidar la página.
 */
export function hasRowTranslation<T extends Record<string, unknown>>(
  row: T,
  requiredFields: readonly (string & keyof T)[],
  locale: Locale
): boolean {
  if (locale === DEFAULT_LOCALE) return true
  return requiredFields.every((field) => {
    const translated = row[`${field}En` as keyof T]
    return typeof translated === 'string' && translated.trim() !== ''
  })
}
