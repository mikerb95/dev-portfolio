// Formateo para las vistas del portal. Puro y sin dependencias: es lo que ve
// el cliente y por tanto merece tests, no confianza.

/**
 * Dinero desde centavos enteros. Nunca se hacen cuentas en float: los importes
 * viven en centavos y solo se dividen aquí, en el último paso antes de pintar.
 */
export function formatMoney(cents: number, currency = 'COP'): string {
  const value = cents / 100
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    // El peso colombiano no usa decimales en la práctica; el dólar y el euro sí.
    minimumFractionDigits: currency === 'COP' ? 0 : 2,
    maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(value)
}

export function formatDate(d: Date | number | null | undefined): string {
  if (d == null) return '—'
  const date = d instanceof Date ? d : new Date(d)
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export function formatDateTime(d: Date | number | null | undefined): string {
  if (d == null) return '—'
  const date = d instanceof Date ? d : new Date(d)
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * "hace 3 días", "en 2 semanas". Un cliente no calcula fechas mentalmente: le
 * importa si algo vence pronto, no el 14 de agosto.
 */
export function relativeTime(d: Date | number | null | undefined, now = new Date()): string {
  if (d == null) return '—'
  const date = d instanceof Date ? d : new Date(d)
  const diffMs = date.getTime() - now.getTime()
  const abs = Math.abs(diffMs)

  const rtf = new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' })
  const MIN = 60_000
  const HOUR = 3_600_000
  const DAY = 86_400_000

  if (abs < MIN) return 'ahora mismo'
  if (abs < HOUR) return rtf.format(Math.round(diffMs / MIN), 'minute')
  if (abs < DAY) return rtf.format(Math.round(diffMs / HOUR), 'hour')
  if (abs < 30 * DAY) return rtf.format(Math.round(diffMs / DAY), 'day')
  if (abs < 365 * DAY) return rtf.format(Math.round(diffMs / (30 * DAY)), 'month')
  return rtf.format(Math.round(diffMs / (365 * DAY)), 'year')
}

/** Días que faltan para una fecha (negativo si ya pasó). */
export function daysUntil(d: Date | null | undefined, now = new Date()): number | null {
  if (!d) return null
  // Se compara a medianoche: si algo vence hoy, son 0 días, no −0.4 porque la
  // hora de emisión fuera más tarde que la actual.
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}
