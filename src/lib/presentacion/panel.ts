// La consola del ponente: lo que se puede decidir SIN DOM sobre el panel
// retráctil de `/present-admin`.
//
// El panel no es una barra de herramientas decorativa: es lo que evita tener
// que mirar el celular mientras se conduce con el portátil. Y como todo lo que
// se pinta delante del público (o a un palmo de él), lo que puede equivocarse
// en silencio se saca aquí y se prueba: el índice del mazo, el ritmo contra el
// guion y el diagnóstico del enlace.
//
// POR QUÉ EMPUJA Y NO SE SUPERPONE. `final.html` encaja su escenario con
// `scale(min(w/1920, h/1080))` y vuelve a hacerlo en cada `resize` de SU
// ventana, que es el iframe. Así que quitarle altura al iframe no tapa nada:
// el mazo se re-encaja solo, entero y más pequeño. Un panel superpuesto, en
// cambio, se comería justo la franja donde el bundle pinta su contador y la
// barra de navegación de la página viva durante la demo.
//
// Lo que NO cambia al abrir el panel es la geometría de scroll que se publica
// a la sala: el iframe vivo está dentro del escenario de 1920 con píxeles
// fijos, así que solo cambia su escala visual, nunca su `y` ni su `max`.

import { notaDePunto } from './guion'
import { aPunto, totalGlobal, type Mazo } from './mapa'

/* ---------------------------------------------------------------------- *
 * El estado del panel
 * ---------------------------------------------------------------------- */

/**
 * Tres estados y no dos, porque son tres necesidades distintas:
 *
 *  · `oculto`  - el mazo a pantalla completa, para ensayar el encuadre y para
 *    el momento en que se proyecta desde esta misma salida.
 *  · `barra`   - una franja fina: cronómetro, posición, qué diapositiva sigue.
 *    Lo mínimo para no perder el hilo sin perder pantalla.
 *  · `consola` - guion, rejilla e instrumentos. Es el estado normal de trabajo
 *    en el portátil del ponente, que es una ventana que la sala no ve.
 */
export type Modo = 'oculto' | 'barra' | 'consola'

export const MODOS: readonly Modo[] = ['oculto', 'barra', 'consola']

/** El ciclo de la tecla y del tirador, en el orden en que abre. */
export function siguienteModo(m: Modo): Modo {
  const i = MODOS.indexOf(m)
  return MODOS[(i + 1) % MODOS.length] ?? 'oculto'
}

/**
 * El modo recordado entre recargas. Cualquier basura cae en `consola` y no en
 * `oculto`: una recarga a mitad de charla no puede dejar al ponente sin guion,
 * y recuperar el panel es una tecla mientras que descubrir que se perdió es
 * mirar una pantalla vacía delante del jurado.
 */
export function parsearModo(v: unknown): Modo {
  return MODOS.includes(v as Modo) ? (v as Modo) : 'consola'
}

/* ---------------------------------------------------------------------- *
 * El índice del mazo
 * ---------------------------------------------------------------------- */

export type Entrada = {
  /** Índice global, el mismo número que entiende el servidor. */
  n: number
  zona: 'intro' | 'beat' | 'outro'
  /** El del guion, o vacío si esa diapositiva todavía no tiene notas. */
  titulo: string
  /** Segundos estimados. 0 tanto si no hay nota como si la nota no los da. */
  dur: number
}

/**
 * El mazo entero como lista navegable. Sale de la FORMA que descubrió la
 * pantalla, no de la longitud del guion: un beat nuevo sin notas escritas
 * tiene que aparecer igual en la rejilla, con el título vacío, o el salto
 * directo dejaría de alcanzarlo justo cuando más falta hace.
 */
export function indice(m: Mazo): Entrada[] {
  return Array.from({ length: totalGlobal(m) }, (_, i) => {
    const p = aPunto(m, i + 1)
    const nota = notaDePunto(p)
    return { n: i + 1, zona: p.zona, titulo: nota?.titulo ?? '', dur: nota?.dur ?? 0 }
  })
}

/** El título de una posición, para la barra fina. Vacío si no hay guion. */
export function tituloDe(m: Mazo, n: number): string {
  return notaDePunto(aPunto(m, n))?.titulo ?? ''
}

/* ---------------------------------------------------------------------- *
 * El ritmo
 * ---------------------------------------------------------------------- */

/**
 * Cuánto se puede ir desviado antes de que valga la pena decirlo. Un minuto:
 * por debajo de eso el aviso sería ruido en cada diapositiva y lo que produce
 * es acelerar sin motivo, que es peor que ir corto.
 */
export const TOLERANCIA_MS = 60_000

export type Senal = 'sin-reloj' | 'sin-guion' | 'a-tiempo' | 'largo' | 'corto'

export type Ritmo = {
  senal: Senal
  /** Lo que se lleva de más (positivo) o de menos. `null` sin datos. */
  desvioMs: number | null
  /** Lo que el guion todavía tiene por delante, la actual incluida, en ms. */
  restanteMs: number
}

