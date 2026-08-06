import { describe, expect, it } from 'vitest'
import {
  collectAssetRefs,
  isRelativeAssetRef,
  missingAssets,
  normalizeAssetPath,
  rewriteAssetUrls,
} from '../src/lib/present/assets'

describe('qué cuenta como asset de la carpeta', () => {
  it('acepta las rutas relativas', () => {
    for (const v of ['./uploads/x.png', 'uploads/x.png', 'deck-stage.js', '../shared/a.css']) {
      expect(isRelativeAssetRef(v), v).toBe(true)
    }
  })

  it('descarta lo que ya sabe resolverse solo', () => {
    const externos = [
      'https://fonts.googleapis.com/css2?family=X',
      'http://ejemplo.com/a.png',
      '//cdn.ejemplo.com/a.js',
      'data:image/png;base64,iVBOR',
      '/absoluta/a.png',
      '#ancla',
      'mailto:hola@ejemplo.com',
      '',
      '   ',
    ]
    for (const v of externos) expect(isRelativeAssetRef(v), v).toBe(false)
  })
})

describe('normalización de rutas', () => {
  it('el prefijo ./ no crea una clave distinta', () => {
    expect(normalizeAssetPath('./uploads/x.png')).toBe('uploads/x.png')
    expect(normalizeAssetPath('uploads/x.png')).toBe('uploads/x.png')
  })

  it('quita query y hash', () => {
    expect(normalizeAssetPath('./a.js?v=2')).toBe('a.js')
    expect(normalizeAssetPath('./a.png#frag')).toBe('a.png')
  })

  it('resuelve los ../ en vez de dejarlos en la clave', () => {
    expect(normalizeAssetPath('a/b/../c.png')).toBe('a/c.png')
    expect(normalizeAssetPath('./a//b.png')).toBe('a/b.png')
  })
})

describe('recolección', () => {
  const html = `
    <script src="./support.js"></script>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X">
    <x-import from="./deck-stage.js" component-from-global-scope="deck-stage">
      <section style="background:url('./uploads/fondo.png')">
        <img src="./uploads/a.png"><img src="uploads/a.png">
      </section>
    </x-import>`

  it('encuentra src, href, from y url() de CSS', () => {
    expect(collectAssetRefs(html).sort()).toEqual(
      ['deck-stage.js', 'support.js', 'uploads/a.png', 'uploads/fondo.png'].sort()
    )
  })

  it('no repite un asset referenciado dos veces con rutas distintas', () => {
    expect(collectAssetRefs(html).filter((p) => p === 'uploads/a.png')).toHaveLength(1)
  })

  it('ignora los recursos externos', () => {
    expect(collectAssetRefs(html)).not.toContain('https://fonts.googleapis.com/css2?family=X')
  })
})

describe('reescritura', () => {
  const urls = {
    'support.js': 'https://blob.example.com/support.js',
    'uploads/a.png': 'https://blob.example.com/a.png',
  }

  it('sustituye la ruta relativa por la URL del blob', () => {
    const out = rewriteAssetUrls('<script src="./support.js"></script>', urls)
    expect(out).toBe('<script src="https://blob.example.com/support.js"></script>')
  })

  it('sustituye las dos formas de escribir la misma ruta', () => {
    const out = rewriteAssetUrls('<img src="./uploads/a.png"><img src="uploads/a.png">', urls)
    expect(out).not.toContain('uploads/a.png"')
    expect([...out.matchAll(/blob\.example\.com\/a\.png/g)]).toHaveLength(2)
  })

  it('reescribe el atributo `from` de x-import', () => {
    const out = rewriteAssetUrls(
      `<x-import from="./support.js" component-from-global-scope="deck-stage">`,
      urls
    )
    expect(out).toContain('from="https://blob.example.com/support.js"')
    // No debe tocar el resto de atributos.
    expect(out).toContain('component-from-global-scope="deck-stage"')
  })

  it('reescribe url() dentro de CSS inline', () => {
    const out = rewriteAssetUrls(`<div style="background:url('./uploads/a.png')">`, urls)
    expect(out).toContain('url("https://blob.example.com/a.png")')
  })

  it('no toca lo externo ni las absolutas', () => {
    const html = '<link href="https://fonts.googleapis.com/css2?family=X"><img src="/logo.png">'
    expect(rewriteAssetUrls(html, urls)).toBe(html)
  })

  it('deja intacta una ruta sin URL asignada, en vez de inventarse una', () => {
    // Un recurso roto y visible se diagnostica; una sustitución inventada rompe
    // el deck de una forma mucho más difícil de encontrar.
    const html = '<img src="./uploads/desconocida.png">'
    expect(rewriteAssetUrls(html, urls)).toBe(html)
  })

  it('no altera las notas del presentador', () => {
    const html = `<section data-speaker-notes="Mencionar ./uploads/a.png como ejemplo"><img src="./uploads/a.png"></section>`
    const out = rewriteAssetUrls(html, urls)
    expect(out).toContain('data-speaker-notes="Mencionar ./uploads/a.png como ejemplo"')
    expect(out).toContain('src="https://blob.example.com/a.png"')
  })
})

describe('assets que faltan', () => {
  const html = '<script src="./support.js"></script><img src="./uploads/a.png">'

  it('los detecta antes de subir nada', () => {
    expect(missingAssets(html, ['support.js'])).toEqual(['uploads/a.png'])
  })

  it('no se queja si están todos, escritos de otra forma', () => {
    expect(missingAssets(html, ['./support.js', 'uploads/a.png'])).toEqual([])
  })
})
