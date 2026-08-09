import { describe, it, expect } from 'vitest'
import { renderMarkdown, markdownExcerpt, escapeHtml } from '../src/lib/capacitacion/markdown'
import {
  parseLista,
  serializarLista,
  slugify,
  formatearDuracion,
  esNivel,
  esTipoRecurso,
  esVisibilidad,
  visibilidadesVisibles,
} from '../src/lib/capacitacion/tipos'
import {
  CODE_LENGTH,
  codigoUtilizable,
  createTrainingPass,
  generateAccessCode,
  isWellFormedCode,
  normalizeAccessCode,
  signTrainingPass,
  verifyTrainingPass,
} from '../src/lib/capacitacion/access'
import { isTrainingAccessPath } from '../src/lib/security/paths'

// ── Markdown ────────────────────────────────────────────────────────────────
//
// Lo que se prueba aquí no es "que formatee bonito" sino que NUNCA emita HTML
// que no haya construido este módulo: el cuerpo de un recurso se sirve en una
// página pública cacheable.
describe('renderMarkdown', () => {
  it('escapa el HTML del origen en vez de emitirlo', () => {
    const html = renderMarkdown('Hola <script>alert(1)</script> mundo')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapa el HTML también dentro de código y de encabezados', () => {
    expect(renderMarkdown('`<img onerror=x>`')).not.toContain('<img')
    expect(renderMarkdown('## <b>Título</b>')).not.toContain('<b>')
  })

  it('rechaza enlaces con esquemas ejecutables y conserva los de navegación', () => {
    const malo = renderMarkdown('[clic](javascript:alert(1))')
    expect(malo).not.toContain('<a href')

    const bueno = renderMarkdown('[docs](https://example.com/a?b=1&c=2)')
    expect(bueno).toContain('<a href="https://example.com/a?b=1&amp;c=2"')
    expect(bueno).toContain('rel="noopener noreferrer"')

    // Una ruta interna es enlace, pero no se abre en pestaña nueva.
    const interno = renderMarkdown('[banco](/capacitacion)')
    expect(interno).toContain('<a href="/capacitacion"')
    expect(interno).not.toContain('target="_blank"')
  })

  it('no confunde un número del texto con un hueco de código', () => {
    // Regresión: el centinela de los huecos era " <n> " y una frase con
    // números se llevaba por delante el contenido en línea.
    const html = renderMarkdown('Tenemos 3 casos y `un_snippet` más')
    expect(html).toContain('Tenemos 3 casos')
    expect(html).toContain('<code>un_snippet</code>')
  })

  it('ignora un NUL inyectado en el origen', () => {
    // El NUL se construye en runtime: dejarlo literal en el fuente vuelve
    // binario el archivo de test y lo hace ilegible para grep y para diffs.
    const NUL = String.fromCharCode(0)
    const html = renderMarkdown(`texto ${NUL}0${NUL} con nul y \`codigo\``)
    expect(html).toContain('<code>codigo</code>')
    expect(html).not.toContain(NUL)
  })

  it('degrada h1 a h2 para no romper el esquema de encabezados', () => {
    expect(renderMarkdown('# Uno')).toContain('<h2>Uno</h2>')
    expect(renderMarkdown('### Tres')).toContain('<h3>Tres</h3>')
  })

  it('arma listas, citas, reglas y bloques de código', () => {
    const html = renderMarkdown(
      ['- uno', '- dos', '', '1. primero', '2. segundo', '', '> cita', '', '---', '', '```ts', 'const a = 1', '```'].join('\n')
    )
    expect(html).toContain('<ul><li>uno</li><li>dos</li></ul>')
    expect(html).toContain('<ol><li>primero</li><li>segundo</li></ol>')
    expect(html).toContain('<blockquote><p>cita</p></blockquote>')
    expect(html).toContain('<hr />')
    expect(html).toContain('<pre><code class="language-ts">const a = 1</code></pre>')
  })

  it('cierra un bloque de código sin cerrar en vez de tragarse el resto', () => {
    const html = renderMarkdown('```\nsin cerrar')
    expect(html).toContain('<pre><code>sin cerrar</code></pre>')
  })

  it('aplica negrita y cursiva', () => {
    expect(renderMarkdown('**fuerte** y *suave*')).toContain('<strong>fuerte</strong>')
    expect(renderMarkdown('**fuerte** y *suave*')).toContain('<em>suave</em>')
  })

  it('devuelve cadena vacía sin contenido', () => {
    expect(renderMarkdown(null)).toBe('')
    expect(renderMarkdown('')).toBe('')
  })

  it('escapa comillas para que nada escape de un atributo', () => {
    expect(escapeHtml(`"'`)).toBe('&quot;&#39;')
  })
})

