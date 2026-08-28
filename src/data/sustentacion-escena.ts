// La ESCENA de la sustentación: qué se ve en el proyector en cada beat.
//
// Se separa del guion (`docs/guion-sustentacion.json`, que alimenta el control
// remoto y la vista del público) porque son dos vistas del mismo momento con
// contenidos distintos a propósito:
//
//   · el guion  → lo que digo y lo que ve el asistente en su celular.
//   · la escena → qué nodos del grafo se encienden, cuál es el titular de la
//                 pantalla grande y qué dato acompaña.
//
// El beat 3 lo enseña: en el celular pone "32 nodos · 42 aristas" (lo que se
// está viendo) y en la pantalla "125 endpoints · 143 páginas · 61 tablas" (lo
// que se está contando). Fundir ambos obligaría a elegir uno y perder el otro.
//
// NINGUNA CIFRA DE MEDICIÓN SE ESCRIBE AQUÍ. Las de carga y estrés salen de
// `sustentacion-datos.json`, que es la extracción de las corridas reales de k6.
// Si mañana se repite la corrida, la diapositiva cambia sola y no puede
// contradecir a la evidencia: es el mismo criterio que gobierna /docs.

import datos from './sustentacion-datos.json'

// ── El grafo ────────────────────────────────────────────────────────────────
//
// Los nodos NO son microservicios: son módulos reales de un único despliegue
// Astro SSR. La capa (`capa`) es la profundidad en el camino de un request, del
// edge hacia los datos, y es lo que ordena el dibujo de arriba abajo.

export type TipoNodo = 'infra' | 'core' | 'front' | 'api' | 'svc' | 'data' | 'ext'

export type NodoEscena = {
  id: string
  etiqueta: string
  capa: number
  tipo: TipoNodo
}

export const NODOS: readonly NodoEscena[] = [
  { id: 'vercel-edge', etiqueta: 'Vercel Edge', capa: 0, tipo: 'infra' },
  { id: 'middleware', etiqueta: 'middleware', capa: 1, tipo: 'core' },

  { id: 'sitio-publico', etiqueta: 'sitio público', capa: 2, tipo: 'front' },
  { id: 'panel-admin', etiqueta: 'panel admin', capa: 2, tipo: 'front' },
  { id: 'portal-clientes', etiqueta: 'portal clientes', capa: 2, tipo: 'front' },
  { id: 'demo-publica', etiqueta: 'demo pública', capa: 2, tipo: 'front' },
  { id: 'docs-academicos', etiqueta: 'docs', capa: 2, tipo: 'front' },
  { id: 'lab', etiqueta: 'lab', capa: 2, tipo: 'front' },
  { id: 'presentaciones', etiqueta: 'presentaciones', capa: 2, tipo: 'front' },

  { id: 'api-publica', etiqueta: '/api/public', capa: 3, tipo: 'api' },
  { id: 'api-admin', etiqueta: '/api/admin', capa: 3, tipo: 'api' },
  { id: 'api-portal', etiqueta: '/api/portal', capa: 3, tipo: 'api' },
  { id: 'api-payments', etiqueta: '/api/payments', capa: 3, tipo: 'api' },
  { id: 'api-cron', etiqueta: '/api/cron', capa: 3, tipo: 'api' },

  { id: 'lib-security', etiqueta: 'lib/security', capa: 4, tipo: 'svc' },
  { id: 'auth-admin', etiqueta: 'auth admin', capa: 4, tipo: 'svc' },
  { id: 'lib-portal', etiqueta: 'lib/portal', capa: 4, tipo: 'svc' },
  { id: 'lib-payments', etiqueta: 'lib/payments', capa: 4, tipo: 'svc' },
  { id: 'lib-present', etiqueta: 'lib/present', capa: 4, tipo: 'svc' },
  { id: 'lib-capacitacion', etiqueta: 'lib/capacitación', capa: 4, tipo: 'svc' },
  { id: 'lib-notify', etiqueta: 'lib/notify', capa: 4, tipo: 'svc' },
  { id: 'lib-i18n', etiqueta: 'i18n', capa: 4, tipo: 'svc' },
  { id: 'lib-diagramas', etiqueta: 'lib/diagramas', capa: 4, tipo: 'svc' },

  { id: 'db-turso-main', etiqueta: 'Turso main', capa: 5, tipo: 'data' },
  { id: 'db-turso-demo', etiqueta: 'Turso demo', capa: 5, tipo: 'data' },
  { id: 'redis-present', etiqueta: 'Upstash Redis', capa: 5, tipo: 'data' },
  { id: 'vercel-blob', etiqueta: 'Vercel Blob', capa: 5, tipo: 'data' },

  { id: 'github-oauth', etiqueta: 'GitHub OAuth', capa: 6, tipo: 'ext' },
  { id: 'wompi', etiqueta: 'Wompi', capa: 6, tipo: 'ext' },
  { id: 'resend', etiqueta: 'Resend', capa: 6, tipo: 'ext' },
  { id: 'ntfy', etiqueta: 'ntfy', capa: 6, tipo: 'ext' },
  { id: 'cron-job-org', etiqueta: 'cron-job.org', capa: 6, tipo: 'ext' },
]

