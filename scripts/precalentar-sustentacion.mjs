#!/usr/bin/env node
/**
 * Despierta las funciones de Vercel antes de entrar a sustentar.
 *
 * El problema que resuelve: Fluid Compute reutiliza instancias, pero una ruta
 * que nadie ha pedido en horas arranca en frío. La primera visita paga ese
 * arranque, y el peor momento para pagarlo es cuando el iframe del portal se
 * abre delante del jurado.
 *
 * No mide nada científico ni pretende hacerlo: pide cada ruta dos veces y
 * enseña los dos tiempos. La primera es la fría; la segunda, la que verá el
 * jurado. Si la segunda sigue alta, hay un problema de verdad y conviene
 * enterarse diez minutos antes, no en mitad de la charla.
 *
 *   node scripts/precalentar-sustentacion.mjs
 *   node scripts/precalentar-sustentacion.mjs --base https://codebymike.tech
 *   node scripts/precalentar-sustentacion.mjs --base http://localhost:4321
 */

const args = process.argv.slice(2)
const leer = (bandera, pordefecto) => {
  const i = args.indexOf(bandera)
  return i >= 0 && args[i + 1] ? args[i + 1] : pordefecto
}

const BASE = leer('--base', 'https://codebymike.tech').replace(/\/+$/, '')
const TIMEOUT_MS = Number(leer('--timeout', '15000'))

/**
 * Lo que el iframe va a visitar, más la infraestructura de la que depende.
 *
 * `esperado` no es un SLA: es lo que hace que un número se lea solo. Un 302 en
 * las rutas del portal es CORRECTO (no hay sesión al precalentar), y marcarlo
 * como fallo entrenaría a ignorar la salida del script, que es peor que no
 * tenerlo.
 */
const RUTAS = [
  { path: '/api/health', esperado: [200], nota: 'BD y salud del despliegue' },
  { path: '/sustentacion', esperado: [200], nota: 'la presentación' },
  { path: '/portal', esperado: [200, 302], nota: 'lo que enmarca el iframe' },
  { path: '/portal/login', esperado: [200], nota: 'lo que ve el iframe sin sesión' },
  { path: '/portal/facturas', esperado: [200, 302], nota: 'iframe · facturas' },
  { path: '/portal/documentos', esperado: [200, 302], nota: 'iframe · documentos' },
  { path: '/portal/mensajes', esperado: [200, 302], nota: 'iframe · mensajes' },
  { path: '/status', esperado: [200], nota: 'la ruta más cara del sitio (agrega BD)' },
  { path: '/security', esperado: [200], nota: 'agregados del micro-SIEM' },
  { path: '/demo', esperado: [200, 302], nota: 'plan B si el portal falla' },
]

const ms = (n) => (n == null ? '     -' : `${String(Math.round(n)).padStart(5)}`)

async function pedir(url) {
  const ctrl = new AbortController()
  const corte = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const t0 = performance.now()
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'precalentar-sustentacion/1.0', 'Cache-Control': 'no-cache' },
    })
    // El cuerpo se lee entero a propósito: sin esto se mide el tiempo hasta la
    // cabecera, no hasta la página, y una ruta SSR lenta parecería rápida.
    await res.arrayBuffer().catch(() => {})
    return { ms: performance.now() - t0, status: res.status, cache: res.headers.get('x-vercel-cache') }
  } catch (e) {
    return { ms: performance.now() - t0, status: null, error: e.name === 'AbortError' ? 'timeout' : e.message }
  } finally {
    clearTimeout(corte)
  }
}

console.log(`\n  Precalentando ${BASE}\n`)
console.log('   ruta                        frío   templado  estado  cache')
console.log('   ─────────────────────────────────────────────────────────────')

let problemas = 0
const tibios = []

for (const r of RUTAS) {
  const url = `${BASE}${r.path}`
  const frio = await pedir(url)
  const templado = await pedir(url)

  const st = frio.status
  const ok = st != null && r.esperado.includes(st)
  if (!ok) problemas++
  // 1,5 s en la SEGUNDA petición ya no es arranque en frío: es lentitud real.
  if (templado.ms > 1500) tibios.push(r.path)

  const marca = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  const estado = st ?? (frio.error ?? 'error')
  console.log(
    `   ${marca} ${r.path.padEnd(24)} ${ms(frio.ms)}ms ${ms(templado.ms)}ms   ` +
      `${String(estado).padEnd(7)} ${templado.cache ?? '-'}`
  )
}

console.log('')
if (problemas) {
  console.log(`  \x1b[31m${problemas} ruta(s) no respondieron lo esperado.\x1b[0m Revisa antes de entrar.`)
}
if (tibios.length) {
  console.log(`  \x1b[33mLentas incluso en templado (>1,5 s):\x1b[0m ${tibios.join(', ')}`)
  console.log('  Eso ya no es arranque en frío. /status agrega datos de BD y es la sospechosa habitual.')
}
if (!problemas && !tibios.length) {
  console.log('  \x1b[32mTodo templado y respondiendo.\x1b[0m')
}
console.log('')

process.exit(problemas ? 1 : 0)
