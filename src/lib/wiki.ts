// Wiki del repo (docs/wiki/*.md) servida dentro del panel en /admin/wiki.
//
// Los archivos se escriben para leerse en GitHub, así que sus enlaces son
// relativos al propio archivo: `08-seguridad-micro-siem.md#4-rate-limiting`
// entre páginas y `../../src/middleware.ts` hacia el código. Servidos tal cual
// desde /admin/wiki/<id>, los primeros darían 404 y los segundos apuntarían a
// rutas del sitio que no existen. Se reescriben aquí en vez de cambiar la
// sintaxis de la wiki: el mismo texto tiene que funcionar en los dos sitios.
//
// Módulo puro: sin BD ni astro:content, para poder probarlo sin build.

export const WIKI_BASE = '/admin/wiki'
export const WIKI_DIR = 'docs/wiki'
export const REPO_URL = 'https://github.com/mikerb95/dev-portfolio'

/** Id de la portada: el glob loader pasa los ids por github-slugger. */
export const WIKI_PORTADA = 'readme'

/**
 * Resuelve `rel` contra el directorio `base` (rutas de repo, sin barra
 * inicial). Devuelve null si se sale de la raíz del repo: un `../` de más no
 * puede convertirse en un enlace a otra cosa de GitHub.
 */
export function resolverRuta(base: string, rel: string): string | null {
  const partes = base.split('/').filter(Boolean)
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (partes.length === 0) return null
      partes.pop()
    } else {
      partes.push(seg)
    }
  }
  return partes.join('/')
}

/** Convierte el href de un archivo de la wiki en el href que sirve el panel. */
export function reescribirHref(href: string): string {
  // Absolutos, anclas, correo y protocolos: ya funcionan donde se pinten.
  if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) return href

  const corte = href.search(/[?#]/)
  const ruta = corte === -1 ? href : href.slice(0, corte)
  const resto = corte === -1 ? '' : href.slice(corte)

  const destino = resolverRuta(WIKI_DIR, ruta)
  if (destino === null) return href

  // Otra página de la wiki: se queda dentro del panel.
  const pagina = destino.match(/^docs\/wiki\/([^/]+)\.md$/i)
  if (pagina) {
    const id = pagina[1].toLowerCase()
    return `${id === WIKI_PORTADA ? WIKI_BASE : `${WIKI_BASE}/${id}`}${resto}`
  }

  // Cualquier otra cosa del repo se abre en GitHub, que sí sabe pintarla. El
  // repo es público, así que el enlace no expone nada que la wiki no diga ya.
  const tipo = ruta.endsWith('/') || destino === '' ? 'tree' : 'blob'
  return `${REPO_URL}/${tipo}/main/${destino}${resto}`
}

/**
 * Reescribe los `href` del HTML que Astro compiló desde el markdown. El HTML
 * viene del build (archivos del repo, no de un usuario), así que basta con
 * tocar los atributos; los enlaces a GitHub se abren en otra pestaña.
 */
export function reescribirEnlaces(html: string): string {
  return html.replace(/<a href="([^"]*)"/g, (_m, href: string) => {
    const nuevo = reescribirHref(href.replace(/&amp;/g, '&')).replace(/&/g, '&amp;')
    const externo = /^https?:\/\//i.test(nuevo)
    return `<a href="${nuevo}"${externo ? ' target="_blank" rel="noopener noreferrer"' : ''}`
  })
}

/**
 * Separa el primer `<h1>` del cuerpo: el layout del panel ya pinta el título
 * como h1 y dos h1 por página rompen el esquema de encabezados que audita axe.
 */
export function separarTitulo(html: string): { titulo: string | null; cuerpo: string } {
  const m = html.match(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>/)
  if (!m) return { titulo: null, cuerpo: html }
  const titulo = m[1].replace(/<[^>]+>/g, '').trim()
  return { titulo, cuerpo: html.slice(m[0].length) }
}

/** Título de una página desde su markdown crudo (para el índice lateral). */
export function tituloDesdeMarkdown(md: string | undefined, id: string): string {
  const linea = md?.match(/^#\s+(.+)$/m)?.[1]
  return linea ? linea.replace(/[`*]/g, '').trim() : id
}

/** Orden de lectura: la portada primero y luego por el número del archivo. */
export function ordenarIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    if (a === WIKI_PORTADA) return -1
    if (b === WIKI_PORTADA) return 1
    return a.localeCompare(b, 'es', { numeric: true })
  })
}
