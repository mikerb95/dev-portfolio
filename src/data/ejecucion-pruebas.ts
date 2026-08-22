// Instantánea de la última corrida completa de la suite, generada por
// `node scripts/report-tests.mjs` desde el XML JUnit de Vitest.
//
// El JSON se versiona a propósito. La alternativa - leer coverage/ o informes/
// en build - no funciona: ambos están en .gitignore, así que en el build de
// Vercel no existen. Y la alternativa de escribir las cifras a mano es
// justamente la que ya dejó /docs/testing desalineado de la realidad.
//
// Regenerar tras cambios grandes en la suite:
//   npx vitest run --reporter=junit --outputFile=informes/tests-junit.xml
//   node scripts/report-tests.mjs

import datos from './ejecucion-pruebas.json'

export type CasoEjecutado = {
  nombre: string
  segundos: number
}

export type SuiteEjecutada = {
  archivo: string
  /** Abre una base libSQL real en un archivo temporal, en vez de ser lógica pura. */
  integracion: boolean
  pruebas: number
  fallos: number
  segundos: number
  /** Solo se guardan los casos de las suites de integración; ver el script. */
  casos: CasoEjecutado[]
}

export type Ejecucion = {
  meta: { capturadaEn: string; fuente: string; comando: string }
  total: {
    pruebas: number
    fallos: number
    archivos: number
    segundos: number
    promedioSegundos: number
  }
  niveles: Record<'unitarias' | 'integracion', { pruebas: number; archivos: number; segundos: number }>
  histograma: { etiqueta: string; n: number }[]
  lentas: CasoEjecutado[]
  suites: SuiteEjecutada[]
}

export const EJECUCION = datos as Ejecucion

export const SUITES_POR_TIEMPO = [...EJECUCION.suites].sort((a, b) => b.segundos - a.segundos)

/** Cuánto más cara es, por prueba, una de integración que una unitaria. */
export const FACTOR_INTEGRACION =
  EJECUCION.niveles.integracion.segundos /
  EJECUCION.niveles.integracion.pruebas /
  (EJECUCION.niveles.unitarias.segundos / EJECUCION.niveles.unitarias.pruebas)

export const formatearDuracion = (s: number): string =>
  s < 1 ? `${(s * 1000).toFixed(s < 0.01 ? 2 : 1)} ms` : `${s.toFixed(2)} s`
