// Rutas de un solo segmento que ya existen en la raíz del sitio. Módulo PURO.
//
// `src/pages/[pin].astro` es la última ruta en resolver: captura cualquier
// `/algo` que no haya coincidido con una página real. Astro ya resuelve las
// estáticas antes que las dinámicas, así que en la práctica un PIN nunca podría
// tapar una ruta existente - pero esta lista existe para el caso inverso, que
// sí es real: que un PIN generado COINCIDA con una ruta que se añada mañana y
// el público que escanee el QR aterrice en el portafolio en vez de en el deck.
//
// `tests/present-reserved.test.ts` cruza esta lista contra los archivos reales
// de `src/pages` y falla si alguien añade una ruta raíz sin registrarla aquí.

/**
 * Nombres tomados en la raíz: páginas, endpoints, directorios de `src/pages`,
 * y los archivos servidos desde `public/`. Todo en minúsculas y sin extensión,
 * porque la comparación se hace contra un PIN ya normalizado.
 */
export const RESERVED_ROOT_SEGMENTS: readonly string[] = [
  // Páginas y directorios de src/pages
  // La ficha SENA da nombre a una ruta de un solo segmento en la raíz, así que
  // compite con el espacio de los PIN igual que cualquier otra página.
  '3114731',
  '404',
  'admin',
  'api',
  'architecture',
  'c',
  'capacitacion',
  'capacitacion-ia',
  'certifications',
  'cobrar',
  'contact',
  'cv',
  'decks',
  'demo',
  'docs',
  'en',
  'engineering',
  'entrar',
  'feedback',
  'hola',
  'index',
  'lab',
  'log',
  'login',
  'logout',
  'mis-pagos',
  'notes',
  'paginas-web',
  'pay',
  'platziconf',
  'portal',
  'present',
  'projects',
  'remote',
  'security',
  'status',
  'tools',
  // Señuelos y archivos servidos en la raíz
  'admin.php',
  'wp-login.php',
  'assets',
  'favicon',
  'fonts',
  'robots.txt',
  'sitemap.xml',
  'rss.xml',
  'llms.txt',
  'videos',
  // Convenciones que un navegador o un bot piden sin que existan
  'well-known',
  '.well-known',
  '_astro',
  '_image',
]

const RESERVED = new Set(RESERVED_ROOT_SEGMENTS.map((s) => s.toLowerCase()))

/**
 * ¿Este PIN choca con algo que ya vive en la raíz? Compara también el prefijo
 * antes del primer punto, para que un PIN nunca pueda parecer un archivo.
 */
export function isReservedSegment(candidate: string): boolean {
  const seg = candidate.toLowerCase()
  if (RESERVED.has(seg)) return true
  return RESERVED.has(seg.split('.')[0])
}
