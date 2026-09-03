#!/usr/bin/env node
/**
 * Adapta `src/data/guion-final.ts` a la forma del mazo actual.
 *
 *   npm run guion:sync              reescribe el guion
 *   npm run guion:sync -- --check   falla si está desalineado (para CI)
 *
 * El problema que resuelve: el guion vive FUERA de `final.html` a propósito
 * -el bundle se reemplaza entero y el discurso no puede irse con él- pero esa
 * separación tenía un precio que se pagó el 3 de septiembre de 2026. El mazo
 * pasó de 19 a 25 beats con CUATRO insertados por delante, y la lista de
 * notas, escrita a mano y leída por posición, quedó corrida cuatro puestos:
 * cada nota apuntaba a la diapositiva de al lado, que es peor que no tener
 * ninguna.
 *
 * La salida es que el emparejamiento no sea posicional sino por TÍTULO, que
 * es lo único estable entre iteraciones del mazo. Así:
 *
 *  · un beat que ya tenía discurso escrito a mano lo conserva TAL CUAL,
 *    aunque haya cambiado de número;
 *  · un beat nuevo entra con las notas que el propio mazo trae dentro,
 *    marcadas con un TODO para reescribirlas como discurso;
 *  · un beat que el mazo ya no trae desaparece del guion, y se avisa.
 *
 * `final.html` NO se toca: este script solo lo lee.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { leerMazo } from './leer-mazo.mjs'

const RUTA = 'src/data/guion-final.ts'

/** Las tres zonas del guion actual, evaluadas desde el .ts sin compilarlo:
 *  de la declaración de tipos para abajo es data pura. */
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
 * Empareja por título normalizado (sin tildes, sin mayúsculas, sin
 * puntuación) para que un retoque cosmético del rótulo en el mazo no tire un
 * discurso ya escrito.
 */
const clave = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * El texto que se hereda del mazo, pasado por la regla de escritura del repo:
 * ni em dashes ni en dashes. El mazo es contenido de diseño y los usa; el
 * guion es código de este repo y no puede. Solo se toca lo HEREDADO: lo que
 * ya estaba escrito a mano se copia tal cual, sin normalizar nada.
 */
const sinRayas = (t) => String(t).replace(/\s*[—–]\s*/g, ' - ')

function alinear(mazo, previos) {
  const porTitulo = new Map(previos.map((n) => [clave(n.titulo), n]))
  const usados = new Set()

  const beats = mazo.map((b) => {
    const previo = porTitulo.get(clave(b.titulo))
    if (!previo) {
      return {
        titulo: sinRayas(b.titulo),
        dur: b.dur,
        enPantalla: b.enPantalla && sinRayas(b.enPantalla),
        notas: b.notas.map(sinRayas),
        delMazo: true,
      }
    }
    usados.add(clave(b.titulo))
    // El TÍTULO se conserva del guion, no se refresca desde el mazo: puede
    // haberse corregido a mano (el mazo escribe `Marco normativo — ISO...`
    // con em dash, que aquí no se puede usar) y el emparejamiento ignora la
    // puntuación, así que la corrección sobrevive a la próxima iteración.
    // La duración SÍ se refresca: es un dato del mazo, no discurso.
    return { ...previo, dur: b.dur || previo.dur }
  })

  return {
    beats,
    huerfanos: previos.filter((n) => !usados.has(clave(n.titulo))).map((n) => n.titulo),
  }
}

/* --- Emisión, en el estilo del repo: comillas simples y sin punto y coma. --- */

const lit = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"

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
  // Va como CAMPO y no como comentario para que sobreviva al viaje de ida y
  // vuelta: el generador se relee a sí mismo en cada corrida, y un comentario
  // se habría perdido en la segunda, dejando de avisar justo cuando todavía
  // hacía falta.
  if (n.delMazo) l.push('    delMazo: true,')
  l.push('  },')
  return l.join('\n')
}

const zona = (doc, nombre, notas) => [doc, `export const ${nombre}: NotaGuion[] = [`, notas.map(emitir).join('\n'), ']'].join('\n')

function render(cabecera, intro, beats, outro) {
  return (
    [
      cabecera.trimEnd(),
      '',
      zona(
        [
          '/**',
          ' * Capas de entrada, de la primera que se ve a la última. Con el mazo actual:',
          ' * la cita y la portada.',
          ' */',
        ].join('\n'),
        'GUION_INTRO',
        intro
      ),
      '',
      zona(
        [
          '/**',
          ' * Los beats, en orden. `GUION_BEATS[0]` es el beat 1.',
          ' *',
          ' * GENERADO por `npm run guion:sync` desde `public/final.html`: el orden y el',
          ' * número de entradas salen del mazo, el discurso se conserva de una corrida a',
          ' * otra emparejando por título. Se edita a mano sin miedo: la próxima corrida',
          ' * respeta lo que haya escrito y solo añade lo que el mazo traiga de nuevo.',
          ' */',
        ].join('\n'),
        'GUION_BEATS',
        beats
      ),
      '',
      zona('/** Capas de cierre, de la primera que sale a la última. */', 'GUION_OUTRO', outro),
      '',
    ].join('\n')
  )
}

const ts = readFileSync(RUTA, 'utf8')
const cabecera = ts.slice(0, ts.indexOf('/**\n * Capas de entrada'))
const previo = guionActual(ts)
const mazo = leerMazo()
const { beats, huerfanos } = alinear(mazo, previo.GUION_BEATS)
const salida = render(cabecera, previo.GUION_INTRO, beats, previo.GUION_OUTRO)

if (process.argv.includes('--check')) {
  if (salida !== ts) {
    console.error(`${RUTA} no coincide con el mazo. Corre \`npm run guion:sync\`.`)
    process.exit(1)
  }
  console.log(`guion alineado con el mazo: ${beats.length} beats`)
} else {
  writeFileSync(RUTA, salida)
  const nuevos = beats.filter((b) => b.delMazo).map((b) => b.titulo)
  console.log(`guion: ${beats.length} beats (${mazo.length} en el mazo)`)
  if (nuevos.length) console.log(`  nuevos, con notas del mazo por reescribir:\n    - ${nuevos.join('\n    - ')}`)
  if (huerfanos.length) console.log(`  descartados (ya no están en el mazo):\n    - ${huerfanos.join('\n    - ')}`)
}
