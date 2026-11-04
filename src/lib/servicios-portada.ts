// Sección "Qué te resuelvo" de la portada (RF-042).
//
// Reemplaza al bento técnico (uptime, presupuesto de error, tRPC, coordenadas)
// que le hablaba a un CTO justo después de un hero que le habla al dueño de un
// negocio. Cada tarjeta dice el problema con las palabras del cliente, lo que
// se hace, el precio y, si existe, la marca real para la que se hizo.
//
// Nada se escribe a mano: precios y plazos salen del tarifario (los mismos
// marcadores del hero), los destinos son los del hero y las marcas son las de
// la franja de logos. Una tarjeta sin cliente real no se inventa uno: muestra
// su `prueba` en lugar de logos.
//
// Módulo PURO: sin BD ni efectos.

import { getDictionary, type Locale } from '../i18n'
import { MARCAS, type Marca } from '../data/marcas'
import { ENTREGA, REGLAS } from '../data/tarifario'
import { destinosServicio, rellenar, valoresTarifario, type Destino, type ServicioId } from './hero-servicios'

/** Qué marcas prueban cada servicio. Solo trabajos entregados de verdad. */
export const MARCAS_POR_SERVICIO: Record<ServicioId, readonly Marca['slug'][]> = {
  web: ['antidoto', 'toledo', 'gorillaz', 'dobleyo'],
  software: ['joxe', 'ekosolv'],
  asesor: [],
  capacitacion: [],
  apps: [],
}

export type TarjetaServicio = {
  id: ServicioId
  etiqueta: string
  problema: string
  solucion: string
  /** Precio o plazo ya relleno; vacío si el servicio no tiene cifra publicable. */
  dato: string
  prueba: string
  enlace: string
  destino: Destino
  marcas: { nombre: string; logo: string; proporcion: number; ficha: string }[]
}

export type CierreServicios = {
  titulo: string
  garantias: string[]
  cta: string
  ctaWhatsapp: string
  waTexto: string
}

export function serviciosPortada(
  locale: Locale,
  L: (ruta: string) => string = (r) => r,
  hayProyectos = true,
): { tarjetas: TarjetaServicio[]; cierre: CierreServicios } {
  const d = getDictionary(locale).home
  const t = d.resuelvo
  const valores = valoresTarifario(locale)
  const destinos = destinosServicio(L, hayProyectos)

  const tarjetas = t.items.map((s) => {
    const id = s.id as ServicioId
    return {
      id,
      etiqueta: s.etiqueta,
      problema: s.problema,
      solucion: s.solucion,
      dato: rellenar(s.dato, valores),
      prueba: s.prueba,
      enlace: s.enlace,
      destino: destinos[id],
      marcas: MARCAS_POR_SERVICIO[id].map((slug) => {
        const m = MARCAS.find((x) => x.slug === slug)
        if (!m) throw new Error(`servicios-portada: la marca "${slug}" no está en MARCAS`)
        return { nombre: m.nombre, logo: m.logo, proporcion: m.proporcion, ficha: d.marcas.fichas[slug] }
      }),
    }
  })

  const condiciones = {
    anticipo: String(Math.round(REGLAS.anticipo * 100)),
    dias: String(ENTREGA.garantiaDias),
  }

  return {
    tarjetas,
    cierre: {
      titulo: t.cierre.titulo,
      garantias: t.cierre.garantias.map((g) => rellenar(g, condiciones)),
      cta: t.cierre.cta,
      ctaWhatsapp: t.cierre.ctaWhatsapp,
      waTexto: t.cierre.waTexto,
    },
  }
}
