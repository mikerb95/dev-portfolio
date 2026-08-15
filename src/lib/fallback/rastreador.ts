// Rastreador de degradación por render.
//
// `safeQuery` (RNF-26) evita que una consulta fallida tumbe la página, pero no
// deja rastro de que el dato mostrado es un reemplazo. Para servir datos reales
// desde una fuente alterna hace falta saberlo: la página tiene que poder decir
// "esto viene de una instantánea del 15 de agosto" o "esto se acaba de medir",
// y no puede adivinarlo mirando el resultado.
//
// Es una INSTANCIA POR RENDER, no un módulo con estado. Vercel Fluid Compute
// reutiliza la misma instancia serverless entre requests concurrentes, así que
// un contador a nivel de módulo mezclaría el estado de dos visitantes: uno con
// la base caída marcaría como degradada la página del otro.

export type Rastreador = {
  /** Igual que `safeQuery`, pero anota si tuvo que usar el reemplazo. */
  q<T>(fn: () => Promise<T>, respaldo: T, etiqueta: string): Promise<T>
  /** true si al menos una consulta de este render falló. */
  readonly degradado: boolean
  /** Etiquetas de las consultas que fallaron, para el log y para diagnóstico. */
  readonly fallos: string[]
}

export function crearRastreador(): Rastreador {
  const fallos: string[] = []

  return {
    async q<T>(fn: () => Promise<T>, respaldo: T, etiqueta: string): Promise<T> {
      try {
        return await fn()
      } catch (err) {
        fallos.push(etiqueta)
        // Mismo criterio que safe-query: degradar en la cara del visitante no
        // es degradar en silencio para quien opera el sitio.
        console.error(`[respaldo] ${etiqueta}:`, err instanceof Error ? err.message : err)
        return respaldo
      }
    },
    get degradado() {
      return fallos.length > 0
    },
    get fallos() {
      return [...fallos]
    },
  }
}
