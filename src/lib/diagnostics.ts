// Batería de diagnósticos en vivo contra un dominio/URL. Sin dependencias externas:
// usa fetch + node:tls + node:dns. Cada prueba nunca lanza; devuelve un resultado
// estructurado con estado (pass/warn/fail/info), resumen y detalles.

import tls from 'node:tls'
import dns from 'node:dns/promises'
import { fetchDomainExpiry, extractDomain, daysUntil } from './domains'
import type { Locale } from '../i18n/config'
import { serverEnv } from './env'

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

// ── Textos por idioma ───────────────────────────────────────────────────────
// El analizador es público y se sirve en los dos idiomas (/lab/site-check y
// /en/lab/site-check), así que sus veredictos también. Los textos viven aquí y
// no en `src/i18n/es.ts` a propósito: este módulo corre en el servidor y lo
// consume tanto la ruta pública como el diagnóstico del panel — importar el
// diccionario de páginas ataría una lib de infraestructura a la capa de UI.
// Las claves que se ven en la tarjeta (label, summary, details) se resuelven
// con el locale que llega en la petición; el panel usa el idioma por defecto.

type Strings = ReturnType<typeof stringsFor>

function stringsFor(locale: Locale) {
  const es = {
    unexpectedError: 'Error inesperado',
    timeout: (s: number) => `Timeout (>${s}s)`,
    finalUrl: (u: string) => `URL final: ${u}`,
    redirected: 'Se siguieron redirecciones',
    notRedirected: 'Sin redirecciones',
    server: (v: string) => `Servidor: ${v}`,
    htmlDownloadFail: 'No se pudo descargar el HTML',
    seoAllPresent: 'title, description y canonical presentes',
    seoMissing: (list: string) => `Falta: ${list}`,
    metaDescription: 'meta description',
    perfFail: 'No se pudo medir el rendimiento',
    linkedScripts: (n: number) => `Scripts enlazados: ${n}`,
    stylesheets: (n: number) => `Hojas de estilo: ${n}`,
    images: (n: number) => `Imágenes: ${n}`,
    htmlSize: (kb: string) => `Tamaño del HTML: ${kb}KB`,
    htmlParseFail: 'No se pudo analizar el HTML',
    missingLang: 'Falta atributo lang en <html>',
    imgsNoAlt: (n: number) => `${n} imagen(es) sin alt`,
    inputsNoLabel: (n: number) => `${n} campo(s) sin label/aria-label`,
    noH1: 'Sin <h1>',
    multipleH1: (n: number) => `${n} etiquetas <h1> (debería haber una)`,
    genericLinks: (n: number) => `${n} enlace(s) con texto genérico`,
    a11yClean: 'Sin hallazgos heurísticos (no reemplaza una auditoría axe-core)',
    a11yFindings: (n: number) => `${n} hallazgo(s) heurístico(s)`,
    a11yNote: 'Chequeo heurístico sobre HTML estático — no reemplaza axe-core',
    psiNotConfigured: 'No configurado (falta PSI_API_KEY)',
    psiNeedsKey: 'Requiere una clave gratuita de Google PageSpeed Insights para correr Lighthouse real.',
    psiResponded: (n: number) => `PageSpeed Insights respondió ${n}`,
    psiNoData: 'Respuesta de PageSpeed Insights sin datos de Lighthouse',
    psiSummary: (p: string, a: string, s2: string) => `Rendimiento ${p} · Accesibilidad ${a} · SEO ${s2}`,
    psiPerformance: (v: string) => `Rendimiento: ${v}/100`,
    psiAccessibility: (v: string) => `Accesibilidad: ${v}/100`,
    psiBestPractices: (v: string) => `Buenas prácticas: ${v}/100`,
    psiSeo: (v: string) => `SEO: ${v}/100`,
    notHttps: 'El objetivo no usa HTTPS',
    tlsUnreadable: 'No se pudo leer el certificado TLS',
    expiredAgo: (d: number) => `Vencido hace ${d}d`,
    validExpiresIn: (d: number) => `Válido · vence en ${d}d`,
    issuer: (v: string) => `Emisor: ${v}`,
    subject: (v: string) => `Sujeto: ${v}`,
    validity: (a: string, b: string) => `Vigencia: ${a} → ${b}`,
    protocol: (v: string) => `Protocolo: ${v}`,
    redirectsToHttps: (n: number) => `Redirige a HTTPS (${n})`,
    redirectsNotHttps: (n: number) => `Redirige, pero no a HTTPS (${n})`,
    servesHttpNoRedirect: 'Sirve por HTTP sin redirigir a HTTPS',
    httpResponds: (n: number) => `HTTP responde ${n}`,
    noHttpResponse: 'No responde por HTTP (puede ser correcto si solo hay HTTPS)',
    headerAbsent: 'ausente',
    headersPresent: (n: number, total: number) => `${n}/${total} presentes`,
    dnsResolves: (a: number, aaaa: number) => `Resuelve · ${a} A, ${aaaa} AAAA`,
    dnsNoResolve: 'No resuelve',
    txtRecords: (n: number) => `${n} registro(s)`,
    rdapUnavailable: 'No disponible por RDAP para este TLD',
    expiresIn: (d: number) => `Vence en ${d}d`,
    domain: (v: string) => `Dominio: ${v}`,
    date: (v: string) => `Fecha: ${v}`,
    noRobots: (n: number) => `Sin robots.txt (${n})`,
    robotsNotReal: 'Responde 200 pero no parece robots.txt (posible catch-all)',
    robotsPresent: (withSitemap: boolean) => `Presente${withSitemap ? ' · declara Sitemap' : ''}`,
    lines: (n: number) => `${n} líneas`,
    sitemapDirectiveOk: 'Directiva Sitemap ✓',
    sitemapDirectiveMissing: 'Sin directiva Sitemap',
    noSitemap: (n: number) => `Sin sitemap.xml (${n})`,
    sitemapNotXml: 'Responde 200 pero no parece XML (posible catch-all)',
    sitemapIndex: 'Índice de sitemaps',
    sitemapUrls: (n: number) => `${n}+ URL${n === 1 ? '' : 's'}`,
    labels: {
      reachability: 'Disponibilidad HTTP',
      tls: 'Certificado TLS',
      httpsRedirect: 'Redirección a HTTPS',
      securityHeaders: 'Cabeceras de seguridad',
      dns: 'Registros DNS',
      domainExpiry: 'Vencimiento del dominio',
      seoMeta: 'Metadatos SEO',
      performance: 'Rendimiento básico',
      lighthouse: 'Lighthouse (PageSpeed Insights)',
      accessibility: 'Accesibilidad (heurística)',
    },
  }

  const en: typeof es = {
    unexpectedError: 'Unexpected error',
    timeout: (s2: number) => `Timeout (>${s2}s)`,
    finalUrl: (u: string) => `Final URL: ${u}`,
    redirected: 'Redirects were followed',
    notRedirected: 'No redirects',
    server: (v: string) => `Server: ${v}`,
    htmlDownloadFail: 'Could not download the HTML',
    seoAllPresent: 'title, description, and canonical present',
    seoMissing: (list: string) => `Missing: ${list}`,
    metaDescription: 'meta description',
    perfFail: 'Could not measure performance',
    linkedScripts: (n: number) => `Linked scripts: ${n}`,
    stylesheets: (n: number) => `Stylesheets: ${n}`,
    images: (n: number) => `Images: ${n}`,
    htmlSize: (kb: string) => `HTML size: ${kb}KB`,
    htmlParseFail: 'Could not parse the HTML',
    missingLang: 'Missing lang attribute on <html>',
    imgsNoAlt: (n: number) => `${n} image(s) without alt`,
    inputsNoLabel: (n: number) => `${n} field(s) without label/aria-label`,
    noH1: 'No <h1>',
    multipleH1: (n: number) => `${n} <h1> tags (there should be one)`,
    genericLinks: (n: number) => `${n} link(s) with generic text`,
    a11yClean: 'No heuristic findings (does not replace an axe-core audit)',
    a11yFindings: (n: number) => `${n} heuristic finding(s)`,
    a11yNote: 'Heuristic check over static HTML — does not replace axe-core',
    psiNotConfigured: 'Not configured (PSI_API_KEY missing)',
    psiNeedsKey: 'Requires a free Google PageSpeed Insights key to run real Lighthouse.',
    psiResponded: (n: number) => `PageSpeed Insights responded ${n}`,
    psiNoData: 'PageSpeed Insights response has no Lighthouse data',
    psiSummary: (p: string, a: string, s2: string) => `Performance ${p} · Accessibility ${a} · SEO ${s2}`,
    psiPerformance: (v: string) => `Performance: ${v}/100`,
    psiAccessibility: (v: string) => `Accessibility: ${v}/100`,
    psiBestPractices: (v: string) => `Best practices: ${v}/100`,
    psiSeo: (v: string) => `SEO: ${v}/100`,
    notHttps: 'The target does not use HTTPS',
    tlsUnreadable: 'Could not read the TLS certificate',
    expiredAgo: (d: number) => `Expired ${d}d ago`,
    validExpiresIn: (d: number) => `Valid · expires in ${d}d`,
    issuer: (v: string) => `Issuer: ${v}`,
    subject: (v: string) => `Subject: ${v}`,
    validity: (a: string, b: string) => `Validity: ${a} → ${b}`,
    protocol: (v: string) => `Protocol: ${v}`,
    redirectsToHttps: (n: number) => `Redirects to HTTPS (${n})`,
    redirectsNotHttps: (n: number) => `Redirects, but not to HTTPS (${n})`,
    servesHttpNoRedirect: 'Serves over HTTP without redirecting to HTTPS',
    httpResponds: (n: number) => `HTTP responds ${n}`,
    noHttpResponse: 'No response over HTTP (may be correct if it is HTTPS-only)',
    headerAbsent: 'absent',
    headersPresent: (n: number, total: number) => `${n}/${total} present`,
    dnsResolves: (a: number, aaaa: number) => `Resolves · ${a} A, ${aaaa} AAAA`,
    dnsNoResolve: 'Does not resolve',
    txtRecords: (n: number) => `${n} record(s)`,
    rdapUnavailable: 'Not available over RDAP for this TLD',
    expiresIn: (d: number) => `Expires in ${d}d`,
    domain: (v: string) => `Domain: ${v}`,
    date: (v: string) => `Date: ${v}`,
    noRobots: (n: number) => `No robots.txt (${n})`,
    robotsNotReal: 'Responds 200 but does not look like robots.txt (possible catch-all)',
    robotsPresent: (withSitemap: boolean) => `Present${withSitemap ? ' · declares Sitemap' : ''}`,
    lines: (n: number) => `${n} lines`,
    sitemapDirectiveOk: 'Sitemap directive ✓',
    sitemapDirectiveMissing: 'No Sitemap directive',
    noSitemap: (n: number) => `No sitemap.xml (${n})`,
    sitemapNotXml: 'Responds 200 but does not look like XML (possible catch-all)',
    sitemapIndex: 'Sitemap index',
    sitemapUrls: (n: number) => `${n}+ URL${n === 1 ? '' : 's'}`,
    labels: {
      reachability: 'HTTP availability',
      tls: 'TLS certificate',
      httpsRedirect: 'HTTPS redirect',
      securityHeaders: 'Security headers',
      dns: 'DNS records',
      domainExpiry: 'Domain expiry',
      seoMeta: 'SEO metadata',
      performance: 'Basic performance',
      lighthouse: 'Lighthouse (PageSpeed Insights)',
      accessibility: 'Accessibility (heuristic)',
    },
  }

  return locale === 'en' ? en : es
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

// ── HTML compartido para pruebas de SEO/rendimiento/accesibilidad ──────────
// Cada prueba recibe un `getHtml` memoizado por invocación de diagnosticSuite(), para
// evitar tanto requests duplicados como el compartir estado entre análisis concurrentes
// de dominios distintos (una función serverless puede atender varias solicitudes a la vez).

type HtmlSnapshot = { html: string; ttfb: number; bytes: number; contentType: string }
type GetHtml = (t: DiagnosticTarget) => Promise<HtmlSnapshot | null>

function makeHtmlFetcher(): GetHtml {
  let cached: Promise<HtmlSnapshot | null> | null = null
  return (t: DiagnosticTarget) => {
    if (cached) return cached
    cached = (async () => {
      try {
        const started = Date.now()
        const res = await fetchWithTimeout(t.url, { redirect: 'follow' })
        const ttfb = Date.now() - started
        const html = await res.text()
        return { html, ttfb, bytes: html.length, contentType: res.headers.get('content-type') ?? '' }
      } catch {
        return null
      }
    })()
    return cached
  }
}

/** Meta tags de SEO: title, description, canonical, Open Graph, lang. */
async function testSeoMeta(t: DiagnosticTarget, getHtml: GetHtml): Promise<Outcome> {
  const snap = await getHtml(t)
  if (!snap) return { status: 'fail', summary: 'No se pudo descargar el HTML' }
  const { html } = snap
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()
  const description = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]?.trim()
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i)?.[1]?.trim()
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i)?.[1]?.trim()
  const lang = html.match(/<html[^>]+lang=["']([^"']*)["']/i)?.[1]?.trim()

  const missing: string[] = []
  if (!title) missing.push('title')
  if (!description) missing.push('meta description')
  if (!canonical) missing.push('canonical')

  return {
    status: missing.length === 0 ? 'pass' : missing.length >= 2 ? 'warn' : 'warn',
    summary: missing.length === 0 ? 'title, description y canonical presentes' : `Falta: ${missing.join(', ')}`,
    details: [
      `Title: ${title ?? '—'}`,
      `Description: ${description ?? '—'}`,
      `Canonical: ${canonical ?? '—'}`,
      `Open Graph title: ${ogTitle ?? '—'}`,
      `lang: ${lang ?? '—'}`,
    ],
  }
}

