import { createHmac, timingSafeEqual } from 'node:crypto'

// Sesión de demo del panel: deja explorar /admin con datos ficticios y SIN
// capacidad de escritura. No es autenticación — es un pase anónimo firmado para
// que nadie pueda fabricarse uno con TTL arbitrario ni reutilizarlo tras vencer.
//
// La garantía real de aislamiento NO vive aquí sino en dos capas independientes:
//  1. Los datos salen de una base Turso distinta (ver src/db/index.ts). Aun con
//     un pase válido, las queries no alcanzan la base real.
//  2. El middleware solo permite GET y bloquea las rutas sensibles.
// Este módulo es solo la primera de las tres. Ninguna basta sola.

export const DEMO_COOKIE = 'demo_session'
export const DEMO_TTL_SEC = 2 * 60 * 60

/** Firma el pase: `<expUnixSec>.<hmac>`. El TTL va DENTRO de lo firmado. */
export function signDemoToken(secret: string, expiresAtSec: number): string {
  const payload = String(Math.floor(expiresAtSec))
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export function createDemoToken(secret: string, nowMs = Date.now()): string {
  return signDemoToken(secret, Math.floor(nowMs / 1000) + DEMO_TTL_SEC)
}

/**
 * Verifica firma y vigencia. Devuelve false ante cualquier duda: token
 * malformado, firma inválida, expirado o secreto ausente.
 */
export function verifyDemoToken(
  secret: string | undefined,
  token: string | undefined | null,
  nowMs = Date.now()
): boolean {
  if (!secret || !token) return false

  const dot = token.lastIndexOf('.')
  if (dot <= 0) return false

  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!/^\d+$/.test(payload) || !/^[0-9a-f]+$/i.test(sig)) return false

  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  // Comparación en tiempo constante; longitudes distintas ⇒ rechazo directo
  // (timingSafeEqual lanza si difieren).
  if (sig.length !== expected.length) return false
  if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return false

  return Number(payload) * 1000 > nowMs
}

// Rutas vetadas en demo AUNQUE sean GET. Esto no es paranoia decorativa: los
// endpoints que revelan la bóveda (`…/services/<id>/secrets`) y las variables de
// entorno (`…/projects/<id>/envvars`) son GET, así que "solo lectura" por sí solo
// NO los detendría. Van por patrón porque cuelgan de rutas con parámetros.
//
// Motivo por grupo:
//  · secrets/envvars → revelan credenciales descifradas.
//  · backup/upload → vuelcan o escriben la base entera / el blob store.
//  · passkeys/sessions/webauthn → superficie de la seguridad de la cuenta real.
//  · lab/chaos → inyecta fallos reales en el sitio; jamás para un anónimo.
const DEMO_BLOCKED_PATTERNS: RegExp[] = [
  /\/secrets$/,
  /\/envvars$/,
  /^\/(api\/)?admin\/backup/,
  /^\/api\/admin\/upload/,
  /^\/(api\/)?admin\/passkeys/,
  /^\/(api\/)?admin\/sessions/,
  /^\/api\/admin\/webauthn/,
  /^\/api\/admin\/lab\/chaos/,
  // Cobros de campo: herramienta operativa real (genera links de pago y expone
  // teléfonos de clientes). La demo enseña el panel, no mi caja registradora.
  /^\/cobrar/,
  /^\/api\/admin\/cobros/,
]

/** ¿La ruta está vetada en modo demo (aun siendo GET)? */
export function isDemoBlockedPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return DEMO_BLOCKED_PATTERNS.some((re) => re.test(path))
}

/** Solo lectura: cualquier método que pueda mutar queda fuera. */
export function isDemoAllowedMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD'
}
