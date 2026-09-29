// Costo de una ejecución del analista, calculado con el `usage` que devuelve
// cada respuesta de la API. Sirve para el tope diario (ejecuciones.ts) y para
// mostrarlo en pantalla. Es una estimación con la tarifa de Opus 5.5: si una
// respuesta la sirvió el modelo de respaldo tras una negativa, la factura real
// puede diferir un poco. La cifra que manda es la de la consola de Claude
// Platform, que además tiene su propio límite de gasto.
//
// Módulo puro.

export const MODELO = 'claude-opus-5-5'

/** USD por millón de tokens (Opus 5.5). La escritura de caché cuesta 1.25x la entrada. */
export const TARIFA = { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5 } as const

export type Uso = { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number }

export const USO_CERO: Uso = { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 }

type UsageApi = {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export function sumarUso(a: Uso, u: UsageApi | null | undefined): Uso {
  return {
    entrada: a.entrada + (u?.input_tokens ?? 0),
    salida: a.salida + (u?.output_tokens ?? 0),
    cacheLectura: a.cacheLectura + (u?.cache_read_input_tokens ?? 0),
    cacheEscritura: a.cacheEscritura + (u?.cache_creation_input_tokens ?? 0),
  }
}

export function costoUsd(u: Uso): number {
  const m = 1_000_000
  return (
    (u.entrada * TARIFA.entrada) / m +
    (u.salida * TARIFA.salida) / m +
    (u.cacheLectura * TARIFA.cacheLectura) / m +
    (u.cacheEscritura * TARIFA.cacheEscritura) / m
  )
}
