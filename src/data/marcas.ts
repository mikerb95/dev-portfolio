// Marcas para las que he trabajado: alimentan el relieve de la portada
// (MarcasRelieve.astro). Son datos, no texto a traducir; lo que sí cambia por
// idioma (la línea de la ficha) vive en el diccionario bajo `home.marcas.fichas`,
// con la misma clave `slug`.
//
// Los logos están en public/assets/marcas/, preparados para fondo oscuro a
// partir de los originales de cada repo:
//   · antidoto.svg  - logo cian de antidoto-web, sin el manifiesto C2PA.
//   · ekosolv.svg   - ekosolv-horizontal.svg de eko, tal cual.
//   · dobleyo.webp  - logo2.png de dobleyo; el marrón casi negro de "café" pasa
//                     a crema y el marrón de "doble yo" sube de luz (mismo
//                     tono), porque sobre negro no se leían.
//   · gorillaz.webp - el gorila de 512 px de gorillaz-motorbikes, en blanco
//                     (calado). El wordmark "GORILLA'Z" solo existe a 224 px y
//                     se veía borroso: el nombre va en la ficha.
//   · toledo.svg    - el logo lo arma el código del sitio (ecualizador +
//                     Space Grotesk); aquí en trazos y apilado, porque la tira
//                     horizontal dejaba el texto diminuto junto a los demás.
//   · joxe.svg      - "JOXE" en Marcellus con su tracking de 0.3em, en trazos.

import { TRABAJOS_REALES } from './trabajos-reales'

export type Marca = {
  slug: 'antidoto' | 'ekosolv' | 'dobleyo' | 'gorillaz' | 'toledo' | 'joxe'
  nombre: string
  logo: string
  /** Ancho / alto del logo, para compensar su tamaño óptico. */
  proporcion: number
  /** Color de marca legible sobre fondo oscuro: tiñe las curvas de su cumbre. */
  tono: string
  dominio: string
  url: string
}

// Las tres marcas que ya tienen captura en la vitrina de /paginas-web toman el
// dominio de allí, para que un dominio cambiado se corrija en un solo sitio.
const enVitrina = (nombre: string) => {
  const t = TRABAJOS_REALES.find((x) => x.nombre === nombre)
  if (!t) throw new Error(`marcas: "${nombre}" no está en TRABAJOS_REALES`)
  return { dominio: t.dominio, url: t.url }
}

export const MARCAS: readonly Marca[] = [
  {
    slug: 'antidoto',
    nombre: 'Antídoto',
    logo: '/assets/marcas/antidoto.svg',
    proporcion: 2532 / 519,
    tono: '#49c1ec',
    dominio: 'antidotocolombia.com',
    url: 'https://antidotocolombia.com/',
  },
  {
    slug: 'toledo',
    nombre: 'Toledo Producciones',
    logo: '/assets/marcas/toledo.svg',
    proporcion: 414.6 / 154.5,
    tono: '#f4c752',
    ...enVitrina('Toledo Producciones'),
  },
  {
    slug: 'ekosolv',
    nombre: 'Ekosolv',
    logo: '/assets/marcas/ekosolv.svg',
    proporcion: 524 / 152,
    tono: '#3fb8a0',
    dominio: 'ekosolv.com',
    url: 'https://ekosolv.com/',
  },
  {
    slug: 'dobleyo',
    nombre: 'DobleYo Café',
    logo: '/assets/marcas/dobleyo.webp',
    proporcion: 400 / 319,
    tono: '#e07a2e',
    ...enVitrina('DobleYo Café'),
  },
  {
    slug: 'gorillaz',
    nombre: 'Gorillaz Motorbikes',
    logo: '/assets/marcas/gorillaz.webp',
    proporcion: 440 / 431,
    tono: '#ea580c',
    ...enVitrina('Gorillaz Motorbikes'),
  },
  {
    slug: 'joxe',
    nombre: 'Joxe',
    logo: '/assets/marcas/joxe.svg',
    proporcion: 377.6 / 160.5,
    tono: '#c29e66',
    dominio: 'joxe.app',
    url: 'https://joxe.app/',
  },
]
