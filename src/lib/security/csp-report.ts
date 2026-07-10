// Parseo puro de reportes de violación de CSP. El navegador los envía en dos
// formatos según su antigüedad: el legacy `application/csp-report` (objeto
// envuelto en "csp-report") y el nuevo Reporting API `application/reports+json`
// (array de reportes con "type":"csp-violation"). Ver
// docs/plan-security-observability.md — la CSP ya está en modo enforce; esto
// añade observabilidad continua sin cambiar el bloqueo del navegador.

export type ParsedCspReport = {
  documentPath: string | null
  violatedDirective: string | null
  blockedUri: string | null
  disposition: string | null
}

function pathOnly(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri) return null
  try {
    return new URL(uri).pathname
  } catch {
    return uri.startsWith('/') ? uri : null
  }
}

/** Extrae los campos relevantes de un único objeto de reporte legacy. */
function fromLegacy(obj: Record<string, unknown>): ParsedCspReport {
  const r = (obj['csp-report'] ?? {}) as Record<string, unknown>
  return {
    documentPath: pathOnly(r['document-uri']),
    violatedDirective: typeof r['violated-directive'] === 'string' ? r['violated-directive'] : (typeof r['effective-directive'] === 'string' ? r['effective-directive'] : null),
    blockedUri: typeof r['blocked-uri'] === 'string' ? r['blocked-uri'] : null,
    disposition: typeof r['disposition'] === 'string' ? r['disposition'] : null,
  }
}

/** Extrae los campos relevantes de un único objeto de reporte de Reporting API. */
function fromReportingApi(obj: Record<string, unknown>): ParsedCspReport {
  const body = (obj['body'] ?? {}) as Record<string, unknown>
  return {
    documentPath: pathOnly(obj['url']),
    violatedDirective: typeof body['effectiveDirective'] === 'string' ? body['effectiveDirective'] : null,
    blockedUri: typeof body['blockedURL'] === 'string' ? body['blockedURL'] : null,
    disposition: typeof body['disposition'] === 'string' ? body['disposition'] : null,
  }
}

/**
 * Parsea el body ya deserializado (JSON.parse) de un reporte CSP, en
 * cualquiera de los dos formatos. Devuelve una lista (el formato nuevo puede
 * traer varios reportes en un solo POST). Nunca lanza: entradas inesperadas
 * producen una lista vacía.
 */
export function parseCspReports(body: unknown): ParsedCspReport[] {
  try {
    if (Array.isArray(body)) {
      return body
        .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object' && (o as Record<string, unknown>)['type'] === 'csp-violation')
        .map(fromReportingApi)
    }
    if (body && typeof body === 'object' && 'csp-report' in (body as Record<string, unknown>)) {
      return [fromLegacy(body as Record<string, unknown>)]
    }
    return []
  } catch {
    return []
  }
}
