import { describe, expect, it } from 'vitest'
import { DeckParseError, decodeEntities, parseDeck } from '../src/lib/present/deck-parse'

const deck = (inner: string) => `<!doctype html><html><body><deck-stage>${inner}</deck-stage></body></html>`

describe('extracción de slides', () => {
  it('lee rótulo y notas de cada section', () => {
    const { slides } = parseDeck(
      deck(`
        <section data-label="Portada" data-speaker-notes="Saludar y presentarse."><h1>Hola</h1></section>
        <section data-label="Arquitectura" data-speaker-notes="Explicar el middleware."><p>…</p></section>
      `)
    )
    expect(slides).toEqual([
      { idx: 0, label: 'Portada', speakerNotes: 'Saludar y presentarse.' },
      { idx: 1, label: 'Arquitectura', speakerNotes: 'Explicar el middleware.' },
    ])
  })

  it('los atributos que faltan quedan en null, no en cadena vacía', () => {
    const { slides } = parseDeck(deck('<section><h1>Sin nada</h1></section>'))
    expect(slides).toEqual([{ idx: 0, label: null, speakerNotes: null }])
  })

  it('un atributo con solo espacios cuenta como ausente', () => {
    const { slides } = parseDeck(deck('<section data-label="   " data-speaker-notes=""></section>'))
    expect(slides[0]).toMatchObject({ label: null, speakerNotes: null })
  })
})

describe('lo que rompe una regex', () => {
  it('notas con > y < dentro del atributo', () => {
    // Este es el caso que motiva el escáner: una `/<section([^>]*)>/` cortaría
    // la nota en el primer `>` y se llevaría por delante el resto del deck.
    const { slides } = parseDeck(
      deck(`
        <section data-label="Flujo" data-speaker-notes="request -> middleware -> SSR. Si a > b, cortar."><p>x</p></section>
        <section data-label="Cierre" data-speaker-notes="Gracias."></section>
      `)
    )
    expect(slides).toHaveLength(2)
    expect(slides[0].speakerNotes).toBe('request -> middleware -> SSR. Si a > b, cortar.')
    expect(slides[1].label).toBe('Cierre')
  })

  it('notas con comillas simples dentro de un atributo con comillas dobles', () => {
    const { slides } = parseDeck(
      deck(`<section data-speaker-notes="Decir 'no es magia' y seguir."></section>`)
    )
    expect(slides[0].speakerNotes).toBe("Decir 'no es magia' y seguir.")
  })

  it('atributos delimitados con comillas simples', () => {
    const { slides } = parseDeck(deck(`<section data-label='Uno' data-speaker-notes='Con "comillas".'></section>`))
    expect(slides[0]).toMatchObject({ label: 'Uno', speakerNotes: 'Con "comillas".' })
  })

  it('notas multilínea', () => {
    const { slides } = parseDeck(
      deck(`<section data-speaker-notes="Primera línea.\nSegunda línea.\n\nTercera."></section>`)
    )
    expect(slides[0].speakerNotes).toContain('\n')
    expect(slides[0].speakerNotes?.split('\n')).toHaveLength(4)
  })

  it('decodifica entidades HTML en los valores', () => {
    const { slides } = parseDeck(
      deck(`<section data-speaker-notes="Comparar &lt;deck-stage&gt; con &amp;quot;reveal&amp;quot; &#183; ojo"></section>`)
    )
    expect(slides[0].speakerNotes).toBe('Comparar <deck-stage> con &quot;reveal&quot; · ojo')
  })

  it('decodeEntities deja intacto lo que no reconoce', () => {
    expect(decodeEntities('100% &foo; &amp; fin')).toBe('100% &foo; & fin')
    expect(decodeEntities('&#x41;&#66;')).toBe('AB')
  })
})

