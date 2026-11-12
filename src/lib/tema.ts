// Tema de color del sitio (RF-043). Módulo puro: lo importan el botón del
// navegador y los lienzos que repintan al cambiar de tema.
//
// El tema NO se decide en el servidor: las páginas públicas salen de la caché
// de Vercel iguales para todos durante minutos, y un tema escrito en el HTML
// se le serviría al siguiente visitante. Lo decide el navegador con un script
// en línea en el <head> (TemaScript.astro), antes del primer pintado.

export type Tema = 'oscuro' | 'claro'

/** Clave de localStorage con la elección explícita del visitante. */
export const CLAVE_TEMA = 'tema'
/** Evento en `window` tras cada cambio; `detail` lleva el tema nuevo. */
export const EVENTO_TEMA = 'tema:cambio'
/** Color de la barra del navegador (meta theme-color) en cada tema. */
export const COLOR_BARRA: Record<Tema, string> = { oscuro: '#07070a', claro: '#ffffff' }

/**
 * La elección guardada manda; sin ella, el tema del dispositivo. Un valor
 * guardado que no se reconoce (otra versión, edición a mano) se ignora en vez
 * de dejar al visitante atrapado en un tema.
 */
export function resolverTema(guardado: string | null | undefined, sistemaClaro: boolean): Tema {
  if (guardado === 'claro' || guardado === 'oscuro') return guardado
  return sistemaClaro ? 'claro' : 'oscuro'
}

/**
 * Código del script en línea del <head> (TemaScript.astro). Repite a mano la
 * regla de `resolverTema` porque ese script no puede importar nada: corre
 * antes que cualquier módulo. tests/tema.test.ts lo ejecuta contra todas las
 * combinaciones para que las dos copias no puedan separarse.
 */
export const codigoTema = (): string =>
  `(function(){var g=null;try{g=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)})}catch(e){}` +
  `var c=g==='claro'||(g!=='oscuro'&&window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches);` +
  `if(!c)return;document.documentElement.dataset.tema='claro';` +
  `var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=${JSON.stringify(COLOR_BARRA.claro)}})()`

export const temaContrario = (t: Tema): Tema => (t === 'claro' ? 'oscuro' : 'claro')

/** Tema que está pintado ahora mismo. Solo navegador. */
export function temaActual(): Tema {
  return document.documentElement.dataset.tema === 'claro' ? 'claro' : 'oscuro'
}

/**
 * Avisa a `fn` cada vez que cambia el tema. Para lienzos (canvas, WebGL) cuyo
 * color no sale de CSS y hay que volver a pintar. Devuelve cómo desuscribirse.
 */
export function alCambiarTema(fn: (t: Tema) => void): () => void {
  const oyente = (e: Event) => fn((e as CustomEvent<Tema>).detail)
  window.addEventListener(EVENTO_TEMA, oyente)
  return () => window.removeEventListener(EVENTO_TEMA, oyente)
}

/**
 * Valor actual de una variable de color (`--color-ink-300`). Para animaciones
 * que necesitan el color como cadena (GSAP no interpola `var()`). Se lee al
 * armar la animación: si el tema cambia después, vale el del momento.
 */
export function colorDeTema(variable: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
}

/** "#0a0a0d" o "10 10 13" a "10, 10, 13", la forma que piden las plantillas `rgba(${x}, .5)`. */
function aCanales(valor: string): string {
  const v = valor.trim()
  if (v.startsWith('#')) {
    const h = v.length === 4 ? v.slice(1).replace(/./g, '$&$&') : v.slice(1, 7)
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')
  }
  return v.split(/[\s,]+/).join(', ')
}

/**
 * Colores del tema actual como cadenas concretas, para donde `var()` no llega:
 * canvas 2D y tweens de GSAP. `rgb.*` son canales ("0, 242, 255") para armar
 * `rgba()`. Los `*Linea` son el acento como trazo: en oscuro igual al acento,
 * en claro su versión que se lee sobre blanco. En un lienzo casi todo es trazo
 * fino, así que suele ser la que toca.
 *
 * Se lee al pintar o al armar la animación, nunca al cargar el módulo: el tema
 * puede cambiar con la página abierta (`alCambiarTema`).
 */
export function paleta() {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim()
  return {
    cian: v('--color-cyan'),
    cianClaro: v('--color-cyan-glow'),
    lima: v('--color-lime'),
    ember: v('--color-ember'),
    violeta: v('--color-violet'),
    ambar: v('--color-ambar'),
    blanco: v('--color-white'),
    tinta50: v('--color-ink-50'),
    tinta100: v('--color-ink-100'),
    tinta200: v('--color-ink-200'),
    tinta300: v('--color-ink-300'),
    rgb: {
      cian: aCanales(v('--rgb-cian-linea')),
      lima: aCanales(v('--rgb-lima-linea')),
      ember: aCanales(v('--rgb-ember-linea')),
      violeta: aCanales(v('--rgb-violeta-linea')),
      luz: aCanales(v('--rgb-luz')),
      tinta100: aCanales(v('--color-ink-100')),
      tinta200: aCanales(v('--color-ink-200')),
    },
  }
}
export type Paleta = ReturnType<typeof paleta>
