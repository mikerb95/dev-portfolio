/**
 * Detección de violaciones de UNIQUE, compartida por todo lo que apoya su
 * idempotencia en un índice de la base y no en un `select` previo (que siempre
 * tiene una ventana de carrera entre la lectura y la escritura).
 *
 * Vive aparte porque ya son dos los consumidores con nada más en común: la
 * pasarela de pagos y la ingesta de corridas de carga. Dos copias de esto es
 * cómo se termina con un endpoint que responde 500 ante un reintento normal.
 *
 * Recorre la cadena de causas porque Drizzle envuelve el error de libsql
 * (`SQLITE_CONSTRAINT_UNIQUE`) en su propio `DrizzleQueryError`, así que el
 * código original no está en el primer nivel.
 */
export function isUniqueViolation(e: unknown): boolean {
  for (let err = e, depth = 0; err && depth < 5; err = (err as { cause?: unknown }).cause, depth++) {
    const { message, code } = err as { message?: string; code?: string }
    if (/unique|constraint/i.test(message ?? '') || /CONSTRAINT/i.test(code ?? '')) return true
  }
  return false
}
