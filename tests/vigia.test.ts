import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { avisoDeInforme, leerInforme, porPrioridad } from '../src/lib/vigia/informe'
import { cierraCorrida, debeAnunciar, desenlaceDe } from '../src/lib/vigia/desenlace'

// Informe real de la primera corrida (sesn_01SQcrKSjaDPKkgB9WtDL8k3).
const REAL = readFileSync(new URL('./fixtures/vigia-informe-2026-10-06.json', import.meta.url), 'utf8')

describe('leerInforme', () => {
  it('acepta el informe real de la primera corrida', () => {
    const inf = leerInforme(REAL)
    expect(inf?.estado).toBe('amarillo')
    expect(inf?.hallazgos).toHaveLength(7)
  })

  it('rechaza JSON roto, vacío o con otra forma', () => {
    expect(leerInforme(null)).toBeNull()
    expect(leerInforme('')).toBeNull()
    expect(leerInforme('{no es json')).toBeNull()
    expect(leerInforme(JSON.stringify({ estado: 'morado', resumen: 'x', hallazgos: [] }))).toBeNull()
    expect(leerInforme(JSON.stringify({ estado: 'verde', resumen: 'x', hallazgos: [{ id: 'a' }] }))).toBeNull()
  })

  it('completa revisado y no_revisado si el modelo los omite', () => {
    const inf = leerInforme(JSON.stringify({ estado: 'verde', resumen: 'todo bien', hallazgos: [] }))
    expect(inf?.revisado).toEqual([])
    expect(inf?.no_revisado).toEqual([])
  })
})

describe('porPrioridad', () => {
  it('ordena alta, media, baja sin desordenar dentro de cada nivel', () => {
    const h = (id: string, prioridad: 'alta' | 'media' | 'baja') => ({
      id, prioridad, categoria: 'otro', titulo: id, evidencia: '', arreglo: '',
    })
    const orden = porPrioridad([h('b1', 'baja'), h('a1', 'alta'), h('m1', 'media'), h('b2', 'baja'), h('a2', 'alta')])
    expect(orden.map((x) => x.id)).toEqual(['a1', 'a2', 'm1', 'b1', 'b2'])
  })
})

describe('avisoDeInforme', () => {
  it('cuenta hallazgos y los de prioridad alta, sin evidencia', () => {
    const { titulo, cuerpo } = avisoDeInforme(leerInforme(REAL)!)
    expect(titulo).toBe('Vigía: AMARILLO (7 hallazgos, 1 de prioridad alta)')
    expect(cuerpo.length).toBeLessThanOrEqual(400)
  })

  it('dice "sin hallazgos" en verde', () => {
    const { titulo } = avisoDeInforme({ estado: 'verde', resumen: 'ok', hallazgos: [], revisado: [], no_revisado: [] })
    expect(titulo).toBe('Vigía: VERDE (sin hallazgos)')
  })
})

describe('desenlaceDe', () => {
  it('traduce el estado y el motivo de parada', () => {
    expect(desenlaceDe('idle', 'end_turn')).toBe('informe')
    expect(desenlaceDe('idle', 'budget_reached')).toBe('tope')
    expect(desenlaceDe('idle', 'requires_action')).toBe('aprobacion')
    expect(desenlaceDe('idle', 'retries_exhausted')).toBe('error')
    expect(desenlaceDe('terminated', null)).toBe('error')
    expect(desenlaceDe('running', 'end_turn')).toBe('en_curso')
    expect(desenlaceDe('rescheduling', null)).toBe('en_curso')
  })
})

describe('debeAnunciar', () => {
  it('anuncia el primer cierre y no los reenvíos', () => {
    expect(debeAnunciar(null, 'informe')).toBe(true)
    expect(debeAnunciar('informe', 'informe')).toBe(false)
    // terminated después del idle con informe: la corrida ya se contó.
    expect(debeAnunciar('informe', 'error')).toBe(false)
  })

  it('una aprobación pendiente avisa una vez y luego deja cerrar la corrida', () => {
    expect(debeAnunciar(null, 'aprobacion')).toBe(true)
    expect(debeAnunciar('aprobacion', 'aprobacion')).toBe(false)
    expect(debeAnunciar('aprobacion', 'informe')).toBe(true)
  })

  it('nunca anuncia una sesión que sigue corriendo', () => {
    expect(debeAnunciar(null, 'en_curso')).toBe(false)
    expect(cierraCorrida('en_curso')).toBe(false)
  })
})
