// Estado del analista en el escenario: la conversación en curso y el bloqueo
// que espera la decisión del administrador. Vive en `globalThis` y no en el
// módulo porque el dev server re-evalúa los archivos al editarlos, y cada
// copia tendría su propio estado: el botón "Aprobar" resolvería una promesa
// que nadie está esperando.
//
// El prefijo `_` evita que Astro lo publique como ruta.

export type Conversacion = {
  /** Instancia de Seudonimos; se tipa laxo para no importar el motor aquí. */
  seudonimos: unknown
  sesion: string | undefined
}

type Estado = {
  ocupado: boolean
  conversacion: Conversacion | null
  pendiente: ((aprobado: boolean) => void) | null
}

const global = globalThis as typeof globalThis & { __analistaEscenario?: Estado }

export const escenario = (): Estado =>
  (global.__analistaEscenario ??= { ocupado: false, conversacion: null, pendiente: null })
