// Formato de fechas, números y moneda por locale. Reemplaza los usos sueltos
// de `Intl.*`/`toLocaleDateString` repartidos en páginas y componentes
// públicos - un solo lugar donde decidir qué locale de Intl corresponde a
// cada idioma del sitio.

import type { Locale } from './config'

const INTL_LOCALE: Record<Locale, string> = { es: 'es-CO', en: 'en-US' }

export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale]
}

export function formatDate(
  date: Date,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], opts).format(date)
}

export function formatDateShort(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    date
  )
}

export function formatNumber(value: number, locale: Locale, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], opts).format(value)
}

/**
 * Pesos colombianos. La moneda no cambia con el idioma (las facturas reales
 * son en COP) - solo el formato de agrupación/decimales. El código ISO va
 * siempre explícito para que un lector angloparlante no lo lea como dólares.
 */
export function formatCOP(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, locale: Locale): string {
  return new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: 'auto' }).format(value, unit)
}

/**
 * "hace 4 min" a partir de una marca de tiempo, eligiendo la unidad más grande
 * que siga siendo precisa. Se usa desde el navegador (card "Ahora" del index):
 * el timestamp relativo es lo que demuestra que el dato es fresco, así que
 * tiene que recalcularse en cliente y no quedarse congelado en el HTML del CDN.
 */
export function formatTimeAgo(at: number, locale: Locale, now: number = Date.now()): string {
  const seconds = Math.round((at - now) / 1000) // negativo = en el pasado
  const abs = Math.abs(seconds)

  if (abs < 60) return formatRelativeTime(seconds, 'second', locale)
  if (abs < 3600) return formatRelativeTime(Math.round(seconds / 60), 'minute', locale)
  if (abs < 86_400) return formatRelativeTime(Math.round(seconds / 3600), 'hour', locale)
  if (abs < 2_592_000) return formatRelativeTime(Math.round(seconds / 86_400), 'day', locale)
  return formatRelativeTime(Math.round(seconds / 2_592_000), 'month', locale)
}

/**
 * Sustituye `{clave}` por su valor. Usado por las plantillas del diccionario
 * que mezclan texto traducido con números/paths dinámicos (p. ej.
 * "{n} servicios monitoreados"). El test de paridad de diccionarios ya
 * verifica que los placeholders coincidan entre es/en.
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`))
}
