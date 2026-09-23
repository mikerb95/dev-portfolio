// Parámetros de la huella dactilar generativa de la portada (sección Lab).
//
// El dibujo sale del mismo hash que usa el laboratorio de fingerprinting para
// reconocer al visitante (collectSignals en src/lib/fingerprint-client.ts): la
// huella que ve en la portada es literalmente su identificador, dibujado. Dos
// navegadores distintos dan dos huellas distintas; el mismo navegador, aunque
// abra una ventana de incógnito, da la misma. Ese es todo el argumento del
// laboratorio, y aquí se ve antes de entrar.
//
// Módulo puro: sin DOM, probado en tests/motion-huella.test.ts. El hash nunca
// sale del navegador; este módulo solo lo convierte en números para el shader.

export type ParametrosHuella = {
  /** Centro del núcleo, desplazado del centro del lienzo. */
  cx: number
  cy: number
  /** Achatamiento horizontal del núcleo (1 = circular). */
  aniso: number
  /** Fase de las modulaciones angulares. */
  fase: number
  /** Vueltas de espiral en el núcleo: 0 (anillos), 1 o 2. Entero a propósito. */
  espiral: number
  /** Desplazamiento del ruido que rompe las crestas en bifurcaciones. */
  rx: number
  ry: number
  /** Cuánto se abre el patrón en lazo por la parte baja (0 = verticilo). */
  lazo: number
}

/** Huella neutra: la que se dibuja mientras se leen las señales. */
export const HUELLA_NEUTRA: ParametrosHuella = {
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
 * Del hash (hex, el sha256 del recolector) a parámetros. Cada parámetro sale
 * de su propio par de bytes, así que un cambio en una sola señal del
 * navegador cambia el hash entero y con él la huella completa, no un detalle.
 *
 * Los rangos están acotados para que toda huella posible siga pareciendo una
 * huella: el núcleo nunca se sale del dedo y la espiral es siempre un número
 * entero de vueltas (con uno fraccionario, el corte del ángulo dejaría una
 * costura visible en las crestas).
 */
export function parametrosDe(hash: string): ParametrosHuella {
  const limpio = hash.replace(/[^0-9a-f]/gi, '').padEnd(24, '0')
  const byte = (i: number) => parseInt(limpio.slice(i * 2, i * 2 + 2), 16) / 255
  const rango = (i: number, min: number, max: number) => min + byte(i) * (max - min)
  const redondear = (n: number) => Math.round(n * 1000) / 1000
  return {
    cx: redondear(rango(0, -0.05, 0.05)),
    cy: redondear(rango(1, -0.04, 0.08)),
    aniso: redondear(rango(2, 0.7, 0.95)),
    fase: redondear(rango(3, 0, Math.PI * 2)),
    espiral: Math.floor(byte(4) * 2.999),
    rx: redondear(rango(5, -40, 40)),
    ry: redondear(rango(6, -40, 40)),
    lazo: redondear(rango(7, 0, 0.9)),
  }
}

/** Identificador corto para mostrar junto a la huella (primeros 8 del hash). */
export const idCorto = (hash: string) => hash.slice(0, 8).toLowerCase()
