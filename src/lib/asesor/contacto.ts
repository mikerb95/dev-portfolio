// Datos de contacto que una persona deja en el asesor de la burbuja para que
// Mike la contacte después (pedido de Mike, 2 oct 2026).
//
// Los datos NO salen de la conversación con el modelo: se piden en un
// formulario aparte, con una casilla de autorización obligatoria (Ley 1581:
// autorización previa, expresa e informada, con la finalidad dicha). El modelo
// solo decide cuándo mostrar el formulario; nunca ve ni guarda lo que se
// escribe en él.
//
// Se guardan en el buzón de mensajes del panel (tabla `messages`), el mismo
// del formulario de contacto: así salen en el contador de "sin leer" y la
// notificación lleva al mismo lugar.
//
// Módulo PURO: validación y armado del mensaje, sin BD ni red.

import { z } from 'zod'
import { isLocale, type Locale } from '../../i18n'
import { normalizePhone } from '../phone'
import { PAGINAS, type Pagina } from './prompt'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MAX_PREGUNTAS_RESUMEN = 10

const Esquema = z
  .object({
    locale: z.string().refine(isLocale),
    pagina: z.enum(PAGINAS).optional(),
    nombre: z.string().trim().min(2).max(120),
    telefono: z.string().trim().max(40).optional(),
    correo: z.string().trim().max(200).optional(),
    empresa: z.string().trim().max(120).optional(),
    autoriza: z.literal(true),
    resumen: z.string().trim().max(1_500).optional(),
    preguntas: z.array(z.string().trim().max(500)).max(40).optional(),
  })
  .strict()

export type Contacto = {
  locale: Locale
  pagina?: Pagina
  nombre: string
  /** E.164, ya normalizado. */
  telefono: string | null
  correo: string | null
  empresa: string | null
  resumen: string | null
  preguntas: string[]
}

export type ErrorContacto = { error: 'formato' | 'sin_medio' | 'telefono' | 'correo' | 'autorizacion' }

/** Valida lo que manda el formulario. Hace falta al menos un teléfono o un correo válidos. */
export function validarContacto(cuerpo: unknown): Contacto | ErrorContacto {
  const r = Esquema.safeParse(cuerpo)
  if (!r.success) {
    const sinAutorizacion = r.error.issues.some((i) => i.path[0] === 'autoriza')
    return { error: sinAutorizacion ? 'autorizacion' : 'formato' }
  }
  const d = r.data
  const telCrudo = d.telefono || null
  const correo = d.correo || null
  if (!telCrudo && !correo) return { error: 'sin_medio' }
  const telefono = telCrudo ? normalizePhone(telCrudo) : null
  if (telCrudo && !telefono) return { error: 'telefono' }
  if (correo && !EMAIL_RE.test(correo)) return { error: 'correo' }
  return {
    locale: d.locale as Locale,
    pagina: d.pagina,
    nombre: d.nombre,
    telefono,
    correo,
    empresa: d.empresa || null,
    resumen: d.resumen || null,
    // Las últimas preguntas bastan para saber de qué se habló.
    preguntas: (d.preguntas ?? []).filter(Boolean).slice(-MAX_PREGUNTAS_RESUMEN),
  }
}

const RUTA: Record<Pagina, string> = {
  'paginas-web': '/paginas-web',
  'capacitacion-ia': '/capacitacion-ia',
  contact: '/contact',
  sitio: 'otra página del sitio',
  inicio: 'la portada (cotizador del hero)',
}

/** Fila para la tabla `messages` del panel. */
export function filaMensaje(c: Contacto, ahora: Date): { name: string; email: string; subject: string; body: string } {
  const fecha = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(ahora)
  const lineas = [
    `Contacto dejado en el asistente con IA${c.pagina ? ` (${RUTA[c.pagina]})` : ''}${c.locale === 'en' ? ', en inglés' : ''}.`,
    `Teléfono: ${c.telefono ?? 'no lo dejó'}`,
    `Correo: ${c.correo ?? 'no lo dejó'}`,
    `Empresa: ${c.empresa ?? 'no la dijo'}`,
    // Entre paréntesis: la hora en es-CO termina en "p. m." y un punto final quedaría doble.
    `Autorizó el tratamiento de sus datos: sí (${fecha})`,
  ]
  if (c.resumen) lineas.push('', 'Resumen que preparó el asistente:', c.resumen)
  if (c.preguntas.length) lineas.push('', 'Lo que preguntó:', ...c.preguntas.map((p) => `- ${p}`))
  return {
    name: c.nombre,
    // La columna no admite NULL; sin correo queda vacía y el teléfono va en el cuerpo.
    email: c.correo ?? '',
    subject: `Asistente IA: ${c.empresa ?? c.nombre}`,
    body: lineas.join('\n'),
  }
}

/** Título y texto de la notificación de ntfy. */
export function aviso(c: Contacto): { titulo: string; texto: string } {
  const medio = [c.telefono, c.correo].filter(Boolean).join(' · ')
  const tema = c.resumen ?? c.preguntas.at(-1) ?? ''
  const corto = tema.length > 140 ? `${tema.slice(0, 140)}...` : tema
  return {
    titulo: `Nuevo contacto del asistente: ${c.nombre}`,
    texto: [c.empresa, medio, corto].filter(Boolean).join('\n'),
  }
}
