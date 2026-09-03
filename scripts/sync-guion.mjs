// Adapta `src/data/guion-final.ts` a la forma del mazo actual.
//
//   npm run guion:sync          reescribe el guion
//   npm run guion:sync -- --check   falla si está desalineado (para CI)
//
// El problema que resuelve: el guion vive fuera de `final.html` a propósito
// -el bundle se reemplaza entero y el discurso no puede irse con él- pero esa
// separación tenía un precio que se pagó en la iteración del 3 de septiembre
// de 2026: el mazo pasó de 19 a 25 beats con CUATRO insertados por delante, y
// la lista de notas, escrita a mano y en orden, quedó corrida cuatro puestos.
// Cada nota apuntaba a la diapositiva de al lado, que es peor que no tener
// ninguna.
//
// La salida es que el emparejamiento no sea posicional sino por TÍTULO, que es
// lo único estable entre iteraciones. Así:
//
//  · un beat que ya tenía discurso escrito a mano lo conserva TAL CUAL, aunque
//    haya cambiado de número;
//  · un beat nuevo entra con las notas que el propio mazo trae dentro, marcado
//    para reescribirlo;
//  · un beat que el mazo ya no trae desaparece del guion.
//
// `final.html` NO se toca: este script solo lo lee.

import { readFileSync, writeFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { leerMazo } from './leer-mazo.mjs'

const RUTA = 'src/data/guion-final.ts'

/** Las tres zonas del guion actual, evaluadas desde el .ts sin compilarlo. */
function guionActual(ts) {
  const datos = ts
    .slice(ts.indexOf('export const GUION_INTRO'))
    .replace(/export const (\w+): NotaGuion\[\] =/g, 'var $1 =')
  const ctx = createContext(Object.create(null))
  runInContext(datos + '\n;__salida = { GUION_INTRO, GUION_BEATS, GUION_OUTRO };', ctx, {
    timeout: 5000,
  })
  return ctx.__salida
}

/**
 * El guion de los beats, alineado al mazo. Empareja por título normalizado
 * (sin tildes, sin mayúsculas, sin puntuación) para que un retoque cosmético
 * del rótulo no tire un discurso escrito.
 */
function alinear(mazo, previos) {
  const clave = (s) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()

  const porTitulo = new Map(previos.map((n) => [clave(n.titulo), n]))
  const usados = new Set()

  const beats = mazo.map((b) => {
    const previo = porTitulo.get(clave(b.titulo))
    if (previo) {
      usados.add(clave(b.titulo))
      // La duración SÍ se refresca desde el mazo: es un dato suyo, no discurso.
      return { ...previo, titulo: b.titulo, dur: b.dur || previo.dur }
    }
    return {
      titulo: b.titulo,
      dur: b.dur,
      enPantalla: b.enPantalla,
      notas: b.notas,
      delMazo: true,
    }
  })

  const huerfanos = previos.filter((n) => !usados.has(clave(n.titulo))).map((n) => n.titulo)
  return { beats, huerfanos }
}

const lit = (s) => JSON.stringify(s)

function emitir(n) {
  const l = ['  {']
  l.push(`    titulo: ${lit(n.titulo)},`)
  if (n.dur) l.push(`    dur: ${n.dur},`)
  if (n.enPantalla) l.push(`    enPantalla: ${lit(n.enPantalla)},`)
  if (!n.notas.length) l.push('    notas: [],')
  else {
    l.push('    notas: [')
    for (const nota of n.notas) l.push(`      ${lit(nota)},`)
    l.push('    ],')
  }
  l.push('  },')
  // Marca de procedencia: estas notas son las que venían DENTRO del mazo, que
  // son contenido de la diapositiva, no indicaciones de cómo darla.
  if (n.delMazo) l.splice(1, 0, '    // TODO(guion): notas heredadas del mazo, sin reescribir como discurso.')
  return l.join('\n')
}

function render(cab, intro, beats, outro) {
  return [
    cab.trimEnd(),
    '',
    '/**',
    ' * Capas de entrada, de la primera que se ve a la última. Con el mazo actual:',
    ' * la cita y la portada.',
    ' */',
    'export const GUION_INTRO: NotaGuion[] = [',
    intro.map(emitir).join('\n'),
    ']',
    '',
    '/** Los beats, en orden. `GUION_BEATS[0]` es el beat 1.',
    ' *',
    ' *  Generado por `npm run guion:sync` desde `public/final.html`: el orden y',
    ' *  el número salen del mazo, el discurso se conserva de una corrida a otra',
    ' *  emparejando por título. Se edita a mano sin miedo; la próxima corrida',
    ' *  respeta lo escrito. */',
    'export const GUION_BEATS: NotaGuion[] = [',
    beats.map(emitir).join('\n'),
    ']',
    '',
    '/** Capas de cierre, de la primera que sale a la última. */',
    'export const GUION_OUTRO: NotaGuion[] = [',
    outro.map(emitir).join('\n'),
    ']',
    '',
  ].join('\n')
}

const ts = readFileSync(RUTA, 'utf8')
const cabecera = ts.slice(0, ts.indexOf('/**\n * Capas de entrada'))
const previo = guionActual(ts)
const mazo = leerMazo()
const { beats, huerfanos } = alinear(mazo, previo.GUION_BEATS)

const salida = render(cabecera, previo.GUION_INTRO, beats, previo.GUION_OUTRO)
const check = process.argv.includes('--check')

if (check) {
  if (salida !== ts) {
    console.error('El guion no coincide con el mazo. Corre `npm run guion:sync`.')
    process.exit(1)
  }
  console.log(`guion alineado: ${beats.length} beats`)
} else {
  writeFileSync(RUTA, salida)
  const nuevos = beats.filter((b) => b.delMazo).map((b) => b.titulo)
  console.log(`guion: ${beats.length} beats (${mazo.length} en el mazo)`)
  if (nuevos.length) console.log(`  nuevos, con notas del mazo por reescribir:\n    - ${nuevos.join('\n    - ')}`)
  if (huerfanos.length) console.log(`  descartados (ya no están en el mazo):\n    - ${huerfanos.join('\n    - ')}`)
}
