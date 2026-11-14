import { describe, expect, it } from 'vitest'
import { HITOS } from '../src/data/hackaton'
import {
  bloqueEnCurso,
  cuentaRegresiva,
  formatoHora,
  horaSimulada,
  instanteEvento,
  momentoBogota,
  prioritariasEnRiesgo,
} from '../src/lib/hackaton/reloj'
import { aplicar, ErrorTablero, estadoInicial, filtrar, progreso, type Estado } from '../src/lib/hackaton/tablero'
import { validarOperacion } from '../src/lib/hackaton/validacion'

const con = (...nombres: string[]): Estado =>
  nombres.reduce((e, nombre) => aplicar(e, { tipo: 'persona.agregar', nombre }), estadoInicial())

describe('operaciones del tablero', () => {
  it('no muta el estado de entrada', () => {
    const e = estadoInicial()
    const copia = JSON.stringify(e)
    aplicar(e, { tipo: 'persona.agregar', nombre: 'Ana' })
    expect(JSON.stringify(e)).toBe(copia)
  })

  it('respeta el límite configurable de personas y rechaza duplicados', () => {
    const e = con('A', 'B', 'C', 'D', 'E')
    expect(() => aplicar(e, { tipo: 'persona.agregar', nombre: 'F' })).toThrow(ErrorTablero)
    expect(() => aplicar(con('Ana'), { tipo: 'persona.agregar', nombre: ' ana ' })).toThrow(/ya está/)
    const ampliado = { ...con('A', 'B', 'C', 'D', 'E'), limite: { min: 2, max: 7 } }
    expect(aplicar(ampliado, { tipo: 'persona.agregar', nombre: 'F' }).personas).toHaveLength(6)
  })

  it('reutiliza el color de quien sale', () => {
    let e = con('A', 'B', 'C')
    e = aplicar(e, { tipo: 'persona.quitar', id: e.personas[1].id })
    e = aplicar(e, { tipo: 'persona.agregar', nombre: 'D' })
    expect(e.personas.find((p) => p.nombre === 'D')!.color).toBe(1)
  })

  it('agrega, edita y borra tareas; editar confirma un dato "por confirmar"', () => {
    let e = estadoInicial()
    const pc = e.tareas.find((t) => t.porConfirmar)!
    e = aplicar(e, { tipo: 'tarea.editar', tarea: pc.id, titulo: 'Cruce de fuentes', horas: 2 })
    const editada = e.tareas.find((t) => t.id === pc.id)!
    expect(editada.titulo).toBe('Cruce de fuentes')
    expect(editada.porConfirmar).toBeUndefined()

    e = aplicar(e, { tipo: 'tarea.agregar', grupo: 'dia', titulo: 'Adaptador HDMI', prioridad: 'Si alcanza', horas: 0 })
    const nueva = e.tareas.at(-1)!
    expect(nueva.titulo).toBe('Adaptador HDMI')
    expect(e.tareas.filter((t) => t.id === nueva.id)).toHaveLength(1)

    e = aplicar(e, { tipo: 'tarea.borrar', tarea: nueva.id })
    expect(e.tareas.some((t) => t.id === nueva.id)).toBe(false)
    expect(() => aplicar(e, { tipo: 'tarea.borrar', tarea: nueva.id })).toThrow(ErrorTablero)
  })

  it('una tarea fijada a mano no sigue al frente; "grupo" la vuelve a heredar', () => {
    let e = aplicar(con('Ana', 'Beto'), { tipo: 'repartir', modo: 'cero' })
    const t = e.tareas.find((x) => x.grupo === 'ingesta')!
    const otro = e.personas.find((p) => p.id !== t.dueno)!.id
    e = aplicar(e, { tipo: 'tarea.asignar', tarea: t.id, persona: otro })
    e = aplicar(e, { tipo: 'grupo.asignar', grupo: 'ingesta', persona: t.dueno })
    expect(e.tareas.find((x) => x.id === t.id)!.dueno).toBe(otro)
    e = aplicar(e, { tipo: 'tarea.asignar', tarea: t.id, persona: 'grupo' })
    expect(e.tareas.find((x) => x.id === t.id)!.dueno).toBe(t.dueno)
  })

  it('no deja asignar a alguien que no está en el equipo', () => {
    expect(() => aplicar(estadoInicial(), { tipo: 'grupo.asignar', grupo: 'panel', persona: 'p99' })).toThrow(ErrorTablero)
  })

  it('reiniciar vuelve al estado precargado', () => {
    const e = aplicar(con('Ana'), { tipo: 'reiniciar' })
    expect(e).toEqual(estadoInicial())
  })
})

