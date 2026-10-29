// Quién puede leer el HTML de un deck en `/decks/<id>.html`.
//
// Los ids son autoincrementales: sin esta regla, quien probara 1, 2, 3... leía
// cualquier deck subido, también los de clientes (auditoría del 20 oct 2026).
// No se cambiaron los ids por unos aleatorios porque el deck no es secreto
// para quien ya lo está viendo: lo que falta es atar cada lectura a una razón
// legítima para verlo. Hay tres, y cada vista que enmarca el deck tiene una:
//
//  · la sesión admin (el panel y el mando);
//  · una presentación viva de ESE deck, que se demuestra con el id de la
//    sesión en `?s=` (lo conocen la pantalla proyectada y el público, que lo
//    recibe en el snapshot tras entrar con el PIN);
//  · un recurso del banco de capacitación que lo enlaza y que el visitante
//    puede ver (público, o del grupo con su pase).
//
// Módulo puro: la ruta resuelve cada pieza y aquí solo se decide.

export type MotivoDeck = 'admin' | 'presentacion' | 'banco'

export type PruebasDeck = {
  deckId: number
  admin: boolean
  /** deckId de la sesión de presentación nombrada en `?s=`, si existe. */
  deckDeLaSesion: number | null
  /** Hay un recurso visible para este visitante que enlaza este deck. */
  enBancoVisible: boolean
}

export function motivoParaLeerDeck(p: PruebasDeck): MotivoDeck | null {
  if (p.admin) return 'admin'
  if (p.deckDeLaSesion !== null && p.deckDeLaSesion === p.deckId) return 'presentacion'
  if (p.enBancoVisible) return 'banco'
  return null
}

/**
 * Id de sesión aceptable en `?s=`. Antes de ir a Redis se descarta lo que no
 * tiene forma de id, para que probar basura no cueste una consulta.
 */
export function sesionDeConsulta(raw: string | null): string | null {
  if (!raw) return null
  return /^[A-Za-z0-9_-]{8,64}$/.test(raw) ? raw : null
}

/** URL del deck para una vista de presentación (pantalla y público). */
export function deckSrcDeSesion(deckId: number, sessionId: string): string {
  return `/decks/${deckId}.html?s=${encodeURIComponent(sessionId)}`
}
