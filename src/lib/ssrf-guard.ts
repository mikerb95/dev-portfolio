// Protección anti-SSRF para endpoints públicos que aceptan una URL/dominio arbitrario.
// Resuelve el hostname y rechaza si alguna IP resuelta es privada/loopback/link-local/reservada.

import dns from 'node:dns/promises'
import net from 'node:net'

export class PrivateHostError extends Error {
  constructor(hostname: string) {
    super(`Host no permitido: ${hostname}`)
    this.name = 'PrivateHostError'
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 0) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast/reservado
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase()
  if (v === '::1') return true
  if (v === '::') return true
  if (v.startsWith('fe80:')) return true // link-local
  if (v.startsWith('fc') || v.startsWith('fd')) return true // ULA (fc00::/7)
  if (v.startsWith('::ffff:')) {
    const mapped = v.slice(7)
    if (net.isIPv4(mapped)) return isPrivateIPv4(mapped)
  }
  return false
}

function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip)
  if (net.isIPv6(ip)) return isPrivateIPv6(ip)
  return true
}

/** Resuelve el hostname y lanza PrivateHostError si alguna IP es privada/reservada. */
export async function assertPublicHost(hostname: string): Promise<void> {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) {
    throw new PrivateHostError(hostname)
  }
  if (net.isIP(h)) {
    if (isPrivateIP(h)) throw new PrivateHostError(hostname)
    return
  }
  let addrs: { address: string }[]
  try {
    addrs = await dns.lookup(h, { all: true, verbatim: true })
  } catch {
    throw new PrivateHostError(hostname)
  }
  if (addrs.length === 0) throw new PrivateHostError(hostname)
  for (const { address } of addrs) {
    if (isPrivateIP(address)) throw new PrivateHostError(hostname)
  }
}
