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
