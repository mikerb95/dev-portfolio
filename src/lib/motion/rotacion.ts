// Reloj del titular rotativo de la portada (RF-038).
//
// Lleva qué cuadro está a la vista y cuánto le queda, y se detiene por
// motivos que se acumulan: el cursor encima, el foco dentro del hero, la
// pestaña oculta o el botón de pausa. Con motivos y no con un booleano porque
// se solapan: quitar el cursor no puede reanudar una rotación que la persona
// pausó a mano.
//
// Módulo PURO: sin DOM ni temporizadores, el script de la portada le pasa el
// tiempo transcurrido en cada fotograma.

export type MotivoPausa = 'cursor' | 'foco' | 'oculto' | 'usuario'

export type Rotacion = {
  /** Avanza `ms`; devuelve el índice nuevo si cambió de cuadro, o null. */
  avanzar: (ms: number) => number | null
  /** Va a un cuadro y reinicia su tiempo. */
  ir: (i: number) => number
  pausar: (motivo: MotivoPausa) => void
  reanudar: (motivo: MotivoPausa) => void
  readonly actual: number
  /** 0..1 del tiempo del cuadro actual. */
  readonly progreso: number
  readonly pausada: boolean
  /** Solo la pausa del botón; la que se muestra como "reanudar". */
  readonly pausadaPorUsuario: boolean
}

export function crearRotacion(total: number, duracionMs: number, inicial = 0): Rotacion {
  if (total < 1) throw new Error('rotación sin cuadros')
  if (duracionMs <= 0) throw new Error('duración inválida')
  const normalizar = (i: number) => ((Math.trunc(i) % total) + total) % total
  let actual = normalizar(inicial)
  let transcurrido = 0
  const motivos = new Set<MotivoPausa>()

  return {
    avanzar(ms) {
      if (motivos.size || total === 1 || !(ms > 0)) return null
      transcurrido += ms
      if (transcurrido < duracionMs) return null
      // Un salto largo (pestaña dormida que no avisó) avanza un solo cuadro:
      // pasar varios de golpe se vería como un parpadeo sin sentido.
      transcurrido = 0
      actual = normalizar(actual + 1)
      return actual
    },
    ir(i) {
      actual = normalizar(i)
      transcurrido = 0
      return actual
    },
    pausar(motivo) {
      motivos.add(motivo)
    },
    reanudar(motivo) {
      motivos.delete(motivo)
    },
    get actual() {
      return actual
    },
    get progreso() {
      return Math.min(1, transcurrido / duracionMs)
    },
    get pausada() {
      return motivos.size > 0
    },
    get pausadaPorUsuario() {
      return motivos.has('usuario')
    },
  }
}
