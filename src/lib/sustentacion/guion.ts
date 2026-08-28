// El guion de la sustentación, tal como lo necesita el control remoto.
//
// `docs/guion-sustentacion.json` es la fuente de verdad de los 12 beats y ya
// existe: aquí no se copia ni un número. Este módulo solo lo estrecha a lo que
// el celular tiene que mostrar y lo congela en un tipo.
//
// Se importa ESTÁTICAMENTE, no se lee del disco con `fs`. La diferencia
// importa en Vercel: un `readFile('docs/...')` compila sin quejarse y luego
// falla en producción, porque `docs/` no entra en el bundle de la función. Con
// el import, el JSON viaja dentro del artefacto y el endpoint no toca el
// sistema de archivos.
//
// El control remoto pide este guion UNA vez al cargar y lo guarda en memoria.
// Nunca por beat: son ~9 KB que no cambian durante la charla, y pedirlos en
// cada flecha sería gastar la latencia del 5G justo en el momento en el que
// hace falta que el avance se sienta instantáneo.

import guionCrudo from '../../../docs/guion-sustentacion.json'

export type BeatGuion = {
  /** Número de beat, 1-indexado como en el documento. */
  beat: number
  /** Título corto del beat ("Hook", "Punto de quiebre"). */
  contenido: string
  /** Cuánto debería durar. El control lo usa para el cronómetro por beat. */
  duracion_estimada_s: number
  /** Lo que voy a decir. Es lo único que miro mientras hablo. */
  notas_narracion: string[]
  /** Lo que ven los asistentes de este beat en su celular. */
  vista_celular: { titulo: string; dato: string | null }
}

type BeatCrudo = {
  beat?: unknown
  contenido?: unknown
  duracion_estimada_s?: unknown
  notas_narracion?: unknown
  vista_celular?: { titulo?: unknown; dato?: unknown }
}

const texto = (v: unknown, respaldo = ''): string => (typeof v === 'string' ? v : respaldo)

function normalizar(crudo: BeatCrudo, indice: number): BeatGuion {
  const beat = typeof crudo.beat === 'number' ? crudo.beat : indice + 1
  const celular = crudo.vista_celular ?? {}
  return {
    beat,
    contenido: texto(crudo.contenido, `Beat ${beat}`),
    duracion_estimada_s:
      typeof crudo.duracion_estimada_s === 'number' ? crudo.duracion_estimada_s : 0,
    notas_narracion: Array.isArray(crudo.notas_narracion)
      ? crudo.notas_narracion.filter((n): n is string => typeof n === 'string')
      : [],
    vista_celular: {
      titulo: texto(celular.titulo) || texto(crudo.contenido, `Beat ${beat}`),
      dato: typeof celular.dato === 'string' && celular.dato.trim() ? celular.dato : null,
    },
  }
}

/** Los 12 beats, en orden y ya normalizados. */
export const BEATS: readonly BeatGuion[] = Object.freeze(
  ((guionCrudo as { beats?: BeatCrudo[] }).beats ?? []).map(normalizar)
)

/**
 * Primer y último beat REALES. El control no los deduce: los lee de aquí, para
 * que añadir un beat 13 al guion no exija tocar la máquina de comandos.
 */
export const BEAT_PRIMERO = BEATS.length > 0 ? BEATS[0].beat : 1
export const BEAT_ULTIMO = BEATS.length > 0 ? BEATS[BEATS.length - 1].beat : 1

/** Suma de las duraciones estimadas. El control la muestra como presupuesto. */
export const DURACION_TOTAL_S = BEATS.reduce((t, b) => t + b.duracion_estimada_s, 0)

export function beatDelGuion(beat: number): BeatGuion | null {
  return BEATS.find((b) => b.beat === beat) ?? null
}
