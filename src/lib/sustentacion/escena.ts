// La mecánica del escenario de la sustentación, sin DOM y sin canvas.
//
// Todo lo que aquí vive es aritmética: dónde cae cada nodo, cómo avanza una
// interpolación, y a qué encuadre tiene que ir la cámara para que un grupo de
// nodos quepa sin taparse con el titular. Está fuera de la página por la misma
// razón que `mando.ts`: es lo que puede estar mal de una forma que no se ve
// hasta que estás delante del jurado, y dentro de un `.astro` no se prueba.
//
// El módulo es ISOMORFO (nada de `node:crypto`, `../db` ni `window`): lo
// importa el `<script>` del escenario, y los tests lo corren en Node.

import { NODOS, type NodoEscena } from '../../data/sustentacion-escena'

export const ANCHO = 1920
export const ALTO = 1080

// ── Curvas ──────────────────────────────────────────────────────────────────

export type NombreCurva = 'out' | 'inOut' | 'expo' | 'back' | 'snap' | 'lin'

export const CURVAS: Record<NombreCurva, (t: number) => number> = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  expo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -11 * t)),
  back: (t) => {
    const c = 1.9
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
  },
  snap: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -16 * t)),
  lin: (t) => t,
}

export const acotar = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

// ── Colores ─────────────────────────────────────────────────────────────────