/**
 * Lo que el guion dice que ya debería haberse hablado al LLEGAR a `n`, en
 * segundos. Las diapositivas anteriores, no la actual: el reloj de la actual
 * está corriendo.
 */
export function estimadoHasta(m: Mazo, n: number): number {
  return indice(m)
    .filter((e) => e.n < n)
    .reduce((s, e) => s + e.dur, 0)
}

/** Lo que el guion estima para el mazo completo, en segundos. */
export function estimadoTotal(m: Mazo): number {
  return indice(m).reduce((s, e) => s + e.dur, 0)
}

/**
 * Si se va largo o corto respecto al guion.
 *
 * `sin-guion` cuando el tramo recorrido no tiene ni una estimación: un desvío
 * calculado contra cero diría "vas 8 minutos largo" en el minuto ocho de una
 * charla que va perfecta, y ese es exactamente el aviso que hace acelerar a
 * quien no debía.
 */
export function ritmo(m: Mazo, n: number, transcurridoMs: number | null): Ritmo {
  const gastado = estimadoHasta(m, n)
  const restanteMs = Math.max(0, (estimadoTotal(m) - gastado) * 1000)
  if (transcurridoMs === null || !Number.isFinite(transcurridoMs)) {
    return { senal: 'sin-reloj', desvioMs: null, restanteMs }
  }
  if (gastado <= 0) return { senal: 'sin-guion', desvioMs: null, restanteMs }
  const desvioMs = transcurridoMs - gastado * 1000
  const senal =
    desvioMs > TOLERANCIA_MS ? 'largo' : desvioMs < -TOLERANCIA_MS ? 'corto' : 'a-tiempo'
  return { senal, desvioMs, restanteMs }
}

/** `+1:20` / `-0:45`, con el signo delante porque el signo es la información. */
export function formatearDesvio(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return ''
  const total = Math.round(Math.abs(ms) / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${ms < 0 ? '-' : '+'}${m}:${String(s).padStart(2, '0')}`
}

/* ---------------------------------------------------------------------- *
 * La salud del enlace
 * ---------------------------------------------------------------------- */

export type Estado = 'sin-mazo' | 'sin-red' | 'cerrando' | 'moviendo' | 'en-linea'

export type Salud = { estado: Estado; texto: string }

/**
 * Qué decir del enlace, en el orden en que importa: primero lo que impide
 * conducir, después lo que solo está en curso.
 *
 * `sin-red` va DESPUÉS de `sin-mazo` a propósito: sin bundle descubierto no
 * hay nada que publicar, y culpar a la red de eso mandaría a mirar el WiFi
 * cuando lo que hay que hacer es recargar el lienzo.
 */
export function salud(v: {
  hayMazo: boolean
  hayRed: boolean
  aplicando: boolean
  pos: number
  destino: number
  /** Segundos para irse a la página de cierre, o `null` si no hay cuenta. */
  cierre?: number | null
}): Salud {
  if (!v.hayMazo) return { estado: 'sin-mazo', texto: 'montando el mazo' }
  if (!v.hayRed) return { estado: 'sin-red', texto: 'sin red, el mazo sigue' }
  // Antes que el movimiento: mientras la cuenta corre lo único que importa
  // saber es que la ventana se va a ir, y que retroceder la desarma.
  if (typeof v.cierre === 'number') {
    return { estado: 'cerrando', texto: `cierre en ${v.cierre}s · atrás lo cancela` }
  }
  if (v.aplicando || v.destino !== v.pos) {
    const verbo = v.destino > v.pos ? 'avanzando' : 'volviendo'
    return { estado: 'moviendo', texto: `${verbo} a ${v.destino}` }
  }
  return { estado: 'en-linea', texto: 'en línea' }
}

/* ---------------------------------------------------------------------- *
 * Los atajos de las páginas vivas
 * ---------------------------------------------------------------------- */

/**
 * Las tres páginas que el mazo enmarca, para volver a la buena de un clic
 * cuando una demo se pierde en una subruta con el público delante.
 *
 * Al portal se entra SIEMPRE por el pase de demo pública y nunca con
 * credenciales: lo que viaja a la sala es la URL, no la sesión, y una sesión
 * de verdad dejaría a la sala mirando el formulario de entrada mientras en la
 * pared se ve el panel. Es la regla del runbook, no un detalle.
 */
export const ATAJOS: readonly { titulo: string; href: string }[] = [
  { titulo: 'Demo del portal', href: '/api/portal/demo' },
  { titulo: 'Login del portal', href: '/portal/login' },
  { titulo: 'Estado', href: '/status' },
  { titulo: 'Ingeniería', href: '/engineering' },
]

/**
 * A dónde navegar dentro del iframe vivo. Se resuelve contra la URL que ya
 * tiene, no contra el origen de esta ventana: en local el mazo enmarca
 * producción, y un atajo relativo a `localhost` llevaría a una página que no
 * existe. `null` si no se sabe dónde está (otro origen, o aún sin navegar).
 */
export function destinoAtajo(actual: string | null, href: string): string | null {
  if (!actual) return null
  try {
    return new URL(href, actual).href
  } catch {
    return null
  }
}
