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
      // Hasta la auditoría del 22 sep 2026 compartían firma y clave, así que un
      // pase de portal "verificaba" como pase de admin y la separación
      // dependía solo de que viajaran en cookies distintas. Ahora el dominio
      // va dentro de lo firmado: la misma clave ya no basta.
      const { createDemoToken, verifyDemoToken } = await import('../src/lib/demo')
      const portalToken = createPortalDemoToken(SECRET)
      expect(verifyDemoToken(SECRET, portalToken)).toBe(false)
      const adminToken = createDemoToken(SECRET)
      expect(verifyPortalDemoToken(SECRET, adminToken)).toBe(false)
    })
  })

  describe('isPortalDemoAllowedMethod', () => {
    it('cualquier GET/HEAD pasa, sea cual sea la ruta', () => {
      expect(isPortalDemoAllowedMethod('GET', '/portal/cuenta')).toBe(true)
      expect(isPortalDemoAllowedMethod('HEAD', '/api/portal/facturas/1')).toBe(true)
      expect(isPortalDemoAllowedMethod('GET', '/api/portal/cuenta/equipo')).toBe(true)
      // El digest de la capa viva es GET, así que la demo también late. No hace
      // falta excepción: sus datos salen de la base de demo por el
      // AsyncLocalStorage de src/db/index.ts, igual que el resto de la vista.
      expect(isPortalDemoAllowedMethod('GET', '/api/portal/live')).toBe(true)
    })

    it('el digest de la capa viva solo se lee, nunca se muta', () => {
      // Es de solo lectura por naturaleza; si algún día alguien le añade un POST,
      // este caso obliga a decidirlo a conciencia en vez de heredarlo.
      expect(isPortalDemoAllowedMethod('POST', '/api/portal/live')).toBe(false)
      expect(isPortalDemoAllowedMethod('DELETE', '/api/portal/live')).toBe(false)
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