/** `origen->destino`. Es la clave de la arista en toda la escena. */
export const ARISTAS: readonly string[] = [
  'vercel-edge->middleware',
  'middleware->lib-security',
  'middleware->auth-admin',
  'middleware->lib-portal',
  'middleware->lib-i18n',
  'middleware->db-turso-demo',
  'middleware->sitio-publico',
  'middleware->panel-admin',
  'middleware->portal-clientes',
  'middleware->demo-publica',
  'middleware->docs-academicos',
  'middleware->lab',
  'middleware->presentaciones',
  'sitio-publico->api-publica',
  'panel-admin->api-admin',
  'portal-clientes->api-portal',
  'presentaciones->redis-present',
  'api-publica->lib-security',
  'api-publica->lib-capacitacion',
  'api-publica->lib-i18n',
  'api-admin->lib-payments',
  'api-admin->lib-present',
  'api-admin->vercel-blob',
  'api-admin->db-turso-main',
  'api-portal->lib-portal',
  'api-portal->db-turso-main',
  'api-portal->vercel-blob',
  'api-payments->lib-payments',
  'api-payments->wompi',
  'api-payments->db-turso-main',
  'api-cron->lib-security',
  'api-cron->lib-notify',
  'api-cron->db-turso-main',
  'cron-job-org->api-cron',
  'lib-security->db-turso-main',
  'lib-portal->db-turso-main',
  'lib-payments->db-turso-main',
  'lib-present->redis-present',
  'lib-notify->ntfy',
  'lib-notify->resend',
  'auth-admin->github-oauth',
  'lib-diagramas->docs-academicos',
]

export const TODOS: readonly string[] = NODOS.map((n) => n.id)

/** La capa de lógica: lo que mide la cobertura del beat 5. */
export const LIBS: readonly string[] = [
  'middleware',
  'lib-security',
  'lib-portal',
  'lib-payments',
  'lib-present',
  'lib-capacitacion',
  'lib-notify',
  'lib-i18n',
  'lib-diagramas',
]

/** Color por tipo de nodo. Es la única leyenda del grafo, así que no se repite. */
export const COLOR_TIPO: Record<TipoNodo, string> = {
  infra: '#e2e8f0',
  core: '#7dd3fc',
  front: '#38bdf8',
  api: '#a78bfa',
  svc: '#34d399',
  data: '#fbbf24',
  ext: '#f472b6',
}

// ── La coreografía ──────────────────────────────────────────────────────────

export type BeatEscena = {
  beat: number
  /** Rótulo de la esquina superior izquierda. */
  rotulo: string
  /** Nodos encendidos. Vacío = grafo apagado (el beat 1 abre a oscuras). */
  encendidos: readonly string[]
  /** Nodos destacados. Si hay alguno, el resto se atenúa. */
  destacados: readonly string[]
  /** Aristas con tráfico visible. */
  activas: readonly string[]
  /** Cifra que acompaña al titular. Distinta de la del celular a propósito. */
  dato: string | null
  /** El titular. Se recorta a siete palabras: es un titular, no un párrafo. */
  titular: string
}

const p = datos.proyecto
const c = datos.cobertura
const t = datos.pruebas
const q = datos.punto_de_quiebre

/** Un escalón de la escalera de estrés, tal como lo pinta el HUD del beat 8. */
export type EscalonEstres = {
  rps: number
  vus: number
  resp: number
  p50: number
  p95: number
  err: number
  cpu: number | null
  estado: string
}

export const ESCALERA: readonly EscalonEstres[] = datos.estres.escalera.map((e) => ({
  rps: e.rpsOfrecido,
  vus: e.vusMax,
  resp: e.respuestasRps,
  p50: e.p50,
  p95: e.p95,
  err: e.errorPct,
  cpu: e.cpuPct,
  estado: e.estado,
}))

export type PuntoRecuperacion = { t: number; p50: number; p95: number; cpu: number | null }

export const RECUPERACION: readonly PuntoRecuperacion[] = datos.estres.recuperacion.curva.map(
  (r) => ({ t: r.desdeS, p50: r.p50, p95: r.p95, cpu: r.cpuPct })
)

