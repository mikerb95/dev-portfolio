import { describe, it, expect } from 'vitest'
import { NIVELES_AUTORIDAD, ORDEN_NIVELES, RACI, REGLAS_RACI, type Nivel, type RolRaci } from '../src/data/gobernanza'

// La lámina de la sustentación afirma dos reglas sobre la matriz ("al menos un R
// y un solo A principal"). Una matriz RACI que las incumple no es una matriz
// incompleta: es una tabla que dice quién manda y miente. Como la página es SSR
// y solo renderiza el dato, nada rompería visiblemente - la fila saldría
// dibujada igual. Estas pruebas convierten esa afirmación en un fallo de CI.

const rolesDe = (asignacion: Record<Nivel, RolRaci[] | null>) =>
  ORDEN_NIVELES.flatMap((n) => asignacion[n] ?? [])

describe('gobernanza · reglas de la matriz RACI', () => {
  it('cada actividad tiene exactamente un Aprobador', () => {
    const infractoras = RACI.filter((a) => rolesDe(a.asignacion).filter((r) => r === 'A').length !== 1).map(
      (a) => a.id,
    )
    expect(infractoras).toEqual([])
  })

  it('cada actividad tiene al menos un Responsable', () => {
    const sinEjecutor = RACI.filter((a) => !rolesDe(a.asignacion).includes('R')).map((a) => a.id)
    expect(sinEjecutor).toEqual([])
  })

  it('declara las dos reglas que la página presenta al lector', () => {
    expect(REGLAS_RACI).toHaveLength(2)
  })
})

describe('gobernanza · consistencia estructural', () => {
  it('cubre los tres niveles de la pirámide, sin duplicados', () => {
    const ids = NIVELES_AUTORIDAD.map((n) => n.id)
    expect(ids).toEqual(ORDEN_NIVELES)
  })

  it('asigna un rol a los tres niveles en cada actividad (o los declara ausentes explícitamente)', () => {
    // Un nivel omitido por olvido y uno omitido a propósito se ven igual en la
    // tabla. El tipo obliga a escribir `null`, esta prueba obliga a que la clave
    // exista: así "no participa" es siempre una decisión, no un descuido.
    const incompletas = RACI.filter((a) => ORDEN_NIVELES.some((n) => !(n in a.asignacion))).map((a) => a.id)
    expect(incompletas).toEqual([])
  })

  it('no repite un mismo rol dentro de una celda', () => {
    const repetidas = RACI.filter((a) =>
      ORDEN_NIVELES.some((n) => {
        const roles = a.asignacion[n] ?? []
        return new Set(roles).size !== roles.length
      }),
    ).map((a) => a.id)
    expect(repetidas).toEqual([])
  })

  it('no repite ids de actividad', () => {
    const ids = RACI.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('toda actividad justifica dónde cae la aprobación y dónde se comprueba', () => {
    const flojas = RACI.filter((a) => !a.porque.trim() || !a.evidencia.trim()).map((a) => a.id)
    expect(flojas).toEqual([])
  })

  it('cada nivel documenta su límite y al menos una evidencia en el repositorio', () => {
    const flojos = NIVELES_AUTORIDAD.filter((n) => !n.noPuede.trim() || n.evidencia.length === 0).map((n) => n.id)
    expect(flojos).toEqual([])
  })
})
