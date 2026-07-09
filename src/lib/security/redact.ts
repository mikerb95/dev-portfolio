// Helpers puros de redacción/pseudonimización para la observabilidad de
// seguridad. Sin DB → testeables. Se usan tanto al registrar (ipHash) como al
// exponer datos en la vitrina pública (maskIp). Ver plan-security-observability.

import { createHash } from 'node:crypto'

/** Trunca a `max` caracteres (defensa de tamaño de fila y anti-payload). */
export function truncate(s: string | null | undefined, max: number): string | null {
  if (s == null) return null
  const t = String(s)
  return t.length > max ? t.slice(0, max) : t
}

/**
 * Hash estable y pseudónimo de una IP: sha-256(salt + ip) truncado a 16 hex.
 * Sirve para contar "IPs únicas" y correlacionar en la vitrina sin exponer la
 * IP en claro. El salt (SECURITY_IP_SALT) evita reversión por diccionario; su
 * ausencia degrada a un salt fijo (aceptable: no es una frontera de seguridad).
 */
export function hashIp(ip: string | null | undefined, salt?: string): string | null {
  if (!ip) return null
  const s = salt ?? ''
  return createHash('sha256').update(`${s}:${ip}`).digest('hex').slice(0, 16)
}

/**
 * Enmascara una IP para mostrarla en público: IPv4 → "181.x.x.x" (solo primer
 * octeto), IPv6 → primer grupo + "…". Nunca revela la IP completa.
 */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return 'desconocida'
  if (ip.includes(':')) {
    const head = ip.split(':')[0] || '::'
    return `${head}:…`
  }
  const parts = ip.split('.')
  if (parts.length === 4) return `${parts[0]}.x.x.x`
  return 'oculta'
}
