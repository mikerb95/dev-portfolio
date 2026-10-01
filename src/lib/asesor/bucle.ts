// Una vuelta de conversación del asesor público: valida lo que manda el
// navegador, llama al modelo, ejecuta sus herramientas y pasa la respuesta por
// la guardia de cifras antes de devolverla.
//
// No se guarda la conversación en ninguna parte (plan: nada de datos
// personales almacenados), así que el navegador reenvía el historial en cada
// pregunta. Eso abre una puerta: un historial manipulado podría traer una
// "respuesta del asesor" con un precio falso. Por eso del historial solo se
// toma texto plano, y los cálculos previos llegan como PEDIDOS que el servidor
// vuelve a ejecutar contra el tarifario: un pedido inventado solo produce
// precios reales.
//
// El modelo se inyecta (`Dependencias`) para probar el bucle sin red.
// Módulo PURO.

import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { isLocale, type Locale } from '../../i18n'
import { EntradaInvalida, type Cotizacion } from '../asistente/calculo-cotizacion'
import { verificarCifras } from '../asistente/guardia'
import { sumarUso, USO_CERO, type Uso } from './costo'
import {
  calcular,
  cifrasCalculadas,
  EsquemaCalculo,
  EsquemaWhatsapp,
  mensajeWhatsapp,
  permitidas,
  resultadoParaModelo,
  type PedidoCalculo,
} from './herramientas'
import { MAX_PREGUNTAS, PAGINAS, type Pagina } from './prompt'

export const MAX_TEXTO_USUARIO = 500
export const MAX_TEXTO_ASESOR = 2_000
export const MAX_CALCULOS = 6
/** Llamadas al modelo por pregunta: una o dos herramientas, la respuesta y un reintento de la guardia. */
export const MAX_LLAMADAS = 4

const EsquemaEntrada = z
  .object({
    locale: z.string().refine(isLocale),
    pagina: z.enum(PAGINAS).optional(),
    mensajes: z
      .array(
        z
          .object({
            rol: z.enum(['usuario', 'asesor']),
            texto: z.string().trim().min(1),
          })
          .strict()
      )
      .min(1)
      .max(MAX_PREGUNTAS * 2 - 1),
    calculos: z.array(EsquemaCalculo).max(MAX_CALCULOS).default([]),
  })
  .strict()

export type Entrada = {
  locale: Locale
  pagina?: Pagina
  mensajes: { rol: 'usuario' | 'asesor'; texto: string }[]
  calculos: PedidoCalculo[]
}

export type ErrorEntrada = { error: 'formato' | 'limite' }

/**
 * Valida el cuerpo del request. 'limite' si se pasó del máximo de preguntas
 * (el navegador lo impide; esto es para quien lo salte).
 */
export function validarEntrada(cuerpo: unknown): Entrada | ErrorEntrada {
  const r = EsquemaEntrada.safeParse(cuerpo)
  if (!r.success) {
    const largo = r.error.issues.some((i) => i.path[0] === 'mensajes' && i.code === 'too_big' && i.path.length === 1)
    return { error: largo ? 'limite' : 'formato' }
  }
  const { mensajes } = r.data
  // Alternancia estricta, empezando y terminando en el visitante.
  const alterna = mensajes.every((m, i) => m.rol === (i % 2 === 0 ? 'usuario' : 'asesor'))
  if (!alterna || mensajes.at(-1)!.rol !== 'usuario') return { error: 'formato' }
  const excede = mensajes.some((m) => m.texto.length > (m.rol === 'usuario' ? MAX_TEXTO_USUARIO : MAX_TEXTO_ASESOR))
  if (excede) return { error: 'formato' }
  return { locale: r.data.locale as Locale, pagina: r.data.pagina, mensajes, calculos: r.data.calculos }
}

export type Dependencias = {
  llamarModelo: (mensajes: Anthropic.MessageParam[]) => Promise<Anthropic.Message>
}

export type Respuesta = {
  texto: string
  /** Mensaje para precargar en WhatsApp, si el modelo lo preparó en esta vuelta. */
  whatsapp: string | null
  /** Pedidos de cálculo de toda la conversación, para que el navegador los reenvíe. */
  calculos: PedidoCalculo[]
  uso: Uso
  /** Cifras del texto que salieron de un cálculo, tal como están escritas. */
  cifras: string[]
  /** Por qué se devolvió el texto de respaldo en vez de la respuesta del modelo. */
  respaldo: 'guardia' | 'negativa' | 'vueltas' | null
}

const RESPALDO: Record<Locale, string> = {
  es: 'Prefiero no darte una respuesta que no pueda respaldar. Escríbele a Mike por WhatsApp y él te confirma, normalmente el mismo día.',
  en: "I'd rather not give you an answer I can't back up. Message Mike on WhatsApp and he'll confirm, usually the same day.",
}

