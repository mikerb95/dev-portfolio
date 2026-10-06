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
import { formatPhone, normalizePhone } from '../phone'
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
  inicio: 'la portada',
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

// ── Número de WhatsApp pedido en la conversación ────────────────────────────
// Mientras Mike se conecta, el asesor le pide el WhatsApp a la persona por si
// él no alcanza a entrar (pedido de Mike, 2 oct 2026). La pregunta es un texto
// FIJO y no del modelo: dice para qué se usa el número antes de que la persona
// lo dé (Ley 1581: autorización informada), y queda guardada en la
// conversación como constancia. El número nunca llega al modelo: el servidor
// lo tapa en todo el historial antes de llamarlo.

export const PIDE_NUMERO: Record<Locale, string> = {
  es: 'Le avisé a Mike. Si no alcanza a conectarse ahora, ¿me dejas tu número de WhatsApp para que te escriba? Solo lo usará para responderte sobre esto.',
  en: "I let Mike know. If he can't join right now, could you leave me your WhatsApp number so he can write to you? He'll only use it to reply about this.",
}

/**
 * ¿Se pide el número al abrir la conversación? No si la persona ya dejó sus
 * datos en el formulario, ni si el motivo del aviso es justo que el asesor le
 * acaba de mostrar ese formulario: serían dos peticiones a la vez.
 */
export const debePedirNumero = (motivo: Motivo, contactoDado: boolean): boolean => motivo !== 'contacto' && !contactoDado

// Lo que ve el modelo en lugar del número. Con la petición hecha, sabe que lo
// recibió y que Mike ya lo tiene; sin ella (alguien lo escribió por su cuenta),
// solo que había uno.
const NOTA_RECIBIDO = '[Nota del sistema, no del visitante: aquí la persona dejó su número de WhatsApp. Mike ya lo tiene. Agradécele en una frase, sin repetir ni pedir el número.]'
const NOTA_OMITIDO = '[Número de teléfono omitido por el sistema.]'

// Candidatos: dígitos con separadores de los que se usan al dictar un número.
// Un precio no pasa: tiene que normalizar como móvil (10 dígitos que empiezan
// por 3, o con indicativo +), y se descarta si lleva "$" delante o una moneda
// detrás ("$3.500.000.000" son 10 dígitos que empiezan por 3).
const CANDIDATO_RE = /\+?\d[\d\s().-]{6,20}\d/g
const MONEDA_ANTES_RE = /\$\s*$/
const MONEDA_DESPUES_RE = /^\s*(cop|usd|us\$|pesos|d[oó]lares|millones|mil)\b/i

type Hallazgo = { inicio: number; fin: number; e164: string }

function hallazgos(texto: string): Hallazgo[] {
  const out: Hallazgo[] = []
  for (const m of texto.matchAll(CANDIDATO_RE)) {
    const inicio = m.index!
    const fin = inicio + m[0].length
    if (MONEDA_ANTES_RE.test(texto.slice(Math.max(0, inicio - 3), inicio))) continue
    if (MONEDA_DESPUES_RE.test(texto.slice(fin))) continue
    // Un dígito pegado por delante o por detrás es otro número más largo.
    if (/\d/.test(texto[inicio - 1] ?? '') || /\d/.test(texto[fin] ?? '')) continue
    const e164 = normalizePhone(m[0])
    if (e164) out.push({ inicio, fin, e164 })
  }
  return out
}

/** Primer número de WhatsApp válido del texto, en E.164. */
export function buscarTelefono(texto: string): string | null {
  return hallazgos(texto)[0]?.e164 ?? null
}

/** Reemplaza todo número de teléfono por la nota para el modelo. */
export function taparTelefonos(texto: string, pedido: boolean): string {
  const h = hallazgos(texto)
  if (!h.length) return texto
  let out = ''
  let desde = 0
  for (const x of h) {
    out += texto.slice(desde, x.inicio) + (pedido ? NOTA_RECIBIDO : NOTA_OMITIDO)
    desde = x.fin
  }
  return out + texto.slice(desde)
}

/** Enlace para escribirle desde el celular de Mike, con un saludo que da contexto. */
export function enlaceWhatsapp(e164: string, locale: Locale): string {
  const saludo =
    locale === 'en'
      ? "Hi, this is Mike from CodeByMike. I'm writing about what you asked my website's assistant."
      : 'Hola, soy Mike de CodeByMike. Te escribo por lo que le preguntaste al asistente de mi página.'
  return `https://wa.me/${e164.replace(/\D/g, '')}?text=${encodeURIComponent(saludo)}`
}

/** Fila para el buzón del panel (tabla `messages`), igual que el formulario. */
export function filaNumero(
  c: { id: number; telefono: string; locale: Locale; pagina?: Pagina; preguntas: string[] },
  ahora: Date
): { name: string; email: string; subject: string; body: string } {
  const fecha = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(ahora)
  const donde = c.pagina ? ` (${PAGINA_TEXTO[c.pagina]})` : ''
  const lineas = [
    `Dejó su WhatsApp en el chat del asistente con IA${donde}${c.locale === 'en' ? ', en inglés' : ''}.`,
    `Teléfono: ${formatPhone(c.telefono)}`,
    // Entre paréntesis: la hora en es-CO termina en "p. m." y un punto final quedaría doble.
    `Autorización: lo escribió respondiendo a esta pregunta del asistente (${fecha}): "${PIDE_NUMERO[c.locale]}"`,
    `Conversación: https://codebymike.net/admin/asesor/${c.id}`,
  ]
  const preguntas = c.preguntas.filter((p) => !buscarTelefono(p)).slice(-10)
  if (preguntas.length) lineas.push('', 'Lo que preguntó:', ...preguntas.map((p) => `- ${p}`))
  return {
    name: 'Visitante del asistente',
    // La columna no admite NULL; el teléfono va en el cuerpo.
    email: '',
    subject: `Asistente IA: WhatsApp ${formatPhone(c.telefono)}`,
    body: lineas.join('\n'),
  }
}
