#!/usr/bin/env node
// Orquestador de distribución. Recibe rutas de notas nuevas (argv o la variable
// NOTE_FILES separada por saltos de línea), las publica en cada plataforma y
// escribe un resumen. No falla el proceso si una plataforma da error: degrada
// con gracia y lo reporta (el workflow decide si notificar).
//
// Uso:
//   node scripts/social/distribute.mjs src/content/notes/mi-nota.md
//   NOTE_FILES=$'a.md\nb.md' node scripts/social/distribute.mjs

import { appendFile } from 'node:fs/promises'
import { readNote } from './lib.mjs'
import { PUBLISHERS } from './publishers.mjs'

const files = (process.argv.slice(2).join('\n') || process.env.NOTE_FILES || '')
  .split(/\r?\n/)
  .map((f) => f.trim())
  .filter((f) => f.endsWith('.md'))

if (files.length === 0) {
  console.log('Sin notas nuevas que distribuir.')
  process.exit(0)
}

const ICON = { ok: '✅', skip: '⏭️', error: '❌' }
const lines = []
const log = (s) => {
  console.log(s)
  lines.push(s)
}

let hadError = false

for (const file of files) {
  let note
  try {
    note = await readNote(file)
  } catch (e) {
    log(`❌ No pude leer ${file}: ${e.message}`)
    hadError = true
    continue
  }
  if (note.draft) {
    log(`⏭️ ${note.slug}: es draft, se omite.`)
    continue
  }
  log(`\n### ${note.title}`)
  log(`\`${note.url}\`\n`)

  const results = await Promise.allSettled(PUBLISHERS.map((p) => p(note)))
  for (const r of results) {
    const v = r.status === 'fulfilled' ? r.value : { platform: '?', status: 'error', detail: r.reason?.message }
    const link = v.url ? ` → ${v.url}` : ''
    log(`- ${ICON[v.status]} **${v.platform}**: ${v.detail}${link}`)
    if (v.status === 'error') hadError = true
  }
}

// Resumen para la pestaña de Actions (si estamos en GitHub).
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Distribución de notas\n${lines.join('\n')}\n`)
}

// Señal para el paso de ntfy: escribe el conteo de errores como output.
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `had_error=${hadError}\n`)
}

// Nunca tumbamos el pipeline por un fallo de red social; solo lo señalizamos.
process.exit(0)
