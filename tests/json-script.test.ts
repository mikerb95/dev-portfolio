import { describe, it, expect } from 'vitest'
import { jsonEnScript } from '../src/lib/json-script'

// Todo JSON que se incrusta en un <script> pasa por aquí. Un título de
// proyecto con `</script>` cerraba la etiqueta y lo que seguía era HTML.
describe('jsonEnScript', () => {
  const peligroso = {
    titulo: '</script><script>alert(document.cookie)</script>',
    nota: '<!-- comentario --> & <b>negrita</b>',
    separadores: 'línea\u2028párrafo\u2029fin',
  }

  it('no deja nada que cierre la etiqueta ni abra otra', () => {
    const salida = jsonEnScript(peligroso)
    expect(salida).not.toMatch(/<|>|&/)
    expect(salida.toLowerCase()).not.toContain('</script')
    expect(salida).not.toMatch(/[\u2028\u2029]/)
  })

  it('JSON.parse devuelve exactamente el mismo valor', () => {
    expect(JSON.parse(jsonEnScript(peligroso))).toEqual(peligroso)
    expect(JSON.parse(jsonEnScript([1, 'dos', null, { tres: true }]))).toEqual([1, 'dos', null, { tres: true }])
  })

  it('un valor que JSON.stringify no representa sale como null, no como "undefined"', () => {
    expect(jsonEnScript(undefined)).toBe('null')
  })
})
