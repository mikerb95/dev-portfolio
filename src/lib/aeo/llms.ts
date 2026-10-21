// llms.txt y llms-full.txt (https://llmstxt.org): lo primero que lee un
// asistente para saber quién está detrás del sitio y qué vende.
//
// El llms.txt anterior era un archivo escrito a mano en julio: presentaba a
// Mike como "Software Engineer con TypeScript" y no decía que el sitio vende
// páginas web ni capacitación, ni listaba una sola nota. Por eso aquí no hay
// ninguna cifra ni texto comercial propio: los precios salen del tarifario (el
// mismo que leen /paginas-web y el asesor), las páginas y preguntas de los
// diccionarios, y las notas de la colección. Lo que cambia allí cambia aquí.
//
// Módulo puro: recibe las notas ya leídas, no importa astro:content.

import type { Dictionary, Locale } from '../../i18n'
import {
  CAPACITACION,
  ENTREGA,
  HOSTING_ANUAL,
  PAQUETES_WEB,
  REGLAS,
  TARIFA_HORA,
  formatearMonto,
} from '../../data/tarifario'

export type NotaLlms = {
  slug: string
  title: string
  description: string
  lang: Locale
  date: Date
  body: string
}

export type Contacto = { whatsapp: string; email: string }

export const CONTACTO: Contacto = { whatsapp: '573104641228', email: 'mike@codebymike.net' }

type Pagina = { ruta: string; titulo: (t: Dictionary) => string; desc: (t: Dictionary) => string }

const una = (s: string) => s.replace(/\s+/g, ' ').trim()

// Lo que vende el sitio va primero: es lo que un asistente necesita para
// recomendarlo. Lo de ingeniería va después, como prueba de que sabe hacerlo.
const SERVICIOS: readonly Pagina[] = [
  { ruta: '/paginas-web', titulo: (t) => t.paginasWeb.title, desc: (t) => t.paginasWeb.description },
  { ruta: '/capacitacion-ia', titulo: (t) => t.capacitacionIa.title, desc: (t) => t.capacitacionIa.description },
  { ruta: '/contact', titulo: (t) => t.contact.title, desc: (t) => t.contact.description },
]

const INGENIERIA: readonly Pagina[] = [
  { ruta: '/architecture', titulo: (t) => t.architecture.title, desc: (t) => t.architecture.description },
  { ruta: '/engineering', titulo: (t) => t.engineering.title, desc: (t) => t.engineering.description },
  { ruta: '/status', titulo: (t) => t.status.title, desc: (t) => t.status.description },
  { ruta: '/security', titulo: (t) => t.security.title, desc: (t) => t.security.description },
  { ruta: '/lab', titulo: (t) => t.lab.title, desc: (t) => t.lab.description },
  { ruta: '/tools', titulo: (t) => t.tools.title, desc: (t) => t.tools.description },
  { ruta: '/automatizaciones', titulo: (t) => t.automatizaciones.title, desc: (t) => t.automatizaciones.description },
]

const OPCIONALES: readonly Pagina[] = [
  { ruta: '/certifications', titulo: (t) => t.certifications.title, desc: (t) => t.certifications.description },
  { ruta: '/changelog', titulo: (t) => t.changelog.title, desc: (t) => t.changelog.description },
]

function url(base: string, ruta: string, locale: Locale): string {
  if (locale === 'es') return `${base}${ruta}`
  return ruta === '/' ? `${base}/en` : `${base}/en${ruta}`
}

// Los <title> llevan la marca al final ("Contacto - CodeByMike"); en una lista
// que ya está bajo "# CodeByMike" solo repite ruido.
const sinMarca = (s: string) => una(s).replace(/\s+[-|]\s+CodeByMike$/, '')

function enlaces(base: string, paginas: readonly Pagina[], t: Dictionary, locale: Locale): string {
  return paginas.map((p) => `- [${sinMarca(p.titulo(t))}](${url(base, p.ruta, locale)}): ${una(p.desc(t))}`).join('\n')
}

function enlacesNotas(base: string, notas: readonly NotaLlms[]): string {
  return notas
    .map((n) => `- [${una(n.title)}](${base}${n.lang === 'en' ? '/en' : ''}/notes/${n.slug}): ${una(n.description)}`)
    .join('\n')
}

const cop = (v: number) => formatearMonto(v, 'COP')
const usd = (v: number) => formatearMonto(v, 'USD')

/**
 * Los datos que un asistente cita cuando le preguntan "¿cuánto cobra?" o
 * "¿cómo se paga?". En frases cortas y completas, cada una entendible sola,
 * porque un motor de respuesta copia la frase, no el párrafo.
 */
