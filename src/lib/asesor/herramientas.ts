// Herramientas del asesor público: calcular un precio y preparar el mensaje de
// WhatsApp. Las dos se ejecutan en el servidor con funciones puras; el modelo
// solo elige qué pedir.
//
// Módulo PURO (sin BD ni red): lo prueban tests/asesor.test.ts sin modelo.

import { z } from 'zod'
import { COMPONENTES, formatearMonto } from '../../data/tarifario'
import {
  cifrasPermitidas,
  cotizarCapacitacion,
  cotizarPaquete,
  cotizarSoftware,
  EntradaInvalida,
  type Cotizacion,
} from '../asistente/calculo-cotizacion'
import { extraerCifras, verificarCifras } from '../asistente/guardia'
import type { Locale } from '../../i18n'
import { cifrasPublicas, monedaDe } from './conocimiento'

const IDS_COMPONENTES = COMPONENTES.map((c) => c.id) as [string, ...string[]]

// Todo proyecto a la medida empieza por entender qué se quiere y termina
// publicándolo y enseñando a usarlo. El modelo tiende a olvidarlos al armar la
// lista, y sin ellos el rango saldría por debajo de lo que de verdad cuesta.
const SIEMPRE = ['descubrimiento', 'entrega'] as const

/**
 * Entrada de `calcular_precio`. Objeto plano y no una unión discriminada: la
 * API exige `type: object` en la raíz del esquema. La coherencia de cada tipo
 * la comprueba `pedidoDesde`.
 */
export const EsquemaCalculo = z
  .object({
    tipo: z.enum(['plan', 'a_medida', 'capacitacion']),
    plan: z.enum(['presencia', 'negocio', 'a-medida']).optional(),
    base: z.enum(['presencia', 'negocio']).optional(),
    componentes: z
      .array(
        z
          .object({
            id: z.enum(IDS_COMPONENTES),
            cantidad: z.number().int().min(1).max(10).optional(),
          })
          .strict()
      )
      .max(COMPONENTES.length)
      .optional(),
    personas: z.number().int().min(1).max(500).optional(),
  })
  .strict()

export type PedidoCalculo = z.infer<typeof EsquemaCalculo>

export const EsquemaWhatsapp = z
  .object({
    necesidad: z.string().min(3).max(300),
    pendiente: z.string().max(300).optional(),
  })
  .strict()

export type PedidoWhatsapp = z.infer<typeof EsquemaWhatsapp>

/** Ejecuta un cálculo. Lanza EntradaInvalida con un mensaje que el modelo puede corregir. */
export function calcular(p: PedidoCalculo, locale: Locale): Cotizacion {
  const moneda = monedaDe(locale)
  if (p.tipo === 'plan') {
    if (!p.plan) throw new EntradaInvalida('falta "plan" (presencia, negocio o a-medida)')
    return cotizarPaquete(p.plan, moneda)
  }
  if (p.tipo === 'capacitacion') {
    if (!p.personas) throw new EntradaInvalida('falta "personas"')
    return cotizarCapacitacion(p.personas)
  }
  const elegidos = (p.componentes ?? []).filter((c) => !SIEMPRE.includes(c.id as (typeof SIEMPRE)[number]))
  if (!elegidos.length) throw new EntradaInvalida('falta al menos un componente además de descubrimiento y entrega')
  return cotizarSoftware({
    componentes: [{ id: 'descubrimiento' }, ...elegidos, { id: 'entrega' }],
    moneda,
    base: p.base,
  })
}

/** Lo que vuelve al modelo tras calcular: el precio y qué incluye, sin horas ni tarifa. */
export function resultadoParaModelo(c: Cotizacion): Record<string, unknown> {
  const m = (v: number) => formatearMonto(v, c.moneda)
  if (c.tipo === 'paquete') {
    return { plan: c.nombre, desde: m(c.desde), anticipo: m(c.condiciones.anticipo[0]) }
  }
  if (c.tipo === 'capacitacion') {
    return {
      personas: c.personas,
      horas: c.horas,
      precio: m(c.precio[0]),
      personasAdicionales: c.personasAdicionales,
      anticipo: m(c.condiciones.anticipo[0]),
    }
  }
  if (c.tipo === 'software') {
    return {
      rango: { desde: m(c.precio[0]), hasta: m(c.precio[1]) },
      partiendoDe: c.base?.nombre ?? null,
      incluye: c.lineas.map((l) => (l.cantidad > 1 ? `${l.nombre} (x${l.cantidad})` : l.nombre)),
      anticipo: { desde: m(c.condiciones.anticipo[0]), hasta: m(c.condiciones.anticipo[1]) },
      aplicoMinimo: c.aplicoMinimo,
      nota: 'Estimado. El precio final lo confirma Mike después de hablar del alcance.',
    }
  }
  return {}
}

/** Precio de una cotización en una frase corta, para el mensaje de WhatsApp. */
export function precioEnFrase(c: Cotizacion, locale: Locale): string {
  const es = locale === 'es'
  if (c.tipo === 'paquete') {
    return `Plan ${c.nombre}, ${es ? 'desde' : 'from'} ${formatearMonto(c.desde, c.moneda)}`
  }
  if (c.tipo === 'capacitacion') {
    return es
      ? `Capacitación para ${c.personas} personas: ${formatearMonto(c.precio[0], 'COP')}`
      : `Training for ${c.personas} people: ${formatearMonto(c.precio[0], 'COP')}`
  }
  if (c.tipo === 'software') {
    const [a, b] = c.precio
    if (a === b) return formatearMonto(a, c.moneda)
    return es
      ? `entre ${formatearMonto(a, c.moneda)} y ${formatearMonto(b, c.moneda)}`
      : `between ${formatearMonto(a, c.moneda)} and ${formatearMonto(b, c.moneda)}`
  }
  return ''
}

