// Endpoints públicos propios que /status sondea EN VIVO cuando la base no
// responde y no se puede leer la tabla `monitors`.
//
// No es una copia de esa tabla ni pretende serlo: es la lista mínima de
// superficies públicas cuya disponibilidad se puede comprobar desde el propio
// servidor sin ninguna credencial. Los monitores reales (que incluyen servicios
// de terceros y umbrales por servicio) siguen viviendo en base de datos; esto
// es el bote salvavidas.
//
// Por qué está declarada en código y no en la instantánea: la instantánea
// guarda MEDICIONES, que caducan. Esto son DESTINOS, que no. Un destino
// declarado aquí se puede sondear hoy y dar un dato de hoy; una medición
// guardada en un JSON solo puede repetir la de ayer.

export type DestinoRespaldo = {
  id: number
  nombre: string
  ruta: string
  /** Un endpoint de salud debe responder rápido; una página completa, no tanto. */
  umbralMs: number
  /** Texto que debe aparecer en el cuerpo. Detecta el "200 que en realidad falló". */
  textoEsperado?: string
}

/**
 * El origen sale de la env var pública del sitio, con el dominio real como
 * respaldo. En un preview de Vercel esto apunta al preview, que es justo lo que
 * se quiere: la página de estado de un despliegue habla de ESE despliegue.
 */
export function origenPublico(): string {
  const url =
    (typeof process !== 'undefined' && (process.env.PUBLIC_SITE_URL || process.env.VERCEL_URL)) ||
    'codebymike.tech'
  return url.startsWith('http') ? url.replace(/\/$/, '') : `https://${url.replace(/\/$/, '')}`
}

export const DESTINOS_RESPALDO: DestinoRespaldo[] = [
  { id: 9001, nombre: 'Portada', ruta: '/', umbralMs: 1500 },
  { id: 9002, nombre: 'Salud de la aplicación', ruta: '/api/health', umbralMs: 800 },
  { id: 9003, nombre: 'Ingeniería', ruta: '/engineering', umbralMs: 1800 },
  { id: 9004, nombre: 'Notas técnicas', ruta: '/notes', umbralMs: 1800 },
  { id: 9005, nombre: 'Documentación', ruta: '/docs', umbralMs: 1800 },
  { id: 9006, nombre: 'Herramientas', ruta: '/tools', umbralMs: 1800 },
]
