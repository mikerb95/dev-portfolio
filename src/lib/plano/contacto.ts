// Mapa de contacto de una propuesta: quién habla, quién decide, quién paga,
// por dónde y en cuánto tiempo se responde, de los dos lados.
//
// Existe porque la mitad de los proyectos que se atrasan no se atrasan por el
// código: se atrasan porque nadie sabía a quién preguntarle, o porque quien
// aprobaba el diseño no era quien pagaba la cuenta.
//
// Módulo PURO e isomorfo.

export type Persona = { nombre: string; rol: string; telefono: string; correo: string }

export type Canal = 'whatsapp' | 'correo' | 'llamada' | 'portal'
export type Seguimiento = 'semanal' | 'quincenal' | 'por-hito'

export type MapaContacto = {
  /** Punto único de contacto del lado del cliente. */
  contacto: Persona
  /** Quién aprueba entregas. null = el mismo contacto. */
  decisor: Persona | null
  /** Quién paga (a menudo tesorería, no quien pidió el proyecto). null = el mismo contacto. */
  pagador: Persona | null
  canal: Canal
  /** Horario en que se atienden mensajes, en texto libre ("lunes a viernes, 8 a. m. a 5 p. m."). */
  horario: string
  /** Horas hábiles en que Mike se compromete a responder. */
  respuestaMikeHoras: number
  /** Días hábiles que tiene el cliente para responder o enviar material antes de que corra el reloj. */
  respuestaClienteDias: number
  /** Días calendario sin respuesta tras los que el proyecto se pausa. */
  diasPausa: number
  seguimiento: Seguimiento
}

export const PERSONA_VACIA: Persona = { nombre: '', rol: '', telefono: '', correo: '' }

export const CONTACTO_DEFAULT: MapaContacto = {
  contacto: PERSONA_VACIA,
  decisor: null,
  pagador: null,
  canal: 'whatsapp',
  horario: 'lunes a viernes, de 8:00 a. m. a 6:00 p. m.',
  respuestaMikeHoras: 24,
  respuestaClienteDias: 5,
  diasPausa: 30,
  seguimiento: 'semanal',
}

export const CANAL_LABEL: Record<Canal, string> = {
  whatsapp: 'WhatsApp',
  correo: 'correo electrónico',
  llamada: 'llamada telefónica',
  portal: 'el portal de clientes',
}

export const SEGUIMIENTO_LABEL: Record<Seguimiento, string> = {
  semanal: 'una reunión corta cada semana',
  quincenal: 'una reunión cada quince días',
  'por-hito': 'una reunión al cerrar cada entrega',
}

const texto = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function persona(v: unknown): Persona {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    nombre: texto(o.nombre, 120),
    rol: texto(o.rol, 80),
    telefono: texto(o.telefono, 40),
    correo: texto(o.correo, 160),
  }
}

const entero = (v: unknown, min: number, max: number, defecto: number): number => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : defecto
}

/** Normaliza lo que llega del formulario (o de la IA). Nunca lanza. */
export function normalizarContacto(v: unknown): MapaContacto {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const canal = (['whatsapp', 'correo', 'llamada', 'portal'] as const).find((c) => c === o.canal) ?? CONTACTO_DEFAULT.canal
  const seguimiento = (['semanal', 'quincenal', 'por-hito'] as const).find((c) => c === o.seguimiento) ?? CONTACTO_DEFAULT.seguimiento
  const opcional = (x: unknown) => {
    if (x == null) return null
    const p = persona(x)
    return p.nombre ? p : null
  }
  return {
    contacto: persona(o.contacto),
    decisor: opcional(o.decisor),
    pagador: opcional(o.pagador),
    canal,
    horario: texto(o.horario, 120) || CONTACTO_DEFAULT.horario,
    respuestaMikeHoras: entero(o.respuestaMikeHoras, 1, 120, CONTACTO_DEFAULT.respuestaMikeHoras),
    respuestaClienteDias: entero(o.respuestaClienteDias, 1, 30, CONTACTO_DEFAULT.respuestaClienteDias),
    diasPausa: entero(o.diasPausa, 7, 120, CONTACTO_DEFAULT.diasPausa),
    seguimiento,
  }
}

/** Qué le falta al mapa para poder enviarse. */
export function faltantesContacto(m: MapaContacto): string[] {
  const f: string[] = []
  if (!m.contacto.nombre) f.push('el nombre del contacto')
  if (!m.contacto.telefono && !m.contacto.correo) f.push('un teléfono o correo del contacto')
  return f
}

/** Avisos que no bloquean pero conviene ver antes de enviar. */
export function avisosContacto(m: MapaContacto): string[] {
  const a: string[] = []
  if (m.pagador && m.decisor && m.pagador.nombre !== m.decisor.nombre) {
    a.push('Quien aprueba y quien paga son personas distintas: conviene que el pagador reciba copia de cada entrega.')
  }
  if (m.respuestaClienteDias > 10) a.push('Más de 10 días hábiles para responder estira mucho el proyecto.')
  return a
}
