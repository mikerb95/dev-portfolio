import { describe, it, expect } from 'vitest'
import { avisoContacto, vistaPrevia } from '../src/lib/contacto-aviso'
import {
  campoValido,
  esDiaHabil,
  formatoBogota,
  limiteRespuesta,
  partesBogota,
  tramoFallido,
} from '../src/lib/motion/contacto-datos'

// /contact dibuja la ruta real de un mensaje y el aviso tal como llega al
// celular. Estas pruebas fijan que lo dibujado sale de las mismas reglas que
// el endpoint y que el plazo prometido se calcula en hora de Bogotá.

const bogota = (iso: string) => Date.parse(`${iso}-05:00`)
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

describe('aviso al celular', () => {
  it('el título y el cuerpo son los que envía /api/contact', () => {
    expect(avisoContacto({ name: 'Ana', email: 'ana@x.co', subject: 'App', body: 'Hola' })).toEqual({
      titulo: 'Nuevo mensaje de Ana',
      cuerpo: 'App\nHola\n- ana@x.co',
    })
  })

  it('sin asunto no deja una línea vacía', () => {
    expect(avisoContacto({ name: 'Ana', email: 'a@x.co', subject: '', body: 'Hola' }).cuerpo).toBe('Hola\n- a@x.co')
  })

  it('la vista previa corta en 140 caracteres', () => {
    const largo = 'x'.repeat(200)
    expect(vistaPrevia(largo)).toBe('x'.repeat(140) + '…')
    expect(vistaPrevia('x'.repeat(140))).toBe('x'.repeat(140))
  })
})

describe('campos', () => {
  it('las mismas reglas que las pistas del formulario', () => {
    expect(campoValido('name', 'A')).toBe(false)
    expect(campoValido('name', 'Al')).toBe(true)
    expect(campoValido('email', 'a@b')).toBe(false)
    expect(campoValido('email', 'a@b.co')).toBe(true)
    expect(campoValido('body', 'x'.repeat(19))).toBe(false)
    expect(campoValido('body', 'x'.repeat(20))).toBe(true)
  })
})

describe('hora de Bogotá', () => {
  it('UTC-5 fijo, sin depender de la zona de quien mira', () => {
    expect(partesBogota(Date.parse('2026-10-02T03:30:00Z'))).toMatchObject({ dow: 4, dia: 1, h: 22, m: 30 })
  })

  it('el sábado no es día hábil aunque en UTC ya sea domingo o viernes', () => {
    expect(esDiaHabil(bogota('2026-10-03T23:30:00'))).toBe(false)
    expect(esDiaHabil(bogota('2026-10-02T23:30:00'))).toBe(true)
  })
})

describe('plazo de respuesta', () => {
  it('de lunes a jueves son 24 horas exactas', () => {
    expect(limiteRespuesta(bogota('2026-10-01T10:42:00'))).toBe(bogota('2026-10-02T10:42:00'))
  })

  it('el viernes, las horas del fin de semana no corren', () => {
    expect(limiteRespuesta(bogota('2026-10-02T15:00:00'))).toBe(bogota('2026-10-05T15:00:00'))
  })

  it('el sábado y el domingo, el plazo empieza el lunes', () => {
    expect(limiteRespuesta(bogota('2026-10-03T10:00:00'))).toBe(bogota('2026-10-06T00:00:00'))
    expect(limiteRespuesta(bogota('2026-10-04T22:00:00'))).toBe(bogota('2026-10-06T00:00:00'))
  })

  it('la medianoche se lee como el final del día anterior', () => {
    expect(formatoBogota(bogota('2026-10-06T00:00:00'), DIAS, MESES)).toBe('lun 5 oct · 24:00')
    expect(formatoBogota(bogota('2026-10-02T10:42:00'), DIAS, MESES)).toBe('vie 2 oct · 10:42')
  })
})

describe('ruta del mensaje', () => {
  it('cada fallo se detiene donde ocurre', () => {
    expect(tramoFallido(201)).toBeNull()
    expect(tramoFallido('red')).toBe(0)
    expect(tramoFallido(400)).toBe(1)
    expect(tramoFallido(429)).toBe(1)
    expect(tramoFallido(500)).toBe(2)
  })
})