describe('markdownExcerpt', () => {
  it('quita el marcado y recorta', () => {
    const texto = markdownExcerpt('## Título\n\nUn **texto** con [enlace](https://x.com) y `code`.', 40)
    expect(texto).not.toContain('#')
    expect(texto).not.toContain('**')
    expect(texto.length).toBeLessThanOrEqual(40)
  })

  it('no recorta lo que ya cabe', () => {
    expect(markdownExcerpt('corto', 100)).toBe('corto')
  })
})

// ── Vocabulario ─────────────────────────────────────────────────────────────
describe('slugify', () => {
  it('sobrevive a un título en español con tildes y signos', () => {
    expect(slugify('¿Cómo evaluar un modelo de IA?')).toBe('como-evaluar-un-modelo-de-ia')
  })

  it('no deja guiones sueltos en los extremos ni al recortar', () => {
    expect(slugify('  ---hola---  ')).toBe('hola')
    expect(slugify('a'.repeat(200)).endsWith('-')).toBe(false)
  })
})

describe('listas JSON', () => {
  it('ida y vuelta desde texto libre', () => {
    expect(parseLista(serializarLista('uno\ndos, tres'))).toEqual(['uno', 'dos', 'tres'])
  })

  it('una lista vacía se guarda como null, no como "[]"', () => {
    expect(serializarLista('   ')).toBeNull()
    expect(serializarLista([])).toBeNull()
  })

  it('un campo corrupto devuelve lista vacía en vez de lanzar', () => {
    expect(parseLista('no es json')).toEqual([])
    expect(parseLista('{"a":1}')).toEqual([])
    expect(parseLista('[1, "dos", null]')).toEqual(['dos'])
    expect(parseLista(null)).toEqual([])
  })
})

describe('guardas de enumeraciones', () => {
  it('solo aceptan los valores del schema', () => {
    expect(esNivel('intro')).toBe(true)
    expect(esNivel('experto')).toBe(false)
    expect(esTipoRecurso('prompt')).toBe(true)
    expect(esTipoRecurso('otra')).toBe(false)
    expect(esVisibilidad('con_codigo')).toBe(true)
    expect(esVisibilidad('secreto')).toBe(false)
  })
})

describe('formatearDuracion', () => {
  it('entero sin decimales, fracción con uno', () => {
    expect(formatearDuracion(4)).toBe('4 h')
    expect(formatearDuracion(1.5)).toBe('1.5 h')
  })

  it('vacío cuando no hay dato', () => {
    expect(formatearDuracion(null)).toBe('')
    expect(formatearDuracion(0)).toBe('')
  })
})

// ── Pase de acceso ──────────────────────────────────────────────────────────
describe('códigos de grupo', () => {
  it('se generan legibles y sin caracteres ambiguos', () => {
    for (let i = 0; i < 40; i++) {
      const code = generateAccessCode()
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
      expect(code).not.toMatch(/[OI015SL]/)
      expect(normalizeAccessCode(code)).toHaveLength(CODE_LENGTH)
    }
  })

  it('normaliza lo que teclea el asistente', () => {
    expect(normalizeAccessCode(' ab3k-9f2h ')).toBe('AB3K9F2H')
    expect(normalizeAccessCode('AB3K 9F2H')).toBe('AB3K9F2H')
  })

  it('rechaza formas imposibles antes de tocar la base', () => {
    expect(isWellFormedCode(generateAccessCode())).toBe(true)
    expect(isWellFormedCode('corto')).toBe(false)
    expect(isWellFormedCode('AB3K9F2HX')).toBe(false)
    // La O y el 0 no están en el alfabeto: si aparecen, no es un código nuestro.
    expect(isWellFormedCode('ABOK9F2H')).toBe(false)
  })
})