/** `#7dd3fc` → `125,211,252`, que es lo que comen `rgba()` y los gradientes. */
export function componentes(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

export const rgb = (hex: string) => componentes(hex).join(',')

/** Mezcla dos colores. `t=0` devuelve `a`; `t=1`, `b`. */
export function mezclar(a: string, b: string, t: number): string {
  const k = acotar(t, 0, 1)
  const pa = componentes(a)
  const pb = componentes(b)
  return (
    '#' +
    pa
      .map((v, i) => Math.round(v + (pb[i] - v) * k).toString(16).padStart(2, '0'))
      .join('')
  )
}

// ── Disposición ─────────────────────────────────────────────────────────────

export type NodoVivo = NodoEscena & {
  /** Posición de reposo, la que fija la capa. */
  x: number
  y: number
  /** Desplazamiento respecto al reposo. Lo mueven los tweens (beats 9 y 11). */
  dx: number
  dy: number
  /** 0 apagado, 1 encendido. */
  on: number
  /** 1 en primer plano, ~0.28 atenuado. */
  hl: number
  /** 0 sano, 1 en alarma. Solo el middleware lo usa, en el beat 8. */
  warn: number
  /** La etiqueta se pinta a la derecha cuando el nodo viaja a una fila. */
  etiquetaDerecha: boolean
}

/**
 * Una fila por capa, centrada en el eje del escenario. El ancho de una fila se
 * limita a 1360 px: sin ese tope, la capa de nueve servicios se saldría del
 * encuadre y las etiquetas se solaparían justo en el beat que existe para
 * explicar la arquitectura.
 */
const Y_POR_CAPA = [80, 220, 370, 510, 660, 810, 935]
const ANCHO_MAXIMO_FILA = 1360
const SEPARACION = 190
const EJE_X = 800

export function disponerNodos(): Record<string, NodoVivo> {
  const porCapa = new Map<number, NodoEscena[]>()
  for (const n of NODOS) {
    const fila = porCapa.get(n.capa) ?? []
    fila.push(n)
    porCapa.set(n.capa, fila)
  }

  const vivos: Record<string, NodoVivo> = {}
  for (const [capa, fila] of porCapa) {
    const n = fila.length
    const ancho = n === 1 ? 0 : Math.min(ANCHO_MAXIMO_FILA, SEPARACION * (n - 1))
    fila.forEach((nodo, k) => {
      vivos[nodo.id] = {
        ...nodo,
        x: EJE_X + (n === 1 ? 0 : -ancho / 2 + (ancho * k) / (n - 1)),
        y: Y_POR_CAPA[capa] ?? Y_POR_CAPA[Y_POR_CAPA.length - 1],
        dx: 0,
        dy: 0,
        on: 0,
        hl: 1,
        warn: 0,
        etiquetaDerecha: false,
      }
    })
  }
  return vivos
}

// ── Motor de interpolación ──────────────────────────────────────────────────
//
// Propio y de treinta líneas en vez de GSAP, que ya está en el repo: GSAP se
// carga solo en las páginas de marca y traerlo aquí significaría meter una
// librería de animación en la ruta crítica de la sustentación para hacer lo
// único que hace falta, mover números hacia un objetivo. Además, un motor
// propio se puede avanzar a mano en un test (`avanzar(0.5)`), que es
// exactamente lo que hace falta para probar la coreografía sin un navegador.

/** Cualquier objeto con propiedades numéricas: un nodo, la cámara, el HUD. */
type Animable = Record<string, unknown>

type Tween = {
  objeto: Animable
  destino: Record<string, number>
  desde: Record<string, number> | null
  dur: number
  curva: NombreCurva
  espera: number
  transcurrido: number
}

type Temporizador = { alSegundo: number; fn: () => void; transcurrido: number }

export class Motor {
  private tweens: Tween[] = []
  private temporizadores: Temporizador[] = []

  /**
   * Lleva las propiedades de `objeto` hasta `destino`. El estado inicial se
   * captura al ARRANCAR el tween, no al programarlo: con `espera`, el valor de
   * partida tiene que ser el que haya cuando le toque, no el de hace un
   * segundo, o un tween escalonado daría un salto al empezar.
   */
  a(
    objeto: Animable,
    destino: Record<string, number>,
    dur = 0.8,
    curva: NombreCurva = 'out',
    espera = 0
  ): void {
    this.tweens.push({ objeto, destino, desde: null, dur, curva, espera, transcurrido: 0 })
  }

  /** Ejecuta `fn` dentro de `alSegundo` segundos de tiempo de escena. */
  tras(alSegundo: number, fn: () => void): void {
    this.temporizadores.push({ alSegundo, fn, transcurrido: 0 })
  }

  /**
   * Cancela todo. Se llama al entrar a un beat: si los tweens del beat anterior
   * siguieran vivos, seguirían escribiendo sobre los mismos nodos y el beat
   * nuevo se pintaría a medias. Volver atrás con la flecha es justo el caso.
   */
  limpiar(): void {
    this.tweens.length = 0
    this.temporizadores.length = 0
  }

  get pendientes(): number {
    return this.tweens.length + this.temporizadores.length
  }

  /** Avanza `dt` segundos. Devuelve cuántos temporizadores dispararon. */
  avanzar(dt: number): number {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i]
      t.transcurrido += dt
      if (t.transcurrido < t.espera) continue

      if (!t.desde) {
        t.desde = {}
        for (const k of Object.keys(t.destino)) t.desde[k] = Number(t.objeto[k]) || 0
      }

      const p = t.dur <= 0 ? 1 : acotar((t.transcurrido - t.espera) / t.dur, 0, 1)
      const v = CURVAS[t.curva](p)
      for (const k of Object.keys(t.destino)) {
        t.objeto[k] = t.desde[k] + (t.destino[k] - t.desde[k]) * v
      }
      if (p >= 1) this.tweens.splice(i, 1)
    }

    // Los temporizadores se recogen ANTES de ejecutarse: un `fn` que programe
    // más temporizadores (la escalera del beat 8 lo hace) los añadiría al mismo
    // array que se está recorriendo, y el recorrido se comería el siguiente.
    const disparados: Temporizador[] = []
    for (let i = this.temporizadores.length - 1; i >= 0; i--) {
      const t = this.temporizadores[i]
      t.transcurrido += dt
      if (t.transcurrido >= t.alSegundo) {
        this.temporizadores.splice(i, 1)
        disparados.push(t)
      }
    }
    for (const t of disparados) t.fn()
    return disparados.length
  }
}

// ── Cámara ──────────────────────────────────────────────────────────────────

export type Camara = { fx: number; fy: number; s: number }

