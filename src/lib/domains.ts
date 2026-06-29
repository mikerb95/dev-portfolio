// Detección de vencimiento de dominios vía RDAP (sin API key) y utilidades de alerta.
//
// RDAP (RFC 7483) reemplaza a WHOIS con respuestas JSON. rdap.org actúa como
// bootstrap: redirige al servidor RDAP del registro correcto según el TLD.
// Funciona para la mayoría de gTLDs (.com .net .org .io .dev .tech .app …).
// Algunos ccTLDs no exponen RDAP → devolvemos null y se mantiene la fecha manual.

// Sufijos de dos niveles más comunes, para derivar el dominio registrable (eTLD+1).
const MULTI_LEVEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'co.jp', 'com.au', 'net.au', 'org.au',
  'com.br', 'com.mx', 'com.ar', 'com.co', 'com.tr', 'co.nz', 'co.za', 'co.in',
])

/** Extrae el dominio registrable a partir de un texto libre (url o nombre del servicio). */
export function extractDomain(input?: string | null): string | null {
  if (!input) return null
  let s = String(input).trim().toLowerCase()
  // Quita protocolo y todo lo que siga al host.
  s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '')
  // Toma el primer token que parezca un host con punto (p. ej. "Dominio codebymike.tech").
  const match = s.match(/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/)
  if (!match) return null
  const host = match[0].replace(/\.$/, '')
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const lastTwo = parts.slice(-2).join('.')
  const lastThree = parts.slice(-3).join('.')
  if (MULTI_LEVEL_SUFFIXES.has(lastTwo)) return lastThree
  return lastTwo
}

/**
 * Consulta la fecha de expiración real de un dominio vía RDAP.
 * Devuelve la fecha de expiración o null si no se pudo determinar.
 */
export async function fetchDomainExpiry(domainOrInput: string): Promise<Date | null> {
  const domain = extractDomain(domainOrInput)
  if (!domain) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: 'application/rdap+json, application/json' },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!res.ok) return null
    const data: any = await res.json()
    const events: any[] = Array.isArray(data?.events) ? data.events : []
    const exp = events.find((e) => e?.eventAction === 'expiration' && e?.eventDate)
    if (!exp) return null
    const d = new Date(exp.eventDate)
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export type DomainAlertState = 'overdue' | 'critical' | 'soon' | 'ok'

/** Días (con decimales) hasta una fecha; negativo si ya pasó. */
export const daysUntil = (d: Date): number => (d.getTime() - Date.now()) / 86_400_000

/** Umbrales de alerta: vencido, ≤7d crítico, ≤30d próximo. */
export function domainAlertState(d?: Date | null): DomainAlertState | null {
  if (!d) return null
  const days = daysUntil(d)
  if (days < 0) return 'overdue'
  if (days <= 7) return 'critical'
  if (days <= 30) return 'soon'
  return 'ok'
}

export const DOMAIN_ALERT_SOON_DAYS = 30
export const DOMAIN_ALERT_CRITICAL_DAYS = 7
