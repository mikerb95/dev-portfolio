// Tamaño de los logos de la franja de marcas de la portada (MarcasFranja.astro).
// Módulo puro: lo usan el componente y los tests.

export type Tam = { ancho: number; alto: number }

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
