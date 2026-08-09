import { describe, it, expect } from 'vitest'
import { validateClient } from '../src/pages/api/admin/clients/_shared'

// Módulo puro: valida el payload de alta/edición de cliente sin tocar BD.
// Lo que se prueba aquí no es "que valide", sino los tres campos que antes se
// caían del formulario y que otros módulos ya consumían: teléfono (llave del
// cobro de campo), logo (va a un <img> del portal) y datos de facturación
// (se imprimen en la factura y en el PDF).

const ok = (body: unknown) => {
  const r = validateClient(body)
  if ('error' in r) throw new Error(`esperaba éxito, dio: ${r.error}`)
  return r.data
}
const err = (body: unknown) => {
  const r = validateClient(body)
  if (!('error' in r)) throw new Error('esperaba error')
  return r.error
}

describe('validateClient', () => {
  it('acepta lo mínimo y deja el resto en null', () => {
    expect(ok({ name: 'Acme' })).toEqual({
      name: 'Acme',
      email: null,
      phone: null,
      company: null,
      notes: null,
      logoUrl: null,
      billingInfo: null,
    })
  })

  it('exige nombre', () => {
    expect(err({ name: '   ' })).toMatch(/nombre/i)
  })

  describe('teléfono', () => {
    it('guarda en E.164 aunque venga escrito a mano', () => {
      expect(ok({ name: 'A', phone: '310 464 1228' }).phone).toBe('+573104641228')
      expect(ok({ name: 'A', phone: '+57 310 4641228' }).phone).toBe('+573104641228')
    })

    // Un teléfono "casi bien" guardado a medias no empareja nunca con el cobro
    // que lo busca normalizado, y el fallo sería invisible: mejor rechazarlo.
    it('rechaza un número inválido en vez de guardarlo torcido', () => {
      expect(err({ name: 'A', phone: '1234' })).toMatch(/teléfono/i)
    })

    it('vacío es null, no error', () => {
      expect(ok({ name: 'A', phone: '' }).phone).toBeNull()
    })
  })

  describe('logo', () => {
    it('acepta https', () => {
      expect(ok({ name: 'A', logoUrl: 'https://cdn.ej.com/l.svg' }).logoUrl).toBe('https://cdn.ej.com/l.svg')
    })

    // El valor termina en un <img src> del portal del cliente.
    it('rechaza esquemas que no sean https', () => {
      expect(err({ name: 'A', logoUrl: 'javascript:alert(1)' })).toMatch(/https/i)
      expect(err({ name: 'A', logoUrl: 'data:image/svg+xml;base64,AAA' })).toMatch(/https/i)
      expect(err({ name: 'A', logoUrl: 'http://ej.com/l.png' })).toMatch(/https/i)
    })

    it('rechaza una URL que no parsea', () => {
      expect(err({ name: 'A', logoUrl: 'no-es-una-url' })).toMatch(/no es válida/i)
    })
  })

  describe('datos de facturación', () => {
    it('serializa a JSON conservando el orden de las claves', () => {
      const data = ok({ name: 'A', billingInfo: { NIT: '900.123.456-7', Dirección: 'Cra 1 #2-3' } })
      expect(data.billingInfo).toBe('{"NIT":"900.123.456-7","Dirección":"Cra 1 #2-3"}')
    })

    it('descarta pares a medio llenar y devuelve null si no queda ninguno', () => {
      expect(ok({ name: 'A', billingInfo: { NIT: '', '': 'x' } }).billingInfo).toBeNull()
      expect(ok({ name: 'A', billingInfo: {} }).billingInfo).toBeNull()
    })

    // Cada par se dibuja como una línea del PDF: un salto de línea partiría el
    // layout del encabezado de la factura.
    it('colapsa saltos de línea y caracteres de control', () => {
      const data = ok({ name: 'A', billingInfo: { 'NIT\n': 'a\nb' } })
      expect(data.billingInfo).toBe('{"NIT":"a b"}')
    })

    it('limita cantidad y longitud', () => {
      const many = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`k${i}`, 'v']))
      expect(err({ name: 'A', billingInfo: many })).toMatch(/máximo/i)
      expect(err({ name: 'A', billingInfo: { [ 'k'.repeat(41) ]: 'v' } })).toMatch(/etiqueta/i)
      expect(err({ name: 'A', billingInfo: { k: 'v'.repeat(201) } })).toMatch(/dato/i)
    })

    it('rechaza un tipo que no sea objeto', () => {
      expect(err({ name: 'A', billingInfo: ['NIT', '1'] })).toMatch(/inválidos/i)
    })

    it('null y cadena vacía son ausencia, no error', () => {
      expect(ok({ name: 'A', billingInfo: null }).billingInfo).toBeNull()
      expect(ok({ name: 'A', billingInfo: '' }).billingInfo).toBeNull()
    })
  })
})
