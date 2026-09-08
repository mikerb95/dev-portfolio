// Canonicalización de host: el sitio se mudó de codebymike.tech a
// codebymike.net (sep 2026). El .tech ya NO está en la lista: el 7 sep 2026 su
// registrador lo suspendió al no renovarse y delegó la zona entera a los
// nameservers de retención (`*.suspended-domain.com`), que responden 127.0.0.1
// para el dominio y todos sus subdominios. Ningún request con ese Host puede
// llegar ya a Vercel, así que redirigirlo no era una red de seguridad: era una
// regla muerta que hacía creer que los enlaces viejos seguían funcionando.
//
// Lo que queda son los duplicados del dominio NUEVO (su `www` y el alias fijo
// del proyecto), que sí resuelven y sí publicarían una copia indexable.
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
// La exención de `/api` se queda aunque el dominio viejo ya no exista: los
// hosts que siguen en la lista son alcanzables hoy, y una integración apuntada
// por error al alias del proyecto debe fallar de forma visible, no degradarse
// en silencio a un GET sin cabecera de autorización.

/** Host canónico de producción. */
export const HOST_CANONICO = 'codebymike.net'

/**
 * Hosts que deben mandar a producción. `www` del dominio nuevo incluido: no
 * queremos dos URLs indexables del mismo contenido.
 *
 * Se exporta porque integrations/canonical-redirect.mjs la reutiliza para
 * inyectar el mismo redirect en el CDN: una página prerenderizada es un archivo
 * que sirve el borde sin invocar jamás la función, así que este módulo solo
 * cubre lo que pasa por el middleware. Misma lista, dos capas, nunca dos copias.
 */
export const HOSTS_A_REDIRIGIR = new Set([
  'www.codebymike.net',
  // Alias fijo del proyecto en Vercel. Servía el sitio entero con 200 y sin
  // `noindex` (los previews sí lo llevan, este no): una copia indexable más.
  // No confundir con las URL por despliegue (dev-portfolio-<hash>.vercel.app),
  // que no están aquí porque el rollback de ci.yml las sondea.
  'mikerb95.vercel.app',
])

/** Prefijos que NUNCA se redirigen (ver cabecera). */
export const EXENTOS = ['/api/', '/_']

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
