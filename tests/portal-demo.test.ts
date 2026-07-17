import { describe, it, expect } from 'vitest'
import {
  createPortalDemoToken,
  verifyPortalDemoToken,
  isPortalDemoAllowedMethod,
  PORTAL_DEMO_TTL_SEC,
} from '../src/lib/portal/demo'

const SECRET = 'test-secret-no-es-real'

describe('portal · demo pública', () => {
  describe('token del pase', () => {
    it('un token recién creado es válido', () => {
      const token = createPortalDemoToken(SECRET)
      expect(verifyPortalDemoToken(SECRET, token)).toBe(true)
    })

    it('caduca pasado el TTL', () => {
      const token = createPortalDemoToken(SECRET)
      const despuesDeCaducar = Date.now() + (PORTAL_DEMO_TTL_SEC + 1) * 1000
      expect(verifyPortalDemoToken(SECRET, token, despuesDeCaducar)).toBe(false)
    })

    it('un secreto distinto invalida el token (no se puede falsificar sin él)', () => {
      const token = createPortalDemoToken(SECRET)
      expect(verifyPortalDemoToken('otro-secreto', token)).toBe(false)
    })

    it('rechaza tokens ausentes o corruptos', () => {
      expect(verifyPortalDemoToken(SECRET, undefined)).toBe(false)
      expect(verifyPortalDemoToken(SECRET, '')).toBe(false)
      expect(verifyPortalDemoToken(SECRET, 'basura')).toBe(false)
    })

    it('el pase del portal y el del admin no son intercambiables', async () => {
      // Comparten el mismo esquema HMAC (createPortalDemoToken reexporta la
      // firma de lib/demo.ts), así que la separación de privilegios depende
      // por completo de que viajen en cookies DISTINTAS, no en el formato del
      // token. Este test documenta esa dependencia: con el MISMO secreto, un
      // token de portal también "verificaría" como token de admin si alguien
      // los mezclara. La defensa real está en middleware.ts (dos cookies, dos
      // funciones de resolución, nunca la misma ruta de código).
      const { createDemoToken, verifyDemoToken } = await import('../src/lib/demo')
      const portalToken = createPortalDemoToken(SECRET)
      expect(verifyDemoToken(SECRET, portalToken)).toBe(true)
      const adminToken = createDemoToken(SECRET)
      expect(verifyPortalDemoToken(SECRET, adminToken)).toBe(true)
    })
  })

  describe('isPortalDemoAllowedMethod', () => {
    it('cualquier GET/HEAD pasa, sea cual sea la ruta', () => {
      expect(isPortalDemoAllowedMethod('GET', '/portal/cuenta')).toBe(true)
      expect(isPortalDemoAllowedMethod('HEAD', '/api/portal/facturas/1')).toBe(true)
      expect(isPortalDemoAllowedMethod('GET', '/api/portal/cuenta/equipo')).toBe(true)
    })

    it('permite los dos pasos del flujo de pago simulado', () => {
      expect(isPortalDemoAllowedMethod('POST', '/api/portal/facturas/1/pagar')).toBe(true)
      expect(isPortalDemoAllowedMethod('POST', '/api/portal/facturas/42/pagar')).toBe(true)
      expect(isPortalDemoAllowedMethod('POST', '/api/payments/mock/pay')).toBe(true)
    })

    it('permite cerrar sesión', () => {
      expect(isPortalDemoAllowedMethod('POST', '/api/portal/logout')).toBe(true)
    })

    it('bloquea el resto de mutaciones, incluidas las que envían correo a terceros', () => {
      // Esta es la que de verdad importa: invitar a un equipo dispara un email
      // real a la dirección que escriba el visitante anónimo. Sin bloquearla,
      // la demo sería un cañón de spam gratis usando mi cuenta de Resend.
      expect(isPortalDemoAllowedMethod('POST', '/api/portal/cuenta/equipo')).toBe(false)
      expect(isPortalDemoAllowedMethod('POST', '/api/portal/mensajes')).toBe(false)
      expect(isPortalDemoAllowedMethod('POST', '/api/portal/documentos')).toBe(false)
      expect(isPortalDemoAllowedMethod('POST', '/api/portal/cuenta/password')).toBe(false)
      expect(isPortalDemoAllowedMethod('PATCH', '/api/portal/cuenta/equipo')).toBe(false)
      expect(isPortalDemoAllowedMethod('DELETE', '/api/portal/cuenta/sesiones')).toBe(false)
    })

    it('no se deja engañar por rutas parecidas a las permitidas', () => {
      // /pagar debe ser el final exacto de la ruta de una factura numérica, no
      // un prefijo que cualquier cosa pueda extender.
      expect(isPortalDemoAllowedMethod('POST', '/api/portal/facturas/1/pagar/extra')).toBe(false)
      expect(isPortalDemoAllowedMethod('POST', '/api/portal/facturas/abc/pagar')).toBe(false)
      expect(isPortalDemoAllowedMethod('POST', '/api/payments/mock/pay/otra')).toBe(false)
    })
  })
})
