// Batería de diagnósticos en vivo contra un dominio/URL. Sin dependencias externas:
// usa fetch + node:tls + node:dns. Cada prueba nunca lanza; devuelve un resultado
// estructurado con estado (pass/warn/fail/info), resumen y detalles.

import tls from 'node:tls'
import dns from 'node:dns/promises'
import { fetchDomainExpiry, extractDomain, daysUntil } from './domains'

export type DiagnosticStatus = 'pass' | 'warn' | 'fail' | 'info'

export type DiagnosticResult = {
  id: string
  label: string
  status: DiagnosticStatus
  summary: string
  details?: string[]
  ms: number
}

export type DiagnosticTarget = { url: string; host: string; hostname: string; origin: string; domain: string }

const HTTP_TIMEOUT_MS = 10_000
const TLS_TIMEOUT_MS = 8_000
const UA = 'codebymike-diagnostics/1.0 (+https://codebymike.tech)'

/** Normaliza texto libre (con o sin esquema) a un objetivo de pruebas. null si no es válido. */
export function normalizeTarget(input?: string | null): DiagnosticTarget | null {
  if (!input) return null
  let s = String(input).trim()
  if (!s) return null
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return {
      url: u.toString(),
      host: u.host,
      hostname: u.hostname,
      origin: u.origin,
      domain: extractDomain(u.hostname) ?? u.hostname,
    }
  } catch {
    return null
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? HTTP_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'User-Agent': UA, ...(init.headers ?? {}) },
    })
  } finally {
    clearTimeout(t)
  }
}

// Libera la conexión sin descargar todo el cuerpo.
const drain = (res: Response) => res.body?.cancel?.().catch(() => {})

type Outcome = Omit<DiagnosticResult, 'id' | 'label' | 'ms'>

/** Envuelve una prueba: la cronometra y captura cualquier excepción como fallo. */
async function timed(id: string, label: string, fn: () => Promise<Outcome>): Promise<DiagnosticResult> {
  const started = Date.now()
  try {
    const r = await fn()
    return { id, label, ms: Date.now() - started, ...r }
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return {
      id,
      label,
      ms: Date.now() - started,
      status: 'fail',
      summary: aborted ? `Timeout (>${HTTP_TIMEOUT_MS / 1000}s)` : e instanceof Error ? e.message : 'Error inesperado',
    }
  }
}

// ── Pruebas individuales ────────────────────────────────────────────────────

/** Disponibilidad HTTP: status, latencia hasta cabeceras, redirecciones y metadatos. */
async function testReachability(t: DiagnosticTarget): Promise<Outcome> {
  const started = Date.now()
  const res = await fetchWithTimeout(t.url, { redirect: 'follow' })
  const ttfb = Date.now() - started
  drain(res)
  const status: DiagnosticStatus = res.ok ? 'pass' : res.status >= 500 ? 'fail' : 'warn'
  return {
    status,
    summary: `HTTP ${res.status} · ${ttfb}ms`,
    details: [
      `URL final: ${res.url}`,
      res.redirected ? 'Se siguieron redirecciones' : 'Sin redirecciones',
      `Content-Type: ${res.headers.get('content-type') ?? '—'}`,
      `Servidor: ${res.headers.get('server') ?? '—'}`,
    ],
  }
}

/** Certificado TLS: emisor, vigencia, protocolo y días restantes. */
async function testTls(t: DiagnosticTarget): Promise<Outcome> {
  const u = new URL(t.url)
  if (u.protocol !== 'https:') return { status: 'info', summary: 'El objetivo no usa HTTPS' }

  const info = await inspectTls(t.url)
  if (!info || !info.validTo) return { status: 'fail', summary: 'No se pudo leer el certificado TLS' }

  const days = info.daysLeft ?? Math.round(daysUntil(info.validTo))
  const status: DiagnosticStatus = days < 0 ? 'fail' : days <= 14 ? 'warn' : 'pass'
  return {
    status,
    summary: days < 0 ? `Vencido hace ${Math.abs(days)}d` : `Válido · vence en ${days}d`,
    details: [
      `Emisor: ${info.issuer ?? '—'}`,
      `Sujeto: ${info.subject ?? '—'}`,
      `Vigencia: ${fmtDate(info.validFrom)} → ${fmtDate(info.validTo)}`,
      `Protocolo: ${info.protocol ?? '—'}`,
    ],
  }
}

