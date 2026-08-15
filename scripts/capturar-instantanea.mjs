#!/usr/bin/env node
/**
 * Captura datos REALES en `src/data/instantanea.json`, que las páginas públicas
 * usan como reemplazo mientras la base de datos no responde.
 *
 *   # desde la base (lo ideal, cuando responde)
 *   node --experimental-strip-types scripts/capturar-instantanea.mjs --desde-db
 *
 *   # desde el backup de Vercel Blob (cuando la base está bloqueada)
 *   node --experimental-strip-types scripts/capturar-instantanea.mjs \
 *     --backup='https://<blob>.public.blob.vercel-storage.com/backups/portfolio-....json'
 *
 *   # desde la API de GitHub (fuente original de `projects`, vía seed-projects)
 *   node --experimental-strip-types scripts/capturar-instantanea.mjs --github
 *
 * Las fuentes se pueden combinar y se aplican en ese orden de prioridad:
 * base > backup > GitHub. La instantánea previa NUNCA se pierde por una fuente
 * que falle: se fusiona sobre lo que ya había, campo a campo.
 *
 * QUÉ ES Y QUÉ NO ES
 * Es una foto de datos reales, con su fecha de captura visible en la página.
 * No es un caché ni una segunda base de datos: nada la lee cuando la base
 * responde, y no se actualiza sola. Cuando la base vuelve, esto queda inerte
 * sin que haya que revertir nada.
 *
 * Solo se capturan datos PÚBLICOS: lo que ya se sirve sin autenticación en las
 * páginas de marca. Nada de finanzas, secretos de la bóveda, datos de clientes
 * ni contactos - esto acaba en un archivo del repositorio y se sirve al mundo.
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(root, 'src/data/instantanea.json')

const args = process.argv.slice(2)
const opcion = (n) => {
  const e = args.find((a) => a.startsWith(`--${n}=`))
  return e ? e.slice(n.length + 3) : null
}
const USAR_DB = args.includes('--desde-db')
const USAR_GITHUB = args.includes('--github')
const BACKUP = opcion('backup')

if (!USAR_DB && !USAR_GITHUB && !BACKUP) {
  console.error('Indica al menos una fuente: --desde-db, --backup=<url>, --github')
  process.exit(1)
}

let env = {}
try {
  env = Object.fromEntries(
    readFileSync(join(root, '.env'), 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
} catch { /* sin .env: las fuentes que lo necesiten avisarán */ }

const previa = (() => {
  try {
    return JSON.parse(readFileSync(DESTINO, 'utf8'))
  } catch {
    return { meta: {}, proyectos: [], certificaciones: [] }
  }
})()

const instantanea = {
  meta: { capturadaEn: new Date().toISOString(), fuentes: [] },
  proyectos: previa.proyectos ?? [],
  certificaciones: previa.certificaciones ?? [],
}

/** Solo campos públicos: lo que ya se pinta en la portada sin autenticar. */
const proyectoPublico = (p) => ({
  id: p.id,
  slug: p.slug,
  title: p.title,
  description: p.description ?? null,
  titleEn: p.titleEn ?? p.title_en ?? null,
  descriptionEn: p.descriptionEn ?? p.description_en ?? null,
  techStack: p.techStack ?? p.tech_stack ?? null,
  repoUrl: p.repoUrl ?? p.repo_url ?? null,
  previewUrl: p.previewUrl ?? p.preview_url ?? null,
  screenshotUrl: p.screenshotUrl ?? p.screenshot_url ?? null,
  status: p.status ?? null,
  createdAt: p.createdAt ?? p.created_at ?? null,
})

