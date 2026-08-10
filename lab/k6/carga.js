/**
 * ÍTEM 5 del checklist - PRUEBA DE CARGA.
 *
 * Pregunta que responde: ¿cuántos usuarios simultáneos sostiene el sistema EN
 * CONDICIONES NORMALES, y con qué latencia? No busca romperlo (eso es
 * `estres.js`): busca el punto hasta donde el servicio sigue siendo aceptable.
 *
 * Diseño: una ESCALERA de niveles de concurrencia, cada uno con su rampa y su
 * meseta, y las métricas se toman SOLO en la meseta. Las dos versiones
 * anteriores de este archivo medían el agregado de toda la corrida, y el
 * agregado no responde nada: mezcla el nivel que iba bien con el que ya estaba
 * saturado y devuelve un promedio que no describe ningún estado real del
 * sistema. Un p95 de 28 s "a 1000 usuarios" en realidad era 10 usuarios yendo
 * rápido y 990 encolados.
 *
 * Los niveles arrancan bajo a propósito. La capacidad medida de un proceso
 * resultó estar en el orden de las decenas de peticiones por segundo, así que
 * empezar en 100 usuarios (lo que pedía el plan original) es empezar ya rotos.
 *
 *   k6 run lab/k6/carga.js
 *   k6 run -e TARGET=https://mi-preview.vercel.app lab/k6/carga.js
 */
import { sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'
import exec from 'k6/execution'
import { objetivo, pedir, rutaAleatoria, resumen, aTexto } from './lib/perfil.js'

const base = objetivo()

const RAMPA_S = 10
const MESETA_S = 20

/** Niveles de concurrencia a caracterizar. */
const NIVELES = [10, 25, 50, 100, 250, 500, 1000]

// Ventana de meseta de cada nivel, en segundos desde el inicio de la corrida.
// Se calcula una vez y la usan tanto `options.stages` como la clasificación de
// cada petición: dos fuentes distintas para lo mismo se desincronizarían al
// primer retoque de los tiempos.
const VENTANAS = (() => {
  let t = 0
  return NIVELES.map((vus) => {
    const inicio = t + RAMPA_S
    const fin = inicio + MESETA_S
    t = fin
    return { vus, inicio, fin }
  })
})()

const metricas = Object.fromEntries(
  NIVELES.map((vus) => [vus, {
    lat: new Trend(`nivel_${vus}`, true),
    err: new Rate(`nivel_${vus}_err`),
  }]),
)

export const options = {
  scenarios: {
    carga: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        ...VENTANAS.flatMap((v) => [
          { duration: `${RAMPA_S}s`, target: v.vus },
          { duration: `${MESETA_S}s`, target: v.vus },
        ]),
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    // El criterio de aceptación NO se pone sobre el agregado, que incluye a
    // propósito niveles pensados para saturar. Se pone sobre el nivel que el
    // proyecto declara soportar: 25 usuarios simultáneos, que es el orden de
    // magnitud real de este sitio (portafolio + portal de unos pocos clientes).
    // Los niveles superiores están para caracterizar la curva, no para aprobar.
    'nivel_25': ['p(95)<800'],
    'nivel_25_err': ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'],
}

export default function () {
  // El nivel se decide ANTES de pedir: una petición que tarda 10 s en rendirse
  // pertenece al nivel de concurrencia que la provocó, no al que corría cuando
  // por fin volvió.
  const seg = exec.instance.currentTestRunDuration / 1000
  const ventana = VENTANAS.find((v) => seg >= v.inicio && seg < v.fin)

  const res = pedir(base, rutaAleatoria())

  // Fuera de meseta no se mide. Durante la rampa la concurrencia es un número
  // que cambia cada instante, y atribuir esas peticiones a cualquiera de los
  // dos niveles vecinos ensucia los dos.
  if (ventana) {
    metricas[ventana.vus].lat.add(res.timings.duration)
    metricas[ventana.vus].err.add(res.status !== 200)
  }

  // Un usuario real lee lo que abre. Sin pausa esto no simula N usuarios,
  // simula N bucles cerrados, que es otra prueba (y la hace `estres.js`).
  sleep(Math.random() * 2 + 0.5)
}

export function handleSummary(data) {
  const r = resumen('carga', data, base)

  r.curvaCapacidad = VENTANAS.map((v) => {
    const m = data.metrics[`nivel_${v.vus}`]?.values ?? {}
    const tasaError = data.metrics[`nivel_${v.vus}_err`]?.values?.rate ?? 0
    const n = m.count ?? 0
    return {
      vus: v.vus,
      n,
      exitosasRps: Number(((n * (1 - tasaError)) / MESETA_S).toFixed(1)),
      p50: Number((m.med ?? 0).toFixed(1)),
      p95: Number((m['p(95)'] ?? 0).toFixed(1)),
      p99: Number((m['p(99)'] ?? 0).toFixed(1)),
      errorPct: Number((tasaError * 100).toFixed(1)),
    }
  })

  const marca = r.fecha.replace(/[:.]/g, '-')
  return {
    stdout: aTexto(r)
      + `  curva de capacidad (medida solo en meseta, ${MESETA_S}s por nivel)\n`
      + `      VUs   exitosas      p50      p95      p99  errores\n`
      + r.curvaCapacidad
          .map((c) => `    ${String(c.vus).padStart(5)} ${String(c.exitosasRps).padStart(9)}/s ${String(Math.round(c.p50)).padStart(7)}ms ${String(Math.round(c.p95)).padStart(7)}ms ${String(Math.round(c.p99)).padStart(7)}ms ${String(c.errorPct).padStart(6)}%`)
          .join('\n')
      + '\n\n',
    [`lab/k6/resultados/carga-${marca}.json`]: JSON.stringify(r, null, 2),
    [`lab/k6/resultados/carga-${marca}.raw.json`]: JSON.stringify(data, null, 2),
  }
}
