// Motor de sondeo de uptime: hace la petición HTTP, mide latencia, valida el
// status/contenido esperado y (opcionalmente) lee la expiración del certificado TLS.
// Sin dependencias externas: usa fetch + node:tls.

import tls from 'node:tls'
import { assertPublicHost } from './ssrf-guard'

export type MonitorState = 'up' | 'degraded' | 'down' | 'unknown'

export type CheckOutcome = {
  ok: boolean
  state: Exclude<MonitorState, 'unknown'>
  statusCode: number | null
  responseMs: number | null
  error: string | null
}

export type MonitorInput = {
  url: string
  method?: string | null
  expectedStatus?: number | null
  expectedText?: string | null
  latencyThresholdMs?: number | null
  /**
   * Techo de espera de ESTE sondeo. El cron puede permitirse los 12s por
   * defecto; un sondeo hecho durante el render de una página no, porque el
   * visitante los espera. Ver src/lib/fallback/sondeo-vivo.ts.
   */
  timeoutMs?: number | null
}

const REQUEST_TIMEOUT_MS = 12_000
// Las redirecciones se siguen a mano para validar CADA destino: con
// redirect: 'follow', una URL pública que responde 302 a 169.254.169.254
// convertía al monitor en un proxy hacia la red interna (SSRF). La URL la
// escribe el admin, pero un sitio vigilado puede cambiar su redirección.
const MAX_SALTOS = 5
const SSL_TIMEOUT_MS = 8_000

/** Sondea una URL una vez. Nunca lanza: cualquier fallo se devuelve como caída. */
export async function probe(m: MonitorInput): Promise<CheckOutcome> {
  const controller = new AbortController()
  const techo = m.timeoutMs && m.timeoutMs > 0 ? m.timeoutMs : REQUEST_TIMEOUT_MS
  const timeout = setTimeout(() => controller.abort(), techo)
  const started = Date.now()
  try {
    let url = m.url
    let metodo = m.method ?? 'GET'
    let res: Response
    for (let salto = 0; ; salto++) {
      const destino = new URL(url)
      if (destino.protocol !== 'http:' && destino.protocol !== 'https:') throw new Error(`Protocolo no permitido: ${destino.protocol}`)
      await assertPublicHost(destino.hostname)
      res = await fetch(url, {
        method: metodo,
        headers: { 'User-Agent': 'codebymike-monitor/1.0 (+https://codebymike.net)' },
        signal: controller.signal,
        redirect: 'manual',
      })
      const location = res.headers.get('location')
      if (res.status < 300 || res.status >= 400 || !location) break
      if (salto >= MAX_SALTOS) throw new Error(`Demasiadas redirecciones (>${MAX_SALTOS})`)
      await res.body?.cancel().catch(() => {})
      url = new URL(location, url).href
      // Como hace el navegador: tras una redirección, un POST pasa a GET.
      if (metodo !== 'HEAD') metodo = 'GET'
    }
    const responseMs = Date.now() - started
    const expected = m.expectedStatus ?? 200

    if (res.status !== expected) {
      // Drena el cuerpo para liberar la conexión aunque no lo usemos.
      await res.text().catch(() => '')
      return { ok: false, state: 'down', statusCode: res.status, responseMs, error: `HTTP ${res.status} (esperado ${expected})` }
    }

    if (m.expectedText) {
      const body = await res.text().catch(() => '')
      if (!body.includes(m.expectedText)) {
        return { ok: false, state: 'down', statusCode: res.status, responseMs, error: `Falta el texto esperado: "${m.expectedText.slice(0, 40)}"` }
      }
    } else {
      await res.text().catch(() => '')
    }

    const threshold = m.latencyThresholdMs ?? 2000
    const state: CheckOutcome['state'] = responseMs > threshold ? 'degraded' : 'up'
    return { ok: true, state, statusCode: res.status, responseMs, error: null }
  } catch (e) {
    const responseMs = Date.now() - started
    const aborted = e instanceof Error && e.name === 'AbortError'
    return {
      ok: false,
      state: 'down',
      statusCode: null,
      responseMs,
      error: aborted ? `Timeout (>${techo / 1000}s)` : e instanceof Error ? e.message : 'Error de red',
    }
  } finally {
    clearTimeout(timeout)
  }
}

/** Lee la fecha de expiración del certificado TLS abriendo un socket. null si falla o no es https. */
export async function fetchSslExpiry(rawUrl: string): Promise<Date | null> {
  // Abrir un socket es tan SSRF como un fetch: el mismo guardia, antes.
  try {
    await assertPublicHost(new URL(rawUrl).hostname)
  } catch {
    return null
  }
  return leerExpiracion(rawUrl)
}

function leerExpiracion(rawUrl: string): Promise<Date | null> {
  let host: string
  let port: number
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'https:') return Promise.resolve(null)
    host = u.hostname
    port = u.port ? Number(u.port) : 443
  } catch {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    let settled = false
    const done = (d: Date | null) => {
      if (settled) return
      settled = true
      resolve(d)
    }
    const socket = tls.connect({ host, port, servername: host, timeout: SSL_TIMEOUT_MS }, () => {
      const cert = socket.getPeerCertificate()
      socket.end()
      const valid = cert && cert.valid_to ? new Date(cert.valid_to) : null
      done(valid && !isNaN(valid.getTime()) ? valid : null)
    })
    socket.on('error', () => done(null))
    socket.on('timeout', () => {
      socket.destroy()
      done(null)
    })
  })
}

export const MONITOR_DOT: Record<MonitorState, string> = {
  up: '🟢',
  degraded: '🟡',
  down: '🔴',
  unknown: '⚪',
}

export const MONITOR_LABEL: Record<MonitorState, string> = {
  up: 'Operativo',
  degraded: 'Degradado',
  down: 'Caído',
  unknown: 'Sin datos',
}
