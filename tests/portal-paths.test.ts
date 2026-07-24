import { describe, it, expect } from 'vitest'
import { isPortalPath, isPortalPublicPath } from '../src/lib/portal/paths'
import { isAuthPath, isPortalAuthPath } from '../src/lib/security/paths'

describe('portal · clasificación de rutas', () => {
  describe('isPortalPath', () => {
    it('reconoce páginas y APIs del portal', () => {
      expect(isPortalPath('/portal')).toBe(true)
      expect(isPortalPath('/portal/facturas')).toBe(true)
      expect(isPortalPath('/api/portal/login')).toBe(true)
    })

    it('no captura rutas ajenas que empiezan igual', () => {
      // Si mañana existe /portafolio o /portales, no debe heredar el gate.
      expect(isPortalPath('/portafolio')).toBe(false)
      expect(isPortalPath('/portales/x')).toBe(false)
      expect(isPortalPath('/admin')).toBe(false)
      expect(isPortalPath('/')).toBe(false)
    })
  })

  describe('isPortalPublicPath', () => {
    it('deja pasar solo las rutas que sirven para conseguir sesión', () => {
      expect(isPortalPublicPath('/portal/login')).toBe(true)
      expect(isPortalPublicPath('/portal/olvide')).toBe(true)
      expect(isPortalPublicPath('/api/portal/login')).toBe(true)
      expect(isPortalPublicPath('/api/portal/reset')).toBe(true)
      expect(isPortalPublicPath('/portal/invitacion/abc123')).toBe(true)
      expect(isPortalPublicPath('/portal/restablecer/abc123')).toBe(true)
    })

    it('protege todo lo demás', () => {
      expect(isPortalPublicPath('/portal')).toBe(false)
      expect(isPortalPublicPath('/portal/facturas')).toBe(false)
      expect(isPortalPublicPath('/portal/documentos')).toBe(false)
      expect(isPortalPublicPath('/portal/cuenta')).toBe(false)
      expect(isPortalPublicPath('/api/portal/logout')).toBe(false)
    })

    it('no se deja engañar por prefijos parecidos', () => {
      // El fallo peligroso sería el inverso: que una ruta protegida pase por
      // pública. Estas deben seguir pidiendo sesión.
      expect(isPortalPublicPath('/portal/loginx')).toBe(false)
      expect(isPortalPublicPath('/portal/login/secreto')).toBe(false)
      expect(isPortalPublicPath('/portal/invitacion')).toBe(false)
      expect(isPortalPublicPath('/portal/facturas/login')).toBe(false)
    })

    it('tolera la barra final', () => {
      expect(isPortalPublicPath('/portal/login/')).toBe(true)
    })

    it('deja pasar el health check, que lo sondea un monitor sin sesión', () => {
      expect(isPortalPublicPath('/api/portal/health')).toBe(true)
      expect(isPortalPublicPath('/api/portal/health/')).toBe(true)
    })

    it('el health check no abre nada por debajo suyo', () => {
      // Es una entrada exacta, no un prefijo: una ruta futura que cuelgue de
      // ahí debe nacer protegida como cualquier otra.
      expect(isPortalPublicPath('/api/portal/health/detalle')).toBe(false)
      expect(isPortalPublicPath('/api/portal/healthz')).toBe(false)
    })
  })

  describe('integración con el rate limit', () => {
    it('las rutas de credenciales del portal cuentan como rutas de auth', () => {
      expect(isPortalAuthPath('/api/portal/login')).toBe(true)
      expect(isPortalAuthPath('/api/portal/reset')).toBe(true)
      expect(isPortalAuthPath('/api/portal/invitacion/abc')).toBe(true)
      expect(isAuthPath('/api/portal/login')).toBe(true)
    })

    it('el resto del portal no cuenta como auth', () => {
      // Contarlas dispararía el límite de 30/min a un cliente navegando normal.
      expect(isPortalAuthPath('/api/portal/logout')).toBe(false)
      expect(isPortalAuthPath('/portal/facturas')).toBe(false)
      expect(isAuthPath('/portal/facturas')).toBe(false)
    })

    it('el health check no cae en el límite estrecho de credenciales', () => {
      // Si cayera ahí, el propio monitor podría agotar la cuota de la IP del
      // cron y provocar la caída que dice estar vigilando.
      expect(isPortalAuthPath('/api/portal/health')).toBe(false)
      expect(isAuthPath('/api/portal/health')).toBe(false)
    })
  })
})