/** Segundo a partir del cual la recuperación ya convergió. Se lee, no se supone. */
export const SEGUNDO_CONVERGENCIA =
  RECUPERACION.find((r) => r.p50 < 1000)?.t ?? RECUPERACION[RECUPERACION.length - 1].t

export const ESCENA: readonly BeatEscena[] = [
  {
    beat: 1,
    rotulo: 'HOOK',
    encendidos: [],
    destacados: [],
    activas: [],
    dato: null,
    titular: '',
  },
  {
    beat: 2,
    rotulo: 'EL PROBLEMA',
    encendidos: ['middleware'],
    destacados: ['middleware'],
    activas: [],
    dato: null,
    titular: '¿Qué pasa si esto se cae?',
  },
  {
    beat: 3,
    rotulo: 'ARQUITECTURA POR CAPAS',
    encendidos: TODOS,
    destacados: [],
    activas: ARISTAS,
    dato: `${p.endpoints} endpoints · ${p.paginas_astro} páginas · ${p.tablas} tablas`,
    titular: 'Un monolito modular, no microservicios',
  },
  {
    beat: 4,
    rotulo: 'PLAN DE PRUEBAS · MALLA DE COBERTURA',
    encendidos: TODOS,
    destacados: LIBS,
    activas: [],
    dato: `${t.unitarias.pruebas} unitarias + ${t.integracion.pruebas} integración + ${t.e2e.total} e2e`,
    titular: 'Cuatro niveles, cuatro preguntas distintas',
  },
  {
    beat: 5,
    rotulo: 'UNITARIAS',
    encendidos: LIBS,
    destacados: [],
    activas: [],
    dato: `${c.lineas_pct}% de líneas cubiertas (${c.lineas})`,
    titular: `${c.lineas_pct}%`,
  },
  {
    beat: 6,
    rotulo: 'INTEGRACIÓN',
    encendidos: TODOS,
    destacados: [
      'api-admin',
      'api-payments',
      'api-portal',
      'api-publica',
      'db-turso-demo',
      'db-turso-main',
      'demo-publica',
      'lib-payments',
      'lib-portal',
      'lib-security',
      'middleware',
      'panel-admin',
      'portal-clientes',
      'sitio-publico',
      'wompi',
    ],
    activas: [
      'api-portal->lib-portal',
      'api-portal->db-turso-main',
      'lib-portal->db-turso-main',
      'api-payments->lib-payments',
      'lib-payments->db-turso-main',
      'api-payments->db-turso-main',
      'lib-security->db-turso-main',
      'api-admin->db-turso-main',
      'middleware->panel-admin',
      'middleware->portal-clientes',
      'middleware->demo-publica',
      'middleware->db-turso-demo',
      'sitio-publico->api-publica',
      'api-payments->wompi',
    ],
    dato: `${t.integracion.pruebas} pruebas · 15/${ARISTAS.length} aristas cubiertas`,
    titular: 'Contra una base real, no un mock',
  },
  {
    beat: 7,
    rotulo: 'CARGA',
    encendidos: TODOS,
    destacados: ['vercel-edge', 'middleware', 'sitio-publico', 'api-publica', 'db-turso-main'],
    activas: [
      'vercel-edge->middleware',
      'middleware->sitio-publico',
      'sitio-publico->api-publica',
      'api-publica->lib-security',
    ],
    dato: `25 VUs · p50 ${datos.carga.curva[1].p50}ms · ${datos.carga.curva[1].errorPct}% error`,
    titular: 'Tráfico normal, sostenido',
  },
  {
    beat: 8,
    rotulo: 'ESTRÉS · QUIEBRE Y RECUPERACIÓN',
    encendidos: TODOS,
    destacados: ['middleware'],
    activas: ['vercel-edge->middleware'],
    dato: `Quiebre a ${q.rps_ofrecido} req/s (${(q.tasa_error * 100).toFixed(1)}% error) · Recuperación en ~${SEGUNDO_CONVERGENCIA}s`,
    titular: 'Se rompe. La pregunta es cómo vuelve',
  },
  {
    beat: 9,
    rotulo: 'MATRIZ DE RESULTADOS',
    encendidos: TODOS,
    destacados: ['portal-clientes', 'api-portal', 'lib-portal', 'api-payments', 'lib-payments'],
    activas: [],
    dato: '9/10 casos trazados a historia de usuario · 10/10 conformes',
    titular: 'Del clic a la fila',
  },
  {
    beat: 10,
    rotulo: 'DEMO EN VIVO',
    encendidos: TODOS,
    destacados: ['portal-clientes', 'api-portal', 'lib-portal', 'db-turso-main'],
    activas: ['portal-clientes->api-portal', 'api-portal->lib-portal', 'lib-portal->db-turso-main'],
    dato: null,
    titular: '',
  },
  {
    beat: 11,
    rotulo: 'DESPLIEGUE Y CI/CD',
    encendidos: TODOS,
    destacados: ['vercel-edge', 'db-turso-main', 'db-turso-demo', 'redis-present', 'vercel-blob'],
    activas: [],
    dato: `6 workflows de CI · ${p.migraciones} migraciones aditivas · rollback automático`,
    titular: 'El pipeline decide si se queda',
  },
  {
    beat: 12,
    rotulo: 'CIERRE · DOSSIER',
    encendidos: TODOS,
    destacados: [],
    activas: [],
    dato: '8/8 documentos completos',
    titular: '',
  },
]

