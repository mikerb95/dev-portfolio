import { describe, expect, it } from 'vitest'
import {
  debeArrancar,
  desfase,
  formatear,
  parsearInicio,
  transcurrido,
} from '../src/lib/presentacion/cronometro'
import { POS_INICIAL } from '../src/lib/presentacion/estado'

const MIN = 60_000

describe('desfase', () => {
  it('sin diferencia, cero', () => {
    expect(desfase(1_000_000, 1_000_000)).toBe(0)
  })

  it('mide el adelanto del reloj local', () => {
    // El portátil dos minutos adelantado: sin corregir, el cronómetro
    // arrancaría en 02:00.
    expect(desfase(1_000_000, 1_000_000 + 2 * MIN)).toBe(2 * MIN)
  })

  it('mide también el atraso', () => {
    expect(desfase(1_000_000, 1_000_000 - 30_000)).toBe(-30_000)
  })

  it('ante una medida rota se queda en cero, no propaga la basura', () => {
    expect(desfase(NaN, 1_000_000)).toBe(0)
    expect(desfase(1_000_000, Infinity)).toBe(0)
  })
})

describe('transcurrido', () => {
  const inicio = 1_000_000

  it('cuenta desde el arranque', () => {
    expect(transcurrido(inicio, inicio + 5 * MIN, 0)).toBe(5 * MIN)
  })

  it('descuenta el desfase del reloj local', () => {
    // El portátil va 2 min adelantado y su Date.now() lo refleja. Con el
    // desfase aplicado, el tiempo real sigue siendo 5 min.
    const local = inicio + 5 * MIN + 2 * MIN
    expect(transcurrido(inicio, local, 2 * MIN)).toBe(5 * MIN)
  })

  it('null mientras no haya arrancado', () => {
    expect(transcurrido(null, inicio, 0)).toBeNull()
  })

  it('nunca cuenta hacia atrás', () => {
    // Un reloj que se ajusta solo (NTP, cambio de zona) daría un tiempo
    // negativo, y un `-00:07` delante del tribunal es peor que un cero.
    expect(transcurrido(inicio, inicio - 10_000, 0)).toBe(0)
    expect(transcurrido(inicio, inicio + 1000, 60_000)).toBe(0)
  })

  it('null ante una medida rota', () => {
    expect(transcurrido(inicio, NaN, 0)).toBeNull()
    expect(transcurrido(inicio, inicio, NaN)).toBeNull()
  })
})

describe('formatear', () => {
  it('mm:ss mientras no llegue a la hora', () => {
    expect(formatear(0)).toBe('00:00')
    expect(formatear(7_000)).toBe('00:07')
    expect(formatear(9 * MIN + 5_000)).toBe('09:05')
    expect(formatear(59 * MIN + 59_000)).toBe('59:59')
  })

  it('h:mm:ss a partir de la hora', () => {
    // Un ensayo largo, o una sesión que se olvidó de reiniciar, tiene que
    // poder decir la verdad aunque la verdad sea fea.
    expect(formatear(60 * MIN)).toBe('1:00:00')
    expect(formatear(4 * 60 * MIN + 12 * MIN + 30_000)).toBe('4:12:30')
  })

  it('trunca, no redondea: el segundo no salta antes de tiempo', () => {
    expect(formatear(1_999)).toBe('00:01')
  })

  it('sin tiempo, un hueco que se lee como hueco', () => {
    expect(formatear(null)).toBe('--:--')
    expect(formatear(-1)).toBe('--:--')
    expect(formatear(NaN)).toBe('--:--')
  })
})

describe('debeArrancar', () => {
  it('arranca con el primer movimiento que sale de la primera diapositiva', () => {
    expect(debeArrancar(null, POS_INICIAL, POS_INICIAL + 1, POS_INICIAL)).toBe(true)
  })

  it('es idempotente: con el reloj ya puesto no vuelve a arrancar', () => {
    // Lo llama el servidor en CADA POST que mueve el destino. Sin esto, el
    // reloj se reiniciaría con cada toque.
    expect(debeArrancar(1_000_000, POS_INICIAL, POS_INICIAL + 1, POS_INICIAL)).toBe(false)
  })

  it('no arranca con un movimiento que no mueve nada', () => {
    expect(debeArrancar(null, POS_INICIAL, POS_INICIAL, POS_INICIAL)).toBe(false)
  })

  it('no arranca a mitad del mazo', () => {
    // Si la clave caducó a mitad de charla, no se inventa un arranque falso en
    // la diapositiva 12: mejor sin reloj que con uno que miente.
    expect(debeArrancar(null, 12, 13, POS_INICIAL)).toBe(false)
  })

  it('volver a la primera diapositiva no arranca nada', () => {
    expect(debeArrancar(null, 5, POS_INICIAL, POS_INICIAL)).toBe(false)
  })
})

describe('parsearInicio', () => {
  it('acepta un instante, venga como número o como texto del almacén', () => {
    expect(parsearInicio(1_700_000_000_000)).toBe(1_700_000_000_000)
    expect(parsearInicio('1700000000000')).toBe(1_700_000_000_000)
  })

  it('descarta lo que no es un instante posible', () => {
    // Un valor corrupto daría un cronómetro en 13491:22:07, que además de
    // inútil delata que algo está roto en el peor momento para averiguarlo.
    for (const v of [null, undefined, 0, -1, 1.5, NaN, '', 'ayer', {}, []]) {
      expect(parsearInicio(v)).toBeNull()
    }
  })
})