async function desdeDb() {
  const { createClient } = await import('@libsql/client')
  const url = env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL
  const authToken = env.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN
  if (!url) throw new Error('falta TURSO_DATABASE_URL')
  const c = createClient({ url, authToken })

  const { rows: proyectos } = await c.execute(
    'select * from projects where visible = 1 order by created_at desc',
  )
  instantanea.proyectos = proyectos.map(proyectoPublico)

  try {
    const { rows: certs } = await c.execute('select * from certifications order by issued_at desc')
    instantanea.certificaciones = certs
  } catch {
    // La tabla puede no existir en una base recién migrada; no es motivo para
    // perder los proyectos que sí se capturaron.
  }
  instantanea.meta.fuentes.push('base de datos')
  console.log(`  base de datos → ${instantanea.proyectos.length} proyectos`)
}

async function desdeBackup(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`el backup respondió ${res.status}`)
  const dump = await res.json()
  if (!Array.isArray(dump.projects)) throw new Error('el JSON no trae `projects`')
  instantanea.proyectos = dump.projects.filter((p) => p.visible).map(proyectoPublico)
  instantanea.meta.fuentes.push(`backup ${dump.meta?.createdAt ?? ''}`.trim())
  console.log(`  backup → ${instantanea.proyectos.length} proyectos visibles`)
}

async function desdeGithub() {
  const usuario = env.GITHUB_USERNAME || process.env.GITHUB_USERNAME || 'mikerb95'
  const token = env.GITHUB_TOKEN || process.env.GITHUB_TOKEN
  const cabeceras = { Accept: 'application/vnd.github+json' }
  if (token) cabeceras.Authorization = `Bearer ${token}`

  const res = await fetch(
    `https://api.github.com/users/${usuario}/repos?per_page=100&sort=updated`,
    { headers: cabeceras },
  )
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}`)
  const repos = await res.json()

  const desdeGh = repos
    .filter((r) => !r.fork && !r.archived && r.description)
    .map((r, i) => ({
      id: 90_000 + i,
      slug: r.name,
      title: r.name,
      description: r.description,
      titleEn: null,
      descriptionEn: null,
      techStack: r.language,
      repoUrl: r.html_url,
      previewUrl: r.homepage || null,
      screenshotUrl: null,
      status: 'activo',
      createdAt: r.created_at,
    }))

  // GitHub es la fuente de MENOR prioridad: solo aporta los proyectos que no
  // vinieron ya de la base o del backup, que están curados a mano (título en
  // inglés, captura, descripción reescrita) y ese trabajo no se tira.
  const yaEstan = new Set(instantanea.proyectos.map((p) => p.slug))
  const nuevos = desdeGh.filter((p) => !yaEstan.has(p.slug))
  instantanea.proyectos = [...instantanea.proyectos, ...nuevos]
  instantanea.meta.fuentes.push('API de GitHub')
  console.log(`  GitHub → ${desdeGh.length} repos, ${nuevos.length} añadidos`)
}

async function main() {
  console.log('Capturando instantánea...')

  // Cada fuente por separado: que GitHub esté caído no puede impedir que el
  // backup se aplique, ni al revés.
  if (USAR_DB) {
    try { await desdeDb() } catch (e) { console.error(`  base de datos falló: ${e.message}`) }
  }
  if (BACKUP) {
    try { await desdeBackup(BACKUP) } catch (e) { console.error(`  backup falló: ${e.message}`) }
  }
  if (USAR_GITHUB) {
    try { await desdeGithub() } catch (e) { console.error(`  GitHub falló: ${e.message}`) }
  }

  if (instantanea.meta.fuentes.length === 0) {
    console.error('\nNinguna fuente respondió. La instantánea previa se deja intacta.')
    process.exit(1)
  }

  writeFileSync(DESTINO, JSON.stringify(instantanea, null, 2) + '\n')
  console.log(`\nEscrito ${DESTINO}`)
  console.log(`  ${instantanea.proyectos.length} proyectos · ${instantanea.certificaciones.length} certificaciones`)
  console.log(`  fuentes: ${instantanea.meta.fuentes.join(', ')}`)
}

main().catch((e) => {
  console.error('Falló la captura:', e.message)
  process.exit(1)
})
