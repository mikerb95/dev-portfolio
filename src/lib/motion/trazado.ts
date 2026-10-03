// Guion del trazador de peticiones de /architecture.
//
// La pieza enseña hasta dónde llega cada tipo de petición en el diagrama de
// capas. El guion NO se escribe a mano: cada desvío sale de preguntarle a las
// mismas funciones que usa el middleware (`delocalizePath`,
// `isLocalizedPrivateRequest`, `classify`, `isPortalPath`,
// `isPortalPublicPath`, `isDemoAllowedMethod`, `isDemoBlockedPath`). Si una de
// ellas cambia de opinión, el guion cambia con ella y tests/motion-arquitectura
// dice si el recorrido sigue siendo el que cuenta el texto.
//
// Lo que no vive en código de este repo (las reglas del WAF de Vercel, que se
// gestionan por CLI) se declara aquí y se ancla a lo que sí se puede comprobar:
// la regla del WAF corta las mismas herramientas que el sensor ya clasifica
// como bot ofensivo.
//
// Corre SOLO en el servidor (la página es prerenderizada): importa el
// clasificador, y mandarlo al navegador publicaría las rutas señuelo. Al
// navegador llega el guion ya resuelto, con textos y sin reglas.
import { classify } from '../security/classify'
import { delocalizePath, isLocalizedPrivateRequest } from '../../i18n/routing'
import { isPortalPath, isPortalPublicPath } from '../portal/paths'
import { isDemoAllowedMethod, isDemoBlockedPath } from '../demo'

// ── Piezas del diagrama ────────────────────────────────────────────────────

/**
 * Identidad de cada nodo, en el MISMO orden que `architecture.layers` del
 * diccionario. Va aquí y no en el diccionario porque el test de paridad exige
 * que todo string del inglés difiera del español, y un identificador es igual
 * en los dos idiomas por definición. El test fija que las longitudes coinciden.
 */
export const NODOS_POR_CAPA = [
  ['html', 'rum'],
  ['cdn', 'waf', 'funciones'],
  ['siem', 'auth', 'idioma', 'chaos'],
  ['publico', 'panel', 'portal', 'demo', 'cobros'],
  ['bases', 'migraciones', 'boveda', 'lecturas'],
  ['crons', 'monitor', 'analista', 'changelog'],
] as const

export type NodoId = (typeof NODOS_POR_CAPA)[number][number]

/** Mismo criterio para `architecture.externals`. */
export const EXTERNOS = ['vercel', 'turso', 'cronjob', 'github', 'claude', 'ntfy', 'resend', 'wompi', 'blob'] as const
export type ExternoId = (typeof EXTERNOS)[number]

/** Qué servicio externo sostiene cada nodo que un recorrido puede pisar. */
const EXTERNO_DE: Partial<Record<NodoId, ExternoId>> = {
  cdn: 'vercel',
  waf: 'vercel',
  funciones: 'vercel',
  bases: 'turso',
  lecturas: 'turso',
}

// ── Casos y fallos ─────────────────────────────────────────────────────────

export const CASOS = ['visitante', 'escaner', 'atajo', 'panel', 'cliente', 'demo'] as const
export type CasoId = (typeof CASOS)[number]

export const FALLOS = ['sensor', 'turso'] as const
export type FalloId = (typeof FALLOS)[number]
export type Fallos = Readonly<Record<FalloId, boolean>>

/** Clave estable de una combinación de fallos: '', 'sensor', 'turso', 'sensor+turso'. */
export function claveFallos(f: Fallos): string {
  return FALLOS.filter((k) => f[k]).join('+')
}

export const COMBINACIONES: Fallos[] = [
  { sensor: false, turso: false },
  { sensor: true, turso: false },
  { sensor: false, turso: true },
  { sensor: true, turso: true },
]

