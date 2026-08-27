#!/usr/bin/env node
/**
 * Chequeo previo de la sustentación: una sola pasada, verde o rojo por ítem.
 *
 * Está pensado para correrse diez minutos antes de entrar, cuando ya no hay
 * tiempo de investigar nada. Por eso cada ítem en rojo trae qué hacer, no solo
 * qué falló.
 *
 *   npm run sustentacion:check
 *   npm run sustentacion:check -- --base http://localhost:4321
 *
 * Para probar además una publicación REAL de punta a punta hace falta una
 * cookie de sesión de admin (crear la sesión está detrás del gate de /admin):
 *
 *   SUSTENTACION_COOKIE='authjs.session-token=…' npm run sustentacion:check
 */

import { readFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const leer = (bandera, pordefecto) => {
  const i = args.indexOf(bandera)
  return i >= 0 && args[i + 1] ? args[i + 1] : pordefecto
}

const BASE = leer('--base', 'https://codebymike.tech').replace(/\/+$/, '')
const COOKIE = process.env.SUSTENTACION_COOKIE ?? ''
const TIMEOUT_MS = 15_000

const V = '\x1b[32m', R = '\x1b[31m', A = '\x1b[33m', G = '\x1b[90m', X = '\x1b[0m'

const resultados = []
/** `estado`: 'ok' | 'mal' | 'aviso'. Un aviso no rompe la salida. */
const anota = (estado, titulo, detalle, arreglo) =>
  resultados.push({ estado, titulo, detalle, arreglo })

async function pedir(path, opts = {}) {
  const ctrl = new AbortController()
  const corte = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE}${path}`, {
      redirect: 'manual',
      signal: ctrl.signal,
      ...opts,
      headers: { 'User-Agent': 'sustentacion-check/1.0', ...(opts.headers ?? {}) },
    })
    const texto = await res.text().catch(() => '')
    return { res, texto, status: res.status }
  } catch (e) {
    return { res: null, texto: '', status: null, error: e.name === 'AbortError' ? 'timeout' : e.message }
  } finally {
    clearTimeout(corte)
  }
}

// ── 1. Salud del despliegue ─────────────────────────────────────────────────
// El estado de la BD por sí solo no dice si la sustentación está lista: con
// la BD caída, el portal puede seguir sirviendo el modo respaldo (ítem 1b) y
// eso es un plan B válido, no una emergencia. Pintarlo en rojo sin más
// entrenaría a ignorar la salida en el único caso donde importa distinguir.
let bdOk = false
{
  const { res, texto, status, error } = await pedir('/api/health')
  if (!res) {
    anota('mal', 'Salud del despliegue', `no respondió (${error})`, 'Comprueba que el sitio esté arriba.')
  } else {
    let cuerpo = {}
    try { cuerpo = JSON.parse(texto) } catch {}
    const db = cuerpo?.checks?.db
    bdOk = status === 200 && db?.ok === true
    if (bdOk) {
      anota('ok', 'Salud del despliegue', `200 · BD ${db.ms}ms · región ${cuerpo.region ?? '?'} · sha ${String(cuerpo.sha ?? '').slice(0, 7)}`)
    } else {
      anota('aviso', 'Salud del despliegue',
        `HTTP ${status} · BD ok=${db?.ok} · ${String(db?.error ?? 'sin detalle').split('\n')[0]}`,
        'Revisa el ítem "Modo respaldo del portal" antes de decidir si esto bloquea. docs/runbook-cuota-turso.md tiene el procedimiento completo.')
    }
  }
}

// ── 1b. Modo respaldo del portal ────────────────────────────────────────────
// Solo tiene sentido comprobarlo cuando la BD está mal: con la BD sana, el
// modo respaldo simplemente no se activa y no hay nada que verificar aquí.
//
// No se puede fabricar el pase a mano (es HMAC firmado con AUTH_SECRET, un
// secreto que este script no tiene ni debe tener): se sigue el mismo camino
// que seguiría un visitante real, entrando por /api/portal/demo y usando la
// cookie que esa respuesta deje.
if (!bdOk) {
  const entrada = await pedir('/api/portal/demo')
  const setCookie = entrada.res?.headers.get('set-cookie') ?? ''
  const pase = /portal_respaldo=[^;]+/.exec(setCookie)?.[0] ?? ''

  if (!pase) {
    anota('mal', 'Modo respaldo del portal',
      `/api/portal/demo → HTTP ${entrada.status}, sin cookie portal_respaldo`,
      'Con la BD caída y sin este pase, el iframe no tiene nada que mostrar. Revisa src/pages/api/portal/demo.ts y que AUTH_SECRET esté puesto en Vercel.')
  } else {
    const { status: statusPortal, texto: textoPortal } = await pedir('/portal', { headers: { Cookie: pase } })
    if (statusPortal === 200 && /Altiplano|Demo p/i.test(textoPortal)) {
      anota('ok', 'Modo respaldo del portal', 'sirve datos ficticios con la BD caída: el iframe sigue mostrando el producto')
    } else {
      anota('mal', 'Modo respaldo del portal',
        `/portal con el pase real → HTTP ${statusPortal}`,
        'El pase se emitió pero /portal no lo aceptó. Revisa src/lib/portal/respaldo.ts.')
    }
  }
}

// ── 2. El portal responde ───────────────────────────────────────────────────
{
  const { status, error } = await pedir('/portal/login')
  if (status === 200) anota('ok', 'El portal responde', '/portal/login → 200')
  else anota('mal', 'El portal responde', `/portal/login → ${status ?? error}`,
    'Es lo que enmarca el iframe. Sin esto la presentación se queda sin demo en vivo.')
}

// ── 3. CSP: el portal se deja enmarcar ──────────────────────────────────────
{
  const { res, status } = await pedir('/portal/login')
  const csp = res?.headers.get('content-security-policy') ?? ''
  const xfo = res?.headers.get('x-frame-options')
  const ancestors = /frame-ancestors ([^;]*)/i.exec(csp)?.[1]?.trim()

  if (ancestors === "'self'" && !xfo) {
    anota('ok', 'CSP del portal', `frame-ancestors 'self' · sin X-Frame-Options`)
  } else if (status !== 200) {
    anota('mal', 'CSP del portal', `no se pudo leer (HTTP ${status})`, 'Revisa el ítem anterior primero.')
  } else {
    anota('mal', 'CSP del portal',
      `frame-ancestors ${ancestors ?? '(ausente)'}${xfo ? ` · X-Frame-Options: ${xfo}` : ''}`,
      "El iframe quedará en blanco. Debe ser 'self' y sin X-Frame-Options (ver isFramablePath en src/lib/security/paths.ts).")
  }
}

// ── 4. CSP: /admin sigue cerrado ────────────────────────────────────────────
{
  const { res } = await pedir('/admin')
  const csp = res?.headers.get('content-security-policy') ?? ''
  const ancestors = /frame-ancestors ([^;]*)/i.exec(csp)?.[1]?.trim()
  // /admin sin sesión redirige, y un redirect no lleva CSP: eso no es un fallo.
  if (!csp) anota('aviso', 'CSP de /admin', 'redirige sin cuerpo, no hay CSP que leer (esperado sin sesión)')
  else if (ancestors === "'none'") anota('ok', 'CSP de /admin', "frame-ancestors 'none' · sigue cerrado")
  else anota('mal', 'CSP de /admin', `frame-ancestors ${ancestors}`,
    'El panel NO debe ser enmarcable. Revisa que isFramablePath no lo esté cubriendo.')
}

// ── 5. connect-src abierto en la vista de seguidor ──────────────────────────
{
  // Un PIN inexistente da 404, pero la respuesta pasa por el middleware igual y
  // trae las cabeceras: es suficiente para verificar la política sin sesión.
  const { res } = await pedir('/sustentacion/seguir/k4m7')
  const csp = res?.headers.get('content-security-policy') ?? ''
  const connect = /connect-src ([^;]*)/i.exec(csp)?.[1]?.trim() ?? ''
  if (connect.includes('upstash.io') || /https:\/\//.test(connect)) {
    anota('ok', 'connect-src del seguidor', connect)
  } else {
    anota('mal', 'connect-src del seguidor', `connect-src ${connect || '(ausente)'}`,
      'Sin el origen del bus, el EventSource se bloquea y los seguidores caen a polling de hasta 15 s. Falta PRESENT_BUS_REST_URL / UPSTASH_REDIS_REST_URL en Vercel.')
  }
}

// ── 6. El bus acepta una publicación ────────────────────────────────────────
{
  // Sonda de vida sin sesión de admin: con un id de sesión falso, el endpoint
  // consulta Redis y responde 404 (no existe). Un 500 significa que NO pudo
  // hablar con Redis, que es exactamente lo que interesa detectar.
  const { status, texto } = await pedir('/api/sustentacion/beat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'sonda-de-vida', secreto: 'f'.repeat(64), beat: 0, titulo: 'sonda' }),
  })
  if (status === 404) anota('ok', 'El bus responde', 'Redis alcanzable (sesión falsa → 404, como debe)')
  else if (status === 403) anota('ok', 'El bus responde', 'Redis alcanzable (403)')
  else anota('mal', 'El bus responde', `HTTP ${status} · ${texto.slice(0, 120)}`,
    'Un 500 aquí es Redis inalcanzable: sin bus no hay seguidores. Revisa UPSTASH_REDIS_REST_URL/_TOKEN en Vercel.')
}

// ── 7. Publicación real de punta a punta (solo con cookie de admin) ─────────
if (COOKIE) {
  const alta = await pedir('/api/admin/sustentacion/sesion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({ titulo: 'Sonda de sustentacion-check' }),
  })
  if (alta.status !== 200 && alta.status !== 201) {
    anota('mal', 'Publicación de punta a punta', `alta de sesión → HTTP ${alta.status} · ${alta.texto.slice(0, 100)}`,
      'Si es 302/403, la cookie de admin no es válida. Vuelve a copiarla del navegador.')
  } else {
    const s = JSON.parse(alta.texto)
    const beat = await pedir('/api/sustentacion/beat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: s.sessionId, secreto: s.secreto, beat: 99, titulo: 'sonda', dato: 'ok' }),
    })
    const leido = await pedir(`/api/sustentacion/${s.sessionId}/snapshot`)
    let snap = {}
    try { snap = JSON.parse(leido.texto) } catch {}
    if (beat.status === 200 && snap.beat === 99) {
      anota('ok', 'Publicación de punta a punta', `PIN ${String(s.pin).toUpperCase()} · beat 99 publicado y releído`)
    } else {
      anota('mal', 'Publicación de punta a punta',
        `publish ${beat.status} · snapshot ${leido.status} · beat leído ${snap.beat}`,
        'La sesión se creó pero el ciclo publicar→leer no cerró.')
    }
  }
} else {
  anota('aviso', 'Publicación de punta a punta', 'omitida (sin SUSTENTACION_COOKIE)',
    "Para probarla: SUSTENTACION_COOKIE='authjs.session-token=…' npm run sustentacion:check")
}

// ── 8. Datos embebidos ──────────────────────────────────────────────────────
{
  try {
    const crudo = await readFile(new URL('../src/data/sustentacion-datos.json', import.meta.url), 'utf-8')
    const d = JSON.parse(crudo)
    const faltan = ['pruebas', 'cobertura', 'carga', 'estres', 'punto_de_quiebre'].filter((k) => !d[k])
    if (faltan.length) {
      anota('mal', 'Datos embebidos', `faltan claves: ${faltan.join(', ')}`, 'Vuelve a generar el JSON.')
    } else {
      anota('ok', 'Datos embebidos',
        `${d.pruebas.total} pruebas · ${d.cobertura.lineas_pct}% líneas · ${d.estres.escalera.length} escalones · quiebre a ${d.punto_de_quiebre.rps_ofrecido} req/s`)
    }
  } catch (e) {
    anota('mal', 'Datos embebidos', e.message, 'Falta src/data/sustentacion-datos.json o está mal formado.')
  }
}

// ── Salida ──────────────────────────────────────────────────────────────────
console.log(`\n  Chequeo de sustentación · ${BASE}\n`)
for (const r of resultados) {
  const marca = r.estado === 'ok' ? `${V}✓${X}` : r.estado === 'aviso' ? `${A}!${X}` : `${R}✗${X}`
  console.log(`  ${marca} ${r.titulo.padEnd(30)} ${G}${r.detalle}${X}`)
  if (r.arreglo && r.estado === 'mal') console.log(`      ${A}→ ${r.arreglo}${X}`)
}

const malos = resultados.filter((r) => r.estado === 'mal').length
const avisos = resultados.filter((r) => r.estado === 'aviso').length
console.log('')
console.log(
  malos
    ? `  ${R}${malos} en rojo${X}${avisos ? `, ${avisos} aviso(s)` : ''}. No entres sin revisarlos.`
    : `  ${V}Todo en verde${X}${avisos ? `, ${avisos} aviso(s)` : ''}.`
)
console.log('')

process.exit(malos ? 1 : 0)
