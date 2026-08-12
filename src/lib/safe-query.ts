// Consulta que no puede tumbar la página que la usa.
//
// El repo ya aplica fail-open a seguridad y observabilidad (si el sensor o el
// rate limiter fallan, el request sigue). Esto lo extiende al RENDER de las
// páginas públicas, que era el agujero: el 10 de agosto de 2026 se agotó la
// cuota de lecturas de Turso y la home devolvió 404 por UNA consulta de
// proyectos. Una portada que depende de que la base esté viva es una portada
// que se cae con la base, y la mayor parte de lo que muestra ni siquiera son
// datos de base.
//
// La regla: en una página pública, un dato que no se pudo leer se pinta como
// ausente. Nunca como un error, y mucho menos como un 404.
//
// NO usar en el panel, el portal ni en nada que cobre o autentique: ahí un dato
// que falta en silencio es peor que un error visible. Esto es solo para lo
// público y agregado.

/**
 * Ejecuta la consulta y devuelve `fallback` si lanza.
 *
 * `label` va al log del servidor para que un fallo siga siendo diagnosticable:
 * degradar en la cara del visitante no significa degradar en silencio para
 * quien opera el sitio.
 */
export async function safeQuery<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.error(`[safe-query] ${label}:`, err instanceof Error ? err.message : err)
    return fallback
  }
}