/** Redirección de HTTP a HTTPS (buenas prácticas de seguridad). */
async function testHttpsRedirect(t: DiagnosticTarget): Promise<Outcome> {
  const httpUrl = `http://${t.host}${new URL(t.url).pathname}`
  try {
    const res = await fetchWithTimeout(httpUrl, { redirect: 'manual', timeoutMs: 8000 })
    drain(res)
    const loc = res.headers.get('location') ?? ''
    if (res.status >= 300 && res.status < 400) {
      const toHttps = loc.startsWith('https://') || (loc.startsWith('/') && false)
      return toHttps
        ? { status: 'pass', summary: `Redirige a HTTPS (${res.status})`, details: [`Location: ${loc}`] }
        : { status: 'warn', summary: `Redirige, pero no a HTTPS (${res.status})`, details: [`Location: ${loc || '—'}`] }
    }
    if (res.status === 200) return { status: 'warn', summary: 'Sirve por HTTP sin redirigir a HTTPS' }
    return { status: 'info', summary: `HTTP responde ${res.status}` }
  } catch {
    return { status: 'info', summary: 'No responde por HTTP (puede ser correcto si solo hay HTTPS)' }
  }
}

const SEC_HEADERS: { key: string; label: string; critical: boolean }[] = [
  { key: 'strict-transport-security', label: 'HSTS', critical: true },
  { key: 'x-content-type-options', label: 'X-Content-Type-Options', critical: true },
  { key: 'content-security-policy', label: 'CSP', critical: false },
  { key: 'x-frame-options', label: 'X-Frame-Options', critical: false },
  { key: 'referrer-policy', label: 'Referrer-Policy', critical: false },
  { key: 'permissions-policy', label: 'Permissions-Policy', critical: false },
]

/** Cabeceras de seguridad recomendadas. */
async function testSecurityHeaders(t: DiagnosticTarget): Promise<Outcome> {
  const res = await fetchWithTimeout(t.url, { redirect: 'follow' })
  drain(res)
  const details: string[] = []
  let missingCritical = 0
  let present = 0
  for (const h of SEC_HEADERS) {
    const val = res.headers.get(h.key)
    if (val) {
      present++
      details.push(`✓ ${h.label}: ${val.length > 60 ? val.slice(0, 60) + '…' : val}`)
    } else {
      if (h.critical) missingCritical++
      details.push(`✗ ${h.label}: ausente`)
    }
  }
  const status: DiagnosticStatus = missingCritical > 0 ? 'warn' : present === SEC_HEADERS.length ? 'pass' : 'warn'
  return { status, summary: `${present}/${SEC_HEADERS.length} presentes`, details }
}

/** Registros DNS (A, AAAA, CNAME, MX, NS, TXT). */
async function testDns(t: DiagnosticTarget): Promise<Outcome> {
  const settle = <T>(p: Promise<T>) => p.then((v) => v).catch(() => null)
  const [a, aaaa, cname, mx, ns, txt] = await Promise.all([
    settle(dns.resolve4(t.hostname)),
    settle(dns.resolve6(t.hostname)),
    settle(dns.resolveCname(t.hostname)),
    settle(dns.resolveMx(t.domain)),
    settle(dns.resolveNs(t.domain)),
    settle(dns.resolveTxt(t.domain)),
  ])
  const hasAddr = (a?.length ?? 0) + (aaaa?.length ?? 0) + (cname?.length ?? 0) > 0
  return {
    status: hasAddr ? 'pass' : 'fail',
    summary: hasAddr ? `Resuelve · ${a?.length ?? 0} A, ${aaaa?.length ?? 0} AAAA` : 'No resuelve',
    details: [
      `A: ${a?.length ? a.join(', ') : '—'}`,
      `AAAA: ${aaaa?.length ? aaaa.join(', ') : '—'}`,
      `CNAME: ${cname?.length ? cname.join(', ') : '—'}`,
      `MX: ${mx?.length ? mx.map((r) => r.exchange).join(', ') : '—'}`,
      `NS: ${ns?.length ? ns.join(', ') : '—'}`,
      `TXT: ${txt?.length ? `${txt.length} registro(s)` : '—'}`,
    ],
  }
}

/** Vencimiento del dominio vía RDAP. */
async function testDomainExpiry(t: DiagnosticTarget): Promise<Outcome> {
  const exp = await fetchDomainExpiry(t.domain)
  if (!exp) return { status: 'info', summary: 'No disponible por RDAP para este TLD' }
  const days = Math.round(daysUntil(exp))
  const status: DiagnosticStatus = days < 0 ? 'fail' : days <= 30 ? 'warn' : 'pass'
  return {
    status,
    summary: days < 0 ? `Vencido hace ${Math.abs(days)}d` : `Vence en ${days}d`,
    details: [`Dominio: ${t.domain}`, `Fecha: ${fmtDate(exp)}`],
  }
}

