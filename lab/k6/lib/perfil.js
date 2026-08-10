/**
 * Piezas compartidas por los escenarios de k6.
 *
 * Sin dependencias remotas a propósito: un `import` desde jslib.k6.io hace que
 * la prueba dependa de que haya red y de que un tercero siga publicando el
 * archivo. Una medición que no se puede repetir dentro de seis meses no es una
 * medición.
 */
import http from 'k6/http'
import { check } from 'k6'
import { Trend } from 'k6/metrics'
import exec from 'k6/execution'

/**
 * Objetivo de la prueba, con la única regla que no se negocia: nunca
 * producción. Vercel factura por invocación y CPU activa, Turso tiene cuota de
 * filas, y el WAF respondería a mil usuarios sintéticos como lo que parecen.
 */
export function objetivo() {
  const url = __ENV.TARGET ?? 'http://127.0.0.1:4400'
  const prohibidos = ['codebymike.tech', 'dev-portfolio.vercel.app']
  for (const dominio of prohibidos) {
    if (url.includes(dominio)) {
      exec.test.abort(`Objetivo prohibido (${dominio}): la carga nunca va contra producción.`)
    }
  }
  return url.replace(/\/$/, '')
}

/**
 * Cabeceras de una petición. `X-Forwarded-For` distinto por VU no es maquillaje
 * para esquivar el rate limit: es lo que hace que la prueba mida el sistema.
 *
 * El middleware limita a 600 req/min por IP. Mil VUs desde una sola IP saturan
 * ese contador en el primer segundo y a partir de ahí toda la corrida mide el
 * coste de devolver un 429, que es del orden de un milisegundo. El resultado
 * sería una gráfica preciosa de un sitio que nunca se renderizó.
 *
 * Un usuario concurrente real es una IP distinta, así que eso es lo que se
 * simula. El caso contrario (mucha carga desde una sola IP) es un ataque, no
 * una prueba de carga, y tiene su propio escenario en `ratelimit.js`.
 */
export function cabeceras(unaSolaIp = false) {
  const n = unaSolaIp ? 1 : exec.vu.idInTest
  // 10.x.x.x: rango privado, imposible de confundir con una IP real en los
  // eventos que el micro-SIEM registre durante la corrida.
  const ip = `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`
  return {
    'X-Forwarded-For': ip,
    'User-Agent': 'k6-load-test/1.0 (+lab/k6)',
    'Accept-Language': 'es-CO,es;q=0.9',
  }
}

/**
 * Mezcla de rutas públicas. Los pesos no son arbitrarios: reparten la carga
 * entre las tres formas distintas que tiene este sitio de gastar tiempo.
 */
export const RUTAS = [
  // SSR con la home completa: el render más caro del sitio público.
  { peso: 40, path: '/', nombre: 'home' },
  // Consultas agregadas contra libSQL: mide la base, no la plantilla.
  { peso: 25, path: '/status', nombre: 'status' },
  // JSON mínimo: el suelo de latencia del middleware. Lo que sobre de aquí en
  // las otras rutas es coste de render y de BD.
  { peso: 20, path: '/api/health', nombre: 'health' },
  // Página estática pesada, servida por SSR igual que el resto.
  { peso: 15, path: '/tools', nombre: 'tools' },
]

const ACUMULADO = (() => {
  let suma = 0
  return RUTAS.map((r) => ({ ...r, hasta: (suma += r.peso) }))
})()
const TOTAL_PESO = ACUMULADO[ACUMULADO.length - 1].hasta

export function rutaAleatoria() {
  const dado = Math.random() * TOTAL_PESO
  return ACUMULADO.find((r) => dado <= r.hasta) ?? ACUMULADO[0]
}

/**
 * Una métrica por ruta. Etiquetar la petición no basta: k6 solo publica una
 * submétrica de una etiqueta si algún umbral la nombra, así que un desglose
 * basado solo en `tags` sale vacío del summary (comprobado: la primera corrida
 * de carga volvió sin ninguna cifra por ruta). Con Trend propio siempre está.
 */
const TRENDS = Object.fromEntries(
  RUTAS.map((r) => [r.nombre, new Trend(`ruta_${r.nombre}`, true)]),
)

