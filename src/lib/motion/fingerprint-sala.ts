// Lógica de las piezas de /lab/fingerprint (entrada y tablero): qué señales
// ya se leyeron, cuánto pesa la huella y cómo se dibuja una huella dactilar en
// SVG desde los mismos parámetros que usa la portada (huella.ts).
//
// Se dibuja con SVG y no con el shader de la portada porque el tablero pinta
// una huella por dispositivo: un contexto WebGL por tarjeta se agotaría en
// cuanto la sala se llene.
//
// Módulo puro: sin DOM, probado en tests/motion-fingerprint.test.ts.

import { parametrosDe, type ParametrosHuella } from './huella'

// ── Libro de señales (entrada) ─────────────────────────────────────────────

/**
 * Las claves de señal (las de `collectSignals`) que respalda cada línea de la
 * lista "qué vamos a recolectar", en el orden del diccionario. La última línea
 * (movimiento de mouse y tecleo) no es una señal del recolector: solo existe
 * dentro de la sala, así que no tiene claves.
 */
export const LIBRO: readonly (readonly string[])[] = [
  ['canvas', 'webgl'],
  ['audio'],
  ['fonts', 'screen'],
  ['timezone', 'languages', 'hwConcurrency'],
  [],
]

/** Señales que se leen sin pedir nada: solo APIs de lectura, sin cómputo pesado. */
export const CLAVES_BASICAS = [
  'webgl', 'screen', 'timezone', 'hwConcurrency', 'deviceMemory', 'platform', 'languages', 'touch', 'ua',
] as const

/**
 * Suma de los pesos de las 12 señales de `collectSignals`: el fondo de
 * escala del medidor. Es una copia a propósito (el recolector solo corre en
 * el navegador y no se importa desde aquí); un test la compara contra el
 * código del recolector para que no se desalineen.
 */
export const BITS_MAX = 38

export type EstadoLinea = { leidas: number; total: number; soloSala: boolean }

/** Por cada línea del libro, cuántas de sus señales ya se leyeron. */
export function estadoLibro(leidas: Iterable<string>): EstadoLinea[] {
  const set = new Set(leidas)
  return LIBRO.map((claves) => ({
    leidas: claves.filter((c) => set.has(c)).length,
    total: claves.length,
    soloSala: claves.length === 0,
  }))
}

/** "1 en N": 2^bits. Con bits inválidos o negativos devuelve 1 (nadie se distingue). */
export function unosEn(bits: number): number {
  return Number.isFinite(bits) && bits > 0 ? 2 ** bits : 1
}

// ── Huella en SVG ──────────────────────────────────────────────────────────

/** Lienzo del dibujo (viewBox). Un dedo es más alto que ancho. */
export const LIENZO = { ancho: 100, alto: 120 } as const

/**
 * Óvalo de la yema: las crestas que se pasan (lazo alto, espiral de dos
 * vueltas) se recortan aquí en vez de aplastar el dibujo para que quepa. Un
 * dedo real también termina en un borde, no en un círculo perfecto.
 */
export const YEMA = { cx: 50, cy: 60, rx: 47, ry: 57 } as const

/**
 * Los ids de la API del tablero traen 12 caracteres hex (6 bytes): alcanzan
 * para los seis primeros parámetros, pero `parametrosDe` rellena con ceros
 * lo que falta y todas las huellas saldrían con el mismo desplazamiento y el
 * mismo lazo. Aquí lo que falta se deriva de lo que sí hay (mezcla, no azar:
 * el mismo id da siempre la misma huella).
 */
export function parametrosDeId(id: string): ParametrosHuella {
  const limpio = id.replace(/[^0-9a-f]/gi, '').toLowerCase().padEnd(12, '0').slice(0, 12)
  const base = parametrosDe(limpio)
  let h = 0x9e3779b1
  for (let i = 0; i < limpio.length; i++) h = Math.imul(h ^ limpio.charCodeAt(i), 0x85ebca6b) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  const b6 = (h & 0xff) / 255
  const b7 = ((h >>> 8) & 0xff) / 255
  const r = (n: number) => Math.round(n * 1000) / 1000
  return { ...base, ry: r(-40 + b6 * 80), lazo: r(b7 * 0.9) }
}

/** Huella que muestran todos los usuarios de Tor Browser: la misma, a propósito. */
export const PARAMETROS_TOR: ParametrosHuella = {
  cx: 0,
  cy: 0.02,
  aniso: 0.82,
  fase: 0,
  espiral: 0,
  rx: 0,
  ry: 0,
  lazo: 0.35,
}