/**
 * - pasa: la pieza deja seguir la petición.
 * - registra: deja seguir, pero la anota (el sensor ante un sondeo).
 * - corta: la pieza responde y la petición no baja más.
 * - falla: la pieza está rota; lo que pase después depende de cómo falla.
 */
export type Estado = 'pasa' | 'registra' | 'corta' | 'falla'

/** Los textos viven en el diccionario (`architecture.trazador.notas`). */
export type NotaId =
  | 'navegadorPide'
  | 'wafPasa'
  | 'wafHerramienta'
  | 'wafSoloAnota'
  | 'cdnMiss'
  | 'cdnHit'
  | 'cdnPrivada'
  | 'cdnSinCopia'
  | 'funcionDespierta'
  | 'rutaCanonica'
  | 'idiomaPrivada'
  | 'sensorLimpio'
  | 'sensorCaido'
  | 'sensorSondeo'
  | 'paginaPublica'
  | 'paginaNoExiste'
  | 'agregadoPorDia'
  | 'statusRespaldo'
  | 'authOk'
  | 'revocacionCerrada'
  | 'panelRender'
  | 'baseReal'
  | 'sesionPortal'
  | 'portalSinBase'
  | 'clientIdDeSesion'
  | 'paseDemo'
  | 'demoVetada'
  | 'demoRender'
  | 'baseDemo'
  | 'baseDemoCaida'

/** Cierre de cada pasada (`architecture.trazador.finales`). */
export type FinalId =
  | 'guardadaEnBorde'
  | 'respaldoMide'
  | 'hitSinFuncion'
  | 'hitConTursoCaido'
  | 'muereEnBorde'
  | 'sondeoAnotado'
  | 'sondeoPerdido'
  | 'antesDeTodo'
  | 'panelServido'
  | 'fallaCerrada'
  | 'portalServido'
  | 'portalAlLogin'
  | 'demoServida'
  | 'demoSinBase'
  | 'aunqueSeaGet'

/** Etiqueta de la pasada cuando un caso tiene dos (`architecture.trazador.pasadas`). */
export type PasadaId = 'primera' | 'segunda' | 'herramienta' | 'disfrazado' | 'lectura' | 'boveda'

export type Paso = { nodo: NodoId; estado: Estado; nota: NotaId }

export type Pasada = {
  etiqueta: PasadaId | null
  metodo: 'GET' | 'POST'
  ruta: string
  /** Código HTTP final, o null si el desenlace no es un código fijo (una página que revienta). */
  status: number | null
  /** Cabecera `x-vercel-cache` cuando aplica. */
  cache: 'MISS' | 'HIT' | null
  pasos: Paso[]
  final: FinalId
  externos: ExternoId[]
}

// ── Peticiones de cada caso ────────────────────────────────────────────────
// Rutas y cabeceras de ejemplo: las mismas que se le pasan a las funciones
// reales. Ninguna es una ruta señuelo (los tests lo comprueban): enseñar una
// sería publicar la trampa.

const UA_NAVEGADOR = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const UA_HERRAMIENTA = 'sqlmap/1.8'

export const PETICIONES = {
  visitante: { metodo: 'GET', ruta: '/status' },
  herramienta: { metodo: 'GET', ruta: '/', ua: UA_HERRAMIENTA },
  sondeo: { metodo: 'GET', ruta: '/.env' },
  atajo: { metodo: 'GET', ruta: '/en/admin' },
  panel: { metodo: 'GET', ruta: '/admin' },
  cliente: { metodo: 'GET', ruta: '/portal/facturas' },
  demoLectura: { metodo: 'GET', ruta: '/admin/finances' },
  demoBoveda: { metodo: 'GET', ruta: '/api/admin/services/7/secrets' },
} as const

// ── Ayudantes que reproducen el orden del middleware ───────────────────────

const esPanel = (canonica: string) =>
  canonica.startsWith('/admin') || canonica.startsWith('/api/admin') || canonica === '/cobrar'