export type OpcionesEncuadre = {
  /** ¿El beat pinta titular o dato abajo? Entonces se reserva el pie. */
  conTexto: boolean
  /** Tope de acercamiento fijo, para los beats con panel encima. */
  escalaMaxima?: number
  /** Escala forzada, cuando el beat necesita un encuadre estable. */
  escalaFija?: number
}

const BANDA_SUPERIOR = 96
const BANDA_INFERIOR_CON_TEXTO = 812
const BANDA_INFERIOR_LIMPIA = 968
const MARGEN_X = 230
const MARGEN_Y = 150

/**
 * A qué encuadre ir para que `ids` quepa en la banda visible.
 *
 * La banda no es la pantalla entera: cuando el beat tiene titular, los 268 px
 * de abajo son suyos. Sin esa reserva la cámara centra el grupo en la mitad
 * geométrica y el nodo más bajo acaba detrás del texto - lo que en el beat 3,
 * con el grafo completo, deja media capa de datos ilegible.
 *
 * Puro: recibe posiciones y devuelve un encuadre. Es lo que permite probar que
 * el grafo entero cabe sin abrir un navegador.
 */
export function encuadre(
  ids: readonly string[],
  nodos: Record<string, NodoVivo>,
  opts: OpcionesEncuadre
): Camara {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity

  for (const id of ids) {
    const n = nodos[id]
    if (!n) continue
    x0 = Math.min(x0, n.x)
    x1 = Math.max(x1, n.x)
    y0 = Math.min(y0, n.y)
    y1 = Math.max(y1, n.y)
  }

  // Sin nodos válidos se encuadra el grafo entero: el beat 1 abre con el grafo
  // apagado y aun así la cámara tiene que estar donde va a estar en el beat 2,
  // o el encendido llegaría acompañado de un salto de cámara.
  if (x0 > x1) {
    x0 = 140
    x1 = 1460
    y0 = 80
    y1 = 935
  }

  const arriba = BANDA_SUPERIOR
  const abajo = opts.conTexto ? BANDA_INFERIOR_CON_TEXTO : BANDA_INFERIOR_LIMPIA
  const w = x1 - x0 + MARGEN_X * 2
  const h = y1 - y0 + MARGEN_Y * 2

  let s = acotar(Math.min(1760 / w, (abajo - arriba) / h), 0.66, 1.75)
  if (opts.escalaMaxima != null) s = Math.min(s, opts.escalaMaxima)
  if (opts.escalaFija != null) s = opts.escalaFija

  // El desplazamiento vertical compensa que la banda visible no está centrada
  // en la pantalla: se corrige en unidades de escena, dividiendo por la escala.
  const fy = (y0 + y1) / 2 + (ALTO / 2 - (arriba + abajo) / 2) / s

  return { fx: (x0 + x1) / 2, fy, s }
}

/** Escena → pantalla. La usa el dibujo y también el vuelo de nodos del beat 9. */
export const aPantalla = (cam: Camara, x: number, y: number): [number, number] => [
  ANCHO / 2 + (x - cam.fx) * cam.s,
  ALTO / 2 + (y - cam.fy) * cam.s,
]

/** Pantalla → escena. Inversa exacta de `aPantalla`. */
export const aEscena = (cam: Camara, px: number, py: number): [number, number] => [
  (px - ANCHO / 2) / cam.s + cam.fx,
  (py - ALTO / 2) / cam.s + cam.fy,
]

// ── Titular ─────────────────────────────────────────────────────────────────

/**
 * Un titular son siete palabras como mucho. No es una preferencia estética: a
 * 62 px, la octava palabra ya salta de línea y empuja el dato fuera de la banda
 * reservada. Recortar es mejor que descuadrar.
 */
export const MAX_PALABRAS_TITULAR = 7

export function recortarTitular(texto: string): string {
  const palabras = texto.split(/\s+/).filter(Boolean)
  return palabras.length > MAX_PALABRAS_TITULAR
    ? palabras.slice(0, MAX_PALABRAS_TITULAR).join(' ')
    : palabras.join(' ')
}