/** robots.txt presente y no un catch-all de SPA. */
async function testRobots(t: DiagnosticTarget): Promise<Outcome> {
  const res = await fetchWithTimeout(new URL('/robots.txt', t.origin).toString(), { redirect: 'follow' })
  if (!res.ok) {
    drain(res)
    return { status: 'info', summary: `Sin robots.txt (${res.status})` }
  }
  const ct = res.headers.get('content-type') ?? ''
  const body = (await res.text().catch(() => '')).trim()
  const looksReal = /text\/plain/i.test(ct) || /(user-agent|disallow|sitemap)\s*:/i.test(body)
  if (!looksReal) return { status: 'warn', summary: 'Responde 200 pero no parece robots.txt (posible catch-all)' }
  const hasSitemap = /^sitemap\s*:/im.test(body)
  return {
    status: 'pass',
    summary: `Presente${hasSitemap ? ' · declara Sitemap' : ''}`,
    details: [`${body.split('\n').length} líneas`, hasSitemap ? 'Directiva Sitemap ✓' : 'Sin directiva Sitemap'],
  }
}

/** sitemap.xml presente y con formato XML. */
async function testSitemap(t: DiagnosticTarget): Promise<Outcome> {
  const res = await fetchWithTimeout(new URL('/sitemap.xml', t.origin).toString(), { redirect: 'follow' })
  if (!res.ok) {
    drain(res)
    return { status: 'info', summary: `Sin sitemap.xml (${res.status})` }
  }
  const ct = res.headers.get('content-type') ?? ''
  const body = (await res.text().catch(() => '')).slice(0, 2000)
  const looksXml = /xml/i.test(ct) || /<(urlset|sitemapindex)/i.test(body)
  if (!looksXml) return { status: 'warn', summary: 'Responde 200 pero no parece XML (posible catch-all)' }
  const count = (body.match(/<loc>/gi) ?? []).length
  const isIndex = /<sitemapindex/i.test(body)
  return {
    status: 'pass',
    summary: isIndex ? 'Índice de sitemaps' : `${count}+ URL${count === 1 ? '' : 's'}`,
    details: [`Content-Type: ${ct || '—'}`],
  }
}

// ── TLS de bajo nivel ───────────────────────────────────────────────────────

type TlsInfo = {
  validFrom: Date | null
  validTo: Date | null
  issuer: string | null
  subject: string | null
  protocol: string | null
  daysLeft: number | null
}

function inspectTls(rawUrl: string): Promise<TlsInfo | null> {
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
    const finish = (v: TlsInfo | null) => {
      if (settled) return
      settled = true
      resolve(v)
    }
    const socket = tls.connect({ host, port, servername: host, timeout: TLS_TIMEOUT_MS }, () => {
      const cert = socket.getPeerCertificate()
      const protocol = socket.getProtocol()
      socket.end()
      if (!cert || !cert.valid_to) return finish(null)
      const validTo = new Date(cert.valid_to)
      const validFrom = cert.valid_from ? new Date(cert.valid_from) : null
      const okTo = !isNaN(validTo.getTime())
      finish({
        validFrom: validFrom && !isNaN(validFrom.getTime()) ? validFrom : null,
        validTo: okTo ? validTo : null,
        issuer: cert.issuer?.O ?? cert.issuer?.CN ?? null,
        subject: cert.subject?.CN ?? null,
        protocol,
        daysLeft: okTo ? Math.round(daysUntil(validTo)) : null,
      })
    })
    socket.on('error', () => finish(null))
    socket.on('timeout', () => {
      socket.destroy()
      finish(null)
    })
  })
}

const fmtDate = (d?: Date | null) =>
  d ? d.toISOString().slice(0, 10) : '—'

// ── Orquestador ─────────────────────────────────────────────────────────────

/** Suite completa de pruebas para un objetivo. Cada entrada corre en paralelo. */
export function diagnosticSuite(t: DiagnosticTarget): { id: string; label: string; run: () => Promise<DiagnosticResult> }[] {
  const defs: { id: string; label: string; fn: (t: DiagnosticTarget) => Promise<Outcome> }[] = [
    { id: 'reachability', label: 'Disponibilidad HTTP', fn: testReachability },
    { id: 'tls', label: 'Certificado TLS', fn: testTls },
    { id: 'https-redirect', label: 'Redirección a HTTPS', fn: testHttpsRedirect },
    { id: 'security-headers', label: 'Cabeceras de seguridad', fn: testSecurityHeaders },
    { id: 'dns', label: 'Registros DNS', fn: testDns },
    { id: 'domain-expiry', label: 'Vencimiento del dominio', fn: testDomainExpiry },
    { id: 'robots', label: 'robots.txt', fn: testRobots },
    { id: 'sitemap', label: 'sitemap.xml', fn: testSitemap },
  ]
  return defs.map((d) => ({ id: d.id, label: d.label, run: () => timed(d.id, d.label, () => d.fn(t)) }))
}
