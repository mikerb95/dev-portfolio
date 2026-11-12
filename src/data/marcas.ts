// Marcas para las que he trabajado: alimentan la franja de logos de la portada
// (MarcasFranja.astro). Son datos, no texto a traducir; lo que sí cambia por
// idioma (lo que hice con cada una, que va en el tooltip) vive en el
// diccionario bajo `home.marcas.fichas`,
// con la misma clave `slug`.
//
// Los logos están en public/assets/marcas/, preparados para fondo oscuro a
// partir de los originales de cada repo:
//   · antidoto.svg  - logo cian de antidoto-web, sin el manifiesto C2PA.
//   · ekosolv.webp  - ekosolv-horizontal-full.png de eko (el que usa su sitio
//                     en nav, login y certificados; el .svg de su carpeta brand
//                     es una versión vieja que ya no se usa). El eslogan casi
//                     negro pasa a crema porque sobre negro no se leía.
//   · dobleyo.webp  - logo2.png de dobleyo; el marrón casi negro de "café" pasa
//                     a crema y el marrón de "doble yo" sube de luz (mismo
//                     tono), porque sobre negro no se leían.
//   · gorillaz.webp - el gorila de 512 px de gorillaz-motorbikes, en blanco
//                     (calado), a 360 px (el doble de lo que se muestra). El
//                     wordmark "GORILLA'Z" solo existe a 224 px y se veía
//                     borroso: el nombre va en el texto accesible.
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
  dominio: string
  url: string
  /**
   * El logo está dibujado en tinta clara (blanco o casi), pensado para fondo
   * oscuro. En tema claro se pinta como silueta oscura; sin esto desaparece
   * sobre el blanco. Se revisa a ojo al añadir una marca.
   */
  tintaClara?: boolean
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
    dominio: 'antidotocolombia.com',
    url: 'https://antidotocolombia.com/',
  },
  {
    slug: 'toledo',
    nombre: 'Toledo Producciones',
    logo: '/assets/marcas/toledo.svg',
    proporcion: 414.6 / 154.5,
    tintaClara: true,
    ...enVitrina('Toledo Producciones'),
  },
  {
    slug: 'ekosolv',
    nombre: 'Ekosolv',
    logo: '/assets/marcas/ekosolv.webp',
    proporcion: 492 / 142,
    dominio: 'ekosolv.com',
    url: 'https://ekosolv.com/',
  },
  {
    slug: 'dobleyo',
    nombre: 'DobleYo Café',
    logo: '/assets/marcas/dobleyo.webp',
    proporcion: 400 / 319,
    ...enVitrina('DobleYo Café'),
  },
  {
    slug: 'gorillaz',
    nombre: 'Gorillaz Motorbikes',
    logo: '/assets/marcas/gorillaz.webp',
    proporcion: 360 / 353,
    tintaClara: true,
    ...enVitrina('Gorillaz Motorbikes'),
  },
  {
    slug: 'joxe',
    nombre: 'Joxe',
    logo: '/assets/marcas/joxe.svg',
    proporcion: 377.6 / 160.5,
    tintaClara: true,
    dominio: 'joxe.app',
    url: 'https://joxe.app/',
  },
]
