// Portadas generativas de los proyectos de la portada.
//
// 9 de los 13 proyectos no tienen captura de pantalla, y una caja vacía en una
// rejilla de proyectos se lee como "roto", no como "sin imagen". En vez de una
// imagen genérica, cada proyecto recibe su propio mapa de isolíneas (el mismo
// lenguaje del terreno del hero) con una semilla que sale de su slug: siempre
// el mismo mapa para el mismo proyecto, distinto entre proyectos, sin pesar
// nada ni depender de un servicio que genere imágenes.
//
// Módulo puro: lo usan el servidor (para anotar semilla y paleta en el HTML) y
// el navegador (para dibujar), y se prueba sin DOM.

export type RGB = [number, number, number]

export type Semilla = {
  /** Desplazamiento del campo de ruido: elige qué región del mapa se ve. */
  x: number
  y: number
  /** Escala del campo: más alta = relieve más fino y más curvas. */
  escala: number
  /** Identificador corto para mostrar ("semilla 3f9a2c"). */
  id: string
}

export type Paleta = { linea: RGB; halo: RGB }

/**
 * FNV-1a de 32 bits. No hace falta un hash criptográfico: se busca que dos
 * slugs parecidos ("brixo", "brixo-jdk") caigan en mapas bien distintos, y
 * FNV-1a ya difunde un solo carácter de diferencia por todos los bits.
 */
export function fnv1a(texto: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Generador determinista (mulberry32) alimentado por el hash del slug. */
function aleatorio(semilla: number) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function semillaDe(slug: string): Semilla {
  const h = fnv1a(slug.toLowerCase())
  const r = aleatorio(h)
  return {
    // Desplazamientos amplios: el ruido se repite cada 4096 celdas, y así cada
    // proyecto cae en una región lejana de las demás.
    x: Math.round((r() * 400 - 200) * 100) / 100,
    y: Math.round((r() * 400 - 200) * 100) / 100,
    escala: Math.round((1.6 + r() * 1.4) * 1000) / 1000,
    id: h.toString(16).padStart(8, '0').slice(0, 6),
  }
}

// Paleta de marca del sitio (global.css). Solo los cuatro acentos: una portada
// con un color fuera de la paleta se leería como la captura de otro sitio.
const CIAN: RGB = [0, 242, 255]
const VIOLETA: RGB = [167, 139, 255]
const LIMA: RGB = [201, 255, 91]
const AMBAR: RGB = [255, 107, 61]

const POR_TECNOLOGIA: [RegExp, Paleta][] = [
  [/^(typescript|ts|react|next|node|deno|bun)/, { linea: CIAN, halo: VIOLETA }],
  [/^(astro|css|tailwind|svelte|vue|sass)/, { linea: VIOLETA, halo: CIAN }],
  [/^(php|laravel|codeigniter|java|spring|kotlin|html)/, { linea: AMBAR, halo: VIOLETA }],
  [/^(javascript|js|ejs|express|python|go)/, { linea: LIMA, halo: CIAN }],
]

/**
 * Color por la tecnología principal del proyecto (la primera del stack). Así
 * el color dice algo: los proyectos en PHP comparten tono y se distinguen de
 * los de TypeScript de un vistazo, en vez de colores al azar por proyecto.
 */
export function paletaDe(stack: string[]): Paleta {
  const principal = (stack[0] ?? '').trim().toLowerCase()
  for (const [patron, paleta] of POR_TECNOLOGIA) {
    if (patron.test(principal)) return paleta
  }
  return { linea: CIAN, halo: LIMA }
}
