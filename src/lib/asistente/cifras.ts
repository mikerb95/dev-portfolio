// Cifras de dinero que el asistente tiene permitido citar: las que devolvieron
// sus herramientas en la sesión. Las herramientas formatean el dinero siempre
// con la misma forma ({ valor, moneda, texto }, ver herramientas/tipos.ts), así
// que basta con recorrer los resultados y recoger esos valores.
//
// En la fase 2 la guardia avisa en la terminal y no bloquea: no hay nada que
// salga hacia fuera. Cuando el asistente redacte borradores (fases 3 y 4), la
// misma lista decide si el borrador pasa.
//
// Módulo puro.

import { verificarCifras, type ResultadoGuardia } from './guardia'

const esDinero = (v: unknown): v is { valor: number; moneda: string; texto: string } =>
  !!v && typeof v === 'object' && typeof (v as { valor?: unknown }).valor === 'number' && typeof (v as { moneda?: unknown }).moneda === 'string'

/** Recoge los valores de dinero de un resultado de herramienta, a cualquier profundidad. */
export function recogerCifras(datos: unknown, destino: Set<number> = new Set()): Set<number> {
  if (Array.isArray(datos)) {
    for (const d of datos) recogerCifras(d, destino)
  } else if (esDinero(datos)) {
    destino.add(datos.valor)
    // La guardia redondea a entero lo que lee ("US$12,50" sale como 13): se
    // permiten las dos formas para no avisar de una cifra que sí es real.
    destino.add(Math.round(datos.valor))
  } else if (datos && typeof datos === 'object') {
    for (const v of Object.values(datos)) recogerCifras(v, destino)
  }
  return destino
}

export function revisarRespuesta(texto: string, permitidas: Set<number>): ResultadoGuardia {
  return verificarCifras(texto, [...permitidas])
}
