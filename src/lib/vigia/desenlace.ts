// Qué significa, para el vigía, el estado en que quedó una sesión de Managed
// Agents. Módulo puro: el webhook solo trae el tipo y el ID, así que el estado
// real se lee de la sesión y de su último `session.status_idle`, y esto decide.

export type Desenlace =
  /** Terminó su turno: hay (o debería haber) informe. */
  | 'informe'
  /** Pausado por el tope de gasto; no sigue sin que se cambie el tope. */
  | 'tope'
  /** Espera la aprobación de una herramienta (fase 4: escribir en GitHub). */
  | 'aprobacion'
  /** Se agotaron los reintentos o la sesión terminó sin turno completo. */
  | 'error'
  /** Sigue trabajando: el aviso llegó fuera de orden. */
  | 'en_curso'

export type EstadoSesion = 'rescheduling' | 'running' | 'idle' | 'terminated'
export type MotivoParada = 'end_turn' | 'requires_action' | 'retries_exhausted' | 'budget_reached'

export function desenlaceDe(estado: EstadoSesion, motivo: MotivoParada | null): Desenlace {
  if (estado === 'running' || estado === 'rescheduling') return 'en_curso'
  switch (motivo) {
    case 'end_turn':
      return 'informe'
    case 'budget_reached':
      return 'tope'
    case 'requires_action':
      return 'aprobacion'
    default:
      // `terminated` sin un idle que lo explique, o reintentos agotados.
      return 'error'
  }
}

/** Los desenlaces que cierran la corrida y cuentan como ejecución en la bitácora. */
export function cierraCorrida(d: Desenlace): boolean {
  return d === 'informe' || d === 'tope' || d === 'error'
}

/**
 * Los webhooks llegan duplicados y sin orden. Solo se anota en `cron_runs` y
 * se avisa la PRIMERA vez que la corrida llega a un desenlace de cierre; un
 * reenvío del mismo aviso, o un `terminated` después del `idle`, no repite.
 */
export function debeAnunciar(previo: Desenlace | null, nuevo: Desenlace): boolean {
  if (nuevo === 'en_curso') return false
  if (nuevo === 'aprobacion') return previo !== 'aprobacion'
  return cierraCorrida(nuevo) && (previo === null || !cierraCorrida(previo))
}
