import { describe, expect, it } from 'vitest'
import {
  ESPERA_MS,
  RUTA_CIERRE,
  segundosParaCierre,
  siguienteFase,
  type Fase,
  type Orden,
} from '../src/lib/presentacion/cierre'

/** El mazo real: 22 posiciones globales, la última es "¿Preguntas?". */
const TOTAL = 22
const en = (pos: number, moviendo = false) => ({ pos, total: TOTAL, moviendo })

/** Recorre una secuencia de lecturas y devuelve la fase final y las órdenes. */
function recorrer(inicio: Fase, lecturas: ReturnType<typeof en>[]) {
  let fase = inicio
  const ordenes: Orden[] = []
  for (const l of lecturas) {
    const r = siguienteFase(fase, l)
    fase = r.fase
    if (r.orden !== 'nada') ordenes.push(r.orden)
  }
  return { fase, ordenes }
}

describe('recién cargada no se va a ninguna parte', () => {
  it('no arma aunque llegue al final, si nunca estuvo quieta antes', () => {
    // El caso real: el destino vive en el servidor con TTL de seis horas, así
    // que abrir la ventana después de un ensayo la manda al final sola.
    const viaje = [en(1, true), en(7, true), en(14, true), en(TOTAL, true), en(TOTAL)]
    expect(recorrer('esperando', viaje)).toEqual({ fase: 'esperando', ordenes: [] })
  })

  it('tampoco si la reconstrucción termina justo en la última', () => {
    // Recarga a mitad del turno de preguntas: se restaura el mazo, no se huye.
    expect(recorrer('esperando', [en(TOTAL, true), en(TOTAL), en(TOTAL)])).toEqual({
      fase: 'esperando',
      ordenes: [],
    })
  })

  it('se pone lista en cuanto se queda quieta fuera del final', () => {
    expect(recorrer('esperando', [en(3, true), en(3)]).fase).toBe('listo')
  })

  it('estar quieta EN el final no la pone lista', () => {
    expect(recorrer('esperando', [en(TOTAL)]).fase).toBe('esperando')
  })
})

describe('conduciendo de verdad', () => {
  it('llegar al final arma la cuenta', () => {
    const { fase, ordenes } = recorrer('listo', [en(21), en(TOTAL)])
    expect(fase).toBe('armado')
    expect(ordenes).toEqual(['armar'])
  })

  it('no se rearma sola por seguir ahí', () => {
    expect(recorrer('listo', [en(TOTAL), en(TOTAL), en(TOTAL)]).ordenes).toEqual(['armar'])
  })

  it('no arma mientras el mazo se mueve, aunque el número ya coincida', () => {
    expect(recorrer('listo', [en(TOTAL, true)])).toEqual({ fase: 'listo', ordenes: [] })
  })

  it('una posición pasada del total también es el final', () => {
    // El total encoge si el mazo se reexporta con menos diapositivas.
    expect(recorrer('listo', [en(TOTAL + 3)]).ordenes).toEqual(['armar'])
  })
})

describe('la cancelación, que es lo que hace esto usable', () => {
  it('salir de la última desarma', () => {
    const { fase, ordenes } = recorrer('armado', [en(21)])
    expect(fase).toBe('listo')
    expect(ordenes).toEqual(['cancelar'])
  })

  it('empezar a moverse desarma aunque el número siga siendo el final', () => {
    // Es lo que permite que "atrás" cancele en el acto, sin esperar a que el
    // mazo se mueva de verdad.
    expect(recorrer('armado', [en(TOTAL, true)]).ordenes).toEqual(['cancelar'])
  })

  it('cancelar no desactiva el cierre para el resto de la charla', () => {
    const { fase, ordenes } = recorrer('armado', [en(21), en(21), en(TOTAL)])
    expect(fase).toBe('armado')
    expect(ordenes).toEqual(['cancelar', 'armar'])
  })

  it('la ida y vuelta completa, de esperando a irse', () => {
    const charla = [
      en(1, true), // reconstruyéndose
      en(1), // ya conduce
      en(11),
      en(TOTAL, true), // avanzando al final
      en(TOTAL), // llega
      en(21), // se arrepiente
      en(TOTAL), // vuelve
    ]
    expect(recorrer('esperando', charla)).toEqual({
      fase: 'armado',
      ordenes: ['armar', 'cancelar', 'armar'],
    })
  })
})

describe('lecturas que no se pueden creer', () => {
  it('sin total creíble no pasa nada, en ninguna fase', () => {
    for (const fase of ['esperando', 'listo'] as const) {
      expect(siguienteFase(fase, { pos: 1, total: 0, moviendo: false }).orden).toBe('nada')
      expect(siguienteFase(fase, { pos: Number.NaN, total: TOTAL, moviendo: false }).orden).toBe(
        'nada'
      )
      expect(siguienteFase(fase, { pos: 1.5, total: TOTAL, moviendo: false }).orden).toBe('nada')
    }
  })

  it('una lectura ilegible con la cuenta armada la cancela, no la mantiene', () => {
    // Prudencia: si no se sabe dónde está la pantalla, no se navega sola.
    expect(siguienteFase('armado', { pos: Number.NaN, total: TOTAL, moviendo: false })).toEqual({
      fase: 'listo',
      orden: 'cancelar',
    })
  })

  it('una lectura ilegible tampoco pone lista a una recién cargada', () => {
    expect(siguienteFase('esperando', { pos: 1, total: 0, moviendo: false }).fase).toBe('esperando')
  })
})

describe('la cuenta que se enseña', () => {
  it('redondea hacia arriba, para que se vea el 5', () => {
    expect(segundosParaCierre(1_000 + ESPERA_MS, 1_000)).toBe(5)
    expect(segundosParaCierre(5_400, 1_000)).toBe(5)
    expect(segundosParaCierre(1_200, 1_000)).toBe(1)
  })

  it('no baja de cero ni con relojes rotos', () => {
    expect(segundosParaCierre(1_000, 9_000)).toBe(0)
    expect(segundosParaCierre(Number.NaN, 1_000)).toBe(0)
  })
})

describe('a dónde se va', () => {
  it('a la página de cierre, que es una ruta del sitio', () => {
    expect(RUTA_CIERRE).toBe('/presentacion-end')
  })
})
