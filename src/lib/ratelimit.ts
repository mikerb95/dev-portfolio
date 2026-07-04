// Rate limit simple en memoria (ventana fija por clave). Es por instancia de
// función — suficiente para frenar spam casual en endpoints públicos. Para
// protección real a escala, complementar con reglas de rate limit del WAF de Vercel.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 10_000

/** true si el request cabe en la ventana; false si se excedió el límite. */
export function rateLimit(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now()

  // Poda perezosa para que el Map no crezca sin límite en instancias longevas.
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k)
    if (buckets.size > MAX_KEYS) buckets.clear()
  }

  const b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (b.count >= limit) return false
  b.count++
  return true
}

/** IP del cliente para usar como clave (Vercel pone la real en x-forwarded-for). */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
