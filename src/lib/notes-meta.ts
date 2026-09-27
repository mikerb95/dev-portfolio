// Metadatos derivados de las notas: tiempo de lectura, familia temática,
// enlaces entre notas y notas relacionadas. Todo sale del propio contenido
// (frontmatter y cuerpo del markdown), nada se escribe a mano por nota.
//
// Módulo puro: no importa `astro:content` para poder probarse sin Astro y
// usarse desde el navegador si hiciera falta. Quien lo llama le pasa ya los
// datos planos de cada nota.

import type { Paleta, RGB } from './motion/portadas'

// ── Familias ────────────────────────────────────────────────────────────────

/**
 * Cuatro familias en vez de las ~35 etiquetas sueltas: una fila de doce
 * filtros con una o dos notas cada uno es ruido, y cuatro colores son lo que
 * el ojo alcanza a asociar de un vistazo en la bitácora. La familia se deduce
 * de las etiquetas que el autor ya puso, no se declara aparte.
 */
export type Familia = 'seguridad' | 'operacion' | 'calidad' | 'arquitectura'

export const FAMILIAS: readonly Familia[] = ['seguridad', 'operacion', 'calidad', 'arquitectura']

// Etiquetas de los dos idiomas: las notas en inglés llevan sus propias
// etiquetas traducidas y tienen que caer en la misma familia que su hermana.
const ETIQUETAS: Record<Familia, readonly string[]> = {
  seguridad: ['seguridad', 'security', 'auth', 'opsec', 'ssrf', 'multi-tenant', 'rate-limiting'],
  operacion: [
    'sre', 'observabilidad', 'observability', 'slo', 'chaos-engineering', 'resiliencia', 'resilience',
    'costos', 'cost', 'infraestructura', 'infrastructure', 'turso', 'vercel',
  ],
  calidad: [
    'testing', 'calidad', 'quality', 'e2e', 'playwright', 'ci-cd', 'k6', 'load-testing', 'sast',
    'accesibilidad', 'accessibility', 'postmortem',
  ],
  arquitectura: ['arquitectura', 'architecture', 'i18n', 'rag', 'llm', 'ia', 'ai', 'aprendizaje', 'learning'],
}

const FAMILIA_DE_ETIQUETA = new Map<string, Familia>(
  FAMILIAS.flatMap((f) => ETIQUETAS[f].map((e) => [e, f] as const)),
)

/**
 * Familias de una nota, en el orden en que aparecen sus etiquetas. La primera
 * es la principal (su color); las demás hacen que el filtro la encuentre
 * también ahí: una nota sobre un scanner de seguridad en CI es de seguridad
 * y de calidad a la vez. Sin ninguna etiqueta conocida, cae en arquitectura.
 */
export function familiasDe(tags: readonly string[]): Familia[] {
  const vistas: Familia[] = []
  for (const t of tags) {
    const f = FAMILIA_DE_ETIQUETA.get(t.trim().toLowerCase())
    if (f && !vistas.includes(f)) vistas.push(f)
  }
  return vistas.length ? vistas : ['arquitectura']
}

// Los cuatro acentos de la marca (global.css), los mismos de las portadas
// generativas de la portada: un color fuera de la paleta se leería como otro
// sitio. Ámbar para seguridad porque es el color de alerta del resto del sitio.
const CIAN: RGB = [0, 242, 255]
const VIOLETA: RGB = [167, 139, 255]
const LIMA: RGB = [201, 255, 91]
const AMBAR: RGB = [255, 107, 61]

export const PALETA_FAMILIA: Record<Familia, Paleta> = {
  seguridad: { linea: AMBAR, halo: VIOLETA },
  operacion: { linea: CIAN, halo: LIMA },
  calidad: { linea: LIMA, halo: CIAN },
  arquitectura: { linea: VIOLETA, halo: CIAN },
}

export const hex = (c: RGB) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')

// ── Identidad del mapa ──────────────────────────────────────────────────────

/**
 * Clave con la que se siembra el mapa generativo de una nota. Es el slug en
 * español también para la versión inglesa (su `translationOf`): el mismo
 * artículo tiene el mismo mapa en los dos idiomas, aunque su URL cambie.
 */
