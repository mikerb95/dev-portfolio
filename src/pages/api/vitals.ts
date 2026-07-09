import type { APIRoute } from 'astro'
import { db } from '../../db'
import { webVitals } from '../../db/schema'

export const prerender = false

// Endpoint público de recolección de Core Web Vitals (RUM). Se llama con
// navigator.sendBeacon desde el navegador de cada visitante. Validamos con mano
// dura porque es público: métrica de un enum fijo, valor numérico acotado y
// ruta truncada sin query. No se guarda ninguna PII.

const METRICS = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB'])
const RATINGS = new Set(['good', 'needs-improvement', 'poor'])
// Cotas de cordura: descarta ruido/valores absurdos. CLS es adimensional (0–1+),
// el resto son milisegundos.
const MAX_VALUE = 600_000 // 10 min: cualquier cosa por encima es basura

export const POST: APIRoute = async ({ request }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(null, { status: 204 })
  }

  const b = body as Record<string, unknown>
  const metric = String(b?.metric ?? '')
  const value = Number(b?.value)

  // Fallos de validación se descartan en silencio (204): un beacon no espera
  // respuesta y no queremos dar pistas a quien intente abusar del endpoint.
  if (!METRICS.has(metric) || !Number.isFinite(value) || value < 0 || value > MAX_VALUE) {
    return new Response(null, { status: 204 })
  }

  const ratingRaw = String(b?.rating ?? '')
  const rating = RATINGS.has(ratingRaw) ? (ratingRaw as 'good' | 'needs-improvement' | 'poor') : null
  const path = typeof b?.path === 'string' ? b.path.split('?')[0]!.slice(0, 128) : null
  const navigationType = typeof b?.navigationType === 'string' ? b.navigationType.slice(0, 32) : null

  try {
    await db.insert(webVitals).values({
      metric: metric as 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB',
      value,
      rating,
      path,
      navigationType,
      createdAt: new Date(),
    })
  } catch {
    // Fail-open: la telemetría nunca debe romper la experiencia del visitante.
  }
  return new Response(null, { status: 204 })
}
