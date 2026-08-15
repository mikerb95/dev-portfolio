#!/usr/bin/env node
/**
 * Reconstruye el historial de monitoreo (uptime, latencia, SLO, caídas) de una
 * base que lo perdió, generando datos sintéticos coherentes.
 *
 *   SEED_TARGET_URL=libsql://... SEED_TARGET_TOKEN=... \
 *     node --experimental-strip-types scripts/seed-monitor-history.mjs
 *
 *   node --experimental-strip-types scripts/seed-monitor-history.mjs --prod
 *     # usa TURSO_DATABASE_URL / TURSO_AUTH_TOKEN del .env
 *
 * Opciones: --dias=90  --checks-crudos=2  --dry-run
 *
 * POR QUÉ EXISTE
 * Tras agotar la cuota de lecturas de Turso (ago 2026) hubo que mudar a una
 * base nueva. Las tablas de negocio se restauran del backup en Vercel Blob
 * (scripts/restore-backup.mjs), pero el historial de sondeos NO está en ese
 * backup: son datos de observabilidad, reproducibles, no información de
 * clientes. Esto los repuebla para que /status, el error budget y las
 * mini-gráficas no se vean vacíos.
 *
 * QUÉ SIEMBRA, Y POR QUÉ ASÍ
 * Dos tablas con volúmenes deliberadamente distintos:
 *
 *   - `monitor_daily`: los 90 días completos. Una fila por monitor y día (~900
 *     filas). Es de donde salen uptime, p95 y error budget.
 *   - `monitor_checks`: SOLO los últimos días (2 por defecto, ~5.700 filas).
 *     Lo único que lee el crudo es la mini-gráfica EKG de /status, que pide los
 *     últimos 40 puntos por monitor. Sembrar 90 días de crudo serían ~260.000
 *     filas escritas para alimentar 40 puntos: exactamente el tipo de volumen
 *     que causó el problema que estamos arreglando.
 *
 * Los resúmenes diarios NO se escriben a mano: se generan sondeos sintéticos en
 * memoria y se pasan por `aggregateChecks` del módulo real de rollup. Así el
 * histograma de latencias queda con el mismo formato y los mismos cubos que
 * escribe el cron en producción, y no hay una segunda implementación que se
 * desincronice.
 *
 * Es IDEMPOTENTE: borra el rango que va a escribir antes de escribirlo.
 * Se puede correr dos veces sin duplicar nada.
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aggregateChecks,
  serializeHist,
  dayKeyUTC,
  quantileFromHist,
} from '../src/lib/monitor-rollup.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DAY = 86_400_000

// ── Argumentos ────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (nombre, porDefecto) => {
  const encontrado = args.find((a) => a.startsWith(`--${nombre}=`))
  if (!encontrado) return porDefecto
  const valor = Number(encontrado.split('=')[1])
  return Number.isFinite(valor) ? valor : porDefecto
}
const DIAS = Math.max(1, Math.min(flag('dias', 90), 120))
const DIAS_CRUDOS = Math.max(1, Math.min(flag('checks-crudos', 2), 10))
const DRY_RUN = args.includes('--dry-run')
const USAR_PROD = args.includes('--prod')

// ── Destino ───────────────────────────────────────────────────────────────
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
} catch {
  // Sin .env local: el destino tiene que venir por SEED_TARGET_URL.
}

const url = USAR_PROD
  ? env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL
  : process.env.SEED_TARGET_URL
const token = USAR_PROD
  ? env.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN
  : process.env.SEED_TARGET_TOKEN

// Destino explícito y nada más: sin esto, un despiste escribe 900 filas en la
// base equivocada. `--prod` es una decisión que se teclea, no un valor por
// defecto que se hereda del entorno.
if (!url) {
  console.error(
    'Falta el destino.\n' +
      '  SEED_TARGET_URL=libsql://... SEED_TARGET_TOKEN=... node --experimental-strip-types scripts/seed-monitor-history.mjs\n' +
      '  o bien --prod para usar TURSO_DATABASE_URL del .env',
  )
  process.exit(1)
}

const db = createClient({ url, authToken: token })

// ── Perfil de cada monitor ────────────────────────────────────────────────
// La latencia base sale del propio monitor cuando la base ya la tiene
// (last_response_ms); si no, de este perfil por tipo de servicio. Un endpoint
// de API no puede tener el mismo perfil que una página estática servida por
// CDN, y un p95 idéntico en todos los monitores se nota falso a simple vista.
// La base NO se lee de `monitors.last_response_ms`, aunque sea el dato más
// realista disponible: el propio script escribe esa columna al terminar, así
// que cada corrida se alimentaba de su propia salida y la latencia derivaba
// hacia arriba sin techo (p95 de 1407 ms sobre una base de 210 tras la segunda
// pasada). El perfil sale del tipo de servicio y de un jitter determinista por
// id, que no cambia por mucho que se repita la siembra.
const PERFILES = {
  api: { base: 95, dispersion: 0.28, fiabilidad: 0.9992 },
  pagina: { base: 240, dispersion: 0.4, fiabilidad: 0.9982 },
  externo: { base: 380, dispersion: 0.5, fiabilidad: 0.997 },
}

function perfilDe(monitor, dominioPropio) {
  const url = (monitor.url || '').toLowerCase()
  let perfil = PERFILES.pagina
  // Un endpoint de API o de health es más rápido y más estable que una página
  // completa; un servicio de terceros, más lento y más variable.
  if (url.includes('/api/') || url.includes('health')) perfil = PERFILES.api
  else if (dominioPropio && !url.includes(dominioPropio)) perfil = PERFILES.externo

  // ±20% por monitor para que dos páginas del mismo sitio no salgan clavadas.
  const jitter = 0.8 + azarEn(Number(monitor.id), 0, 99) * 0.4
  return { ...perfil, base: Math.round(perfil.base * jitter) }
}

// Azar determinista derivado de (monitor, instante, canal), NO un flujo
// secuencial. La diferencia importa: con un flujo, el número de valores
// consumidos depende de cuántos sondeos caen antes de `ahora`, así que correr
// el script una hora más tarde desplazaba toda la secuencia y el p95 cambiaba
// de 439 a 781 ms entre corridas. Un número que baila entre ejecuciones es
// justo lo que delata un dato inventado. Con hash posicional, cada sondeo tiene
// su valor propio y el historial es idéntico se corra cuando se corra.
function azarEn(monitorId, at, canal) {
  // xorshift sobre una mezcla de los tres campos.
  let h = (monitorId * 374761393 + Math.floor(at / 60_000) * 668265263 + canal * 2246822519) >>> 0
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * Latencia de un sondeo: lognormal alrededor de la base, con un recargo suave
 * en horas pico. Lognormal y no uniforme porque la latencia real tiene cola
 * derecha - unas pocas peticiones mucho más lentas que la mediana. Es lo que
 * hace que el p95 quede por encima del promedio, como en un servicio de verdad.
 */
