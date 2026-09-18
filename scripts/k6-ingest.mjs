#!/usr/bin/env node
/**
 * Reporta al panel LAB el resumen de una corrida de k6.
 *
 *   node scripts/k6-ingest.mjs                      # el summary más reciente
 *   node scripts/k6-ingest.mjs lab/k6/resultados/estres-….json
 *
 * Postea el resumen que ya normalizó `handleSummary` en los scripts de
 * `lab/k6/`, no el `*.raw.json` de k6: el crudo pesa cientos de KB, cambia de
 * forma entre versiones y mezcla rampa con meseta, que es justo lo que el
 * script separó.
 *
 * Sin INGEST_URL + LAB_INGEST_TOKEN solo imprime el resumen, igual que
 * zap-ingest.mjs: una corrida local no debería fallar por no tener credencial.
 *
 * Código de salida: 1 solo si la ingesta estaba configurada y falló. Que la
 * corrida haya encontrado el punto de quiebre no es un error del job - es el
 * resultado que se buscaba.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'lab/k6/resultados'
const INGEST_URL = process.env.INGEST_URL
const TOKEN = process.env.LAB_INGEST_TOKEN

/** El summary más reciente del directorio de resultados, ignorando los crudos. */
function ultimoResumen() {
  let archivos
  try {
    archivos = readdirSync(DIR)
      .filter((f) => f.endsWith('.json') && !f.endsWith('.raw.json'))
      .map((f) => ({ ruta: join(DIR, f), mtime: statSync(join(DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
  } catch (e) {
    console.error(`✗ no se pudo leer ${DIR}: ${e.message}`)
    process.exit(1)
  }
  if (!archivos.length) {
    console.error(`✗ no hay resúmenes en ${DIR}. ¿Corrió k6?`)
    process.exit(1)
  }
  return archivos[0].ruta
}

const ruta = process.argv[2] ?? ultimoResumen()

let summary
try {
  summary = JSON.parse(readFileSync(ruta, 'utf8'))
} catch (e) {
  console.error(`✗ no se pudo leer ${ruta}: ${e.message}`)
  process.exit(1)
}

const escalones = summary.escalera ?? summary.curvaCapacidad ?? []
const roto = (summary.escalera ?? []).find((e) => e.estado === 'roto')

console.log(`k6 · ${summary.escenario} contra ${summary.objetivo} (${ruta})`)
console.log(
  `  ${summary.peticiones ?? 0} peticiones · p95 ${Math.round(summary.latenciaMs?.p95 ?? 0)}ms · ` +
    `${summary.tasaErrorPct ?? 0}% error · ${escalones.length} escalón(es)` +
    (roto ? ` · quiebre en ${roto.rpsOfrecido}/s` : ''),
)

if (!INGEST_URL || !TOKEN) {
  console.log('(sin INGEST_URL/LAB_INGEST_TOKEN: solo se imprime el resumen)')
  process.exit(0)
}

const res = await fetch(INGEST_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ kind: 'load_test', summary }),
})
const body = await res.json().catch(() => ({}))

if (!res.ok) {
  console.error(`✗ ingesta falló: ${res.status}`, body)
  process.exit(1)
}
console.log(`✓ ingesta: corrida #${body.id} con ${body.escalones} escalón(es).`)
