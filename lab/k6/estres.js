/**
 * ÍTEM 6 del checklist - PRUEBA DE ESTRÉS.
 *
 * Tres preguntas, no una:
 *   1. ¿CUÁNDO COLAPSA?  A qué ritmo de peticiones deja de sostener el servicio.
 *   2. ¿CÓMO RESPONDE?   Al romperse, ¿degrada (lento, 429, 503) o se cae?
 *   3. ¿CÓMO SE RECUPERA? Al bajar la carga, ¿vuelve solo y en cuánto tiempo?
 *
 * La 3 es la que casi nadie mide y la que de verdad importa en producción: un
 * sistema que se rompe y vuelve es un mal rato; uno que se rompe y se queda
 * roto es una madrugada.
 *
 * Por qué `ramping-arrival-rate` y no `ramping-vus`: con VUs, cada usuario
 * espera su respuesta antes de pedir otra vez, así que cuando el servidor se
 * ralentiza la carga BAJA sola. El sistema se auto-protege y nunca encuentras
 * el punto de quiebre. Con arrival-rate, k6 mantiene el ritmo de llegada pase
 * lo que pase, que es como se comporta el tráfico real: a los usuarios no les
 * importa que estés saturado, siguen dando clic.
 *
 *   k6 run lab/k6/estres.js
 */
import { sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'
import { objetivo, pedir, rutaAleatoria, resumen, aTexto } from './lib/perfil.js'

const base = objetivo()

// Métricas propias de la fase de recuperación. Mezcladas con las del quiebre no
// dirían nada: la media global ya está envenenada por la fase de saturación.
const latenciaRecuperacion = new Trend('recuperacion_duracion', true)
const erroresRecuperacion = new Rate('recuperacion_errores')

/**
 * La recuperación no es un número, es una curva. Un p95 agregado de toda la
 * fase mezcla los primeros segundos (cuando el sistema todavía está drenando la
 * cola que dejó la saturación) con los últimos (cuando ya está normal) y no
 * responde la pregunta que importa: CUÁNTO tarda en volver.
 *
 * Se mide en tramos de 10 s. El primero que baje a latencia normal es el
 * tiempo de recuperación.
 */
const TRAMOS = [0, 10, 20, 30, 40, 50]
const porTramo = Object.fromEntries(
  TRAMOS.map((t) => [t, new Trend(`recuperacion_t${t}`, true)]),
)
const INICIO_RECUPERACION = 155

export const options = {
  scenarios: {
    // Fase 1: subir el ritmo hasta que algo ceda.
    quiebre: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 3000,
      stages: [
        { duration: '30s', target: 200 },   // 200 req/s
        { duration: '30s', target: 600 },
        { duration: '30s', target: 1200 },
        { duration: '30s', target: 2400 },
        { duration: '30s', target: 4000 },  // muy por encima de lo esperable
      ],
      tags: { fase: 'quiebre' },
      exec: 'apretar',
      // Se corta en seco a los 150 s. Sin esto k6 deja terminar las peticiones
      // en vuelo, y con el sistema saturado eso son decenas de segundos de cola
      // que se solapan con la fase de recuperación: la primera corrida midió un
      // p95 de 35 s "recuperándose" que en realidad era la saturación todavía
      // drenando.
      gracefulStop: '0s',
    },
    // Fase 2: soltar. Arranca cuando la 1 ya terminó y pide poco, para
    // responder "¿volvió a la normalidad, y en cuánto?".
    recuperacion: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 40,
      startTime: `${INICIO_RECUPERACION}s`,
      tags: { fase: 'recuperacion' },
      exec: 'soltar',
    },
  },
  thresholds: {
    // La fase de quiebre NO lleva umbrales de latencia: su objetivo es fallar.
    // Ponerle un umbral sería declarar fracaso a que la prueba funcione.
    //
    // La de recuperación sí, y es el criterio de aceptación del ítem 6: tras la
    // saturación, el sistema debe volver a servir con normalidad.
    'recuperacion_duracion': ['p(95)<1000'],
    'recuperacion_errores': ['rate<0.02'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'],
}

export function apretar() {
  pedir(base, rutaAleatoria())
}

export function soltar() {
  const res = pedir(base, rutaAleatoria())
  latenciaRecuperacion.add(res.timings.duration)
  erroresRecuperacion.add(res.status !== 200)

  const seg = Math.floor(exec.instance.currentTestRunDuration / 1000) - INICIO_RECUPERACION
  const tramo = TRAMOS.reduce((acc, t) => (seg >= t ? t : acc), 0)
  porTramo[tramo]?.add(res.timings.duration)

  sleep(1)
}

export function handleSummary(data) {
  const r = resumen('estres', data, base)

  // El dato que da sentido al ítem: cómo quedó el sistema DESPUÉS de romperlo.
  const rec = data.metrics.recuperacion_duracion?.values ?? {}
  r.recuperacion = {
    p50: Number((rec.med ?? 0).toFixed(1)),
    p95: Number((rec['p(95)'] ?? 0).toFixed(1)),
    max: Number((rec.max ?? 0).toFixed(1)),
    tasaErrorPct: Number(((data.metrics.recuperacion_errores?.values?.rate ?? 0) * 100).toFixed(3)),
  }

  const marca = r.fecha.replace(/[:.]/g, '-')
  return {
    stdout: aTexto(r) + `  recuperación  p50 ${r.recuperacion.p50}ms · p95 ${r.recuperacion.p95}ms · errores ${r.recuperacion.tasaErrorPct}%\n\n`,
    [`lab/k6/resultados/estres-${marca}.json`]: JSON.stringify(r, null, 2),
    [`lab/k6/resultados/estres-${marca}.raw.json`]: JSON.stringify(data, null, 2),
  }
}