function sensor(metodo: string, ruta: string, ua: string, f: Fallos): Paso {
  if (f.sensor) return { nodo: 'siem', estado: 'falla', nota: 'sensorCaido' }
  const amenaza = classify({ method: metodo, path: ruta, userAgent: ua })
  return amenaza
    ? { nodo: 'siem', estado: 'registra', nota: 'sensorSondeo' }
    : { nodo: 'siem', estado: 'pasa', nota: 'sensorLimpio' }
}

/** Tramo común de toda petición que despierta una función. */
function hastaLaPuerta(ruta: string, cdn: Paso, navegador: boolean): Paso[] {
  const pasos: Paso[] = []
  if (navegador) pasos.push({ nodo: 'html', estado: 'pasa', nota: 'navegadorPide' })
  pasos.push({ nodo: 'waf', estado: 'pasa', nota: ruta === PETICIONES.sondeo.ruta ? 'wafSoloAnota' : 'wafPasa' })
  pasos.push(cdn)
  pasos.push({ nodo: 'funciones', estado: 'pasa', nota: 'funcionDespierta' })
  return pasos
}

function externosDe(pasos: Paso[]): ExternoId[] {
  const set = new Set<ExternoId>()
  for (const p of pasos) {
    const e = EXTERNO_DE[p.nodo]
    if (e) set.add(e)
  }
  return EXTERNOS.filter((e) => set.has(e))
}

function pasada(p: Omit<Pasada, 'externos'>): Pasada {
  return { ...p, externos: externosDe(p.pasos) }
}

// ── Los seis casos ─────────────────────────────────────────────────────────

function visitante(f: Fallos): Pasada[] {
  const { metodo, ruta } = PETICIONES.visitante
  const canonica = delocalizePath(ruta)
  if (isLocalizedPrivateRequest(ruta) || esPanel(canonica) || isPortalPath(canonica)) {
    throw new Error('trazado: la ruta del visitante dejó de ser pública')
  }
  const pasos: Paso[] = [
    ...hastaLaPuerta(ruta, { nodo: 'cdn', estado: 'pasa', nota: 'cdnMiss' }, true),
    { nodo: 'idioma', estado: 'pasa', nota: 'rutaCanonica' },
    sensor(metodo, ruta, UA_NAVEGADOR, f),
    { nodo: 'publico', estado: 'pasa', nota: 'paginaPublica' },
    f.turso
      ? { nodo: 'lecturas', estado: 'falla', nota: 'statusRespaldo' }
      : { nodo: 'lecturas', estado: 'pasa', nota: 'agregadoPorDia' },
  ]
  return [
    pasada({ etiqueta: 'primera', metodo, ruta, status: 200, cache: 'MISS', pasos, final: f.turso ? 'respaldoMide' : 'guardadaEnBorde' }),
    pasada({
      etiqueta: 'segunda',
      metodo,
      ruta,
      status: 200,
      cache: 'HIT',
      pasos: [
        { nodo: 'html', estado: 'pasa', nota: 'navegadorPide' },
        { nodo: 'waf', estado: 'pasa', nota: 'wafPasa' },
        { nodo: 'cdn', estado: 'corta', nota: 'cdnHit' },
      ],
      final: f.turso ? 'hitConTursoCaido' : 'hitSinFuncion',
    }),
  ]
}

