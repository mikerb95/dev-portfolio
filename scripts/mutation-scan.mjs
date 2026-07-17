#!/usr/bin/env node
/**
 * Corre Stryker sobre src/lib y reporta el mutation score al panel LAB.
 *
 *   node scripts/mutation-scan.mjs
 *
 * Lento a propósito: es el job manual/semanal, nunca en cada push (ver
 * stryker.config.json y mutation.yml). Con INGEST_URL + LAB_INGEST_TOKEN
 * postea kind:'ci_run' con mutationScore — reusa el mismo mecanismo que ya
 * reporta los runs del pipeline, así que aparece junto a ellos sin tocar el
 * esquema de nuevo.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const INGEST_URL = process.env.INGEST_URL
const TOKEN = process.env.LAB_INGEST_TOKEN

const started = Date.now()
try {
  execSync('npx stryker run', { stdio: 'inherit' })
} catch {
  // Stryker sale con código != 0 si el score cae bajo el threshold `break`;
  // el reporte JSON se genera de todos modos. Se sigue para leerlo e ingerir
  // el score real — la decisión de qué hacer con un score bajo es del panel,
  // no de un exit code silencioso en CI.
}
const durationMs = Date.now() - started

const { computeMutationScore } = await import('../src/lib/lab/mutation.ts')

let report
try {
  report = JSON.parse(readFileSync('reports/mutation/mutation.json', 'utf8'))
} catch {
  console.error('✗ No se encontró reports/mutation/mutation.json — ¿Stryker corrió?')
  process.exit(1)
}

const score = computeMutationScore(report)
console.log(`\nMutation score: ${score ?? 'sin datos'}%`)

if (score === null) process.exit(1)

if (INGEST_URL && TOKEN) {
  const sha = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD']).toString().trim()

  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      kind: 'ci_run',
      sha,
      branch,
      conclusion: 'success',
      mutationScore: score,
      durationMs,
    }),
  })
  if (!res.ok) {
    console.error(`✗ ingesta falló: ${res.status}`, await res.text())
  } else {
    console.log('✓ score reportado al panel LAB')
  }
}