describe('estructura', () => {
  it('solo cuenta los section que son hijos DIRECTOS de deck-stage', () => {
    const { slides } = parseDeck(
      deck(`
        <section data-label="Uno">
          <div><section data-label="anidado">contenido, no slide</section></div>
        </section>
        <section data-label="Dos"></section>
      `)
    )
    expect(slides.map((s) => s.label)).toEqual(['Uno', 'Dos'])
  })

  it('ignora un <section> que aparece dentro de un <script> o un <style>', () => {
    const { slides } = parseDeck(
      deck(`
        <section data-label="Real"></section>
        <script>const sel = '<section data-label="falso">'; console.log(sel)</script>
        <style>section > section { color: red; }</style>
      `)
    )
    expect(slides.map((s) => s.label)).toEqual(['Real'])
  })

  it('ignora comentarios HTML', () => {
    const { slides } = parseDeck(
      deck(`
        <!-- <section data-label="comentado"></section> -->
        <section data-label="Real"></section>
      `)
    )
    expect(slides.map((s) => s.label)).toEqual(['Real'])
  })

  it('no se descuadra con elementos vacíos ni autocerrados', () => {
    const { slides } = parseDeck(
      deck(`
        <section data-label="Uno"><img src="a.png"><br><input type="text"><hr /></section>
        <section data-label="Dos"></section>
      `)
    )
    expect(slides.map((s) => s.label)).toEqual(['Uno', 'Dos'])
  })

  it('un <section> sin cerrar al final conserva su slide', () => {
    // Perder el último slide por una etiqueta olvidada se descubriría
    // proyectando; contarlo es el mal menor.
    const { slides } = parseDeck('<deck-stage><section data-label="Uno"></section><section data-label="Dos">')
    expect(slides.map((s) => s.label)).toEqual(['Uno', 'Dos'])
  })

  it('conserva el orden del documento', () => {
    const html = deck(
      Array.from({ length: 12 }, (_, i) => `<section data-label="S${i}"></section>`).join('')
    )
    const { slides } = parseDeck(html)
    expect(slides.map((s) => s.label)).toEqual(Array.from({ length: 12 }, (_, i) => `S${i}`))
    expect(slides.map((s) => s.idx)).toEqual([...Array(12).keys()])
  })
})

describe('archivos que hay que rechazar al subir', () => {
  it('sin <deck-stage>', () => {
    expect(() => parseDeck('<html><body><section></section></body></html>')).toThrow(DeckParseError)
  })

  it('<deck-stage> vacío', () => {
    expect(() => parseDeck(deck('<p>solo texto</p>'))).toThrow(DeckParseError)
  })

  it('archivo vacío', () => {
    expect(() => parseDeck('')).toThrow(DeckParseError)
  })

  it('el mensaje dice qué falta, no "error al procesar"', () => {
    // Lo lee el admin en el formulario: tiene que servir para arreglar el HTML.
    expect(() => parseDeck('<html></html>')).toThrow(/deck-stage/)
  })
})

describe('coste', () => {
  it('un deck grande se parsea sin patinar', () => {
    const html = deck(
      Array.from(
        { length: 300 },
        (_, i) =>
          `<section data-label="Slide ${i}" data-speaker-notes="Nota larga ${'x'.repeat(400)} con > y < dentro">
             <div><p>${'contenido '.repeat(50)}</p></div>
           </section>`
      ).join('')
    )
    const t0 = performance.now()
    const { slides } = parseDeck(html)
    expect(slides).toHaveLength(300)
    expect(performance.now() - t0).toBeLessThan(500)
  })
})

describe('export de Claude Design (envoltorio x-import)', () => {
  // El export real no trae un <deck-stage> literal: solo existe en tiempo de
  // ejecución, cuando x-import carga el módulo que lo define. Buscar la
  // etiqueta rechazaba un deck perfectamente válido.
  const xImport = (inner: string) =>
    `<!doctype html><html><body><x-dc><helmet><script src="./support.js"></script></helmet>` +
    `<x-import component-from-global-scope="deck-stage" from="./deck-stage.js" width="1920">` +
    `${inner}</x-import></x-dc></body></html>`

  it('reconoce el contenedor por el componente que declara', () => {
    const { slides } = parseDeck(
      xImport(`
        <section data-label="Uno" data-screen-label="00" data-speaker-notes="Nota uno"></section>
        <section data-label="Dos" data-speaker-notes="Nota dos"></section>
      `)
    )
    expect(slides.map((s) => s.label)).toEqual(['Uno', 'Dos'])
    expect(slides[0].speakerNotes).toBe('Nota uno')
  })

  it('no confunde otro x-import con el del deck', () => {
    expect(() =>
      parseDeck('<x-import component-from-global-scope="otra-cosa"><section></section></x-import>')
    ).toThrow(DeckParseError)
  })

  it('sigue leyendo un <deck-stage> literal', () => {
    const { slides } = parseDeck('<deck-stage><section data-label="Uno"></section></deck-stage>')
    expect(slides).toHaveLength(1)
  })

  it('el mensaje de error nombra las dos formas válidas', () => {
    expect(() => parseDeck('<html><body></body></html>')).toThrow(/deck-stage.*x-import|x-import.*deck-stage/s)
  })
})
