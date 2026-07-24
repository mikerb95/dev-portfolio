#!/usr/bin/env node
/**
 * Lee el reporte JSON que produce la acción `zaproxy/action-baseline`
 * (`report_json.json`) y lo reporta al panel LAB.
 *
 *   REPORT_PATH=report_json.json node scripts/zap-ingest.mjs
 *
 * Con INGEST_URL + LAB_INGEST_TOKEN postea con autoResolve:true — las alertas
 * que ya no aparecen en un scan (vulnerabilidad corregida) se marcan
 * resueltas solas. Sin ellos, solo imprime el resumen.
 *
 * A diferencia de npm-audit-scan.mjs, este script NO ejecuta el escaneo (lo
 * hace la acción de Docker en el workflow): solo parsea y reporta su salida.
 *
 * Código de salida: 1 si hay alertas de riesgo High (para que el job de CI se
 * ponga rojo), 0 en caso contrario.
 */
import { readFileSync } from 'node:fs'

const REPORT_PATH = process.env.REPORT_PATH || 'report_json.json'
const INGEST_URL = process.env.INGEST_URL
const TOKEN = process.env.LAB_INGEST_TOKEN

let report
try {
  report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'))
} catch (e) {
  console.error(`✗ no se pudo leer ${REPORT_PATH}: ${e.message}`)
  process.exit(1)
}

const alerts = (report.site ?? []).flatMap((s) => s.alerts ?? [])
console.log(`ZAP baseline: ${alerts.length} alerta(s) sobre ${(report.site ?? []).length} sitio(s).`)

const blocking = alerts.filter((a) => String(a.riskdesc ?? '').startsWith('High')).length

if (INGEST_URL && TOKEN) {
  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ kind: 'security_finding', source: 'zap', report, autoResolve: true }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(`✗ ingesta falló: ${res.status}`, body)
  } else {
    console.log(`✓ ingesta: ${body.inserted} nuevo(s), ${body.updated} refrescado(s), ${body.autoResolved} resuelto(s) solo.`)
  }
} else {
  console.log('(sin INGEST_URL/LAB_INGEST_TOKEN: solo se imprime el resumen)')
}

console.log(`${blocking} alerta(s) de riesgo High.`)
process.exit(blocking > 0 ? 1 : 0)
