import { describe, expect, it } from 'vitest'
import { repartir } from '../src/lib/hackaton/reparto'
import { aplicar, cargaPorPersona, estadoInicial, horasPorGrupo, type Estado } from '../src/lib/hackaton/tablero'

// Horas reales del plan (con 0.3 h de documentación por frente):
// núcleo 4.55, normalizador 3.8, ingesta 5.05, seguridad 3.55, panel 3.3.
const FRENTES = [
  { id: 'nucleo', horas: 4.55 },
  { id: 'normalizador', horas: 3.8 },
  { id: 'ingesta', horas: 5.05 },
  { id: 'seguridad', horas: 3.55 },
  { id: 'panel', horas: 3.3 },
]
const TOTAL = FRENTES.reduce((s, f) => s + f.horas, 0)
const suma = (r: Record<string, number>) => Object.values(r).reduce((s, x) => s + x, 0)

describe('repartir (función pura)', () => {
  it('las horas precargadas del tablero cuadran con el plan (20.25 h)', () => {
    const h = horasPorGrupo(estadoInicial())
    const frentes = ['nucleo', 'normalizador', 'ingesta', 'seguridad', 'panel']
    expect(frentes.reduce((s, f) => s + h[f], 0)).toBeCloseTo(20.25, 5)
    expect(h.nucleo).toBeCloseTo(4.25 + 0.3, 5)
    expect(h.ingesta).toBeCloseTo(4.75 + 0.3, 5)
  })

  it('2 personas: voraz por horas, carga lo más pareja posible', () => {
    const r = repartir({ personas: ['a', 'b'], frentes: FRENTES })
    // LPT: ingesta→a (5.05), núcleo→b (4.55), normalizador→b, seguridad→a, panel→b.
    expect(Object.values(r.dueno).every((d) => d === 'a' || d === 'b')).toBe(true)
    expect(suma(r.carga)).toBeCloseTo(TOTAL, 5)
    expect(Math.abs(r.carga.a - r.carga.b)).toBeLessThanOrEqual(3.6)
    expect(r.dueno.ingesta).toBe('a')
    expect(r.dueno.nucleo).toBe('b')
    // Determinista: misma entrada, misma salida.
    expect(repartir({ personas: ['a', 'b'], frentes: FRENTES })).toEqual(r)
  })

  it('3 personas: el frente más pesado va a quien tiene menos carga', () => {
    const r = repartir({ personas: ['a', 'b', 'c'], frentes: FRENTES })
    expect(r.dueno).toEqual({ ingesta: 'a', nucleo: 'b', normalizador: 'c', seguridad: 'c', panel: 'b' })
    expect(r.carga).toEqual({ a: 5.05, b: 7.85, c: 7.35 })
    expect(Object.values(r.apoyo).flat()).toEqual([])
  })

  it('5 personas: un frente por persona, de mayor a menor', () => {
    const r = repartir({ personas: ['a', 'b', 'c', 'd', 'e'], frentes: FRENTES })
    expect(r.dueno).toEqual({ ingesta: 'a', nucleo: 'b', normalizador: 'c', seguridad: 'd', panel: 'e' })
    expect(r.carga).toEqual({ a: 5.05, b: 4.55, c: 3.8, d: 3.55, e: 3.3 })
  })

  it('7 personas: las extra entran como apoyo al frente más pesado y luego al siguiente', () => {
    const r = repartir({ personas: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], frentes: FRENTES })
    expect(r.dueno.ingesta).toBe('a')
    expect(r.apoyo.ingesta).toEqual(['f'])
    expect(r.apoyo.nucleo).toEqual(['g'])
    expect(r.apoyo.panel).toEqual([])
    // Un frente con apoyo reparte sus horas entre dueño y apoyo.
    expect(r.carga.a).toBeCloseTo(2.53, 2)
    expect(r.carga.f).toBeCloseTo(2.53, 2)
    expect(suma(r.carga)).toBeCloseTo(TOTAL, 1)
  })

  it('respeta un ajuste manual vigente y reparte el resto alrededor', () => {
    const r = repartir({ personas: ['a', 'b', 'c'], frentes: FRENTES, manuales: { panel: 'a' } })
    expect(r.dueno.panel).toBe('a')
    // a ya carga 3.3: ingesta (la más pesada) va a b, que está en cero.
    expect(r.dueno.ingesta).toBe('b')
  })

  it('ignora un ajuste manual cuyo dueño ya no está', () => {
    const r = repartir({ personas: ['a', 'b'], frentes: FRENTES, manuales: { panel: 'zz' } })
    expect(['a', 'b']).toContain(r.dueno.panel)
  })

  it('con 5 personas y un manual que da dos frentes a alguien, nadie se queda con frente null', () => {
    const r = repartir({
      personas: ['a', 'b', 'c', 'd', 'e'],
      frentes: FRENTES,
      manuales: { ingesta: 'a', panel: 'a' },
    })
    expect(Object.values(r.dueno).every(Boolean)).toBe(true)
    expect(r.dueno.ingesta).toBe('a')
    expect(r.dueno.panel).toBe('a')
    // Una persona sobra sin frente y queda como apoyo.
    expect(Object.values(r.apoyo).flat()).toHaveLength(1)
  })

  it('sin personas no asigna nada', () => {
    const r = repartir({ personas: [], frentes: FRENTES })
    expect(Object.values(r.dueno).every((d) => d === null)).toBe(true)
    expect(r.carga).toEqual({})
  })
})

