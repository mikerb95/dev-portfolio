import { describe, expect, it } from 'vitest'
import {
  CAUSAS,
  JUSTIFICACION,
  OBJETIVOS_ESPECIFICOS,
  OBJETIVO_GENERAL,
  PROBLEMA,
  SINTOMAS,
} from '../src/data/planteamiento'
import { REQUISITOS_FUNCIONALES, REQUISITOS_NO_FUNCIONALES } from '../src/data/documentacion'

const idsRequisitos = new Set(
  [...REQUISITOS_FUNCIONALES, ...REQUISITOS_NO_FUNCIONALES].flatMap((m) => m.items).map((r) => r.id),
)
const idsModulos = new Set(REQUISITOS_FUNCIONALES.map((m) => m.id))
const idsSintomas = new Set(SINTOMAS.map((s) => s.id))

describe('planteamiento del problema', () => {
  it('enuncia el problema sin colar dentro la solución', () => {
    // Un planteamiento que ya nombra la herramienta que lo resuelve deja de ser
    // un problema y pasa a ser una justificación disfrazada.
    expect(PROBLEMA.nucleo.length).toBeGreaterThan(200)
    expect(PROBLEMA.pregunta.trim().endsWith('?')).toBe(true)
  })

  it('delimita el alcance en las tres dimensiones, con dentro y fuera', () => {
    expect(PROBLEMA.delimitacion).toHaveLength(3)
    for (const d of PROBLEMA.delimitacion) {
      expect(d.dentro.length, `${d.dimension} sin delimitar hacia dentro`).toBeGreaterThan(60)
      expect(d.fuera.length, `${d.dimension} sin exclusiones`).toBeGreaterThan(40)
    }
  })

  it('da evidencia y consecuencia de cada síntoma', () => {
    expect(SINTOMAS.length).toBeGreaterThanOrEqual(5)
    for (const s of SINTOMAS) {
      expect(s.evidencia.length, `${s.id} sin evidencia`).toBeGreaterThan(40)
      expect(s.consecuencia.length, `${s.id} sin consecuencia`).toBeGreaterThan(40)
    }
  })

  it('no deja síntomas sin causa ni causas sin síntoma', () => {
    // Las dos mitades del árbol de problemas tienen que cerrar: un síntoma
    // huérfano no está explicado, y una causa que no explica nada sobra.
    const explicados = new Set(CAUSAS.flatMap((c) => c.explica))
    expect(SINTOMAS.filter((s) => !explicados.has(s.id)).map((s) => s.id)).toEqual([])
    for (const c of CAUSAS) {
      expect(c.explica.length, `${c.id} no explica ningún síntoma`).toBeGreaterThan(0)
      const fantasmas = c.explica.filter((s) => !idsSintomas.has(s))
      expect(fantasmas, `${c.id} apunta a síntomas inexistentes`).toEqual([])
    }
  })

  it('no repite identificadores', () => {
    const ids = [
      ...SINTOMAS.map((s) => s.id),
      ...CAUSAS.map((c) => c.id),
      ...JUSTIFICACION.map((j) => j.id),
      ...OBJETIVOS_ESPECIFICOS.map((o) => o.id),
    ]
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('justificación', () => {
  it('cubre los ejes en los que se sostiene el proyecto', () => {
    expect(JUSTIFICACION.length).toBeGreaterThanOrEqual(4)
    for (const j of JUSTIFICACION) {
      expect(j.texto.length, `${j.id} sin desarrollo`).toBeGreaterThan(150)
    }
  })
})

describe('objetivos', () => {
  it('enuncia el objetivo general con condiciones falsables', () => {
    expect(OBJETIVO_GENERAL.enunciado.length).toBeGreaterThan(200)
    expect(OBJETIVO_GENERAL.condiciones.length).toBeGreaterThanOrEqual(3)
  })

  it('numera los objetivos específicos de forma correlativa', () => {
    OBJETIVOS_ESPECIFICOS.forEach((o, i) => {
      expect(o.id).toBe(`OBJ-${String(i + 1).padStart(2, '0')}`)
    })
  })

  it('empieza cada objetivo específico por un verbo en infinitivo', () => {
    for (const o of OBJETIVOS_ESPECIFICOS) {
      const primera = o.enunciado.split(' ')[0]
      expect(primera, `${o.id}: «${primera}» no es un infinitivo`).toMatch(/(ar|er|ir)$/)
    }
  })

  it('da indicador, meta y verificación a cada objetivo específico', () => {
    for (const o of OBJETIVOS_ESPECIFICOS) {
      expect(o.indicador.length, `${o.id} sin indicador`).toBeGreaterThan(20)
      expect(o.meta.length, `${o.id} sin meta`).toBeGreaterThan(10)
      expect(o.verificacion.length, `${o.id} sin verificación`).toBeGreaterThan(40)
    }
  })

  it('solo cita requisitos que existen en la documentación', () => {
    // El cruce que hace que este documento no pueda envejecer en silencio: si
    // un RF/RNF se renombra o se retira, el objetivo que lo invocaba falla aquí
    // en vez de quedarse apuntando al vacío.
    for (const o of OBJETIVOS_ESPECIFICOS) {
      expect(o.requisitos.length, `${o.id} no se realiza en ningún requisito`).toBeGreaterThan(0)
      const fantasmas = o.requisitos.filter((r) => !idsRequisitos.has(r))
      expect(fantasmas, `${o.id} cita requisitos inexistentes`).toEqual([])
    }
  })

  it('solo cita módulos funcionales que existen', () => {
    for (const o of OBJETIVOS_ESPECIFICOS) {
      const fantasmas = o.modulos.filter((m) => !idsModulos.has(m))
      expect(fantasmas, `${o.id} cita módulos inexistentes`).toEqual([])
    }
  })

  it('cubre con los objetivos todos los módulos funcionales', () => {
    // Al revés que la prueba anterior: un módulo del sistema que ningún
    // objetivo reclama es funcionalidad construida sin un porqué declarado.
    const cubiertos = new Set(OBJETIVOS_ESPECIFICOS.flatMap((o) => o.modulos))
    const sinObjetivo = [...idsModulos].filter((m) => !cubiertos.has(m))
    expect(sinObjetivo, 'módulos de RF sin objetivo que los justifique').toEqual([])
  })

  it('no reparte el mismo módulo entre varios objetivos', () => {
    const todos = OBJETIVOS_ESPECIFICOS.flatMap((o) => o.modulos)
    expect(new Set(todos).size, 'un módulo reclamado por dos objetivos').toBe(todos.length)
  })
})
