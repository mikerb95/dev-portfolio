#!/usr/bin/env node
/**
 * Corre `npm audit --json`, normaliza el resultado y lo reporta al panel LAB.
 *
 *   node scripts/npm-audit-scan.mjs
 *
 * Con INGEST_URL + LAB_INGEST_TOKEN postea con autoResolve:true — las
 * vulnerabilidades que ya no aparecen (dependencia actualizada) se marcan
 * resueltas solas. Sin ellos, solo imprime el resumen.
 *
 * Código de salida: 1 si hay hallazgos critical/high (para que CI se ponga
 * rojo en un push real), 0 en caso contrario. `npm audit` en sí puede salir
 * con código != 0 al encontrar vulnerabilidades, así que se ignora su exit
 * code y se decide por el contenido del reporte.
 */
import { execSync } from 'node:child_process'

const INGEST_URL = process.env.INGEST_URL
const TOKEN = process.env.LAB_INGEST_TOKEN

let raw
try {
  raw = execSync('npm audit --json', { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
} catch (e) {
  // npm audit sale con código 1 cuando hay vulnerabilidades: su stdout sigue
  // siendo el JSON válido que necesitamos.
  raw = e.stdout?.toString() ?? '{}'
}

let report
try {
  report = JSON.parse(raw)
} catch {
  console.error('✗ npm audit no devolvió JSON válido.')
  process.exit(1)
}

const vulnCount = Object.keys(report.vulnerabilities ?? {}).length
console.log(`npm audit: ${vulnCount} paquete(s) con vulnerabilidades reportadas.`)

let blocking = 0
if (report.vulnerabilities) {
  for (const v of Object.values(report.vulnerabilities)) {
    if (v.severity === 'critical' || v.severity === 'high') blocking++
  }
}

if (INGEST_URL && TOKEN) {
  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ kind: 'security_finding', source: 'npm-audit', report, autoResolve: true }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(`✗ ingesta falló: ${res.status}`, body)
  } else {
    console.log(`✓ ingesta: ${body.inserted} nuevo(s), ${body.updated} refrescado(s), ${body.autoResolved} resuelto(s) solo.`)
  }
}

console.log(`${blocking} vulnerabilidad(es) critical/high.`)
process.exit(blocking > 0 ? 1 : 0)
