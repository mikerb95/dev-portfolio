import { describe, it, expect } from 'vitest'
import { isFramablePath } from '../src/lib/security/paths'

// La allowlist de enmarcado es lo único que separa un iframe que se ve de uno
// en blanco delante del jurado. Es una lista corta y se prueba entera: un fallo
// aquí no se descubre hasta que la página ya está proyectada.
describe('isFramablePath', () => {
  it('deja enmarcar las páginas que proyecta la sustentación', () => {
    expect(isFramablePath('/portal')).toBe(true)
    expect(isFramablePath('/portal/login')).toBe(true)
    expect(isFramablePath('/portal/facturas/3')).toBe(true)
    expect(isFramablePath('/status')).toBe(true)
    expect(isFramablePath('/engineering')).toBe(true)
    expect(isFramablePath('/lab/site-check')).toBe(true)
  })

  it('no abre el resto de /lab por añadir site-check', () => {
    // La relajación es de una página, no del laboratorio entero: /lab/fingerprint
    // y las vistas de admin del laboratorio siguen sin poder enmarcarse.
    expect(isFramablePath('/lab')).toBe(false)
    expect(isFramablePath('/lab/site-check/detalle')).toBe(false)
    expect(isFramablePath('/lab/fingerprint/sala')).toBe(false)
    expect(isFramablePath('/admin/lab/security')).toBe(false)
  })

  it('mantiene el panel y las APIs fuera', () => {
    expect(isFramablePath('/admin')).toBe(false)
    expect(isFramablePath('/api/portal/login')).toBe(false)
    expect(isFramablePath('/api/lab/site-check')).toBe(false)
    expect(isFramablePath('/')).toBe(false)
  })
})
