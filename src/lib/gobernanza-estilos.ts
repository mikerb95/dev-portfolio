// Tokens visuales compartidos por /docs/roles y /docs/raci.
//
// Viven aquí y no en src/data/gobernanza.ts porque son decisiones de interfaz,
// no del modelo. Y no se duplican en cada página porque el color es lo único
// que conecta las dos vistas: si el «estratégico» fuera violeta en la pirámide
// y ámbar en la matriz, el lector no relacionaría una columna con su nivel.

import type { Nivel, RolRaci } from '../data/gobernanza'

export const ACENTO_NIVEL: Record<Nivel, string> = {
  estrategico: 'bg-violet',
  tactico: 'bg-ember',
  operativo: 'bg-cyan',
}

export const TEXTO_NIVEL: Record<Nivel, string> = {
  estrategico: 'text-violet',
  tactico: 'text-ember',
  operativo: 'text-cyan',
}

// R y A son actuación y responsabilidad: se marcan con relleno. C e I son
// participación periférica; con el mismo peso visual la tabla se vuelve un
// mosaico donde no se distingue quién hace de quién se entera.
export const ESTILO_ROL: Record<RolRaci, string> = {
  R: 'bg-lime/15 text-lime border-lime/30',
  A: 'bg-violet/15 text-violet border-violet/30',
  C: 'border-white/15 text-ink-200',
  I: 'border-white/10 text-ink-300',
}