describe('pase firmado', () => {
  const SECRET = 'secreto-de-prueba'

  it('se verifica el que se firmó', () => {
    const pase = createTrainingPass(SECRET, 42)
    expect(verifyTrainingPass(SECRET, pase)?.codeId).toBe(42)
  })

  it('no vale con otro secreto', () => {
    expect(verifyTrainingPass('otro', createTrainingPass(SECRET, 1))).toBeNull()
  })

  it('no vale sin secreto configurado', () => {
    expect(verifyTrainingPass(undefined, createTrainingPass(SECRET, 1))).toBeNull()
  })

  it('no se puede alargar la vigencia manipulando el payload', () => {
    const ahora = Date.now()
    const pase = signTrainingPass(SECRET, 7, Math.floor(ahora / 1000) - 10)
    expect(verifyTrainingPass(SECRET, pase, ahora)).toBeNull()

    // Reescribir el vencimiento invalida la firma, que es el punto entero.
    const [codeId, , sig] = pase.split('.')
    const falso = `${codeId}.${Math.floor(ahora / 1000) + 9999}.${sig}`
    expect(verifyTrainingPass(SECRET, falso, ahora)).toBeNull()
  })

  it('no se puede cambiar de cohorte reescribiendo el id', () => {
    const pase = createTrainingPass(SECRET, 1)
    const [, exp, sig] = pase.split('.')
    expect(verifyTrainingPass(SECRET, `999.${exp}.${sig}`)).toBeNull()
  })

  it('rechaza tokens malformados sin lanzar', () => {
    for (const t of ['', 'sinpuntos', 'a.b.c', '1.2.zz', '1.2', null, undefined]) {
      expect(verifyTrainingPass(SECRET, t as string | null)).toBeNull()
    }
  })
})

describe('codigoUtilizable', () => {
  const ahora = new Date('2026-08-08T12:00:00Z')

  it('sirve el vigente y sin tope alcanzado', () => {
    expect(codigoUtilizable({ expiresAt: new Date('2026-12-01'), uses: 3, maxUses: 10 }, ahora)).toBe(true)
    expect(codigoUtilizable({ expiresAt: null, maxUses: null }, ahora)).toBe(true)
  })

  it('no sirve revocado, vencido ni con el cupo agotado', () => {
    expect(codigoUtilizable({ revokedAt: new Date('2026-08-01') }, ahora)).toBe(false)
    expect(codigoUtilizable({ expiresAt: new Date('2026-08-01') }, ahora)).toBe(false)
    expect(codigoUtilizable({ uses: 10, maxUses: 10 }, ahora)).toBe(false)
  })

  it('no sirve si no existe', () => {
    expect(codigoUtilizable(null, ahora)).toBe(false)
    expect(codigoUtilizable(undefined, ahora)).toBe(false)
  })
})

// ── Visibilidad y rutas ─────────────────────────────────────────────────────
describe('visibilidadesVisibles', () => {
  it('el borrador no sale nunca, con pase o sin él', () => {
    expect(visibilidadesVisibles(false)).toEqual(['publico'])
    expect(visibilidadesVisibles(true)).toEqual(['publico', 'con_codigo'])
    expect(visibilidadesVisibles(true)).not.toContain('borrador')
  })
})

describe('isTrainingAccessPath', () => {
  it('solo cubre el canje, no el banco entero', () => {
    expect(isTrainingAccessPath('/api/capacitacion/acceso')).toBe(true)
    expect(isTrainingAccessPath('/capacitacion')).toBe(false)
    expect(isTrainingAccessPath('/capacitacion/acceso')).toBe(false)
    expect(isTrainingAccessPath('/api/capacitacion/acceso/extra')).toBe(false)
  })
})
