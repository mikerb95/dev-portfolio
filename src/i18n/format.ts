// Formato de fechas, números y moneda por locale. Reemplaza los usos sueltos
// de `Intl.*`/`toLocaleDateString` repartidos en páginas y componentes
// públicos — un solo lugar donde decidir qué locale de Intl corresponde a
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
 * son en COP) — solo el formato de agrupación/decimales. El código ISO va
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
