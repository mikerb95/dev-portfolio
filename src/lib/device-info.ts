// Helpers puros (sin dependencias de DB) para el registro de dispositivos.
// Separados de device-sessions.ts para poder testearlos sin abrir Turso.

export const DEVICE_COOKIE = 'device_id'

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