export function datosClave(es: Dictionary): string {
  const planes = PAQUETES_WEB.map((p, i) => {
    const d = es.paginasWeb.planes[i]
    return `- Plan ${p.nombre}: desde ${cop(p.desde.COP)} (${usd(p.desde.USD)} fuera de Colombia). ${una(d?.para ?? '')} ${una(d?.tiempo ?? '')}.`
  }).join('\n')
  const anticipo = Math.round(REGLAS.anticipo * 100)
  return `${planes}
- Software a la medida y apps: se cotiza por horas, a ${cop(TARIFA_HORA.COP)} la hora (${usd(TARIFA_HORA.USD)}). Ningún trabajo cuesta menos de ${cop(REGLAS.minimo.COP)}.
- Dominio y hosting: el primer año va incluido. Desde el segundo, ${cop(HOSTING_ANUAL.presencia.COP)} al año en Presencia y ${cop(HOSTING_ANUAL.negocio.COP)} en Negocio.
- Cada página incluye ${ENTREGA.rondasCambios} rondas de cambios antes de publicar y ${ENTREGA.garantiaDias} días de garantía después.
- Pago: ${anticipo} % para empezar y el resto al entregar, por tarjeta, PSE, Nequi o transferencia. Las cotizaciones valen ${REGLAS.validezDias} días.
- Capacitación en IA para empresas: sesión de ${CAPACITACION.horas} horas para hasta ${CAPACITACION.cupo} personas por ${cop(CAPACITACION.sesionCOP)}; cada persona adicional, ${cop(CAPACITACION.personaAdicionalCOP)}. Presencial en Bogotá y alrededores, o remota.
- Contacto directo: WhatsApp +${CONTACTO.whatsapp.slice(0, 2)} ${CONTACTO.whatsapp.slice(2, 5)} ${CONTACTO.whatsapp.slice(5, 8)} ${CONTACTO.whatsapp.slice(8)} (https://wa.me/${CONTACTO.whatsapp}) o ${CONTACTO.email}.`
}

export function llmsTxt(input: { origen: string; es: Dictionary; en: Dictionary; notas: readonly NotaLlms[] }): string {
  const base = input.origen.replace(/\/$/, '')
  const { es, en } = input
  const notasEs = input.notas.filter((n) => n.lang === 'es')
  const notasEn = input.notas.filter((n) => n.lang === 'en')
  return `# CodeByMike

> ${una(es.home.description)} CodeByMike es el estudio de Mike (@mikerb95), ingeniero de software en Colombia: páginas web para negocios, software a la medida, apps y capacitación en inteligencia artificial para empresas.

El sitio es bilingüe: el español es el idioma canónico (sin prefijo) y el inglés vive bajo /en. Los precios en pesos colombianos son para clientes en Colombia; fuera de Colombia se cotiza en dólares. El texto completo de las notas está en ${base}/llms-full.txt.

## Datos clave

${datosClave(es)}

## Servicios

${enlaces(base, SERVICIOS, es, 'es')}

## Ingeniería: cómo está construido y operado este sitio

${enlaces(base, INGENIERIA, es, 'es')}
- [Documentación](${base}/docs): requerimientos, casos de uso y diagramas UML del proyecto (solo en español)

## Notas de ingeniería

${enlacesNotas(base, notasEs)}

## English

> ${una(en.home.description)}

${enlaces(base, SERVICIOS, en, 'en')}
${enlaces(base, INGENIERIA, en, 'en')}

### Engineering notes

${enlacesNotas(base, notasEn)}

## Optional

${enlaces(base, OPCIONALES, es, 'es')}
- [RSS de notas (es)](${base}/rss.xml)
- [Notes RSS (en)](${base}/en/rss.xml)
- [Sitemap](${base}/sitemap.xml)
`
}

/** Enlaces relativos del markdown de una nota ("](/notes/x)") a absolutos. */
export function absolutizarEnlaces(markdown: string, base: string): string {
  return markdown.replace(/\]\(\//g, `](${base}/`)
}

function faqs(titulo: string, items: readonly { q: string; a: string }[]): string {
  return `## ${titulo}\n\n${items.map((f) => `### ${una(f.q)}\n\n${una(f.a)}`).join('\n\n')}`
}

/**
 * Todo el contenido en un archivo, para que un asistente pueda citar sin
 * rastrear página por página. Solo en español, el idioma canónico: las notas
 * en inglés son traducciones de estas y duplicarían el tamaño sin añadir nada
 * que un modelo no lea ya en español.
 */
export function llmsFullTxt(input: { origen: string; es: Dictionary; notas: readonly NotaLlms[] }): string {
  const base = input.origen.replace(/\/$/, '')
  const { es } = input
  const notas = input.notas
    .filter((n) => n.lang === 'es')
    .map(
      (n) =>
        `# ${una(n.title)}\n\nURL: ${base}/notes/${n.slug}\nFecha: ${n.date.toISOString().slice(0, 10)}\n\n> ${una(n.description)}\n\n${absolutizarEnlaces(n.body.trim(), base)}`
    )
    .join('\n\n---\n\n')
  return `# CodeByMike: texto completo

> ${una(es.home.description)} Mapa del sitio: ${base}/llms.txt

## Datos clave

${datosClave(es)}

${faqs(`Páginas web: ${es.paginasWeb.faqHeading.toLowerCase()}`, es.paginasWeb.faqs)}

${faqs(`Capacitación en IA: ${es.capacitacionIa.faqHeading.toLowerCase()}`, es.capacitacionIa.faqs)}

---

${notas}
`
}
