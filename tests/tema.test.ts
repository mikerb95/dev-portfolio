import { describe, expect, it } from 'vitest'
import { CLAVE_TEMA, COLOR_BARRA, codigoTema, resolverTema, temaContrario } from '../src/lib/tema'

describe('resolverTema', () => {
  it('la elección guardada manda sobre el dispositivo', () => {
    expect(resolverTema('claro', false)).toBe('claro')
    expect(resolverTema('oscuro', true)).toBe('oscuro')
  })
  it('sin elección sigue al dispositivo', () => {
    expect(resolverTema(null, true)).toBe('claro')
    expect(resolverTema(null, false)).toBe('oscuro')
    expect(resolverTema(undefined, false)).toBe('oscuro')
  })
  it('ignora un valor guardado que no reconoce', () => {
    expect(resolverTema('sepia', true)).toBe('claro')
    expect(resolverTema('', false)).toBe('oscuro')
  })
  it('temaContrario alterna', () => {
    expect(temaContrario('claro')).toBe('oscuro')
    expect(temaContrario('oscuro')).toBe('claro')
  })
})

// El script del <head> no puede importar `resolverTema`: repite la regla a
// mano. Aquí se ejecuta de verdad, con un navegador de mentira, contra todas
// las combinaciones, para que las dos copias no puedan separarse.
describe('script en línea del <head>', () => {
  function ejecutar(guardado: string | null, sistemaClaro: boolean, almacenRoto = false) {
    const meta = { content: COLOR_BARRA.oscuro }
    const document = { documentElement: { dataset: {} as Record<string, string> }, querySelector: () => meta }
    const localStorage = {
      getItem: (k: string) => {
        if (almacenRoto) throw new Error('bloqueado')
        return k === CLAVE_TEMA ? guardado : null
      },
    }
    const matchMedia = () => ({ matches: sistemaClaro })
    const window = { matchMedia }
    new Function('document', 'localStorage', 'matchMedia', 'window', codigoTema())(
      document,
      localStorage,
      matchMedia,
      window,
    )
    return { tema: document.documentElement.dataset.tema === 'claro' ? 'claro' : 'oscuro', barra: meta.content }
  }

  it('coincide con resolverTema en todas las combinaciones', () => {
    for (const guardado of [null, 'claro', 'oscuro', 'sepia', '']) {
      for (const sistemaClaro of [true, false]) {
        expect(ejecutar(guardado, sistemaClaro).tema, `${guardado}/${sistemaClaro}`).toBe(
          resolverTema(guardado, sistemaClaro),
        )
      }
    }
  })
  it('con el almacenamiento bloqueado sigue al dispositivo sin lanzar', () => {
    expect(ejecutar('claro', false, true).tema).toBe('oscuro')
    expect(ejecutar(null, true, true).tema).toBe('claro')
  })
  it('cambia el color de la barra del navegador solo en claro', () => {
    expect(ejecutar('claro', false).barra).toBe(COLOR_BARRA.claro)
    expect(ejecutar('oscuro', true).barra).toBe(COLOR_BARRA.oscuro)
  })
})
