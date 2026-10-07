// Lo que Mike ve antes de aprobar una escritura que CAMBIA algo que ya existe
// (proyecto, hito, mensaje) o anota algo nuevo (seguimiento): una tarjeta con
// el antes y el después, campo por campo. La cuenta de cobro tiene su propia
// tarjeta porque lleva totales; todo lo demás cabe en esta forma.
//
// La arma siempre el servidor desde la base, nunca el modelo: lo que se aprueba
// es lo que dice la base, no lo que el modelo cree que había.
//
// Módulo puro: lo importan las escrituras (servidor) y el cliente del panel.

export type CampoCambio = {
  campo: string
  /** null = el campo estaba vacío o es nuevo. */
  antes: string | null
  /** null = el campo queda vacío. */
  despues: string | null
}

export type VistaCambio = {
  tipo: 'cambio'
  /** "Proyecto", "Hito del proyecto", "Seguimiento nuevo", "Mensajes". */
  rotulo: string
  /** El nombre de la cosa: título del proyecto, del hito, etc. */
  titulo: string
  /** Una línea de contexto: cliente, proyecto. */
  contexto: string | null
  cambios: CampoCambio[]
  /**
   * Lo que pasa fuera del panel al aprobar (el cliente lo ve en su portal, le
   * llega un correo). Va en grande en la tarjeta: es lo que no se deshace.
   */
  avisos: string[]
  /** Texto del botón de aprobar: "Aprobar y guardar", "Aprobar y anotar". */
  boton: string
  /** Pie de la tarjeta. */
  nota: string
}

/** Resultado de una escritura ya hecha, para el enlace de "listo" en el hilo. */
export type Hecho = { hecho: true; resumen: string; enlace: string }

const ESTADOS: Record<string, string> = {
  activo: 'Activo',
  pausado: 'Pausado',
  completado: 'Completado',
  archivado: 'Archivado',
  pendiente: 'Pendiente',
  en_curso: 'En curso',
}

export const etiquetaEstado = (e: string | null | undefined): string | null => (e ? (ESTADOS[e] ?? e) : null)

/** Solo los campos que de verdad cambian: una tarjeta con "Activo → Activo" confunde. */
export const soloDistintos = (cambios: CampoCambio[]): CampoCambio[] => cambios.filter((c) => c.antes !== c.despues)
