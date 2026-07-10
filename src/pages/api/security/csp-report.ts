import type { APIRoute } from 'astro'
import { clientIp } from '../../../lib/ratelimit'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'
import { recordSecurityEvent } from '../../../lib/security/events'
import { parseCspReports } from '../../../lib/security/csp-report'

// Receptor de reportes de violación de CSP (report-uri / Reporting API). La
// CSP ya corre en modo ENFORCE (el navegador ya bloqueó lo que sea); esto solo
// añade observabilidad continua — si un futuro cambio rompe la CSP, o alguien
// intenta inyectar algo que la política ya bloquea, queda registrado.
//
// Sin auth (los navegadores no mandan credenciales en estos POST). Rate limit
// durable para que este endpoint no se pueda usar para llenar la tabla de
// eventos con spam.

export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request)
  const { allowed } = await enforceLimit(`csp-report:${ip}`, { limit: 20, windowMs: 60_000 })
  if (!allowed) return new Response(null, { status: 204 })

  try {
    const body = await request.json()
    const reports = parseCspReports(body)
    for (const r of reports.slice(0, 5)) {
      void recordSecurityEvent({
        classification: { category: 'csp_violation', severity: 'low', ruleId: 'csp.report' },
        ip,
        method: 'REPORT',
        path: r.documentPath ?? '/',
        query: r.blockedUri ? `blocked=${r.blockedUri.slice(0, 150)}` : null,
        userAgent: request.headers.get('user-agent'),
        country: request.headers.get('x-vercel-ip-country'),
        asn: request.headers.get('x-vercel-ip-as-number'),
        statusCode: null,
        action: 'logged',
      })
    }
  } catch {
    // Fail-open: un body inesperado no debe producir un error visible.
  }
  return new Response(null, { status: 204 })
}
