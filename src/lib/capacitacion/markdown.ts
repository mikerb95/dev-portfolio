// Renderizador de un subconjunto de Markdown, puro y sin dependencias.
//
// El repo no tiene librería de markdown en runtime (las notas de /notes son
// content collections, que se compilan en build). El cuerpo de un recurso del
// banco vive en la base y se edita desde el panel, así que hay que formatearlo
// en cada request.
//
// La decisión de fondo: **se escapa el HTML ANTES de formatear**, siempre. El
// texto lo escribe el administrador, no un anónimo, pero termina en una página
// pública cacheada por la CDN - permitir marcado arbitrario convertiría un
// error de copiar y pegar en un XSS almacenado y servido a todo el que abra la
// página. Nada de lo que hace falta para escribir una guía necesita HTML.

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ESCAPES[c])
}

// Solo esquemas de navegación. Un `javascript:` en un enlace es ejecución de
// código con el disfraz de un link, y `data:` permite servir un documento
// entero desde el href.
function safeHref(url: string): string | null {
  const trimmed = url.trim()
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(trimmed)) return trimmed
  return null
}

/** Formato en línea: código, negrita, cursiva y enlaces. Sobre texto YA escapado. */
function inline(escaped: string): string {
  // El código va primero y su contenido no vuelve a formatearse: dentro de un
  // `span` de código, los asteriscos son asteriscos.
  //
  // El hueco se marca con NUL (que `renderMarkdown` retira de la entrada) y no
  // con un número entre espacios: una frase tan común como "tenemos 3 casos"
  // habría reemplazado ese "3" por un slot inexistente.
  const codeSlots: string[] = []
  let out = escaped.replace(/`([^`]+)`/g, (_m, code: string) => {
    codeSlots.push(`<code>${code}</code>`)
    return `\u0000${codeSlots.length - 1}\u0000`
  })

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text: string, url: string) => {
    // El href viaja escapado, así que hay que desescapar `&amp;` para no romper
    // los query strings antes de validar el esquema.
    const href = safeHref(url.replace(/&amp;/g, '&'))
    if (!href) return m
    const external = /^https?:\/\//i.test(href)
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<a href="${escapeHtml(href)}"${attrs}>${text}</a>`
  })

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')

  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codeSlots[Number(i)])
}

/**
 * Markdown → HTML seguro. Soporta encabezados (##, ###), listas con viñeta y
 * numeradas, citas, bloques de código con ```, reglas horizontales y párrafos.
 * Cualquier otra cosa cae a párrafo de texto plano, nunca a HTML crudo.
 */
export function renderMarkdown(src: string | null | undefined): string {
  if (!src) return ''

  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []

  let paragraph: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null
  let quote: string[] = []
  let fence: { lang: string; body: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    out.push(`<p>${inline(escapeHtml(paragraph.join(' ')))}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((i) => `<li>${inline(escapeHtml(i))}</li>`).join('')
    out.push(`<${list.type}>${items}</${list.type}>`)
    list = null
  }
  const flushQuote = () => {
    if (quote.length === 0) return
    out.push(`<blockquote><p>${inline(escapeHtml(quote.join(' ')))}</p></blockquote>`)
    quote = []
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (fence) {
      if (/^```/.test(line.trim())) {
        const cls = fence.lang ? ` class="language-${escapeHtml(fence.lang)}"` : ''
        out.push(`<pre><code${cls}>${escapeHtml(fence.body.join('\n'))}</code></pre>`)
        fence = null
      } else {
        fence.body.push(raw)
      }
      continue
    }

    const fenceStart = line.trim().match(/^```([a-z0-9+-]*)$/i)
    if (fenceStart) {
      flushAll()
      fence = { lang: fenceStart[1] ?? '', body: [] }
      continue
    }

    if (line.trim() === '') {
      flushAll()
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flushAll()
      // h1 se degrada a h2: el título de la página ya es el h1 y dos h1 en un
      // documento rompen el esquema de encabezados que audita axe.
      const level = Math.max(2, heading[1].length)
      out.push(`<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`)
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushAll()
      out.push('<hr />')
      continue
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    if (bullet) {
      flushParagraph()
      flushQuote()
      if (list?.type !== 'ul') {
        flushList()
        list = { type: 'ul', items: [] }
      }
      list.items.push(bullet[1])
      continue
    }

    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (numbered) {
      flushParagraph()
      flushQuote()
      if (list?.type !== 'ol') {
        flushList()
        list = { type: 'ol', items: [] }
      }
      list.items.push(numbered[1])
      continue
    }

    const quoted = line.match(/^\s*>\s?(.*)$/)
    if (quoted) {
      flushParagraph()
      flushList()
      quote.push(quoted[1])
      continue
    }

    flushList()
    flushQuote()
    paragraph.push(line.trim())
  }

  // Un fence sin cerrar no debe tragarse el resto del documento en silencio.
  if (fence) {
    const cls = fence.lang ? ` class="language-${escapeHtml(fence.lang)}"` : ''
    out.push(`<pre><code${cls}>${escapeHtml(fence.body.join('\n'))}</code></pre>`)
  }
  flushAll()

  return out.join('\n')
}

/** Texto plano para descripciones y OG: sin marcado, colapsado y recortado. */
export function markdownExcerpt(src: string | null | undefined, max = 160): string {
  if (!src) return ''
  const plain = src
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length <= max ? plain : `${plain.slice(0, max - 1).trimEnd()}…`
}
