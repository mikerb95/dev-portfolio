// Lo que sabe el asesor público (docs/plan-asistente.md, capacidad 3).
//
// Se arma con lo MISMO que publican /paginas-web y /capacitacion-ia: el
// tarifario y los diccionarios de esas páginas. Si el asesor leyera de otra
// fuente, tarde o temprano le diría al visitante algo distinto de lo que dice
// la página que tiene abierta detrás del chat.
//
// Nada del panel entra aquí: ni clientes, ni proyectos privados, ni la tabla
// de horas por componente (esa la usa la calculadora, pero no se publica: el
// visitante recibe el rango, y el desglose se lo da Mike). La tarifa por hora
// sí es pública desde el 2 oct 2026, solo para cambios extra y mantenimiento.
//
// El perfil sale de lo que ya publica el sitio: la portada y la copia de los
// proyectos visibles (instantanea.json), que no consulta la base. Así cada
// pregunta no suma una lectura a Turso.
//
// Módulo PURO.

import { getDictionary, type Locale } from '../../i18n'
import { CAPACITACION, ENTREGA, HOSTING_ANUAL, PAQUETES_WEB, REGLAS, TARIFA_HORA, formatearMonto, type Moneda } from '../../data/tarifario'
import { proyectosInstantanea, type ProyectoInstantanea } from '../fallback/instantanea'

/** Largo máximo de la descripción de cada proyecto en el prompt. */
const MAX_DESCRIPCION = 220

/**
 * Proyectos publicados con descripción, sin repetidos por título. Los que no
 * tienen descripción no dicen nada que el asesor pueda contar (y alguno, como
 * ResidentialAccess, ya ni existe).
 */
export function proyectosPublicos(
  locale: Locale,
  fuente: readonly ProyectoInstantanea[] = proyectosInstantanea
): { titulo: string; descripcion: string }[] {
  const vistos = new Set<string>()
  const out: { titulo: string; descripcion: string }[] = []
  for (const p of fuente) {
    const titulo = (locale === 'en' ? p.titleEn : null) ?? p.title
    const crudo = ((locale === 'en' ? p.descriptionEn : null) ?? p.description ?? '').replace(/\s+/g, ' ').trim()
    if (!crudo || vistos.has(titulo.toLowerCase())) continue
    vistos.add(titulo.toLowerCase())
    const descripcion = crudo.length > MAX_DESCRIPCION ? `${crudo.slice(0, MAX_DESCRIPCION).replace(/\s+\S*$/, '')}...` : crudo
    out.push({ titulo, descripcion })
  }
  return out
}

/** Moneda de los planes web según el idioma de la página: COP en español, USD en inglés. */
export function monedaDe(locale: Locale): Moneda {
  return locale === 'es' ? 'COP' : 'USD'
}

