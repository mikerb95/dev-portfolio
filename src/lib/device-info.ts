// Helpers puros (sin dependencias de DB) para el registro de dispositivos.
// Separados de device-sessions.ts para poder testearlos sin abrir Turso.

import type { AstroCookies } from 'astro'

export const DEVICE_COOKIE = 'device_id'

/**
 * Identidad estable del dispositivo/sesión actual: el `sid` firmado en el JWT
 * si existe, o si no la cookie `device_id` (creándola si falta). La usan el
 * middleware (registro de sesiones) y el step-up de WebAuthn (para atar la
 * cookie de MFA al mismo id), así que deben calcularla igual siempre.
 */
export function resolveDeviceSessionId(sid: string | null | undefined, cookies: AstroCookies): string {
  if (sid) return sid
  let deviceCookie = cookies.get(DEVICE_COOKIE)?.value
  if (!deviceCookie) {
    deviceCookie = crypto.randomUUID()
    cookies.set(DEVICE_COOKIE, deviceCookie, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: import.meta.env.PROD,
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  return deviceCookie
}

/** IP del cliente a partir de los headers de proxy de Vercel. */
export function clientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return headers.get('x-real-ip') || null
}

/** Etiqueta legible "Navegador · SO" a partir del User-Agent. */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return 'Dispositivo desconocido'
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) && !/Chrome/.test(ua) ? 'Safari'
    : 'Navegador'
  const os =
    /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'SO desconocido'
  return `${browser} · ${os}`
}
