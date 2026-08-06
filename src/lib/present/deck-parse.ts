// Extracción de slides de un deck HTML autónomo. Módulo PURO, sin
// dependencias: el repo acota sus dependencias de UI a tres (lenis, gsap,
// mermaid) y meter un parser de HTML completo (cheerio, linkedom) para leer
// unos atributos de un archivo que subimos nosotros mismos no lo justifica.
//
// Tampoco vale una regex: `data-speaker-notes` son notas del presentador en
// texto libre, así que contienen comillas, `<`, `>` y saltos de línea. Una
// `/<section([^>]*)>/` corta la nota en el primer `>` y se lleva por delante la
// mitad del deck sin dar un error — falla en silencio, que es la peor forma de
// fallar. Lo que hay aquí es un escáner de etiquetas: pequeño, consciente de
// comillas y de comentarios, y con tests.
//
// Se ejecuta UNA vez, al subir el archivo. Las notas quedan en `deck_slides`
// para que el control remoto no dependa de cargar el iframe.

export type ParsedSlide = {
  idx: number
  label: string | null
  speakerNotes: string | null
}

export type ParsedDeck = {
  slides: ParsedSlide[]
}

export class DeckParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeckParseError'
  }
}

// Elementos sin cierre: no entran en la pila de anidamiento.
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

// Su contenido es texto, no marcado: un `<section` ahí dentro es un string de
// JavaScript o un selector CSS, no un slide.
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title'])

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** Decodifica las entidades que pueden aparecer en un valor de atributo. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()]
    return named ?? match
  })
}

type Tag = {
  name: string
  attrs: Record<string, string>
  selfClosing: boolean
  closing: boolean
  /** Índice del carácter siguiente al `>` de esta etiqueta. */
  end: number
}

const isNameChar = (ch: string) => /[a-zA-Z0-9:_.-]/.test(ch)
const isSpace = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f'

/**
 * Lee la etiqueta que empieza en `html[start]` (que debe ser `<`). Devuelve
 * null si lo que hay ahí no es una etiqueta (un `<` suelto en el texto).
 */
function readTag(html: string, start: number): Tag | null {
  let i = start + 1
  const closing = html[i] === '/'
  if (closing) i++
  if (!isNameChar(html[i] ?? '')) return null

  let name = ''
  while (i < html.length && isNameChar(html[i])) name += html[i++]
  name = name.toLowerCase()

  const attrs: Record<string, string> = {}
  let selfClosing = false

  while (i < html.length) {
    while (i < html.length && isSpace(html[i])) i++
    if (html[i] === '/') {
      selfClosing = true
      i++
      continue
    }
    if (html[i] === '>') {
      i++
      break
    }
    if (i >= html.length) break

    let attrName = ''
    while (i < html.length && !isSpace(html[i]) && html[i] !== '=' && html[i] !== '>' && html[i] !== '/') {
      attrName += html[i++]
    }
    if (!attrName) {
      // Carácter que no encaja en ninguna posición válida: lo saltamos para no
      // entrar en bucle infinito con marcado malformado.
      i++
      continue
    }

    while (i < html.length && isSpace(html[i])) i++
    let value = ''
    if (html[i] === '=') {
      i++
      while (i < html.length && isSpace(html[i])) i++
      const quote = html[i]
      if (quote === '"' || quote === "'") {
        i++
        // Aquí está la razón de ser de este escáner: el valor termina en la
        // comilla de cierre, NUNCA en un `>`. Las notas del presentador llevan
        // `>` con toda naturalidad.
        const close = html.indexOf(quote, i)
        if (close === -1) {
          value = html.slice(i)
          i = html.length
        } else {
          value = html.slice(i, close)
          i = close + 1
        }
      } else {
        while (i < html.length && !isSpace(html[i]) && html[i] !== '>') value += html[i++]
      }
    }
    attrs[attrName.toLowerCase()] = decodeEntities(value)
  }

  return { name, attrs, selfClosing, closing, end: i }
}