function textoDe(m: Anthropic.Message): string {
  return m.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

/** Corre una pregunta completa. Lanza solo si falla la llamada al modelo. */
export async function atender(e: Entrada, deps: Dependencias): Promise<Respuesta> {
  // Los cálculos previos se rehacen; uno que ya no valga (tarifario cambiado)
  // simplemente se descarta.
  const calculos: PedidoCalculo[] = []
  const cotizaciones: Cotizacion[] = []
  for (const p of e.calculos) {
    try {
      cotizaciones.push(calcular(p, e.locale))
      calculos.push(p)
    } catch {
      // Pedido viejo o manipulado: no aporta cifras.
    }
  }

  const mensajes: Anthropic.MessageParam[] = e.mensajes.map((m) => ({
    role: m.rol === 'usuario' ? 'user' : 'assistant',
    content: m.texto,
  }))

  let uso = USO_CERO
  let whatsapp: string | null = null
  let reintentoGuardia = false
  // Texto escrito junto a una llamada a herramienta. El modelo suele dar la
  // respuesta completa en el mismo mensaje en que pide preparar WhatsApp, y
  // después cierra sin decir nada más: si ese texto se descartara, se perdería
  // justo la respuesta con el precio.
  let previo: string[] = []
  const cerrar = (texto: string, respaldo: Respuesta['respaldo']): Respuesta => ({
    texto,
    whatsapp,
    calculos,
    uso,
    cifras: respaldo ? [] : cifrasCalculadas(texto, cotizaciones),
    respaldo,
  })

  for (let vuelta = 0; vuelta < MAX_LLAMADAS; vuelta++) {
    const r = await deps.llamarModelo(mensajes)
    uso = sumarUso(uso, r.usage)
    if (r.stop_reason === 'refusal') return cerrar(RESPALDO[e.locale], 'negativa')

    const usos = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (usos.length) {
      const dicho = textoDe(r)
      if (dicho) previo.push(dicho)
      mensajes.push({ role: 'assistant', content: r.content })
      const resultados: Anthropic.ToolResultBlockParam[] = usos.map((u) => {
        const salida = ejecutarHerramienta(u, e.locale, cotizaciones, calculos)
        if (salida.whatsapp) whatsapp = salida.whatsapp
        return { type: 'tool_result', tool_use_id: u.id, content: salida.contenido, is_error: salida.error }
      })
      mensajes.push({ role: 'user', content: resultados })
      continue
    }

    const texto = [...previo, textoDe(r)].filter(Boolean).join('\n\n')
    if (!texto) return cerrar(RESPALDO[e.locale], 'vueltas')
    const g = verificarCifras(texto, permitidas(cotizaciones, e.locale))
    if (g.ok) return cerrar(texto, null)
    if (reintentoGuardia) return cerrar(RESPALDO[e.locale], 'guardia')
    // Una oportunidad de corregir, con las cifras problemáticas a la vista.
    reintentoGuardia = true
    // El reintento reescribe la respuesta completa: lo dicho antes no se suma.
    previo = []
    mensajes.push({ role: 'assistant', content: r.content })
    mensajes.push({
      role: 'user',
      content:
        `[Revisión automática del sistema, no del visitante] Tu respuesta menciona cifras que no salen de calcular_precio ` +
        `ni de los precios publicados: ${g.inventadas.map((c) => c.texto).join(', ')}. ` +
        'Reescribe la respuesta completa para el visitante: usa calcular_precio para cualquier precio, o no des la cifra.',
    })
  }
  return cerrar(RESPALDO[e.locale], 'vueltas')
}

type Salida = { contenido: string; error: boolean; whatsapp?: string }

function ejecutarHerramienta(
  u: Anthropic.ToolUseBlock,
  locale: Locale,
  cotizaciones: Cotizacion[],
  calculos: PedidoCalculo[]
): Salida {
  if (u.name === 'calcular_precio') {
    const p = EsquemaCalculo.safeParse(u.input)
    if (!p.success) return { contenido: `Entrada inválida: ${p.error.issues.map((i) => i.message).join('; ')}`, error: true }
    try {
      const c = calcular(p.data, locale)
      cotizaciones.push(c)
      // El historial de pedidos se queda con los últimos: el navegador lo
      // reenvía y tiene tope.
      calculos.push(p.data)
      if (calculos.length > MAX_CALCULOS) calculos.splice(0, calculos.length - MAX_CALCULOS)
      return { contenido: JSON.stringify(resultadoParaModelo(c)), error: false }
    } catch (err) {
      if (err instanceof EntradaInvalida) return { contenido: err.message, error: true }
      throw err
    }
  }
  if (u.name === 'preparar_whatsapp') {
    const p = EsquemaWhatsapp.safeParse(u.input)
    if (!p.success) return { contenido: `Entrada inválida: ${p.error.issues.map((i) => i.message).join('; ')}`, error: true }
    const ultima = cotizaciones.at(-1) ?? null
    return {
      contenido: 'Listo: el botón "Enviarle esto a Mike" ya está visible para el visitante.',
      error: false,
      whatsapp: mensajeWhatsapp(p.data, ultima, locale),
    }
  }
  return { contenido: `Herramienta desconocida: ${u.name}`, error: true }
}