describe('progreso y filtros', () => {
  it('pondera por horas y cuenta tareas', () => {
    let e = estadoInicial()
    const pesada = e.tareas.find((t) => t.horas === 2.5)!
    e = aplicar(e, { tipo: 'tarea.estado', tarea: pesada.id, estado: 'hecha' })
    const p = progreso(e.tareas.filter((t) => t.grupo === 'nucleo'))
    expect(p.hechas).toBe(1)
    expect(p.total).toBe(3)
    expect(p.avance).toBeCloseTo(2.5 / 4.55, 5)
  })

  it('sin horas, el avance cae al conteo', () => {
    let e = estadoInicial()
    const dia = e.tareas.filter((t) => t.grupo === 'dia' && t.horas === 0)
    e = aplicar(e, { tipo: 'tarea.estado', tarea: dia[0].id, estado: 'hecha' })
    expect(progreso(e.tareas.filter((t) => t.grupo === 'dia' && t.horas === 0)).avance).toBeCloseTo(1 / dia.length, 5)
  })

  it('filtra por persona, frente, prioridad y estado', () => {
    const e = aplicar(con('Ana', 'Beto', 'Caro', 'Dani', 'Eva'), { tipo: 'repartir', modo: 'cero' })
    const ana = e.personas[0].id
    expect(filtrar(e.tareas, { persona: ana }).every((t) => t.dueno === ana)).toBe(true)
    expect(filtrar(e.tareas, { persona: 'sin' }).every((t) => !t.dueno)).toBe(true)
    expect(filtrar(e.tareas, { grupo: 'seguridad', prioridad: 'Imprescindible' })).toHaveLength(3)
    expect(filtrar(e.tareas, { estado: 'hecha' })).toHaveLength(0)
  })
})

describe('reloj de Bogotá', () => {
  it('convierte a hora de Bogotá (UTC-5) y reconoce el día del evento', () => {
    const m = momentoBogota(new Date('2026-11-14T18:15:00Z'))
    expect(m.esDiaEvento).toBe(true)
    expect(m.minuto).toBe(13 * 60 + 15)
    // Las 11 p.m. del 13 en Bogotá ya son el 14 en UTC: no es el día del evento.
    expect(momentoBogota(new Date('2026-11-14T04:00:00Z')).esDiaEvento).toBe(false)
  })

  it('formatea en 12 horas y simula una hora del día', () => {
    expect(formatoHora(8 * 60)).toBe('8:00 a.m.')
    expect(formatoHora(12 * 60 + 30)).toBe('12:30 p.m.')
    expect(formatoHora(17 * 60)).toBe('5:00 p.m.')
    expect(horaSimulada('13:50')?.toISOString()).toBe('2026-11-14T18:50:00.000Z')
    expect(horaSimulada('25:00')).toBeNull()
    expect(horaSimulada(null)).toBeNull()
  })

  it('cuenta regresiva y bloque en curso', () => {
    const cierre = instanteEvento(HITOS.cierreEntregas)
    expect(cuentaRegresiva(instanteEvento(15 * 60 + 30), cierre)).toBe('1 h 30 min')
    expect(cuentaRegresiva(instanteEvento(16 * 60 + 59), cierre)).toBe('1 min 00 s')
    expect(cuentaRegresiva(instanteEvento(17 * 60), cierre)).toBeNull()
    const bloques = [
      { inicio: 540, fin: 1020, texto: 'sprint' },
      { inicio: 660, fin: 660, texto: 'hito' },
      { inicio: 600, fin: 630, texto: 'dentro' },
    ]
    expect(bloqueEnCurso(bloques, 610)).toBe(2)
    expect(bloqueEnCurso(bloques, 660)).toBe(0)
    expect(bloqueEnCurso(bloques, 1020)).toBe(-1)
  })

  it('avisa de las prioritarias pendientes solo a menos de 90 min del congelamiento', () => {
    const tareas = estadoInicial().tareas
    const antes = momentoBogota(instanteEvento(HITOS.congelamiento - 91))
    const dentro = momentoBogota(instanteEvento(HITOS.congelamiento - 89))
    expect(prioritariasEnRiesgo(tareas, antes)).toEqual([])
    const riesgo = prioritariasEnRiesgo(tareas, dentro)
    expect(riesgo.length).toBeGreaterThan(0)
    expect(riesgo.every((t) => t.prioridad === 'Requisito' || t.prioridad === 'Imprescindible')).toBe(true)
    // Otro día no avisa.
    expect(prioritariasEnRiesgo(tareas, momentoBogota(new Date('2026-11-15T18:00:00Z')))).toEqual([])
  })
})

describe('validación de operaciones', () => {
  it('acepta operaciones bien formadas', () => {
    expect(validarOperacion({ tipo: 'persona.agregar', nombre: 'Ana' })).toEqual({ tipo: 'persona.agregar', nombre: 'Ana' })
    expect(validarOperacion({ tipo: 'tarea.asignar', tarea: 't1', persona: 'grupo' })).not.toBeNull()
    expect(validarOperacion({ tipo: 'tarea.asignar', tarea: 't1', persona: null })).not.toBeNull()
  })

  it('rechaza tipos, ids, textos y horas inválidos', () => {
    expect(validarOperacion({ tipo: 'borrar.todo' })).toBeNull()
    expect(validarOperacion({ tipo: 'persona.agregar', nombre: '' })).toBeNull()
    expect(validarOperacion({ tipo: 'persona.agregar', nombre: 'x'.repeat(41) })).toBeNull()
    expect(validarOperacion({ tipo: 'persona.agregar', nombre: 'a\u0000b' })).toBeNull()
    expect(validarOperacion({ tipo: 'tarea.estado', tarea: '../x', estado: 'hecha' })).toBeNull()
    expect(validarOperacion({ tipo: 'tarea.estado', tarea: 't1', estado: 'lista' })).toBeNull()
    expect(validarOperacion({ tipo: 'tarea.agregar', grupo: 'dia', titulo: 'x', prioridad: 'Urgente', horas: 1 })).toBeNull()
    expect(validarOperacion({ tipo: 'tarea.agregar', grupo: 'dia', titulo: 'x', prioridad: 'Alto', horas: 99 })).toBeNull()
    expect(validarOperacion(null)).toBeNull()
  })
})
