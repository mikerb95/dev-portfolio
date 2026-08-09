/**
 * ÍTEM 5 del checklist - PRUEBA DE CARGA.
 *
 * Pregunta que responde: ¿cómo se comporta el sistema con muchos usuarios
 * simultáneos EN CONDICIONES NORMALES? No busca romperlo (eso es `estres.js`):
 * busca saber si el rendimiento se mantiene dentro de lo aceptable mientras la
 * demanda sube a niveles que el sistema debería aguantar.
 *
 * Escalones: 100 → 500 → 1000 usuarios concurrentes, con meseta en cada uno.
 * La meseta importa más que la rampa: un pico instantáneo lo absorbe cualquier
 * cola, y lo que se quiere ver es el estado estacionario.
 *
 *   k6 run lab/k6/carga.js
 *   k6 run -e TARGET=https://mi-preview.vercel.app lab/k6/carga.js
 */
import { sleep } from 'k6'
import { objetivo, pedir, rutaAleatoria, resumen, aTexto } from './lib/perfil.js'

const base = objetivo()

export const options = {
  scenarios: {
    carga: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 100 },   // rampa
        { duration: '40s', target: 100 },   // meseta a 100
        { duration: '20s', target: 500 },
        { duration: '40s', target: 500 },   // meseta a 500
        { duration: '20s', target: 1000 },
        { duration: '40s', target: 1000 },  // meseta a 1000
        { duration: '20s', target: 0 },     // descenso
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // 800 ms en p95 sale del RNF de rendimiento del proyecto (la home debe
    // cargar en menos de 3 s en conexión media; el servidor no puede gastarse
    // más de un cuarto de ese presupuesto).
    http_req_duration: ['p(95)<800', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    // Por ruta: /api/health es el suelo del middleware y debe seguir siendo
    // barato aunque el render SSR se atasque. Si esto se rompe, el problema no
    // es la plantilla, es la capa de entrada.
    'http_req_duration{ruta:health}': ['p(95)<300'],
  },
  // Sin esto k6 agrega todas las URLs bajo una sola métrica y se pierde el
  // desglose por ruta, que es justo donde está la información útil.
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'],
}

export default function () {
  pedir(base, rutaAleatoria())
  // Un usuario real lee lo que abre. Sin pausa esto no simula mil usuarios,
  // simula mil bucles cerrados, que es otra prueba (y la hace `estres.js`).
  sleep(Math.random() * 2 + 0.5)
}

export function handleSummary(data) {
  const r = resumen('carga', data, base)
  const marca = r.fecha.replace(/[:.]/g, '-')
  return {
    stdout: aTexto(r),
    [`lab/k6/resultados/carga-${marca}.json`]: JSON.stringify(r, null, 2),
    [`lab/k6/resultados/carga-${marca}.raw.json`]: JSON.stringify(data, null, 2),
  }
}