// ── Paneles que aparecen sobre el grafo ─────────────────────────────────────

/** Beat 9. Los diez casos del taller de caja negra, con su trazabilidad. */
export const CASOS_MATRIZ = Array.from({ length: 10 }, (_, k) => {
  const n = k + 1
  // TC-07 es el único sin historia de usuario, y se dice en voz alta: ninguna
  // de las 41 lo describe con precisión. Forzar el mapeo sería menos creíble.
  const sinHu = n === 7
  return {
    id: `TC-${String(n).padStart(2, '0')}`,
    hu: sinHu
      ? 'sin HU asignada · gap documentado'
      : n === 8
        ? 'HU asignada · BUG-01 cerrado con test de regresión'
        : 'HU asignada',
    color: sinHu ? '#fbbf24' : '#dbe9f4',
    evidencia: 'captura',
  }
})

/**
 * Beat 9. Qué nodo del grafo se convierte en qué fila de la matriz. El orden
 * importa: es el que decide qué nodo vuela hacia qué renglón.
 */
export const NODOS_MATRIZ: readonly string[] = [
  'portal-clientes',
  'api-portal',
  'lib-portal',
  'api-payments',
  'lib-payments',
  'middleware',
  'api-admin',
  'lib-security',
  'db-turso-main',
  'api-publica',
]

/** Beat 11. */
export const ETAPAS_PIPELINE = [
  { n: '01', t: 'push', d: 'A main o rama de trabajo.', color: '#7dd3fc', borde: '#1b2836' },
  {
    n: '02',
    t: 'tests',
    d: `${t.unitarias.pruebas} unitarias + ${t.integracion.pruebas} integración en CI.`,
    color: '#34d399',
    borde: '#1b2836',
  },
  { n: '03', t: 'build', d: 'Astro SSR, adaptador de Vercel.', color: '#38bdf8', borde: '#1b2836' },
  {
    n: '04',
    t: 'deploy',
    d: 'Vercel. Preview por rama, producción en main.',
    color: '#a78bfa',
    borde: '#1b2836',
  },
  {
    n: '05',
    t: 'health check',
    d: 'verify-production espera hasta 8 min a que /api/health devuelva el SHA. 3 intentos.',
    color: '#fbbf24',
    borde: '#1b2836',
  },
  {
    n: '06',
    t: 'rollback',
    d: 'Si 2 de 3 intentos no son sanos, vercel rollback solo. Nadie lo dispara a mano.',
    color: '#f87171',
    borde: '#3a2029',
  },
]

export const INFRA_PIPELINE = ['Vercel', 'Turso main', 'Turso demo', 'Upstash Redis', 'Vercel Blob']

/** Beat 12. */
export const DOSSIER = [
  { n: '1', t: 'Documento del Producto Final' },
  { n: '2', t: 'Plan de Pruebas' },
  { n: '3', t: 'Pruebas unitarias' },
  { n: '4', t: 'Pruebas de integración' },
  { n: '5', t: 'Pruebas de carga' },
  { n: '6', t: 'Pruebas de estrés' },
  { n: '7', t: 'Documentación y gestión de pruebas' },
  { n: '8', t: 'Plan de implantación' },
  { n: '8.1', t: 'Manual técnico' },
  { n: '8.2', t: 'Manual de usuario y capacitación' },
  { n: '11', t: 'Despliegue y hosting' },
]

/**
 * Beat 10. El recorrido guionado de la demo. Los tiempos suman los 150 s que
 * el guion le da al beat; si se cambian allí, hay que revisarlos aquí.
 */
export const PASOS_DEMO = [
  { t: '0-15s', ruta: '/portal/login', ir: null, ms: 15000 },
  { t: '15-30s', ruta: '/api/portal/demo → /portal', ir: '/portal', ms: 15000 },
  { t: '30-60s', ruta: '/portal/facturas', ir: '/portal/facturas', ms: 30000 },
  { t: '60-90s', ruta: '/portal/facturas/2', ir: '/portal/facturas/2', ms: 30000 },
]

/** Fecha de la corrida de estrés, para rotularla en el HUD sin inventarla. */
export const FECHA_ESTRES = datos.estres.fecha