function escaner(f: Fallos): Pasada[] {
  const h = PETICIONES.herramienta
  // La regla del WAF corta por user-agent la misma familia de herramientas que
  // el sensor clasifica como bot ofensivo; si el sensor dejara de verla así,
  // el relato del corte en el borde ya no tendría con qué compararse.
  if (classify({ method: h.metodo, path: h.ruta, userAgent: h.ua })?.category !== 'bad_bot') {
    throw new Error('trazado: el sensor ya no reconoce la herramienta del ejemplo')
  }
  const s = PETICIONES.sondeo
  const pasosSondeo: Paso[] = [
    ...hastaLaPuerta(s.ruta, { nodo: 'cdn', estado: 'pasa', nota: 'cdnSinCopia' }, false),
    { nodo: 'idioma', estado: 'pasa', nota: 'rutaCanonica' },
    sensor(s.metodo, s.ruta, UA_NAVEGADOR, f),
    { nodo: 'publico', estado: 'corta', nota: 'paginaNoExiste' },
  ]
  return [
    pasada({
      etiqueta: 'herramienta',
      metodo: h.metodo,
      ruta: h.ruta,
      status: 403,
      cache: null,
      pasos: [{ nodo: 'waf', estado: 'corta', nota: 'wafHerramienta' }],
      final: 'muereEnBorde',
    }),
    pasada({
      etiqueta: 'disfrazado',
      metodo: s.metodo,
      ruta: s.ruta,
      status: 404,
      cache: null,
      pasos: pasosSondeo,
      final: f.sensor ? 'sondeoPerdido' : 'sondeoAnotado',
    }),
  ]
}

function atajo(): Pasada[] {
  const { metodo, ruta } = PETICIONES.atajo
  if (!isLocalizedPrivateRequest(ruta)) throw new Error('trazado: /en/ delante del panel ya no se corta')
  return [
    pasada({
      etiqueta: null,
      metodo,
      ruta,
      status: 404,
      cache: null,
      pasos: [
        ...hastaLaPuerta(ruta, { nodo: 'cdn', estado: 'pasa', nota: 'cdnSinCopia' }, true),
        { nodo: 'idioma', estado: 'corta', nota: 'idiomaPrivada' },
      ],
      final: 'antesDeTodo',
    }),
  ]
}

function panel(f: Fallos): Pasada[] {
  const { metodo, ruta } = PETICIONES.panel
  if (!esPanel(delocalizePath(ruta))) throw new Error('trazado: la ruta del panel dejó de ser privada')
  const comun: Paso[] = [
    ...hastaLaPuerta(ruta, { nodo: 'cdn', estado: 'pasa', nota: 'cdnPrivada' }, true),
    { nodo: 'idioma', estado: 'pasa', nota: 'rutaCanonica' },
    sensor(metodo, ruta, UA_NAVEGADOR, f),
  ]
  // La revocación se consulta en Turso en cada petición y falla CERRADA.
  const pasos: Paso[] = f.turso
    ? [...comun, { nodo: 'auth', estado: 'corta', nota: 'revocacionCerrada' }]
    : [
        ...comun,
        { nodo: 'auth', estado: 'pasa', nota: 'authOk' },
        { nodo: 'panel', estado: 'pasa', nota: 'panelRender' },
        { nodo: 'bases', estado: 'pasa', nota: 'baseReal' },
      ]
  return [
    pasada({
      etiqueta: null,
      metodo,
      ruta,
      status: f.turso ? 503 : 200,
      cache: null,
      pasos,
      final: f.turso ? 'fallaCerrada' : 'panelServido',
    }),
  ]
}

function cliente(f: Fallos): Pasada[] {
  const { metodo, ruta } = PETICIONES.cliente
  const canonica = delocalizePath(ruta)
  if (!isPortalPath(canonica) || isPortalPublicPath(canonica)) {
    throw new Error('trazado: la ruta del cliente dejó de exigir sesión')
  }
  const comun: Paso[] = [
    ...hastaLaPuerta(ruta, { nodo: 'cdn', estado: 'pasa', nota: 'cdnPrivada' }, true),
    { nodo: 'idioma', estado: 'pasa', nota: 'rutaCanonica' },
    sensor(metodo, ruta, UA_NAVEGADOR, f),
  ]
  // Sin base no se puede leer la sesión del portal; sin pase de respaldo
  // firmado (que solo emite la demo), el middleware manda al login.
  const pasos: Paso[] = f.turso
    ? [...comun, { nodo: 'portal', estado: 'corta', nota: 'portalSinBase' }]
    : [
        ...comun,
        { nodo: 'portal', estado: 'pasa', nota: 'sesionPortal' },
        { nodo: 'bases', estado: 'pasa', nota: 'clientIdDeSesion' },
      ]
  return [
    pasada({
      etiqueta: null,
      metodo,
      ruta,
      status: f.turso ? 302 : 200,
      cache: null,
      pasos,
      final: f.turso ? 'portalAlLogin' : 'portalServido',
    }),
  ]
}

