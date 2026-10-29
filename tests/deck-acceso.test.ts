import { describe, expect, it } from 'vitest'
import { deckSrcDeSesion, motivoParaLeerDeck, sesionDeConsulta } from '../src/lib/present/deck-acceso'

const base = { deckId: 7, admin: false, deckDeLaSesion: null, enBancoVisible: false }

describe('motivoParaLeerDeck', () => {
  it('sin ninguna prueba no se sirve: adivinar el id ya no basta', () => {
    expect(motivoParaLeerDeck(base)).toBeNull()
  })

  it('la sesión admin lo abre siempre', () => {
    expect(motivoParaLeerDeck({ ...base, admin: true })).toBe('admin')
  })

  it('una presentación viva abre SOLO su propio deck', () => {
    expect(motivoParaLeerDeck({ ...base, deckDeLaSesion: 7 })).toBe('presentacion')
    // El id de una sesión de otro deck no sirve de llave maestra.
    expect(motivoParaLeerDeck({ ...base, deckDeLaSesion: 8 })).toBeNull()
  })

  it('un recurso visible del banco lo abre', () => {
    expect(motivoParaLeerDeck({ ...base, enBancoVisible: true })).toBe('banco')
  })
})

describe('sesionDeConsulta', () => {
  it('acepta un id con forma de id', () => {
    expect(sesionDeConsulta('a3f09c1d2b4e5f60')).toBe('a3f09c1d2b4e5f60')
  })

  it('descarta lo que no tiene forma antes de ir a Redis', () => {
    for (const raw of [null, '', 'abc', 'x'.repeat(65), 'a3f0 9c1d', '../../etc', 'id"><script>']) {
      expect(sesionDeConsulta(raw)).toBeNull()
    }
  })
})

describe('deckSrcDeSesion', () => {
  it('ata la URL del iframe a la sesión', () => {
    expect(deckSrcDeSesion(7, 'a3f09c1d2b4e5f60')).toBe('/decks/7.html?s=a3f09c1d2b4e5f60')
  })
})