/**
 * Una petición instrumentada, con la ruta como etiqueta para separar métricas.
 *
 * `timeout` importa más de lo que parece en la prueba de estrés. Con el valor
 * por defecto de k6 (60 s) toda petición encolada acaba contando como 60000 ms,
 * y el resultado deja de ser una medición para ser el propio timeout repetido:
 * p50, p95 y p99 salen todos en 60 s y no distinguen "lento" de "muerto".
 * Diez segundos también es lo que hace un usuario real, y lo que haría un CDN
 * delante: rendirse mucho antes del minuto.
 */
export function pedir(base, ruta, unaSolaIp = false, timeout = '10s') {
  const res = http.get(`${base}${ruta.path}`, {
    headers: cabeceras(unaSolaIp),
    tags: { ruta: ruta.nombre },
    timeout,
  })
  TRENDS[ruta.nombre]?.add(res.timings.duration)
  check(res, {
    'status 200': (r) => r.status === 200,
    'cuerpo no vacío': (r) => r.body != null && r.body.length > 0,
  })
  return res
}

/**
 * Extrae del summary de k6 las cifras que van al informe, en un JSON estable.
 * El `raw` completo se guarda aparte: sirve para revisar, pero nadie lo lee.
 */
export function resumen(escenario, data, base) {
  const d = data.metrics.http_req_duration?.values ?? {}
  const fallos = data.metrics.http_req_failed?.values ?? {}
  const checks = data.metrics.checks?.values ?? {}
  const reqs = data.metrics.http_reqs?.values ?? {}

  return {
    escenario,
    objetivo: base,
    fecha: new Date().toISOString(),
    vusMax: data.metrics.vus_max?.values?.max ?? null,
    duracionS: Math.round((data.state?.testRunDurationMs ?? 0) / 1000),
    peticiones: reqs.count ?? 0,
    rps: Number((reqs.rate ?? 0).toFixed(2)),
    latenciaMs: {
      media: Number((d.avg ?? 0).toFixed(1)),
      p50: Number((d.med ?? 0).toFixed(1)),
      p90: Number((d['p(90)'] ?? 0).toFixed(1)),
      p95: Number((d['p(95)'] ?? 0).toFixed(1)),
      p99: Number((d['p(99)'] ?? 0).toFixed(1)),
      max: Number((d.max ?? 0).toFixed(1)),
    },
    tasaErrorPct: Number(((fallos.rate ?? 0) * 100).toFixed(3)),
    checksOk: checks.passes ?? 0,
    checksFallidos: checks.fails ?? 0,
    porRuta: Object.fromEntries(
      RUTAS.map((r) => {
        const v = data.metrics[`ruta_${r.nombre}`]?.values ?? {}
        return [r.nombre, {
          path: r.path,
          n: v.count ?? 0,
          p50: Number((v.med ?? 0).toFixed(1)),
          p95: Number((v['p(95)'] ?? 0).toFixed(1)),
          p99: Number((v['p(99)'] ?? 0).toFixed(1)),
          max: Number((v.max ?? 0).toFixed(1)),
        }]
      }),
    ),
    umbralesCumplidos: Object.entries(data.metrics)
      .filter(([, m]) => m.thresholds)
      .every(([, m]) => Object.values(m.thresholds).every((t) => t.ok !== false)),
  }
}

/** Resumen legible en consola, sin depender de jslib. */
export function aTexto(r) {
  return [
    ``,
    `  escenario     ${r.escenario}`,
    `  objetivo      ${r.objetivo}`,
    `  VUs máx       ${r.vusMax}`,
    `  duración      ${r.duracionS}s`,
    `  peticiones    ${r.peticiones} (${r.rps}/s)`,
    `  latencia      p50 ${r.latenciaMs.p50}ms · p90 ${r.latenciaMs.p90}ms · p95 ${r.latenciaMs.p95}ms · p99 ${r.latenciaMs.p99}ms · max ${r.latenciaMs.max}ms`,
    `  errores       ${r.tasaErrorPct}%`,
    `  checks        ${r.checksOk} ok / ${r.checksFallidos} fallidos`,
    `  umbrales      ${r.umbralesCumplidos ? 'CUMPLIDOS' : 'INCUMPLIDOS'}`,
    ``,
    `  por ruta                n      p50      p95      p99`,
    ...Object.entries(r.porRuta ?? {}).map(([nombre, v]) =>
      `  ${(nombre + ' ' + v.path).padEnd(22)}${String(v.n).padStart(6)}${String(Math.round(v.p50)).padStart(9)}${String(Math.round(v.p95)).padStart(9)}${String(Math.round(v.p99)).padStart(9)}`,
    ),
    ``,
  ].join('\n')
}
