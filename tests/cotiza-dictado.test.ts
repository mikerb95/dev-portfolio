// Dictado por voz de Cotiza: la parte pura (comandos de puntuación y cómo se
// inserta lo dictado). El reconocimiento en sí lo hace el navegador.

import { describe, expect, it } from 'vitest'
import { aplicarComandos, dictadoDisponible, insertarDictado } from '../src/lib/cotiza/dictado'

describe('comandos de puntuación', () => {
  it('coma, dos puntos y punto al final', () => {
    expect(aplicarComandos('necesito dos presentaciones coma una revisión punto')).toBe('necesito dos presentaciones, una revisión.')
    expect(aplicarComandos('pendientes dos puntos enviar contratos')).toBe('pendientes: enviar contratos')
  })

  it('"punto" en medio de una frase es una palabra normal', () => {
    expect(aplicarComandos('revisar el punto de venta')).toBe('revisar el punto de venta')
  })

  it('nueva línea y punto y aparte', () => {
    expect(aplicarComandos('acordamos dos cosas nueva línea enviar facturas')).toBe('acordamos dos cosas\nenviar facturas')
    expect(aplicarComandos('fin del tema punto y aparte otro tema')).toBe('fin del tema.\n\notro tema')
  })

  it('pregunta al final', () => {
    expect(aplicarComandos('cuántas diapositivas signo de pregunta')).toBe('cuántas diapositivas?')
  })
})

describe('inserción en el campo', () => {
  it('en un campo vacío empieza con mayúscula', () => {
    expect(insertarDictado('', 0, 0, 'hola carolina')).toEqual({ valor: 'Hola carolina', cursor: 13 })
  })

  it('después de una frase terminada, mayúscula y espacio', () => {
    const r = insertarDictado('Revisé los contratos.', 21, 21, 'falta el anexo')
    expect(r.valor).toBe('Revisé los contratos. Falta el anexo')
  })

  it('en medio de una frase, minúscula y espacios a los dos lados', () => {
    const valor = 'Enviar facturas el jueves'
    const r = insertarDictado(valor, 15, 15, 'de septiembre')
    expect(r.valor).toBe('Enviar facturas de septiembre el jueves')
    expect(r.cursor).toBe('Enviar facturas de septiembre'.length)
  })

  it('reemplaza la selección', () => {
    const r = insertarDictado('Son 5 documentos', 4, 5, 'seis')
    expect(r.valor).toBe('Son seis documentos')
  })

  it('un signo dictado se pega a la palabra anterior', () => {
    expect(insertarDictado('Acordamos', 9, 9, 'coma').valor).toBe('Acordamos,')
  })

  it('después de un salto de línea no mete espacio', () => {
    expect(insertarDictado('Pendientes:\n', 12, 12, 'jorge envía los excel').valor).toBe('Pendientes:\nJorge envía los excel')
  })

  it('lo dictado vacío no cambia nada', () => {
    expect(insertarDictado('Hola', 4, 4, '   ')).toEqual({ valor: 'Hola', cursor: 4 })
  })

  it('fuera del navegador no hay dictado', () => {
    expect(dictadoDisponible()).toBe(false)
  })
})
