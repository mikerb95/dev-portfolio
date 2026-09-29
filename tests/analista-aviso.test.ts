import { describe, expect, it } from 'vitest'
import { avisoMatutino, veredicto } from '../src/lib/analista/aviso'
import { nuevaEjecucion } from '../src/lib/analista/bucle'

const IP = '203.0.113.7'

describe('aviso del análisis de la mañana', () => {
  it('toma el veredicto de la primera línea con texto, sin títulos de sección', () => {
    expect(veredicto('Veredicto: noche tranquila.\n\n## Qué pasó\n- nada')).toBe('noche tranquila.')
    expect(veredicto('\n## Resumen\nTodo en orden.')).toBe('Todo en orden.')
    expect(veredicto(null)).toBeNull()
  })

  it('si terminó, manda el veredicto con prioridad normal', () => {
    const e = nuevaEjecucion('e1', 'x')
    e.estado = 'terminada'
    e.respuesta = 'Noche tranquila: solo ruido de fondo.\n\n## Detalle\n- 12 intentos'
    expect(avisoMatutino(e)).toEqual({
      titulo: 'Analista: resumen de las últimas 24 horas',
      cuerpo: 'Noche tranquila: solo ruido de fondo.',
      prioridad: 3,
    })
  })

  it('si propone un bloqueo, avisa con prioridad alta y sin la IP', () => {
    const e = nuevaEjecucion('e1', 'x')
    e.estado = 'esperando_aprobacion'
    e.seudonimos = { 'origen-04': IP }
    e.propuesta = { toolUseId: 't', origen: 'origen-04', motivo: 'Fuerza bruta persistente', entrada: {}, resultadosPrevios: [], orden: ['t'] }
    const a = avisoMatutino(e)
    expect(a.prioridad).toBe(4)
    expect(a.titulo).toContain('origen-04')
    expect(a.cuerpo).toContain('Fuerza bruta persistente')
    expect(JSON.stringify(a)).not.toContain(IP)
  })

  it('si falló, lo dice con el error', () => {
    const e = nuevaEjecucion('e1', 'x')
    e.estado = 'fallida'
    e.error = 'Se alcanzó el tope de gasto diario del analista.'
    expect(avisoMatutino(e).cuerpo).toBe('Se alcanzó el tope de gasto diario del analista.')
  })

  it('recorta cuerpos largos para el celular', () => {
    const e = nuevaEjecucion('e1', 'x')
    e.estado = 'terminada'
    e.respuesta = 'a'.repeat(1000)
    expect(avisoMatutino(e).cuerpo.length).toBe(400)
  })
})