/**
 * Mensaje que se precarga en WhatsApp. Lo compone el servidor: el modelo solo
 * aporta qué necesita la persona y qué quedó pendiente, y el precio sale de la
 * última cotización calculada, nunca del texto del modelo.
 */
export function mensajeWhatsapp(p: PedidoWhatsapp, ultima: Cotizacion | null, locale: Locale): string {
  const es = locale === 'es'
  // Si el modelo coló una cifra en el resumen, se descarta ese campo entero:
  // lo que llega a WhatsApp con precio tiene que poder respaldarse.
  const limpio = (s: string | undefined) => {
    const v = s?.trim()
    if (!v) return null
    return verificarCifras(v, []).ok ? v : null
  }
  const necesidad = limpio(p.necesidad)
  const pendiente = limpio(p.pendiente)
  const lineas = [
    es
      ? 'Hola Mike, vengo de codebymike.net. Hablé con tu asistente y quiero seguir contigo.'
      : 'Hi Mike, I come from codebymike.net. I talked to your assistant and want to continue with you.',
  ]
  // Sin etiqueta delante: el modelo ya lo escribe en primera persona.
  if (necesidad) lineas.push('', necesidad)
  if (ultima) {
    lineas.push(`${es ? 'Estimado del asistente' : 'Assistant estimate'}: ${precioEnFrase(ultima, locale)}`)
  }
  if (pendiente) lineas.push(`${es ? 'Me queda la duda' : 'Still unsure about'}: ${pendiente}`)
  return lineas.join('\n')
}

/** Todas las cifras que el asesor puede escribir: las públicas más las de sus cálculos. */
export function permitidas(cotizaciones: readonly Cotizacion[], locale: Locale): number[] {
  return [...new Set([...cifrasPublicas(locale), ...cifrasPermitidas(cotizaciones)])]
}

/**
 * Cifras del texto que salieron de un cálculo de esta conversación, tal como
 * están escritas. El chat las marca ("Calculado con el tarifario") y las hace
 * rodar; los "desde" dichos de memoria no cuentan, aunque sean correctos,
 * porque la marca afirma que hubo cálculo.
 */
export function cifrasCalculadas(texto: string, cotizaciones: readonly Cotizacion[]): string[] {
  const calculadas = cifrasPermitidas(cotizaciones)
  if (!calculadas.length) return []
  return extraerCifras(texto)
    .filter((c) => calculadas.some((v) => Math.abs(v - c.valor) <= c.tolerancia))
    .map((c) => c.texto)
}

function esquemaApi(esquema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...resto } = z.toJSONSchema(esquema) as Record<string, unknown>
  return resto
}

/** Definiciones para la API, en el idioma del prompt (español: el modelo responde en el de la página). */
export function definiciones() {
  return [
    {
      name: 'calcular_precio',
      description:
        'Única fuente de precios. Úsala SIEMPRE antes de decir un precio que no sea el "desde" público de un plan. ' +
        'tipo "plan": el precio "desde" de un plan (plan: presencia | negocio | a-medida). ' +
        'tipo "capacitacion": precio de la capacitación en IA para un número de personas (personas). ' +
        'tipo "a_medida": estimado por partes de un proyecto a la medida. "base" es el plan web sobre el que se monta ' +
        '(presencia o negocio) cuando el proyecto es una página con algo más (tienda, reservas, pagos); omítela si es ' +
        'un sistema sin página pública. "componentes": lista de partes. Descubrimiento y entrega se suman solos. ' +
        'Partes válidas: ' +
        COMPONENTES.filter((c) => !SIEMPRE.includes(c.id as (typeof SIEMPRE)[number]))
          .map((c) => `${c.id} (${c.nombre}${c.unidad ? `; cantidad = cada ${c.unidad}` : ''})`)
          .join(', ') +
        '. Devuelve el rango y lo que incluye. Nunca redondees ni cambies las cifras que devuelve.',
      input_schema: esquemaApi(EsquemaCalculo),
    },
    {
      name: 'preparar_whatsapp',
      description:
        'Prepara el botón "Enviarle esto a Mike", que abre WhatsApp con un resumen ya escrito. Úsala cuando la persona ' +
        'quiera avanzar, pida hablar con Mike, o cuando ya diste un estimado. El mensaje lo envía la persona, así que ' +
        'escribe en PRIMERA persona, como si ella le escribiera a Mike ("Necesito una tienda en línea...", nunca "Quiere..."). ' +
        '"necesidad": qué necesita, en una o dos frases y en su idioma, SIN precios ni cifras de dinero (el precio lo agrega ' +
        'el sistema). "pendiente": la duda que le quedó, también en primera persona, si la hay. No incluyas nombres, ' +
        'teléfonos ni correos.',
      input_schema: esquemaApi(EsquemaWhatsapp),
    },
  ]
}