/** Rendimiento básico: TTFB, tamaño de respuesta y conteo de recursos enlazados. */
async function testPerformance(t: DiagnosticTarget, getHtml: GetHtml): Promise<Outcome> {
  const snap = await getHtml(t)
  if (!snap) return { status: 'fail', summary: 'No se pudo medir el rendimiento' }
  const { html, ttfb, bytes } = snap
  const scripts = (html.match(/<script[^>]+src=/gi) ?? []).length
  const styles = (html.match(/<link[^>]+rel=["']stylesheet["']/gi) ?? []).length
  const images = (html.match(/<img\b/gi) ?? []).length
  const status: DiagnosticStatus = ttfb > 3000 ? 'fail' : ttfb > 1500 ? 'warn' : 'pass'
  return {
    status,
    summary: `TTFB ${ttfb}ms · ${(bytes / 1024).toFixed(1)}KB HTML`,
    details: [
      `Scripts enlazados: ${scripts}`,
      `Hojas de estilo: ${styles}`,
      `Imágenes: ${images}`,
      `Tamaño del HTML: ${(bytes / 1024).toFixed(1)}KB`,
    ],
  }
}

const GENERIC_LINK_TEXT = /^(click here|leer m[aá]s|read more|aqu[ií]|here|more|m[aá]s)$/i

/** Heurísticas de accesibilidad sobre el HTML estático (no reemplaza una auditoría con axe-core). */
async function testAccessibilityHeuristics(t: DiagnosticTarget, getHtml: GetHtml): Promise<Outcome> {
  const snap = await getHtml(t)
  if (!snap) return { status: 'fail', summary: 'No se pudo analizar el HTML' }
  const { html } = snap

  const lang = /<html[^>]+lang=["'][^"']+["']/i.test(html)

  const imgs = html.match(/<img\b[^>]*>/gi) ?? []
  const imgsWithoutAlt = imgs.filter((tag) => !/\balt\s*=/i.test(tag)).length

  const inputs = html.match(/<(input|textarea)\b[^>]*>/gi) ?? []
  const inputsWithoutLabel = inputs.filter((tag) => {
    if (/type=["']hidden["']/i.test(tag)) return false
    if (/aria-label\s*=/i.test(tag) || /aria-labelledby\s*=/i.test(tag)) return false
    const id = tag.match(/\bid=["']([^"']+)["']/i)?.[1]
    if (id && new RegExp(`<label[^>]+for=["']${id}["']`, 'i').test(html)) return false
    return true
  }).length

  const h1Count = (html.match(/<h1\b/gi) ?? []).length

  const linkTexts = [...html.matchAll(/<a\b[^>]*>([^<]*)<\/a>/gi)].map((m) => m[1].trim())
  const genericLinks = linkTexts.filter((text) => GENERIC_LINK_TEXT.test(text)).length

  const issues: string[] = []
  if (!lang) issues.push('Falta atributo lang en <html>')
  if (imgsWithoutAlt > 0) issues.push(`${imgsWithoutAlt} imagen(es) sin alt`)
  if (inputsWithoutLabel > 0) issues.push(`${inputsWithoutLabel} campo(s) sin label/aria-label`)
  if (h1Count === 0) issues.push('Sin <h1>')
  if (h1Count > 1) issues.push(`${h1Count} etiquetas <h1> (debería haber una)`)
  if (genericLinks > 0) issues.push(`${genericLinks} enlace(s) con texto genérico`)

  return {
    status: issues.length === 0 ? 'pass' : issues.length >= 3 ? 'fail' : 'warn',
    summary:
      issues.length === 0
        ? 'Sin hallazgos heurísticos (no reemplaza una auditoría axe-core)'
        : `${issues.length} hallazgo(s) heurístico(s)`,
    details: [...issues, 'Chequeo heurístico sobre HTML estático — no reemplaza axe-core'],
  }
}

const PSI_TIMEOUT_MS = 28_000
const PSI_CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'] as const

/** Reporte Lighthouse real vía la API de Google PageSpeed Insights (requiere PSI_API_KEY). */
async function testLighthouse(t: DiagnosticTarget): Promise<Outcome> {
  const key = serverEnv('PSI_API_KEY')
  if (!key) {
    return {
      status: 'info',
      summary: 'No configurado (falta PSI_API_KEY)',
      details: ['Requiere una clave gratuita de Google PageSpeed Insights para correr Lighthouse real.'],
    }
  }

  const psiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
  psiUrl.searchParams.set('url', t.url)
  psiUrl.searchParams.set('key', key)
  psiUrl.searchParams.set('strategy', 'mobile')
  for (const c of PSI_CATEGORIES) psiUrl.searchParams.append('category', c)

  const res = await fetchWithTimeout(psiUrl.toString(), { timeoutMs: PSI_TIMEOUT_MS })
  if (!res.ok) {
    drain(res)
    return { status: 'fail', summary: `PageSpeed Insights respondió ${res.status}` }
  }
  const data = await res.json().catch(() => null)
  const categories = data?.lighthouseResult?.categories
  if (!categories) return { status: 'fail', summary: 'Respuesta de PageSpeed Insights sin datos de Lighthouse' }

  const pct = (score: number | null | undefined) => (score == null ? null : Math.round(score * 100))
  const scores = {
    performance: pct(categories.performance?.score),
    accessibility: pct(categories.accessibility?.score),
    bestPractices: pct(categories['best-practices']?.score),
    seo: pct(categories.seo?.score),
  }

  const audits = data.lighthouseResult?.audits ?? {}
  const lcp = audits['largest-contentful-paint']?.displayValue
  const cls = audits['cumulative-layout-shift']?.displayValue
  const tbt = audits['total-blocking-time']?.displayValue

  const perf = scores.performance ?? 0
  const status: DiagnosticStatus = perf >= 90 ? 'pass' : perf >= 50 ? 'warn' : 'fail'

  return {
    status,
    summary: `Rendimiento ${scores.performance ?? '—'} · Accesibilidad ${scores.accessibility ?? '—'} · SEO ${scores.seo ?? '—'}`,
    details: [
      `Rendimiento: ${scores.performance ?? '—'}/100`,
      `Accesibilidad: ${scores.accessibility ?? '—'}/100`,
      `Buenas prácticas: ${scores.bestPractices ?? '—'}/100`,
      `SEO: ${scores.seo ?? '—'}/100`,
      `LCP: ${lcp ?? '—'} · CLS: ${cls ?? '—'} · TBT: ${tbt ?? '—'}`,
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
        issuer: toSingleString(cert.issuer?.O) ?? toSingleString(cert.issuer?.CN) ?? null,
        subject: toSingleString(cert.subject?.CN) ?? null,
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

const toSingleString = (v: string | string[] | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

// ── Orquestador ─────────────────────────────────────────────────────────────

/** Suite completa de pruebas para un objetivo. Cada entrada corre en paralelo. */
export function diagnosticSuite(t: DiagnosticTarget): { id: string; label: string; run: () => Promise<DiagnosticResult> }[] {
  const getHtml = makeHtmlFetcher()
  const defs: { id: string; label: string; fn: (t: DiagnosticTarget) => Promise<Outcome> }[] = [
    { id: 'reachability', label: 'Disponibilidad HTTP', fn: testReachability },
    { id: 'tls', label: 'Certificado TLS', fn: testTls },
    { id: 'https-redirect', label: 'Redirección a HTTPS', fn: testHttpsRedirect },
    { id: 'security-headers', label: 'Cabeceras de seguridad', fn: testSecurityHeaders },
    { id: 'dns', label: 'Registros DNS', fn: testDns },
    { id: 'domain-expiry', label: 'Vencimiento del dominio', fn: testDomainExpiry },
    { id: 'robots', label: 'robots.txt', fn: testRobots },
    { id: 'sitemap', label: 'sitemap.xml', fn: testSitemap },
    { id: 'seo-meta', label: 'Metadatos SEO', fn: (target) => testSeoMeta(target, getHtml) },
    { id: 'performance', label: 'Rendimiento básico', fn: (target) => testPerformance(target, getHtml) },
    { id: 'lighthouse', label: 'Lighthouse (PageSpeed Insights)', fn: testLighthouse },
    { id: 'accessibility', label: 'Accesibilidad (heurística)', fn: (target) => testAccessibilityHeuristics(target, getHtml) },
  ]
  return defs.map((d) => ({ id: d.id, label: d.label, run: () => timed(d.id, d.label, () => d.fn(t)) }))
}
