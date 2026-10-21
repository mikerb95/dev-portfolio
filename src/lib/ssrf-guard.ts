// Protección anti-SSRF para endpoints públicos que aceptan una URL/dominio arbitrario.
// Resuelve el hostname y rechaza si alguna IP resuelta es privada/loopback/link-local/reservada.

import dns from 'node:dns/promises'
import dnsCb, { type LookupAddress, type LookupOptions } from 'node:dns'
import net from 'node:net'
import { Agent } from 'undici'

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

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

/**
 * `lookup` para sockets (net/tls/undici) que rechaza IPs privadas EN EL MOMENTO
 * DE CONECTAR. `assertPublicHost` valida antes, pero entre esa consulta y la del
 * socket el DNS puede cambiar de respuesta (rebinding, TTL 0): la IP a la que
 * se conecta tiene que ser la misma que se validó, y eso solo se garantiza aquí.
 *
 * No se invoca para IPs literales (el socket no resuelve nada), por eso los
 * saltos de `fetchPublico` siguen pasando además por `assertPublicHost`.
 */
export function lookupPublico(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsCb.lookup(hostname, { ...options, all: true, verbatim: true }, (err, addrs) => {
    if (err) return callback(err, '')
    if (addrs.length === 0 || addrs.some((a) => isPrivateIP(a.address))) {
      return callback(new PrivateHostError(hostname), '')
    }
    if (options.all) return callback(null, addrs)
    callback(null, addrs[0]!.address, addrs[0]!.family)
  })
}

let agente: Agent | null = null
/** Dispatcher de undici cuyas conexiones pasan por `lookupPublico`. Uno por instancia. */
export const agentePublico = (): Agent => (agente ??= new Agent({ connect: { lookup: lookupPublico } }))

export const MAX_SALTOS = 5

export type RespuestaPublica = { res: Response; url: string; redirected: boolean }

/**
 * `fetch` contra un host que eligió un tercero. Dos capas:
 *  · Las redirecciones se siguen A MANO y cada destino pasa por
 *    `assertPublicHost`: con `redirect: 'follow'` bastaba un 302 de un dominio
 *    público hacia 127.0.0.1 o 169.254.169.254 para que el servidor sondeara su
 *    propia red (y devolviera status, cabeceras y título al visitante).
 *  · La conexión usa `lookupPublico`, que cierra el rebinding.
 *
 * `redirect: 'manual'` devuelve el 3xx tal cual (la prueba de redirección a
 * HTTPS lo necesita); por defecto sigue hasta MAX_SALTOS.
 */
export async function fetchPublico(
  url: string,
  init: RequestInit & { redirect?: 'follow' | 'manual' } = {}
): Promise<RespuestaPublica> {
  const seguir = init.redirect !== 'manual'
  let actual = url
  for (let salto = 0; ; salto++) {
    await assertPublicHost(new URL(actual).hostname)
    const res = await fetch(actual, { ...init, redirect: 'manual', dispatcher: agentePublico() } as RequestInit)
    const location = res.headers.get('location')
    if (!seguir || res.status < 300 || res.status >= 400 || !location) {
      return { res, url: actual, redirected: salto > 0 }
    }
    if (salto >= MAX_SALTOS) {
      res.body?.cancel().catch(() => {})
      throw new Error('demasiadas redirecciones')
    }
    res.body?.cancel().catch(() => {})
    const siguiente = new URL(location, actual)
    if (siguiente.protocol !== 'https:' && siguiente.protocol !== 'http:') throw new Error('redirección a un esquema no permitido')
    actual = siguiente.href
  }
}