/** Texto de referencia que va en el system prompt, en el idioma de la página. */
export function conocimiento(locale: Locale): string {
  const t = getDictionary(locale)
  const home = t.home
  const pw = t.paginasWeb
  const ci = t.capacitacionIa
  const moneda = monedaDe(locale)
  const es = locale === 'es'

  const planes = PAQUETES_WEB.map((p, i) => {
    const d = pw.planes[i]!
    return [
      `### ${d.nombre} (${es ? 'desde' : 'from'} ${formatearMonto(p.desde[moneda], moneda)})`,
      d.para,
      d.tiempo,
      ...d.incluye.map((x) => `- ${x}`),
    ].join('\n')
  }).join('\n\n')

  const faqsWeb = pw.faqs.map((f) => `- ${f.q} ${f.a}`).join('\n')
  const trabajos = pw.trabajos.items.map((x) => `- ${x.tipo}: ${x.resumen}`).join('\n')
  const perfilesCap = ci.perfiles.map((p) => `- ${p.titulo}: ${p.detalle}`).join('\n')
  const pasosCap = ci.pasos.map((p, i) => `${i + 1}. ${p.titulo}: ${p.detalle}`).join('\n')
  const faqsCap = ci.faqs.map((f) => `- ${f.q} ${f.a}`).join('\n')

  const sesion = formatearMonto(CAPACITACION.sesionCOP, 'COP')
  const adicional = formatearMonto(CAPACITACION.personaAdicionalCOP, 'COP')
  const minimo = formatearMonto(REGLAS.minimo[moneda], moneda)
  const hora = formatearMonto(TARIFA_HORA[moneda], moneda)
  const proyectos = proyectosPublicos(locale)
    .map((p) => `- ${p.titulo}: ${p.descripcion}`)
    .join('\n')
  // El hero ya no lista el stack (desde el 6 oct 2026 le habla al cliente), pero
  // sigue siendo información pública del perfil: se mantiene aquí.
  const stack = 'TypeScript · React · Next.js · Astro · Node.js · PostgreSQL'
  const titular = `${home.hero.line1} ${home.hero.line2} ${home.hero.line3}`
  const promesas = home.hero.ventas.map((v) => `${v.t}: ${v.d}`).join(' ')

  return es
    ? `# Quién es Mike

Primero lo que hace por los negocios: páginas web, sistemas a la medida y capacitación en IA para equipos, con un solo responsable de punta a punta (diseño, código, publicación y cuidado después). Después, la experiencia técnica. Su portada dice "${titular}" y promete: ${promesas} Stack principal ${stack}, Top #3 de contribuidores de GitHub en Colombia y miembro del GitHub Developer Program. Su propio sitio, codebymike.net, muestra en público cómo lo vigila y lo protege.

Trabaja de forma remota con clientes de cualquier ciudad; lo único presencial es la capacitación. Está abierto a oportunidades laborales y colaboraciones: quien pregunte por eso, que le escriba por WhatsApp.

## Proyectos publicados en el sitio
Cuéntalos con su nombre y lo que dice su descripción, sin agruparlos en categorías ni agregarles adjetivos.
${proyectos}

# Páginas web (/paginas-web)

${pw.hero.intro}

## Planes
${planes}

Proyectos a la medida (apps, sistemas, tiendas o reservas con cosas especiales): se calculan por partes con la herramienta. El mínimo de cualquier trabajo a la medida es ${minimo}.

Tarifa por hora: ${hora}. Se usa SOLO para cambios adicionales (después de las ${ENTREGA.rondasCambios} rondas incluidas) y para el mantenimiento mensual, que se cobra por horas usadas. Nunca para explicar un estimado.

La garantía de ${ENTREGA.garantiaDias} días cubre SOLO errores (algo que no funciona como se acordó). Cambiar fotos, textos o agregar cosas no es un error: es un cambio y se cobra por hora, también dentro de esos ${ENTREGA.garantiaDias} días.

## Preguntas frecuentes
(Escritas en la voz de Mike: "lo arreglo" es "Mike lo arregla". Al usarlas, pásalas a tercera persona.)
${faqsWeb}

## Trabajos reales publicados
Son tres de los proyectos de la lista de arriba (el café, el taller de motos y la productora): no los cuentes dos veces.
${trabajos}

# Capacitación en IA para equipos (/capacitacion-ia)

${ci.hero.intro}

Sesión cerrada de ${CAPACITACION.horas} horas para un grupo de hasta ${CAPACITACION.cupo} personas: ${sesion}. Cada persona adicional en la misma sesión: ${adicional}. Siempre en pesos colombianos, también para quien escribe en inglés.

## Para quién
${perfilesCap}

## Cómo funciona
${pasosCap}

## Preguntas frecuentes
(También en la voz de Mike: pásalas a tercera persona.)
${faqsCap}

# Reglas de pago (todos los servicios)
- ${Math.round(REGLAS.anticipo * 100)} % para empezar y el resto al entregar.
- La cotización formal que manda Mike vale ${REGLAS.validezDias} días.
- Los descuentos solo los decide Mike.`
    : `# Who Mike is

First, what he does for businesses: websites, custom systems and AI training for teams, with one person responsible end to end (design, code, publishing and care afterwards). Then, the technical background. His homepage says "${titular}" and promises: ${promesas} Main stack ${stack}, Top #3 GitHub contributor in Colombia and member of the GitHub Developer Program. His own site, codebymike.net, shows in public how it is monitored and protected.

He works remotely with clients anywhere; only the training is in person. He is open to job opportunities and collaborations: anyone asking about that should message him on WhatsApp.

## Projects published on the site
Mention them by name and what their description says, without grouping them into categories or adding adjectives.
${proyectos}

# Websites (/en/paginas-web)

${pw.hero.intro}

## Plans
${planes}

Custom projects (apps, systems, stores or bookings with special needs) are estimated part by part with the tool. The minimum for any custom work is ${minimo}.

Hourly rate: ${hora}. Used ONLY for extra changes (after the ${ENTREGA.rondasCambios} included rounds) and for monthly maintenance, billed by hours used. Never to explain an estimate.

The ${ENTREGA.garantiaDias}-day warranty covers ONLY bugs (something that does not work as agreed). Changing photos or text, or adding things, is not a bug: it is a change billed by the hour, also within those ${ENTREGA.garantiaDias} days.

## FAQ
(Written in Mike's voice: "I fix it" means "Mike fixes it". Rephrase them in the third person.)
${faqsWeb}

## Real published work
These are three of the projects listed above (the coffee shop, the motorcycle workshop and the event producer): do not count them twice.
${trabajos}

# AI training for teams (/en/capacitacion-ia)

${ci.hero.intro}

Closed ${CAPACITACION.horas}-hour session for a group of up to ${CAPACITACION.cupo} people: ${sesion}. Each additional person in the same session: ${adicional}. Always in Colombian pesos, even for visitors writing in English (the training is for companies in Colombia).

## Who it is for
${perfilesCap}

## How it works
${pasosCap}

## FAQ
(Also in Mike's voice: rephrase them in the third person.)
${faqsCap}

# Payment rules (all services)
- ${Math.round(REGLAS.anticipo * 100)}% to start and the rest on delivery.
- The formal quote Mike sends is valid for ${REGLAS.validezDias} days.
- Only Mike decides discounts.`
}

/**
 * Cifras públicas que el asesor puede decir sin haber llamado a la
 * calculadora: los "desde" de los planes, el mínimo, la tarifa por hora, el
 * hosting anual y la capacitación, porque ya están escritos en las páginas. Cualquier otra cifra tiene que salir de un
 * cálculo de esta conversación (lo comprueba la guardia).
 */
export function cifrasPublicas(locale: Locale): number[] {
  const moneda = monedaDe(locale)
  return [
    ...PAQUETES_WEB.map((p) => p.desde[moneda]),
    REGLAS.minimo[moneda],
    TARIFA_HORA[moneda],
    HOSTING_ANUAL.presencia[moneda],
    HOSTING_ANUAL.negocio[moneda],
    CAPACITACION.sesionCOP,
    CAPACITACION.personaAdicionalCOP,
  ]
}
