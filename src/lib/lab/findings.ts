import { createHash } from 'node:crypto'

// Lógica pura de los hallazgos de seguridad/accesibilidad. Sin BD ni red: los
// parsers convierten la salida cruda de cada herramienta (npm audit, axe) en
// hallazgos normalizados, y el fingerprint permite deduplicar entre corridas.
// La escritura vive en el endpoint de ingesta; aquí solo transformamos.

export const FINDING_SOURCES = [
  'npm-audit',
  'codeql',
  'semgrep',
  'snyk',
  'zap',
  'axe',
  'lighthouse',
] as const
export type FindingSource = (typeof FINDING_SOURCES)[number]

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const
export type Severity = (typeof SEVERITIES)[number]

export const FINDING_STATUSES = ['open', 'resolved', 'accepted'] as const
export type FindingStatus = (typeof FINDING_STATUSES)[number]

export type NormalizedFinding = {
  source: FindingSource
  severity: Severity
  title: string
  description: string | null
  route: string | null
  ruleId: string | null
}

/**
 * Identidad estable de un hallazgo entre corridas: mismo problema en el mismo
 * sitio ⇒ mismo fingerprint, así reingerir no crea duplicados. Deliberadamente
 * NO incluye severidad ni título: si npm sube la severidad de una vuln o cambia
 * su texto, sigue siendo el mismo hallazgo, no uno nuevo.
 */
export function fingerprint(source: string, ruleId: string | null, route: string | null): string {
  return createHash('sha256')
    .update(`${source}|${ruleId ?? ''}|${route ?? ''}`)
    .digest('hex')
    .slice(0, 32)
}

/** Normaliza cualquier texto de severidad a nuestra escala; desconocido → 'info'. */
export function normalizeSeverity(raw: unknown): Severity {
  const s = String(raw ?? '').toLowerCase()
  if (s === 'critical') return 'critical'
  if (s === 'high' || s === 'serious') return 'high'
  if (s === 'moderate' || s === 'medium') return 'medium'
  if (s === 'low' || s === 'minor') return 'low'
  return 'info'
}

/** Recorta y limpia un texto libre para no guardar payloads enormes. */
const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

/**
 * Valida y normaliza un hallazgo ya con forma de objeto (el que manda el job de
 * CI directamente, o el que producen los parsers de abajo). Devuelve null si le
 * falta lo mínimo (source válido + título).
 */
export function normalizeFinding(raw: unknown): NormalizedFinding | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const source = FINDING_SOURCES.includes(r.source as FindingSource)
    ? (r.source as FindingSource)
    : null
  const title = clean(r.title, 300)
  if (!source || !title) return null

  return {
    source,
    severity: normalizeSeverity(r.severity),
    title,
    description: clean(r.description, 2000),
    route: clean(r.route, 300),
    ruleId: clean(r.ruleId, 200),
  }
}

/**
 * Parsea la salida de `npm audit --json` (formato v2/v7+). Un hallazgo por
 * vulnerabilidad de paquete; la `route` es el nombre del paquete.
 */
export function parseNpmAudit(json: unknown): NormalizedFinding[] {
  if (!json || typeof json !== 'object') return []
  const vulns = (json as Record<string, unknown>).vulnerabilities
  if (!vulns || typeof vulns !== 'object') return []

  const out: NormalizedFinding[] = []
  for (const [name, v] of Object.entries(vulns as Record<string, Record<string, unknown>>)) {
    // `via` puede ser strings (vuln transitiva) u objetos (vuln directa con detalle).
    const via = Array.isArray(v.via) ? v.via : []
    const detail = via.find((x) => x && typeof x === 'object') as Record<string, unknown> | undefined

    out.push({
      source: 'npm-audit',
      severity: normalizeSeverity(v.severity),
      title: detail?.title
        ? `${name}: ${clean(detail.title, 260)}`
        : `Vulnerabilidad en ${name}`,
      description: clean(detail?.url, 2000),
      route: name,
      // La CWE/advisory da un ruleId estable; si no, el nombre del paquete.
      ruleId: detail?.source != null ? `npm-${detail.source}` : `npm-${name}`,
    })
  }
  return out
}

type AxeViolation = {
  id?: unknown
  impact?: unknown
  help?: unknown
  description?: unknown
  nodes?: unknown
}

/**
 * Parsea las violaciones de axe-core (`results.violations`) para una página.
 * `pageUrl` acota la ruta; una misma regla en dos páginas son dos hallazgos.
 */
export function parseAxeViolations(violations: unknown, pageUrl: string): NormalizedFinding[] {
  if (!Array.isArray(violations)) return []

  return violations.map((raw): NormalizedFinding => {
    const v = (raw ?? {}) as AxeViolation
    const nodes = Array.isArray(v.nodes) ? v.nodes.length : 0
    return {
      source: 'axe',
      severity: normalizeSeverity(v.impact),
      title: clean(v.help, 260) ?? `Regla de accesibilidad ${clean(v.id, 60) ?? '?'}`,
      description: [clean(v.description, 1500), nodes ? `${nodes} elemento(s) afectado(s)` : null]
        .filter(Boolean)
        .join(' · ') || null,
      route: pageUrl.slice(0, 300),
      ruleId: clean(v.id, 200),
    }
  })
}

/** Transiciones de estado permitidas al marcar un hallazgo desde el panel. */
export function canSetStatus(from: FindingStatus, to: FindingStatus): boolean {
  if (from === to) return false
  // Cualquier estado puede reabrirse; abierto puede resolverse o aceptarse; y se
  // puede pasar entre resolved/accepted (reclasificar). Todo salvo no-op vale.
  return FINDING_STATUSES.includes(to)
}

/** Cuenta hallazgos por severidad, solo los abiertos (lo que exige atención). */
export function countOpenBySeverity(
  findings: { status: FindingStatus; severity: Severity }[]
): Record<Severity, number> {
  const acc: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  for (const f of findings) if (f.status === 'open') acc[f.severity]++
  return acc
}