/**
 * Precisión reducida: cada parámetro se redondea a una rejilla gruesa. Es lo
 * que hace `privacy.resistFingerprinting` con las señales (mide menos fino),
 * y su efecto es real: huellas que antes se distinguían caen en la misma
 * casilla, pero no todas, porque la rejilla no borra la diferencia entera.
 */
export function reducirPrecision(p: ParametrosHuella, paso: number): ParametrosHuella {
  const q = (v: number, unidad: number) => Math.round(v / (unidad * paso)) * unidad * paso
  const r = (n: number) => Math.round(n * 1000) / 1000
  const vuelta = Math.PI * 2
  return {
    cx: r(q(p.cx, 0.05)),
    cy: r(q(p.cy, 0.05)),
    aniso: r(Math.min(0.95, Math.max(0.7, q(p.aniso, 0.1)))),
    // La fase es un ángulo: el redondeo se envuelve en una vuelta.
    fase: r((q(p.fase, Math.PI / 3) % vuelta + vuelta) % vuelta || 0),
    espiral: p.espiral,
    rx: r(q(p.rx, 40)),
    ry: r(q(p.ry, 40)),
    lazo: r(Math.min(0.9, Math.max(0, q(p.lazo, 0.45)))),
  }
}

/**
 * Cuatro dispositivos inventados para la comprobación de defensas del
 * tablero (ilustrativos: no son de ninguna sala). Ids fijos, así la
 * comprobación es reproducible.
 */
export const EJEMPLOS_DEFENSA = ['3fa9c01d7be2', 'a1b2c3d4e5f6', '7c10e9b4d283', 'e04b5f6a91c7'] as const

/** Paso de la rejilla de "Firefox + resistFingerprinting" en la comprobación. */
export const PASO_FIREFOX = 4

/** Cuántas huellas distintas quedan en una lista de parámetros (redondeados a 3 decimales). */
export function huellasDistintas(lista: readonly ParametrosHuella[]): number {
  return new Set(lista.map((p) => JSON.stringify(p))).size
}

export type OpcionesCrestas = { anillos?: number; puntos?: number }

const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * Crestas de la huella: un anillo por cresta, del centro hacia afuera. El
 * núcleo, la espiral y el lazo salen de los parámetros; el ruido (rx, ry)
 * rompe la regularidad como las bifurcaciones de una huella real. Cada
 * cresta es un trazo abierto: con espiral > 0, el final de un anillo empalma
 * con el inicio del siguiente y el conjunto se lee como una sola espiral.
 *
 * Devuelve los `d` de los paths, del más interno al más externo. Funciona
 * con parámetros no enteros a propósito: así una animación puede interpolar
 * de una huella a otra (Tor, precisión reducida) sin saltos.
 */
export function crestas(p: ParametrosHuella, { anillos = 15, puntos = 72 }: OpcionesCrestas = {}): string[] {
  const salida: string[] = []
  const cx = LIENZO.ancho / 2 + p.cx * LIENZO.ancho
  const cy = LIENZO.alto / 2 + p.cy * LIENZO.alto
  for (let i = 0; i < anillos; i++) {
    const t = (i + 0.6) / anillos
    let d = ''
    for (let k = 0; k <= puntos; k++) {
      const th = (k / puntos) * Math.PI * 2
      const seno = Math.sin(th)
      // Radio: ondulación angular del patrón + vueltas de la espiral + ruido
      // que crece hacia el borde (el núcleo se mantiene limpio).
      let radio =
        t *
        (1 +
          0.07 * Math.sin(3 * th + p.fase + i * 0.22) +
          0.025 * Math.sin(5 * th + p.rx * 0.1) * t +
          0.025 * Math.sin(7 * th + p.ry * 0.1) * t)
      radio += (p.espiral * (th / (Math.PI * 2))) / anillos
      // Lazo: por la parte baja las crestas exteriores se estiran, como en un
      // patrón en lazo; con lazo = 0 queda un verticilo cerrado.
      const estirar = seno > 0 ? 1 + p.lazo * 0.4 * t * t * seno : 1
      const x = cx + radio * 40 * p.aniso * Math.cos(th) * 1.15
      const y = cy + radio * 43 * seno * estirar
      d += `${k === 0 ? 'M' : 'L'}${r1(x)} ${r1(y)}`
    }
    salida.push(d)
  }
  return salida
}