export function claveMapa(nota: { slug: string; lang: string; translationOf?: string }): string {
  return nota.lang === 'es' ? nota.slug : (nota.translationOf ?? nota.slug)
}

// ── Lectura ─────────────────────────────────────────────────────────────────

/** Palabras por minuto de lectura técnica (con código de por medio va lenta). */
export const PALABRAS_POR_MINUTO = 220

/** Minutos de lectura del cuerpo en markdown, redondeados hacia arriba. */
export function minutosLectura(cuerpo: string): number {
  const palabras = cuerpo
    // Las URLs de los enlaces no se leen: se lee el texto del enlace.
    .replace(/\]\([^)]*\)/g, ']')
    .split(/\s+/)
    .filter((p) => /[\p{L}\p{N}]/u.test(p)).length
  return Math.max(1, Math.ceil(palabras / PALABRAS_POR_MINUTO))
}

/**
 * Slugs de las notas a las que enlaza el cuerpo (`](/notes/x)` o
 * `](/en/notes/x)`), sin repetir. Son los enlaces que el autor escribió a
 * mano, la relación más fuerte que puede haber entre dos notas.
 */
export function enlacesANotas(cuerpo: string): string[] {
  const slugs = new Set<string>()
  for (const m of cuerpo.matchAll(/\]\((?:\/en)?\/notes\/([a-z0-9-]+)\/?(?:#[^)]*)?\)/g)) slugs.add(m[1])
  return [...slugs]
}

// ── Relacionadas ────────────────────────────────────────────────────────────

export type NotaMeta = {
  slug: string
  tags: readonly string[]
  date: Date
  /** Slugs a los que enlaza su cuerpo (ver `enlacesANotas`). */
  enlaces: readonly string[]
}

/**
 * Las `n` notas más cercanas a `actual`. Un enlace escrito a mano (en
 * cualquier sentido) pesa más que cualquier coincidencia de etiquetas; después
 * cuentan las etiquetas compartidas y la familia principal. A igual puntaje,
 * la más cercana en fecha: dos notas escritas la misma semana suelen salir
 * del mismo trabajo. Una nota sin nada en común no se ofrece como relacionada.
 */
export function relacionadas<T extends NotaMeta>(actual: T, todas: readonly T[], n = 3): T[] {
  const familia = familiasDe(actual.tags)[0]
  const tags = new Set(actual.tags)
  return todas
    .filter((o) => o.slug !== actual.slug)
    .map((o) => {
      let puntos = 0
      if (actual.enlaces.includes(o.slug) || o.enlaces.includes(actual.slug)) puntos += 4
      puntos += o.tags.filter((t) => tags.has(t)).length
      if (familiasDe(o.tags)[0] === familia) puntos += 1
      return { o, puntos, distancia: Math.abs(o.date.getTime() - actual.date.getTime()) }
    })
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.distancia - b.distancia || a.o.slug.localeCompare(b.o.slug))
    .slice(0, n)
    .map((x) => x.o)
}

// ── Bitácora ────────────────────────────────────────────────────────────────

/** Cuántas notas hay en cada familia (una nota cuenta en todas las suyas). */
export function conteoFamilias(notas: readonly { tags: readonly string[] }[]): Record<Familia, number> {
  const conteo = { seguridad: 0, operacion: 0, calidad: 0, arquitectura: 0 }
  for (const n of notas) for (const f of familiasDe(n.tags)) conteo[f]++
  return conteo
}

/**
 * Agrupa por mes calendario, en el orden en que llegan (se espera de la más
 * reciente a la más antigua). El mes se toma en UTC: la fecha del frontmatter
 * es un día, no un instante, y en hora de Bogotá el 1 de agosto caería en julio.
 */
export function agruparPorMes<T extends { date: Date }>(notas: readonly T[]): { clave: string; notas: T[] }[] {
  const grupos: { clave: string; notas: T[] }[] = []
  for (const n of notas) {
    const clave = `${n.date.getUTCFullYear()}-${String(n.date.getUTCMonth() + 1).padStart(2, '0')}`
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.clave === clave) ultimo.notas.push(n)
    else grupos.push({ clave, notas: [n] })
  }
  return grupos
}
