// Canonicalización de host: el sitio se mudó de codebymike.tech a
// codebymike.net (sep 2026) y los dos dominios siguen apuntando al mismo
// proyecto de Vercel.
//
// El redirect se hace aquí y no en la configuración de dominios de Vercel a
// propósito. Un redirect a nivel de dominio afecta TAMBIÉN a `/api/*`, y ahí
// hay tres cosas que un 308 rompe en silencio:
//
//  · Webhooks firmados de Wompi: son POST, y un cliente que sigue el redirect
//    puede degradarlo a GET o descartar el cuerpo. El evento se pierde y el
//    pago se queda a medias.
//  · Crons externos (cron-job.org): mandan `Authorization: Bearer`, y casi
//    todos los clientes HTTP quitan esa cabecera al saltar de host. El cron
//    devolvería 401 sin que nadie se entere.
//  · Los sondeos del propio monitor, que medirían la latencia del redirect en
//    vez de la del sitio.
//
// Así, las integraciones viejas que aún llaman al .tech siguen funcionando tal
// cual, mientras que personas y crawlers acaban siempre en el dominio nuevo.

/** Host canónico de producción. */
export const HOST_CANONICO = 'codebymike.net'

/**
 * Hosts que deben mandar a producción. `www` del dominio nuevo incluido: no
 * queremos dos URLs indexables del mismo contenido.
 */
const HOSTS_A_REDIRIGIR = new Set([
  'codebymike.tech',
  'www.codebymike.tech',
  'www.codebymike.net',
])

/** Prefijos que NUNCA se redirigen (ver cabecera). */
const EXENTOS = ['/api/', '/_']

export type EntradaCanonica = {
  host: string | null | undefined
  method: string
  pathname: string
  search: string
}

/**
 * URL absoluta a la que redirigir, o `null` si el request ya está donde debe.
 * Puro: no toca red ni entorno, para poder probar la tabla de casos entera.
 */
export function destinoCanonico({ host, method, pathname, search }: EntradaCanonica): string | null {
  if (method !== 'GET' && method !== 'HEAD') return null
  if (!host) return null

  // El Host trae el puerto en local y puede venir con mayúsculas.
  const hostname = host.toLowerCase().split(':')[0]
  if (!HOSTS_A_REDIRIGIR.has(hostname)) return null

  if (pathname === '/api' || EXENTOS.some((p) => pathname.startsWith(p))) return null

  return `https://${HOST_CANONICO}${pathname}${search}`
}
