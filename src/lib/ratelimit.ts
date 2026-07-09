// Helper de identidad de cliente para el rate limiting. El limiter en sí vive
// ahora en lib/security/ratelimit-durable.ts (dos capas: memoria + Turso), que
// reemplazó al limiter en memoria por instancia que había aquí.

/** IP del cliente para usar como clave (Vercel pone la real en x-forwarded-for). */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
