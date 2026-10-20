// Cuadros del titular rotativo de la portada (RF-038).
//
// El diccionario trae el texto con {marcadores} y este módulo los rellena con
// las cifras del tarifario: el precio que dice el hero es el mismo que cobra
// el cotizador y que publica /paginas-web, y cambiarlo es tocar un solo
// archivo. Cada cuadro sabe también a dónde lleva su botón.
//
// Módulo PURO: lo usan la portada en el servidor y el contexto del asesor.

import { getDictionary, type Locale } from '../i18n'
import { APP_NATIVA_SEMANAS, CAPACITACION, PAQUETES_WEB, REGLAS, formatearMonto, type Moneda } from '../data/tarifario'

export type ServicioId = 'software' | 'capacitacion' | 'asesor' | 'web' | 'apps'

/**
 * A dónde lleva el botón principal de cada cuadro. Los de tipo `accion` no
 * navegan: abren el chat de la burbuja o enfocan el cotizador del mismo hero.
 * Igual llevan un `href` de respaldo para cuando no hay JavaScript.
 */
export type Destino = { tipo: 'ruta'; href: string } | { tipo: 'accion'; accion: 'asesor' | 'cotizador'; href: string }

export type ServicioHero = {
  id: ServicioId
  etiqueta: string
  lineas: [string, string]
  dato: string
  prueba: string
  enlace: string
  ejemplo: string
  destino: Destino
  /** El cuadro de páginas web muestra los clientes en línea en vez de una frase. */
  conClientes: boolean
}

/** Sustituye {clave} por su valor; un marcador sin valor se deja a la vista para que el test lo pille. */
export function rellenar(plantilla: string, valores: Record<string, string>): string {
  return plantilla.replace(/\{(\w+)\}/g, (todo, clave: string) => valores[clave] ?? todo)
}

function primeraMinuscula(s: string): string {
  return s.charAt(0).toLocaleLowerCase() + s.slice(1)
}

/**
 * Cuadros listos para pintar. `L` localiza rutas (localizedHref) y
 * `hayProyectos` decide si "Ver proyectos" puede apuntar a la sección de la
 * propia portada.
 */
export function serviciosHero(
  locale: Locale,
  L: (ruta: string) => string = (r) => r,
  hayProyectos = true,
): ServicioHero[] {
  const t = getDictionary(locale)
  // Planes web y mínimo de software en la moneda de la página; la capacitación
  // va siempre en pesos (es para empresas en Colombia, decisión de Mike).
  const moneda: Moneda = locale === 'es' ? 'COP' : 'USD'
  const presencia = PAQUETES_WEB[0]!
  const valores: Record<string, string> = {
    minimo: formatearMonto(REGLAS.minimo[moneda], moneda),
    horas: String(CAPACITACION.horas),
    cupo: String(CAPACITACION.cupo),
    sesion: formatearMonto(CAPACITACION.sesionCOP, 'COP'),
    presencia: formatearMonto(presencia.desde[moneda], moneda),
    tiempoPresencia: primeraMinuscula(t.paginasWeb.planes[0]!.tiempo),
    semanasApp: `${APP_NATIVA_SEMANAS[0]} ${locale === 'es' ? 'a' : 'to'} ${APP_NATIVA_SEMANAS[1]}`,
  }

  const destinos: Record<ServicioId, Destino> = {
    software: { tipo: 'ruta', href: hayProyectos ? '#proyectos' : L('/contact') },
    capacitacion: { tipo: 'ruta', href: L('/capacitacion-ia') },
    asesor: { tipo: 'accion', accion: 'asesor', href: L('/contact') },
    web: { tipo: 'ruta', href: L('/paginas-web') },
    apps: { tipo: 'accion', accion: 'cotizador', href: '#cotizador' },
  }

  return t.home.hero.servicios.map((s) => {
    const id = s.id as ServicioId
    return {
      id,
      etiqueta: s.etiqueta,
      lineas: [s.lineas[0]!, s.lineas[1]!],
      dato: rellenar(s.dato, valores),
      prueba: s.prueba,
      enlace: s.enlace,
      ejemplo: s.ejemplo,
      destino: destinos[id],
      conClientes: id === 'web',
    }
  })
}
