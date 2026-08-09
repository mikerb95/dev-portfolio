// Vocabulario del módulo de capacitación. Módulo PURO: lo importan tanto el
// servidor como los `<script>` de las páginas del panel, así que no puede
// tocar `node:crypto` ni la base.

export const FORMATOS = ['charla', 'taller', 'programa'] as const
export type Formato = (typeof FORMATOS)[number]

export const NIVELES = ['intro', 'intermedio', 'avanzado'] as const
export type Nivel = (typeof NIVELES)[number]

export const TIPOS_RECURSO = [
  'guia',
  'prompt',
  'plantilla',
  'checklist',
  'video',
  'enlace',
  'deck',
] as const
export type TipoRecurso = (typeof TIPOS_RECURSO)[number]

export const VISIBILIDADES = ['borrador', 'publico', 'con_codigo'] as const
export type Visibilidad = (typeof VISIBILIDADES)[number]

export const ETIQUETA_FORMATO: Record<Formato, string> = {
  charla: 'Charla',
  taller: 'Taller',
  programa: 'Programa',
}

export const ETIQUETA_NIVEL: Record<Nivel, string> = {
  intro: 'Introductorio',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
}

export const ETIQUETA_TIPO: Record<TipoRecurso, string> = {
  guia: 'Guía',
  prompt: 'Prompt',
  plantilla: 'Plantilla',
  checklist: 'Checklist',
  video: 'Video',
  enlace: 'Enlace',
  deck: 'Presentación',
}

export const ETIQUETA_VISIBILIDAD: Record<Visibilidad, string> = {
  borrador: 'Borrador',
  publico: 'Público',
  con_codigo: 'Con código',
}

/** Color de marca por tipo, en clases completas: Tailwind no ve las interpoladas. */
export const COLOR_TIPO: Record<TipoRecurso, { punto: string; texto: string }> = {
  guia: { punto: 'bg-cyan', texto: 'text-cyan' },
  prompt: { punto: 'bg-violet', texto: 'text-violet' },
  plantilla: { punto: 'bg-lime', texto: 'text-lime' },
  checklist: { punto: 'bg-ember', texto: 'text-ember' },
  video: { punto: 'bg-violet', texto: 'text-violet' },
  enlace: { punto: 'bg-ink-200', texto: 'text-ink-200' },
  deck: { punto: 'bg-cyan', texto: 'text-cyan' },
}

export const esFormato = (v: unknown): v is Formato => FORMATOS.includes(v as Formato)
export const esNivel = (v: unknown): v is Nivel => NIVELES.includes(v as Nivel)
export const esTipoRecurso = (v: unknown): v is TipoRecurso =>
  TIPOS_RECURSO.includes(v as TipoRecurso)
export const esVisibilidad = (v: unknown): v is Visibilidad =>
  VISIBILIDADES.includes(v as Visibilidad)

/**
 * Slug a partir de un título. Sin acentos, sin signos y sin guiones dobles: es
 * la URL pública del recurso y tiene que sobrevivir a un título escrito en
 * español con tildes y signos de interrogación.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '')
}

/**
 * Lista de texto guardada como JSON. Devuelve `[]` ante cualquier cosa que no
 * sea un array de strings: un campo corrupto no debe tumbar la página que lo
 * pinta.
 */
export function parseLista(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  } catch {
    return []
  }
}

/** Serializa una lista escrita como texto libre (una por línea o separada por comas). */
export function serializarLista(input: string | string[] | null | undefined): string | null {
  const items = Array.isArray(input)
    ? input
    : String(input ?? '')
        .split(/[\n,]/)
        .map((s) => s.trim())
  const limpia = items.map((s) => s.trim()).filter(Boolean)
  return limpia.length > 0 ? JSON.stringify(limpia) : null
}

/** Duración legible: "4 h", "1.5 h", o vacío si no se registró. */
export function formatearDuracion(horas: number | null | undefined): string {
  if (!horas || horas <= 0) return ''
  return Number.isInteger(horas) ? `${horas} h` : `${horas.toFixed(1)} h`
}
