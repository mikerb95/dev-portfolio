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
import exec from 'k6/execution'
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
/**
 * Escalones del quiebre, para poder decir a QUÉ ritmo colapsa y no solo que
 * colapsa. Cada uno dura 30 s y se mide por separado: sin esto, la media de
 * toda la fase mezcla el escalón que iba bien con el que ya estaba muerto y el
 * punto de quiebre queda invisible entre los dos.
 */
const ESCALONES = [
  { desdeS: 0, rps: 50 },
  { desdeS: 30, rps: 100 },
  { desdeS: 60, rps: 200 },
  { desdeS: 90, rps: 300 },
  { desdeS: 120, rps: 300 },
]
const porEscalon = Object.fromEntries(
  ESCALONES.map((e) => [e.desdeS, {
    lat: new Trend(`quiebre_e${e.desdeS}`, true),
    err: new Rate(`quiebre_e${e.desdeS}_err`),
  }]),
)

const TRAMOS = [0, 15, 30, 45, 60, 75, 90, 105]
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
      // Los escalones se fijaron DESPUÉS de conocer la capacidad real medida en
      // `carga.js` (~62 req/s sostenidas). Apuntar a 4000 req/s, como pedía el
      // plan original, no encuentra el punto de quiebre: lo pasa de largo 60
      // veces y lo único que mide después es el tamaño de una cola infinita.
      // Cinco veces la capacidad basta para romperlo y deja ver la transición.
      stages: [
        { duration: '30s', target: 50 },   // por debajo de la capacidad
        { duration: '30s', target: 100 },  // ~1,6x
        { duration: '30s', target: 200 },  // ~3x
        { duration: '30s', target: 300 },  // ~5x
        { duration: '30s', target: 300 },  // meseta en saturación
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
      // 120 s y no 60: la primera corrida terminó la ventana con el sistema
      // todavía drenando, y "no se recuperó" y "no le dimos tiempo" son
      // conclusiones distintas que se veían igual.
      duration: '120s',
      preAllocatedVUs: 60,
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
  // Igual que en `soltar`: el escalón se decide antes de pedir, porque una
  // petición que tarda 10 s en rendirse pertenece al ritmo que la provocó, no
  // al que corría cuando por fin volvió.
  const seg = Math.floor(exec.instance.currentTestRunDuration / 1000)
  const clave = ESCALONES.reduce((acc, e) => (seg >= e.desdeS ? e.desdeS : acc), 0)

  const res = pedir(base, rutaAleatoria())
  porEscalon[clave]?.lat.add(res.timings.duration)
  porEscalon[clave]?.err.add(res.status !== 200)
}

export function soltar() {
  // El tramo se decide ANTES de pedir, no después. Con el sistema saturado una
  // petición tarda hasta el timeout, así que clasificarla por el momento en que
  // RESPONDE la mete siempre en un tramo posterior: la primera corrida dejó los
  // cinco primeros tramos vacíos y todo amontonado en el último, que es
  // exactamente la curva que se quería ver, invertida.
  const seg = Math.floor(exec.instance.currentTestRunDuration / 1000) - INICIO_RECUPERACION
  const tramo = TRAMOS.reduce((acc, t) => (seg >= t ? t : acc), 0)

  const res = pedir(base, rutaAleatoria())
  latenciaRecuperacion.add(res.timings.duration)
  erroresRecuperacion.add(res.status !== 200)
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
    curva: TRAMOS.map((t) => {
      const v = data.metrics[`recuperacion_t${t}`]?.values ?? {}
      return {
        desdeS: t,
        n: v.count ?? 0,
        p50: Number((v.med ?? 0).toFixed(1)),
        p95: Number((v['p(95)'] ?? 0).toFixed(1)),
      }
    }),
  }

  // La escalera: ritmo ofrecido contra lo que el sistema realmente sirvió.
  // La primera fila donde `servidoRps` deja de seguir a `rps` es el punto de
  // quiebre, y es el número que responde el ítem 6.
  r.escalera = ESCALONES.map((e) => {
    const v = data.metrics[`quiebre_e${e.desdeS}`]?.values ?? {}
    const n = v.count ?? 0
    const tasaError = data.metrics[`quiebre_e${e.desdeS}_err`]?.values?.rate ?? 0
    return {
      rpsOfrecido: e.rps,
      n,
      // Respuestas por segundo, timeouts incluidos. NO es throughput: una
      // petición que se rinde a los 10 s también "responde".
      respuestasRps: Number((n / 30).toFixed(1)),
      // Throughput real: solo lo que se sirvió con un 200. Es la única columna
      // que dice cuánto trabajo útil hace el sistema.
      exitosasRps: Number(((n * (1 - tasaError)) / 30).toFixed(1)),
      p50: Number((v.med ?? 0).toFixed(1)),
      p95: Number((v['p(95)'] ?? 0).toFixed(1)),
      errorPct: Number((tasaError * 100).toFixed(1)),
    }
  })

  const marca = r.fecha.replace(/[:.]/g, '-')
  return {
    stdout: aTexto(r)
      + `  escalera del quiebre\n`
      + `    ofrecido  respuestas   exitosas      p50      p95  errores\n`
      + r.escalera
          .map((e) => `    ${String(e.rpsOfrecido).padStart(5)}/s ${String(e.respuestasRps).padStart(9)}/s ${String(e.exitosasRps).padStart(9)}/s ${String(Math.round(e.p50)).padStart(7)}ms ${String(Math.round(e.p95)).padStart(7)}ms ${String(e.errorPct).padStart(6)}%`)
          .join('\n')
      + `\n\n  recuperación  p50 ${r.recuperacion.p50}ms · p95 ${r.recuperacion.p95}ms · errores ${r.recuperacion.tasaErrorPct}%\n`
      + `  curva de recuperación (s desde que cesó la carga)\n`
      + r.recuperacion.curva
          .map((c) => `    +${String(c.desdeS).padStart(2)}s   n=${String(c.n).padStart(4)}   p50 ${String(Math.round(c.p50)).padStart(6)}ms   p95 ${String(Math.round(c.p95)).padStart(6)}ms`)
          .join('\n')
      + '\n\n',
    [`lab/k6/resultados/estres-${marca}.json`]: JSON.stringify(r, null, 2),
    [`lab/k6/resultados/estres-${marca}.raw.json`]: JSON.stringify(data, null, 2),
  }
}