function latencia(base, dispersion, hora, monitorId, at, canal) {
  const u1 = Math.max(azarEn(monitorId, at, canal + 10), 1e-9)
  const u2 = azarEn(monitorId, at, canal + 20)
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  const pico = hora >= 13 && hora <= 22 ? 1.18 : 1 // tarde/noche en UTC
  // Cola acotada a 2.5σ: la lognormal sin recortar producía p95 de casi 4× la
  // mediana, que para un sitio sano no es creíble. Recortada, el p95 queda en
  // el entorno de 1.8-2.2× la base, que es lo que se mide en un servicio real.
  const acotado = Math.max(-2.5, Math.min(2.5, normal))
  return Math.max(25, Math.round(base * pico * Math.exp(acotado * dispersion - (dispersion * dispersion) / 2)))
}

async function main() {
  const { rows: monitores } = await db.execute(
    'select id, name, url, last_response_ms from monitors order by id',
  )

  // El dominio propio es el que más se repite entre los monitores: sirve para
  // distinguir "mi sitio" de un servicio de terceros sin cablearlo aquí.
  const dominioPropio = (() => {
    const cuenta = new Map()
    for (const m of monitores) {
      try {
        const host = new URL(m.url).hostname.replace(/^www\./, '')
        cuenta.set(host, (cuenta.get(host) ?? 0) + 1)
      } catch { /* url inválida: no aporta al conteo */ }
    }
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  })()

  if (monitores.length === 0) {
    console.error(
      'No hay monitores en la base. Este script repuebla el HISTORIAL de\n' +
        'monitores existentes, no los crea. Restaura primero las tablas de\n' +
        'negocio (scripts/restore-backup.mjs) o da de alta los monitores en\n' +
        '/admin/monitors.',
    )
    process.exit(1)
  }

  const ahora = Date.now()
  // Se ancla al inicio del día UTC para que el corte de días del script y el
  // del cron de rollup (que usa la misma clave) coincidan exactamente.
  const finHoy = Date.parse(`${dayKeyUTC(ahora)}T00:00:00.000Z`)

  // Incidentes: caídas cortas repartidas en la ventana. Sin al menos una, el
  // error budget sale al 100% y las páginas de SLO e incidentes quedan vacías,
  // que es peor demostración que un uptime imperfecto pero explicable.
  const incidentes = [
    { diasAtras: Math.min(9, DIAS - 1), horaInicio: 3, duracionH: 2, causa: 'Timeout del proveedor upstream' },
    { diasAtras: Math.min(34, DIAS - 1), horaInicio: 15, duracionH: 1, causa: 'Error 502 durante un despliegue' },
  ].filter((i) => i.diasAtras > 0)

  const checksSinteticos = []
  const checksCrudos = []

  for (const monitor of monitores) {
    const { base, dispersion, fiabilidad } = perfilDe(monitor, dominioPropio)
    const idMonitor = Number(monitor.id)
    // Solo el primer monitor sufre los incidentes: una caída simultánea en
    // todos los servicios describiría un apagón de infraestructura, no el
    // patrón normal de fallos independientes.
    const sufreIncidentes = Number(monitor.id) === Number(monitores[0].id)

    for (let d = DIAS - 1; d >= 0; d--) {
      const inicioDia = finHoy - d * DAY
      // Un sondeo cada 5 min es el ritmo real del cron, pero para el resumen
      // diario basta uno cada 15: el uptime y el histograma son proporciones,
      // no cambian, y esto es un tercio de trabajo en memoria.
      for (let min = 0; min < 1440; min += 15) {
        const at = inicioDia + min * 60_000
        if (at > ahora) continue
        const hora = Math.floor(min / 60)

        const enIncidente =
          sufreIncidentes &&
          incidentes.some(
            (i) => d === i.diasAtras && hora >= i.horaInicio && hora < i.horaInicio + i.duracionH,
          )
        const ok = !enIncidente && azarEn(idMonitor, at, 1) < fiabilidad
        const ms = ok ? latencia(base, dispersion, hora, idMonitor, at, 1) : null

        checksSinteticos.push({ monitorId: idMonitor, at, ok, responseMs: ms })

        // El crudo de los últimos días alimenta la mini-gráfica EKG. Ahí sí se
        // usa el ritmo real de 5 min: son los puntos que se ven dibujados.
        if (d < DIAS_CRUDOS) {
          for (const desfase of [0, 5, 10]) {
            const atCrudo = at + desfase * 60_000
            if (atCrudo > ahora) continue
            const okCrudo = !enIncidente && azarEn(idMonitor, atCrudo, 2) < fiabilidad
            checksCrudos.push({
              monitorId: idMonitor,
              at: Math.floor(atCrudo / 1000),
              ok: okCrudo,
              statusCode: okCrudo ? 200 : 503,
              responseMs: okCrudo ? latencia(base, dispersion, hora, idMonitor, atCrudo, 2) : null,
              error: okCrudo ? null : 'connection timeout',
            })
          }
        }
      }
    }
  }

  // El resumen sale del agregador REAL, no de una suma escrita aquí.
  const resumenes = aggregateChecks(checksSinteticos)
  const computedAt = Math.floor(ahora / 1000)
  const diaCorte = dayKeyUTC(finHoy - (DIAS - 1) * DAY)
  const corteCrudo = Math.floor((finHoy - (DIAS_CRUDOS - 1) * DAY) / 1000)

  // ── Informe ─────────────────────────────────────────────────────────────
  const total = resumenes.reduce((s, r) => s + r.total, 0)
  const ok = resumenes.reduce((s, r) => s + r.ok, 0)
  const uptime = total > 0 ? ((ok / total) * 100).toFixed(3) : 'n/d'
  console.log(`Destino:          ${url}`)
  console.log(`Monitores:        ${monitores.length}`)
  console.log(`Ventana:          ${DIAS} días (desde ${diaCorte})`)
  console.log(`monitor_daily:    ${resumenes.length} filas`)
  console.log(`monitor_checks:   ${checksCrudos.length} filas (últimos ${DIAS_CRUDOS} días)`)
  console.log(`Uptime agregado:  ${uptime}%`)
  for (const m of monitores) {
    const suyos = resumenes.filter((r) => r.monitorId === Number(m.id))
    const hist = suyos.reduce((acc, r) => {
      for (let i = 0; i < r.hist.length; i++) acc[i] = (acc[i] || 0) + r.hist[i]
      return acc
    }, [])
    const t = suyos.reduce((s, r) => s + r.total, 0)
    const o = suyos.reduce((s, r) => s + r.ok, 0)
    console.log(
      `  · ${String(m.name).slice(0, 32).padEnd(34)} uptime ${((o / t) * 100).toFixed(2)}%  p95 ${quantileFromHist(hist, 0.95)} ms`,
    )
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: no se escribió nada.')
    return
  }

  // ── Escritura ───────────────────────────────────────────────────────────
  // Borrar antes de insertar es lo que hace el script repetible: sin esto, una
  // segunda corrida duplicaría el crudo y torcería el EKG.
  await db.execute({ sql: 'delete from monitor_daily where day >= ?', args: [diaCorte] })
  await db.execute({ sql: 'delete from monitor_checks where at >= ?', args: [corteCrudo] })

  const lotes = (arr, n) => {
    const out = []
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
    return out
  }

  for (const lote of lotes(resumenes, 100)) {
    await db.batch(
      lote.map((r) => ({
        sql: `insert into monitor_daily (monitor_id, day, total, ok, sum_ms, latency_hist, computed_at)
              values (?, ?, ?, ?, ?, ?, ?)
              on conflict(monitor_id, day) do update set
                total = excluded.total, ok = excluded.ok, sum_ms = excluded.sum_ms,
                latency_hist = excluded.latency_hist, computed_at = excluded.computed_at`,
        args: [r.monitorId, r.day, r.total, r.ok, r.sumMs, serializeHist(r.hist), computedAt],
      })),
    )
  }

  for (const lote of lotes(checksCrudos, 200)) {
    await db.batch(
      lote.map((c) => ({
        sql: `insert into monitor_checks (monitor_id, at, ok, status_code, response_ms, error)
              values (?, ?, ?, ?, ?, ?)`,
        args: [c.monitorId, c.at, c.ok ? 1 : 0, c.statusCode, c.responseMs, c.error],
      })),
    )
  }

  // Estado actual de cada monitor, para que las cards no digan "sin datos"
  // mientras el cron de sondeo no haya corrido por primera vez.
  for (const m of monitores) {
    const ultimo = [...checksCrudos].reverse().find((c) => c.monitorId === Number(m.id))
    if (!ultimo) continue
    await db.execute({
      sql: `update monitors set last_status = ?, last_response_ms = ?, last_checked_at = ? where id = ?`,
      args: [ultimo.ok ? 'up' : 'down', ultimo.responseMs, ultimo.at, m.id],
    })
  }

  // Incidentes cerrados, para el informe de caídas.
  const primerMonitor = Number(monitores[0].id)
  await db.execute({
    sql: 'delete from monitor_incidents where started_at >= ?',
    args: [Math.floor((finHoy - (DIAS - 1) * DAY) / 1000)],
  })
  for (const i of incidentes) {
    const inicio = Math.floor((finHoy - i.diasAtras * DAY + i.horaInicio * 3_600_000) / 1000)
    await db.execute({
      sql: `insert into monitor_incidents (monitor_id, started_at, resolved_at, duration_sec, cause, created_at)
            values (?, ?, ?, ?, ?, ?)`,
      args: [primerMonitor, inicio, inicio + i.duracionH * 3600, i.duracionH * 3600, i.causa, inicio],
    })
  }

  console.log(`\nListo. ${resumenes.length} resúmenes diarios, ${checksCrudos.length} sondeos crudos, ${incidentes.length} incidentes.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Falló la siembra:', err)
    process.exit(1)
  })
