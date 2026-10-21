// Datos estructurados (schema.org) del negocio y de las preguntas frecuentes.
//
// Hasta ahora el sitio solo declaraba una Persona con su stack técnico, y los
// Service de /paginas-web y /capacitacion-ia colgaban de esa Persona sin
// precio. A la pregunta "¿quién hace páginas web en Colombia y cuánto cobra?"
// un motor de respuesta no tenía de dónde sacar ni el negocio ni la cifra.
// Ahora hay un nodo de negocio con @id fijo, que los servicios referencian, y
// sus ofertas salen del tarifario: el mismo precio que ve el visitante.
//
// Módulo puro: devuelve objetos; quien los pinta usa jsonEnScript.

import type { Dictionary, Locale } from '../../i18n'
import { SITE_ORIGIN } from '../site'
import { CAPACITACION, PAQUETES_WEB } from '../../data/tarifario'
import { CONTACTO } from './llms'

export const PERSONA_ID = `${SITE_ORIGIN}/#person`
export const NEGOCIO_ID = `${SITE_ORIGIN}/#negocio`

const SAME_AS = ['https://github.com/mikerb95', 'https://www.linkedin.com/in/mdrb95/', 'https://www.facebook.com/codebymike']

const ruta = (locale: Locale, r: string) => `${SITE_ORIGIN}${locale === 'en' ? '/en' : ''}${r}`

/** Ofertas de los planes web con su precio "desde", en la moneda del idioma. */
export function ofertasWeb(locale: Locale, t: Dictionary) {
  const moneda = locale === 'en' ? 'USD' : 'COP'
  return PAQUETES_WEB.map((p, i) => ({
    '@type': 'Offer',
    name: t.paginasWeb.planes[i]?.nombre ?? p.nombre,
    description: t.paginasWeb.planes[i]?.para,
    url: `${ruta(locale, '/paginas-web')}#planes`,
    priceSpecification: {
      '@type': 'PriceSpecification',
      minPrice: p.desde[moneda],
      priceCurrency: moneda,
    },
  }))
}

/** La capacitación solo se cobra en pesos, también en la página en inglés. */
export function ofertaCapacitacion(locale: Locale, t: Dictionary) {
  return {
    '@type': 'Offer',
    name: t.capacitacionIa.jsonLdServiceType,
    description: t.capacitacionIa.jsonLdDescription,
    url: ruta(locale, '/capacitacion-ia'),
    eligibleQuantity: { '@type': 'QuantitativeValue', maxValue: CAPACITACION.cupo, unitText: 'personas' },
    priceSpecification: { '@type': 'PriceSpecification', price: CAPACITACION.sesionCOP, priceCurrency: 'COP' },
  }
}

export function negocioJsonLd(locale: Locale, t: Dictionary) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': NEGOCIO_ID,
    name: 'CodeByMike',
    url: ruta(locale, '/'),
    description: t.meta.defaultDescription,
    logo: `${SITE_ORIGIN}/icon-512.png`,
    image: `${SITE_ORIGIN}/og-default.png`,
    founder: { '@id': PERSONA_ID },
    email: CONTACTO.email,
    telephone: `+${CONTACTO.whatsapp}`,
    address: { '@type': 'PostalAddress', addressCountry: 'CO' },
    areaServed: { '@type': 'Country', name: 'Colombia' },
    knowsLanguage: ['es', 'en'],
    sameAs: SAME_AS,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: t.paginasWeb.planesHeading,
      itemListElement: [...ofertasWeb(locale, t), ofertaCapacitacion(locale, t)],
    },
  }
}

export function faqPageJsonLd(items: readonly { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}
