// Lee la FORMA y el discurso del mazo desde `public/final.html`, sin tocarlo.
//
// `final.html` es un bundle exportado que se reemplaza entero en cada
// iteración: aquí se lee, nunca se escribe. Todo lo que este repo necesita
// saber de él (cuántos beats trae, cómo se llaman, cuánto duran y qué notas
// nacieron dentro) sale de esta función, para que haya UN solo sitio que
// entienda su formato y no una copia por herramienta.
//
// La extracción evalúa el trozo de datos del script del mazo en un contexto
// de `vm` sin globals: son literales puros (arrays y objetos), no hay I/O ni
// referencias al DOM. Se evalúa el bloque ENTERO hasta el final de `BEATS`
// porque sus entradas referencian constantes declaradas justo encima
// (`ALL`, `LIBS`), y resolverlas a mano sería reimplementar el intérprete.

import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

/**
 * El HTML de la página que el bundler empaqueta, que viaja como una cadena
 * JSON dentro de un `<script type="__bundler/template">`.
 */
export function plantillaDe(html) {
  const marca = '<script type="__bundler/template">'
  const i = html.indexOf(marca)
  if (i === -1) throw new Error('no hay <script type="__bundler/template"> en el bundle')
  const j = html.indexOf('</script>', i)
  return JSON.parse(html.slice(i + marca.length, j).trim())
}

/**
 * El bloque de datos del mazo: desde la primera constante que `BEATS`
 * necesita hasta el cierre de `BEATS`. Se corta por texto y no por AST porque
 * el script trae JSX-ish y plantillas del bundler que ningún parser de JS
 * plano acepta.
 */
export function bloqueDeDatos(fuente) {
  const ini = fuente.indexOf('const NODES')
  const marcaBeats = fuente.indexOf('const BEATS = [')
  if (ini === -1 || marcaBeats === -1) throw new Error('el mazo no declara NODES/BEATS como se esperaba')

  // El cierre de BEATS es el primer `];` en columna cero después de su apertura:
  // los objetos de dentro cierran indentados.
  const fin = fuente.indexOf('\n];', marcaBeats)
  if (fin === -1) throw new Error('no se encuentra el cierre de BEATS')
  return fuente.slice(ini, fin + 3)
}

/** Los beats del mazo, en orden, con lo que hace falta para el guion. */
export function beatsDe(html) {
  const fuente = plantillaDe(html)
  const ctx = createContext(Object.create(null))
  runInContext(bloqueDeDatos(fuente) + '\n;__salida = BEATS;', ctx, { timeout: 5000 })
  const beats = ctx.__salida
  if (!Array.isArray(beats) || beats.length === 0) throw new Error('BEATS salió vacío')
  return beats.map((b, i) => ({
    beat: typeof b.beat === 'number' ? b.beat : i + 1,
    titulo: String(b.contenido ?? '').trim(),
    dur: typeof b.dur === 'number' ? b.dur : 0,
    enPantalla: (b.texto ?? '').trim() || undefined,
    notas: Array.isArray(b.notas) ? b.notas.map(String) : [],
  }))
}

export function leerMazo(ruta = 'public/final.html') {
  return beatsDe(readFileSync(ruta, 'utf8'))
}
