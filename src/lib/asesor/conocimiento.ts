// Lo que sabe el asesor público (docs/plan-asistente.md, capacidad 3).
//
// Se arma con lo MISMO que publican /paginas-web y /capacitacion-ia: el
// tarifario y los diccionarios de esas páginas. Si el asesor leyera de otra
// fuente, tarde o temprano le diría al visitante algo distinto de lo que dice
// la página que tiene abierta detrás del chat.
//
// Nada del panel entra aquí: ni clientes, ni proyectos, ni la tabla de horas
// por componente con la tarifa por hora (esa la usa la calculadora, pero no se
// publica: el visitante recibe el rango, y el desglose se lo da Mike).
//
// Módulo PURO.

import { getDictionary, type Locale } from '../../i18n'
import { CAPACITACION, PAQUETES_WEB, REGLAS, formatearMonto, type Moneda } from '../../data/tarifario'

/** Moneda de los planes web según el idioma de la página: COP en español, USD en inglés. */
export function monedaDe(locale: Locale): Moneda {
  return locale === 'es' ? 'COP' : 'USD'
}

/** Texto de referencia que va en el system prompt, en el idioma de la página. */
export function conocimiento(locale: Locale): string {
  const t = getDictionary(locale)
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

  return es
    ? `# Páginas web (/paginas-web)

${pw.hero.intro}

## Planes
${planes}

Proyectos a la medida (apps, sistemas, tiendas o reservas con cosas especiales): se calculan por partes con la herramienta. El mínimo de cualquier trabajo a la medida es ${minimo}.

## Preguntas frecuentes
${faqsWeb}

## Trabajos reales publicados
${trabajos}

# Capacitación en IA para equipos (/capacitacion-ia)

${ci.hero.intro}

Sesión cerrada de ${CAPACITACION.horas} horas para un grupo de hasta ${CAPACITACION.cupo} personas: ${sesion}. Cada persona adicional en la misma sesión: ${adicional}. Siempre en pesos colombianos, también para quien escribe en inglés.

## Para quién
${perfilesCap}

## Cómo funciona
${pasosCap}

## Preguntas frecuentes
${faqsCap}

# Reglas de pago (todos los servicios)
- ${Math.round(REGLAS.anticipo * 100)} % para empezar y el resto al entregar.
- La cotización formal que manda Mike vale ${REGLAS.validezDias} días.
- Los descuentos solo los decide Mike.`
    : `# Websites (/en/paginas-web)

${pw.hero.intro}

## Plans
${planes}

Custom projects (apps, systems, stores or bookings with special needs) are estimated part by part with the tool. The minimum for any custom work is ${minimo}.

## FAQ
${faqsWeb}

## Real published work
${trabajos}

# AI training for teams (/en/capacitacion-ia)

${ci.hero.intro}

Closed ${CAPACITACION.horas}-hour session for a group of up to ${CAPACITACION.cupo} people: ${sesion}. Each additional person in the same session: ${adicional}. Always in Colombian pesos, even for visitors writing in English (the training is for companies in Colombia).

## Who it is for
${perfilesCap}

## How it works
${pasosCap}

## FAQ
${faqsCap}

# Payment rules (all services)
- ${Math.round(REGLAS.anticipo * 100)}% to start and the rest on delivery.
- The formal quote Mike sends is valid for ${REGLAS.validezDias} days.
- Only Mike decides discounts.`
}

/**
 * Cifras públicas que el asesor puede decir sin haber llamado a la
 * calculadora: los "desde" de los planes, el mínimo y la capacitación, porque
 * ya están escritos en las páginas. Cualquier otra cifra tiene que salir de un
 * cálculo de esta conversación (lo comprueba la guardia).
 */
export function cifrasPublicas(locale: Locale): number[] {
  const moneda = monedaDe(locale)
  return [
    ...PAQUETES_WEB.map((p) => p.desde[moneda]),
    REGLAS.minimo[moneda],
    CAPACITACION.sesionCOP,
    CAPACITACION.personaAdicionalCOP,
  ]
}