/** Salta un comentario, una declaración o un CDATA que empieza en `start`. */
function skipDeclaration(html: string, start: number): number | null {
  if (html.startsWith('<!--', start)) {
    const end = html.indexOf('-->', start + 4)
    return end === -1 ? html.length : end + 3
  }
  if (html.startsWith('<!', start) || html.startsWith('<?', start)) {
    const end = html.indexOf('>', start)
    return end === -1 ? html.length : end + 1
  }
  return null
}

/** Salta el contenido de un elemento de texto crudo (`<script>`, `<style>`…). */
function skipRawText(html: string, name: string, from: number): number {
  const close = html.toLowerCase().indexOf(`</${name}`, from)
  return close === -1 ? html.length : close
}

/**
 * Slides de un deck: los `<section>` que son hijos DIRECTOS de `<deck-stage>`.
 * Un `<section>` anidado dentro de un slide es contenido del slide, no un slide
 * — por eso se lleva la cuenta de la profundidad y no basta con contar tags.
 */
export function parseDeck(html: string): ParsedDeck {
  const lower = html.toLowerCase()
  const stageStart = lower.indexOf('<deck-stage')
  if (stageStart === -1) {
    throw new DeckParseError('el archivo no contiene un elemento <deck-stage>')
  }

  const stageTag = readTag(html, stageStart)
  if (!stageTag || stageTag.closing) {
    throw new DeckParseError('el elemento <deck-stage> está malformado')
  }

  const slides: ParsedSlide[] = []
  // Elementos abiertos por debajo de <deck-stage>. Vacía = estamos en el nivel
  // de los slides.
  const stack: string[] = []
  let openSection: { attrs: Record<string, string> } | null = null
  let i = stageTag.end
  let closedCleanly = false

  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) break

    const skipped = skipDeclaration(html, lt)
    if (skipped !== null) {
      i = skipped
      continue
    }

    const tag = readTag(html, lt)
    if (!tag) {
      i = lt + 1
      continue
    }

    if (tag.closing) {
      if (tag.name === 'deck-stage' && stack.length === 0) {
        closedCleanly = true
        break
      }
      if (tag.name === 'section' && stack.length === 0 && openSection) {
        slides.push({
          idx: slides.length,
          label: cleanAttr(openSection.attrs['data-label']),
          speakerNotes: cleanAttr(openSection.attrs['data-speaker-notes']),
        })
        openSection = null
      } else {
        // Cierre de un elemento anidado: desapila hasta él. Un deck con una
        // etiqueta sin cerrar no debe descuadrar la profundidad para siempre.
        const at = stack.lastIndexOf(tag.name)
        if (at !== -1) stack.length = at
      }
      i = tag.end
      continue
    }

    if (RAW_TEXT_ELEMENTS.has(tag.name) && !tag.selfClosing) {
      i = skipRawText(html, tag.name, tag.end)
      continue
    }

    if (tag.selfClosing || VOID_ELEMENTS.has(tag.name)) {
      i = tag.end
      continue
    }

    if (tag.name === 'section' && stack.length === 0 && !openSection) {
      openSection = { attrs: tag.attrs }
    } else {
      stack.push(tag.name)
    }
    i = tag.end
  }

  // Un `<section>` abierto al llegar al final es un deck truncado, pero el
  // slide existe: se cuenta. Perder el último slide por una etiqueta sin cerrar
  // sería descubrirlo proyectando.
  if (openSection) {
    slides.push({
      idx: slides.length,
      label: cleanAttr(openSection.attrs['data-label']),
      speakerNotes: cleanAttr(openSection.attrs['data-speaker-notes']),
    })
  }

  if (!closedCleanly && slides.length === 0) {
    throw new DeckParseError('no se encontró ningún <section> dentro de <deck-stage>')
  }
  if (slides.length === 0) {
    throw new DeckParseError('el <deck-stage> no contiene slides')
  }

  return { slides }
}

/** Normaliza un valor de atributo: recorta y convierte el vacío en null. */
function cleanAttr(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}