function demo(f: Fallos): Pasada[] {
  const l = PETICIONES.demoLectura
  const b = PETICIONES.demoBoveda
  if (!isDemoAllowedMethod(l.metodo) || isDemoBlockedPath(l.ruta)) {
    throw new Error('trazado: la lectura de ejemplo ya no cabe en la demo')
  }
  if (!isDemoAllowedMethod(b.metodo) || !isDemoBlockedPath(b.ruta)) {
    throw new Error('trazado: la bóveda dejó de estar vetada en la demo, o dejó de ser GET')
  }
  const comun = (ruta: string): Paso[] => [
    ...hastaLaPuerta(ruta, { nodo: 'cdn', estado: 'pasa', nota: 'cdnPrivada' }, true),
    { nodo: 'idioma', estado: 'pasa', nota: 'rutaCanonica' },
    sensor('GET', ruta, UA_NAVEGADOR, f),
  ]
  return [
    pasada({
      etiqueta: 'lectura',
      metodo: l.metodo,
      ruta: l.ruta,
      // La demo no consulta la base para decidir el pase (es un HMAC), así que
      // con Turso caído llega a la página, y es la página la que revienta.
      status: f.turso ? null : 200,
      cache: null,
      pasos: [
        ...comun(l.ruta),
        { nodo: 'auth', estado: 'pasa', nota: 'paseDemo' },
        { nodo: 'demo', estado: 'pasa', nota: 'demoRender' },
        f.turso
          ? { nodo: 'bases', estado: 'falla', nota: 'baseDemoCaida' }
          : { nodo: 'bases', estado: 'pasa', nota: 'baseDemo' },
      ],
      final: f.turso ? 'demoSinBase' : 'demoServida',
    }),
    pasada({
      etiqueta: 'boveda',
      metodo: b.metodo,
      ruta: b.ruta,
      status: 403,
      cache: null,
      pasos: [...comun(b.ruta), { nodo: 'auth', estado: 'corta', nota: 'demoVetada' }],
      final: 'aunqueSeaGet',
    }),
  ]
}

export function guion(caso: CasoId, f: Fallos): Pasada[] {
  switch (caso) {
    case 'visitante':
      return visitante(f)
    case 'escaner':
      return escaner(f)
    case 'atajo':
      return atajo()
    case 'panel':
      return panel(f)
    case 'cliente':
      return cliente(f)
    case 'demo':
      return demo(f)
  }
}

/** Todos los guiones, por caso y combinación de fallos. Es lo que viaja al navegador. */
export type Guiones = Record<CasoId, Record<string, Pasada[]>>

export function todosLosGuiones(): Guiones {
  const out = {} as Guiones
  for (const caso of CASOS) {
    out[caso] = {}
    for (const f of COMBINACIONES) out[caso][claveFallos(f)] = guion(caso, f)
  }
  return out
}

/**
 * Qué caso enseña cada decisión de `architecture.decisions`, por posición.
 * null = la decisión no pasa por el camino de una petición (crons, agentes,
 * Docker) y no se le inventa un recorrido.
 */
export const CASO_DE_DECISION: ({ caso: CasoId; fallo: FalloId | null } | null)[] = [
  { caso: 'visitante', fallo: null },
  { caso: 'panel', fallo: 'turso' },
  { caso: 'panel', fallo: null },
  { caso: 'visitante', fallo: null },
  null,
  null,
  null,
]
