// Geometría del relieve de marcas de la portada (MarcasRelieve.astro). Módulo
// puro: lo usan el componente (servidor) para colocar los logos, el motor del
// lienzo (navegador) para levantar las cumbres, y los tests.

export type Punto = { x: number; y: number }
export type Tam = { ancho: number; alto: number }

/**
 * Posición de cada cumbre como fracción del escenario, en el orden de MARCAS.
 * No es una rejilla a propósito: dos hileras desfasadas se leen como relieve,
 * una rejilla de 3×2 se lee como "logos de clientes" de plantilla.
 *   · Ancha (escritorio, escenario ~2.4:1): 3 arriba y 3 abajo, corridas.
 *   · Alta (móvil, ~0.55:1): zigzag de dos columnas.
 */
// Entre las dos hileras queda una franja libre: ahí cae la etiqueta de la
// cumbre apuntada (debajo de las de arriba, encima de las de abajo).
export const DISPOSICION_ANCHA: readonly Punto[] = [
  { x: 0.17, y: 0.26 },
  { x: 0.5, y: 0.19 },
  { x: 0.83, y: 0.28 },
  { x: 0.27, y: 0.77 },
  { x: 0.57, y: 0.82 },
  { x: 0.85, y: 0.75 },
]

export const DISPOSICION_ALTA: readonly Punto[] = [
  { x: 0.33, y: 0.11 },
  { x: 0.7, y: 0.27 },
  { x: 0.33, y: 0.43 },
  { x: 0.7, y: 0.58 },
  { x: 0.31, y: 0.74 },
  { x: 0.68, y: 0.89 },
]

/** Exponente de compensación óptica: 0 = mismo alto, 0.5 = misma área. */
export const COMPENSACION = 0.4

/**
 * Tamaño en px de un logo de proporción `p` (ancho/alto) para que todos pesen
 * lo mismo a la vista. El área queda en base² · p^(1 − 2k). Con el mismo alto
 * (k = 0), el wordmark de Antídoto (4.9:1) ocuparía cinco veces la superficie
 * del gorila de Gorillaz (1:1); con la misma área (k = 0.5), los alargados
 * quedan con letra de nota al pie. 0.4 es el punto intermedio que se ve parejo.
 */
export function tamOptico(p: number, base: number, k = COMPENSACION): Tam {
  const alto = base * Math.pow(p, -k)
  return { ancho: alto * p, alto }
}

/**
 * Pares de logos cuyas cajas (más `margen` px por lado) se pisan en un
 * escenario de `ancho`×`alto`. Vacío = la disposición sirve a ese tamaño.
 */
export function solapes(
  puntos: readonly Punto[],
  tams: readonly Tam[],
  ancho: number,
  alto: number,
  margen = 0,
): [number, number][] {
  const cajas = puntos.map((p, i) => ({
    x0: p.x * ancho - tams[i].ancho / 2 - margen,
    x1: p.x * ancho + tams[i].ancho / 2 + margen,
    y0: p.y * alto - tams[i].alto / 2 - margen,
    y1: p.y * alto + tams[i].alto / 2 + margen,
  }))
  const pares: [number, number][] = []
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i]
      const b = cajas[j]
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) pares.push([i, j])
    }
  }
  return pares
}

/** Logos que se salen del escenario (con `margen` px de aire al borde). */
export function fuera(
  puntos: readonly Punto[],
  tams: readonly Tam[],
  ancho: number,
  alto: number,
  margen = 0,
): number[] {
  return puntos.flatMap((p, i) => {
    const x0 = p.x * ancho - tams[i].ancho / 2
    const x1 = p.x * ancho + tams[i].ancho / 2
    const y0 = p.y * alto - tams[i].alto / 2
    const y1 = p.y * alto + tams[i].alto / 2
    return x0 < margen || y0 < margen || x1 > ancho - margen || y1 > alto - margen ? [i] : []
  })
}

/**
 * Acerca `actual` a `objetivo` con decaimiento exponencial: independiente de
 * los fps (a 30 o a 120 fotogramas la cumbre tarda lo mismo en subir).
 */
export function acercar(actual: number, objetivo: number, dt: number, tasa: number): number {
  return objetivo + (actual - objetivo) * Math.exp(-dt * tasa)
}

/** '#rrggbb' → [r, g, b] en 0..1, que es lo que recibe el shader. */
export function hexARgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Índice siguiente/anterior con vuelta, para recorrer las cumbres con flechas. */
export function rotarIndice(i: number, paso: number, total: number): number {
  return (((i + paso) % total) + total) % total
}
