// Utilidades compartidas para la distribución de notas en redes/blogs.
// Sin dependencias externas: parsea el frontmatter a mano (es YAML simple) y
// construye el texto de cada plataforma con plantillas fijas (sin LLM).

import { readFile } from 'node:fs/promises'

export const SITE = 'https://codebymike.tech'

/**
 * Separa el frontmatter YAML del cuerpo markdown y devuelve
 * { data, body }. Solo entiende las claves que usan las notas
 * (title, description, date, tags, draft) — no es un parser YAML general.
 */
export function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { data: {}, body: raw }
  const [, fm, body] = m
  const data = {}
  for (const line of fm.split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (!kv) continue
    const [, key, rawVal] = kv
    let val = rawVal.trim()
    if (key === 'tags') {
      // [a, b, c]  →  ['a','b','c']
      val = val
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    } else if (key === 'draft') {
      val = val === 'true'
    } else {
      val = val.replace(/^['"]|['"]$/g, '')
    }
    data[key] = val
  }
  return { data, body: body.trim() }
}

/** Lee y parsea una nota desde su ruta en el repo. */
export async function readNote(path) {
  const raw = await readFile(path, 'utf8')
  const { data, body } = parseFrontmatter(raw)
  const slug = path.split('/').pop().replace(/\.md$/, '')
  return {
    slug,
    url: `${SITE}/notes/${slug}`,
    title: data.title ?? slug,
    description: data.description ?? '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    draft: data.draft === true,
    body,
  }
}

/** Convierte un tag a slug seguro para blogs (alfanumérico, sin acentos). */
export function tagSlug(tag) {
  return tag
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/** Hashtags a partir de los primeros `n` tags. */
function hashtags(tags, n) {
  return tags
    .slice(0, n)
    .map((t) => '#' + tagSlug(t))
    .filter((t) => t.length > 1)
    .join(' ')
}

/**
 * Texto para X (≤280). El enlace ocupa 23 (t.co), así que reservamos ese
 * espacio y recortamos la descripción para no pasarnos.
 */
export function buildTweet(note) {
  const tags = hashtags(note.tags, 3)
  const url = note.url
  const tail = `\n\n${url}${tags ? '\n' + tags : ''}`
  const tailLen = 1 + 1 + 23 + (tags ? 1 + tags.length : 0) // \n\n + url(23) + \n + tags
  const room = 280 - tailLen
  let head = note.title
  if (note.description && head.length + 2 + note.description.length <= room) {
    head += '\n\n' + note.description
  }
  if (head.length > room) head = head.slice(0, room - 1).trimEnd() + '…'
  return head + tail
}

/** Texto para LinkedIn (sin markdown; el link genera preview vía og tags). */
export function buildLinkedIn(note) {
  const tags = hashtags(note.tags, 5)
  return [
    note.title,
    '',
    note.description,
    '',
    `Léelo completo → ${note.url}`,
    tags ? '\n' + tags : '',
  ]
    .filter((l) => l !== undefined)
    .join('\n')
    .trim()
}

/**
 * Cuerpo markdown para dev.to / Hashnode: el artículo completo más una nota
 * de canonical al final (además del campo canonical_url de la API).
 */
export function buildArticleBody(note) {
  return `${note.body}\n\n---\n\n*Publicado originalmente en [codebymike.tech](${note.url}).*`
}
