// Asesor en vivo: cuándo una conversación del asesor merece avisarle a Mike
// para que pueda entrar a escribir, y la validación de lo que se escribe una
// vez dentro (pedido de Mike, 2 oct 2026).
//
// wa.me no sirve para esto: solo abre WhatsApp en el celular del visitante con
// un texto que él tiene que enviar. El aviso va por ntfy (lib/notify.ts) y la
// respuesta de Mike vuelve por el mismo chat de la burbuja.
//
// Módulo PURO: sin BD ni red (lo de base de datos vive en vivo-db.ts).

import { z } from 'zod'
import type { Locale } from '../../i18n'
import type { Pagina } from './prompt'

export const MOTIVOS = ['precio', 'whatsapp', 'contacto'] as const
export type Motivo = (typeof MOTIVOS)[number]

/** Las conversaciones se borran a las 48 h: es para atender en caliente. */
export const RETENCION_MS = 48 * 60 * 60 * 1000
/** Tope de mensajes por conversación: una charla real no llega, un bucle sí. */
export const MAX_MENSAJES = 200
export const MAX_TEXTO = 500
export const MAX_TEXTO_MIKE = 2_000

/** Token del visitante: 32 bytes en base64url. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

/**
 * ¿Esta respuesta muestra interés suficiente para avisar? Solo las tres
 * señales que el propio asesor ya usa para cerrar: dio un precio calculado,
 * preparó el mensaje de WhatsApp o pidió el formulario de contacto. Una charla
 * de curiosidad no despierta a nadie.
 */
export function motivoAviso(r: { cifras: string[]; whatsapp: string | null; contacto: boolean }): Motivo | null {
  if (r.contacto) return 'contacto'
  if (r.whatsapp) return 'whatsapp'
  if (r.cifras.length) return 'precio'
  return null
}

const EsquemaVisitante = z
  .object({
    t: z.string().regex(TOKEN_RE),
    texto: z.string().trim().min(1).max(MAX_TEXTO),
  })
  .strict()

/** Mensaje del visitante cuando Mike ya está en la conversación. */
export function validarMensajeVisitante(cuerpo: unknown): { t: string; texto: string } | null {
  const r = EsquemaVisitante.safeParse(cuerpo)
  return r.success ? r.data : null
}

/** Texto que escribe Mike desde el panel. */
export function validarMensajeMike(cuerpo: unknown): string | null {
  const r = z.object({ texto: z.string().trim().min(1).max(MAX_TEXTO_MIKE) }).safeParse(cuerpo)
  return r.success ? r.data.texto : null
}

/** `desde` de los sondeos: id del último mensaje que ya se tiene. */
export function leerDesde(valor: string | null): number {
  const n = Number(valor)
  return Number.isSafeInteger(n) && n > 0 ? n : 0
}

const MOTIVO_TEXTO: Record<Motivo, string> = {
  precio: 'le dio un precio',
  whatsapp: 'le preparó el mensaje de WhatsApp',
  contacto: 'le ofreció el formulario de contacto',
}

const PAGINA_TEXTO: Record<Pagina, string> = {
  'paginas-web': '/paginas-web',
  'capacitacion-ia': '/capacitacion-ia',
  contact: '/contact',
  sitio: 'otra página',
}

/** Título y texto de la notificación de ntfy. */
export function avisoVivo(c: {
  motivo: Motivo
  locale: Locale
  pagina?: Pagina
  preguntas: string[]
}): { titulo: string; texto: string } {
  const donde = [c.pagina ? PAGINA_TEXTO[c.pagina] : null, c.locale === 'en' ? 'en inglés' : null].filter(Boolean).join(', ')
  const ultima = c.preguntas.at(-1) ?? ''
  const corta = ultima.length > 160 ? `${ultima.slice(0, 160)}...` : ultima
  return {
    titulo: 'Alguien está interesado en el asesor',
    texto: [`El asesor ${MOTIVO_TEXTO[c.motivo]}${donde ? ` (${donde})` : ''}.`, corta && `Última pregunta: ${corta}`, 'Toca para ver la conversación y entrar.']
      .filter(Boolean)
      .join('\n'),
  }
}

/** ¿El visitante sigue mirando? Sondea cada pocos segundos con el chat abierto. */
export function visitantePresente(visto: Date | null, ahora: Date): boolean {
  return !!visto && ahora.getTime() - visto.getTime() < 45_000
}