// ── El reparto dentro del tablero ───────────────────────────────────────────

function conPersonas(...nombres: string[]): Estado {
  return nombres.reduce((e, nombre) => aplicar(e, { tipo: 'persona.agregar', nombre }), estadoInicial())
}
const idDe = (e: Estado, nombre: string) => e.personas.find((p) => p.nombre === nombre)!.id

describe('reparto en el tablero', () => {
  it('cada tarea hereda el dueño de su frente', () => {
    const e = aplicar(conPersonas('Ana', 'Beto', 'Caro', 'Dani', 'Eva'), { tipo: 'repartir', modo: 'cero' })
    const ingesta = e.grupos.find((g) => g.id === 'ingesta')!
    expect(ingesta.dueno).toBe(idDe(e, 'Ana'))
    for (const t of e.tareas.filter((t) => t.grupo === 'ingesta')) expect(t.dueno).toBe(ingesta.dueno)
    // Los grupos extra no entran al reparto.
    expect(e.tareas.filter((t) => t.grupo === 'entrega').every((t) => t.dueno === null)).toBe(true)
  })

  it('"conservar" respeta frentes y tareas fijados a mano; "cero" los borra', () => {
    let e = aplicar(conPersonas('Ana', 'Beto', 'Caro'), { tipo: 'repartir', modo: 'cero' })
    const caro = idDe(e, 'Caro')
    const ana = idDe(e, 'Ana')
    e = aplicar(e, { tipo: 'grupo.asignar', grupo: 'ingesta', persona: caro })
    const tarea = e.tareas.find((t) => t.grupo === 'panel')!
    e = aplicar(e, { tipo: 'tarea.asignar', tarea: tarea.id, persona: ana })

    const conservado = aplicar(e, { tipo: 'repartir', modo: 'conservar' })
    expect(conservado.grupos.find((g) => g.id === 'ingesta')!.dueno).toBe(caro)
    expect(conservado.grupos.find((g) => g.id === 'ingesta')!.manual).toBe(true)
    expect(conservado.tareas.find((t) => t.id === tarea.id)!.dueno).toBe(ana)

    const deCero = aplicar(e, { tipo: 'repartir', modo: 'cero' })
    expect(deCero.grupos.every((g) => !g.manual)).toBe(true)
    expect(deCero.grupos.find((g) => g.id === 'ingesta')!.dueno).toBe(ana)
    const t2 = deCero.tareas.find((t) => t.id === tarea.id)!
    expect(t2.manual).toBe(false)
    expect(t2.dueno).toBe(deCero.grupos.find((g) => g.id === 'panel')!.dueno)
  })

  it('al quitar a una persona sus tareas quedan sin asignar y resaltadas', () => {
    let e = aplicar(conPersonas('Ana', 'Beto', 'Caro'), { tipo: 'repartir', modo: 'cero' })
    const ana = idDe(e, 'Ana')
    const suyas = e.tareas.filter((t) => t.dueno === ana).map((t) => t.id)
    expect(suyas.length).toBeGreaterThan(0)

    e = aplicar(e, { tipo: 'persona.quitar', id: ana })
    expect(e.personas.map((p) => p.nombre)).toEqual(['Beto', 'Caro'])
    for (const id of suyas) {
      const t = e.tareas.find((x) => x.id === id)!
      expect(t.dueno).toBeNull()
      expect(t.huerfana).toBe(true)
    }
    expect(e.grupos.some((g) => g.dueno === ana)).toBe(false)

    // Volver a repartir recoge las huérfanas aunque se conserven ajustes.
    e = aplicar(e, { tipo: 'repartir', modo: 'conservar' })
    for (const id of suyas) {
      const t = e.tareas.find((x) => x.id === id)!
      expect(t.dueno).not.toBeNull()
      expect(t.huerfana).toBe(false)
    }
  })

  it('reasignar el frente completo recoge sus huérfanas', () => {
    let e = aplicar(conPersonas('Ana', 'Beto'), { tipo: 'repartir', modo: 'cero' })
    const ana = idDe(e, 'Ana')
    const beto = idDe(e, 'Beto')
    const frente = e.grupos.find((g) => g.dueno === ana)!.id
    e = aplicar(e, { tipo: 'persona.quitar', id: ana })
    e = aplicar(e, { tipo: 'grupo.asignar', grupo: frente, persona: beto })
    expect(e.tareas.filter((t) => t.grupo === frente).every((t) => t.dueno === beto && !t.huerfana)).toBe(true)
  })

  it('la carga por persona sale de las tareas y suma las horas de los frentes', () => {
    const e = aplicar(conPersonas('Ana', 'Beto', 'Caro'), { tipo: 'repartir', modo: 'cero' })
    const c = cargaPorPersona(e)
    expect(suma(c)).toBeCloseTo(TOTAL, 1)
  })
})
