// Reescritura de las rutas relativas de un deck exportado.
//
// El export de Claude Design no es un archivo, es una carpeta: el HTML
// referencia `./support.js`, `./deck-stage.js`, `./image-slot.js` y una
// veintena de `./uploads/*.png` que pesan decenas de MB.
//
// La clave para no tener que servir carpetas enteras es que la restricción de
// mismo origen **solo aplica al documento HTML**: viene de acceder a
// `iframe.contentDocument`, no de cargar recursos. Las imágenes, el JS y las
// fuentes pueden venir de donde sea.
//
// Así que al subir se hace lo siguiente: cada asset va a Blob PÚBLICO y en el
// HTML se sustituye su ruta relativa por la URL del blob. Lo que se guarda como
// deck sigue siendo UN archivo HTML —de unos 100 KB— servido en `/decks/:id.html`
// desde nuestro origen, igual que antes. Los 30 MB de imágenes nunca pasan por
// una función: los sirve el CDN de Blob directamente al navegador.
//
// Módulo PURO: no toca Blob ni la base. Recibe el HTML y un mapa ya resuelto.

/** Atributos que pueden contener una ruta a un recurso del deck. */
const URL_ATTRS = ['src', 'href', 'from', 'poster', 'data-src']

const ATTR_RE = new RegExp(`\\b(${URL_ATTRS.join('|')})\\s*=\\s*("([^"]*)"|'([^']*)')`, 'gi')
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi

/**
 * ¿Esta referencia apunta a un archivo de la carpeta del deck? Se descarta todo
 * lo que ya sabe resolverse solo: absolutas, protocolo-relativas, data URIs,
 * anclas y esquemas raros.
 */
export function isRelativeAssetRef(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  if (v.startsWith('#')) return false
  if (v.startsWith('//')) return false
  if (v.startsWith('/')) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return false // http:, data:, blob:, mailto:…
  return true
}

/**
 * Ruta canónica de un asset, tal como se usará de clave. Quita el `./` inicial
 * y la query/hash, y normaliza los `../` — dos referencias al mismo archivo
 * escritas distinto deben resolver a la misma clave o se subiría dos veces.
 */
export function normalizeAssetPath(ref: string): string {
  const clean = ref.trim().split(/[?#]/)[0]
  const parts: string[] = []
  for (const seg of clean.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      parts.pop()
      continue
    }
    parts.push(seg)
  }
  return parts.join('/')
}

/** Todas las rutas relativas que el HTML necesita, sin repetir. */
export function collectAssetRefs(html: string): string[] {
  const found = new Set<string>()

  for (const m of html.matchAll(ATTR_RE)) {
    const raw = m[3] ?? m[4] ?? ''
    if (isRelativeAssetRef(raw)) found.add(normalizeAssetPath(raw))
  }
  for (const m of html.matchAll(CSS_URL_RE)) {
    const raw = m[2] ?? ''
    if (isRelativeAssetRef(raw)) found.add(normalizeAssetPath(raw))
  }

  found.delete('')
  return [...found]
}

/**
 * Sustituye cada ruta relativa por su URL definitiva. Una ruta sin entrada en
 * el mapa se deja intacta a propósito: es preferible un recurso roto y visible
 * a una sustitución inventada que rompa el deck de una forma más difícil de
 * diagnosticar.
 */
export function rewriteAssetUrls(html: string, urls: Record<string, string>): string {
  const resolve = (raw: string): string | null => {
    if (!isRelativeAssetRef(raw)) return null
    const key = normalizeAssetPath(raw)
    return urls[key] ?? null
  }

  let out = html.replace(ATTR_RE, (match, attr: string, _quoted: string, dq?: string, sq?: string) => {
    const raw = dq ?? sq ?? ''
    const url = resolve(raw)
    if (!url) return match
    // Se emite siempre con comillas dobles: las URLs de Blob no las contienen.
    return `${attr}="${url}"`
  })

  out = out.replace(CSS_URL_RE, (match, _q: string, raw: string) => {
    const url = resolve(raw)
    return url ? `url("${url}")` : match
  })

  return out
}

/** Rutas que el HTML pide pero que no venían en la carpeta. */
export function missingAssets(html: string, available: Iterable<string>): string[] {
  const have = new Set([...available].map(normalizeAssetPath))
  return collectAssetRefs(html).filter((p) => !have.has(p))
}
