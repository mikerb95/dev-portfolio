// Reglas de la bandeja de ejemplo de /ep ("así busca el instructor"). Módulo
// puro: lo usan la animación y sus pruebas.
//
// El instructor no lee la bandeja de arriba abajo: busca por el comienzo del
// asunto ("Bitácora 4") para juntar las entregas de un mes. La bandeja de
// ejemplo aplica esa misma búsqueda, así que lo que se ve apagado es
// literalmente lo que no aparece al buscar.

/** Lo que el instructor escribe en el buscador: el tramo antes de la primera coma. */
export function consultaBandeja(asunto: string): string {
  return asunto.split(',')[0].trim()
}

/**
 * Coincide si el asunto arranca con la consulta y ahí termina el primer tramo.
 * Sin ese corte, "Bitácora 4" encontraría "Bitácora 40", y un buscador real
 * por prefijo de campo tampoco lo haría.
 */
export function coincideBandeja(asunto: string, consulta: string): boolean {
  if (!consulta) return false
  return consultaBandeja(asunto) === consulta
}
