// Fuente de verdad de los diagramas de comunicación UML de
// /docs/diagrama-comunicacion.
//
// Los cuatro modelos son las CUATRO MISMAS interacciones que ya están en
// /docs/diagrama-secuencia, con los mismos participantes. Es deliberado: en UML
// el diagrama de comunicación y el de secuencia son semánticamente
// equivalentes, y lo único que cambia es qué se pone delante - allí el orden
// temporal sobre líneas de vida, aquí la estructura de enlaces con la secuencia
// reducida a la numeración decimal. Documentar interacciones distintas en cada
// página desperdiciaría justamente eso: la posibilidad de contrastar las dos
// vistas del mismo hecho.

import type { UmlCommunicationModel } from '../lib/uml-communication'

/** CU-04 · Login del administrador con GitHub OAuth y allowlist. */
const login: UmlCommunicationModel = {
  id: 'login',
  titulo: 'Login del administrador (GitHub OAuth)',
  desc:
    'La misma interacción del diagrama de secuencia, vista por su estructura: qué objeto está enlazado con cuál. Se lee de un vistazo que el navegador nunca habla con GitHub ni con la base - solo con el middleware y con Auth.js.',
  equivaleA: '/docs/diagrama-secuencia#login',
  origen: 'src/middleware.ts · auth.config.mjs · src/lib/auth.ts · src/lib/device-sessions.ts',
  nota:
    'La validación contra la allowlist es un mensaje reflexivo: no sale del objeto. Por eso además se repite en el middleware en cada request - un mensaje que no cruza un enlace tampoco deja rastro que otro objeto pueda verificar.',
  objetos: [
    { id: 'admin', clase: 'Administrador', estereotipo: 'actor', col: 0, fila: 0 },
    { id: 'mw', clase: 'Middleware', estereotipo: 'control', col: 1, fila: 0 },
    { id: 'aj', clase: 'AuthJs', estereotipo: 'control', col: 1, fila: 1 },
    { id: 'gh', clase: 'GitHubOAuth', estereotipo: 'external', col: 2, fila: 1 },
    { id: 'db', nombre: 'sesiones', clase: 'Turso', estereotipo: 'entity', col: 1, fila: 2 },
  ],
  mensajes: [
    { seq: '1', from: 'admin', to: 'mw', label: 'GET /admin sin sesión' },
    { seq: '2', from: 'mw', to: 'admin', label: '302 a /api/auth/signin', kind: 'reply' },
    { seq: '3', from: 'admin', to: 'aj', label: 'iniciar login con GitHub' },
    { seq: '3.1', from: 'aj', to: 'gh', label: 'redirigir a autorización' },
    { seq: '3.2', from: 'gh', to: 'aj', label: 'code de autorización', kind: 'reply' },
    { seq: '3.3', from: 'aj', to: 'gh', label: 'canjear code por perfil' },
    { seq: '3.4', from: 'gh', to: 'aj', label: 'perfil (login, email)', kind: 'reply' },
    { seq: '3.5', from: 'aj', to: 'aj', label: 'validar allowlist y emitir el JWT' },
    { seq: '3.6', from: 'aj', to: 'db', label: 'registrar sesión y dispositivo' },
    { seq: '4', from: 'aj', to: 'admin', label: '302 a /admin con la cookie', kind: 'reply' },
  ],
}

/** CU-09 · Sondeo de un monitor y apertura o cierre del incidente. */
const monitor: UmlCommunicationModel = {
  id: 'monitor',
  titulo: 'Chequeo de monitor y apertura de incidente',
  desc:
    'El ciclo de sondeo disparado por el cron externo. La estructura enseña algo que la secuencia no subraya: el endpoint es el único objeto enlazado con todos los demás, así que es también el único punto donde el ciclo puede romperse.',
  equivaleA: '/docs/diagrama-secuencia#monitor',
  origen: 'src/pages/api/cron/uptime-check.ts · src/lib/notify.ts',
  nota:
    'El disparo viene de fuera (cron-job.org) y no de un temporizador interno: no hay proceso residente que mantener vivo, y la autenticación del cron es un Bearer comparado con timingSafeEqual.',
  objetos: [
    { id: 'cron', clase: 'CronExterno', estereotipo: 'external', col: 0, fila: 0 },
    { id: 'api', clase: 'UptimeCheck', estereotipo: 'control', col: 1, fila: 0 },
    { id: 'svc', clase: 'ServicioVigilado', estereotipo: 'external', col: 2, fila: 0 },
    { id: 'db', clase: 'Turso', estereotipo: 'entity', col: 1, fila: 1 },
    { id: 'ntfy', clase: 'Ntfy', estereotipo: 'external', col: 2, fila: 1 },
  ],
  mensajes: [
    { seq: '1', from: 'cron', to: 'api', label: 'POST con el CRON_SECRET' },
    { seq: '2', from: 'api', to: 'db', label: 'leer los monitores activos' },
    { seq: '3', from: 'api', to: 'svc', label: 'sondear el servicio' },
    { seq: '4', from: 'svc', to: 'api', label: 'respuesta o error', kind: 'reply' },
    { seq: '5', from: 'api', to: 'db', label: 'registrar el chequeo' },
    { seq: '6', from: 'api', to: 'db', label: 'abrir o cerrar el incidente' },
    { seq: '7', from: 'api', to: 'ntfy', label: 'avisar caída o recuperación', kind: 'async' },
  ],
}

/** CU-14 · Sensor, blocklist y limitador, todos fail-open. */
const seguridad: UmlCommunicationModel = {
  id: 'seguridad',
  titulo: 'Enforcement de seguridad en el middleware',
  desc:
    'Los tres guardas de seguridad y sus enlaces. La vista estructural deja claro que el sensor no está en el camino del cliente: cuelga del middleware por un enlace propio y escribe en la base por su cuenta.',
  equivaleA: '/docs/diagrama-secuencia#seguridad',
  origen: 'src/middleware.ts · src/lib/security/{sensor,classify,blocklist,ratelimit-durable}.ts',
  nota:
    'El mensaje 2.2 es asíncrono a propósito: el middleware no espera a que el evento se escriba. Si esa escritura fallara y bloqueara, el sistema de defensa se habría convertido en la causa de la caída del sitio que defiende.',
  objetos: [
    { id: 'cli', clase: 'ClienteHTTP', estereotipo: 'actor', col: 0, fila: 0 },
    { id: 'mw', clase: 'Middleware', estereotipo: 'control', col: 1, fila: 0 },
    { id: 'sens', clase: 'Sensor', estereotipo: 'control', col: 2, fila: 0 },
    { id: 'bl', clase: 'Blocklist', estereotipo: 'control', col: 0, fila: 1 },
    { id: 'rl', clase: 'RateLimit', estereotipo: 'control', col: 1, fila: 1 },
    { id: 'db', clase: 'Turso', estereotipo: 'entity', col: 2, fila: 1 },
  ],
  mensajes: [
    { seq: '1', from: 'cli', to: 'mw', label: 'solicitud HTTP' },
    { seq: '2', from: 'mw', to: 'sens', label: 'observar el request' },
    { seq: '2.1', from: 'sens', to: 'sens', label: 'clasificar contra las firmas' },
    { seq: '2.2', from: 'sens', to: 'db', label: 'registrar el evento', kind: 'async' },
    { seq: '3', from: 'mw', to: 'bl', label: 'consultar la IP' },
    { seq: '4', from: 'bl', to: 'mw', label: 'veredicto (caché de 30 s)', kind: 'reply' },
    { seq: '5', from: 'mw', to: 'rl', label: 'aplicar el límite de la clave' },
    { seq: '5.1', from: 'rl', to: 'db', label: 'actualizar la ventana deslizante' },
    { seq: '6', from: 'rl', to: 'mw', label: 'permitido o rechazado', kind: 'reply' },
    { seq: '7', from: 'mw', to: 'cli', label: 'respuesta o corte', kind: 'reply' },
  ],
}

/** CU-12 · Webhook de pago sobre la máquina de estados idempotente. */
const pagos: UmlCommunicationModel = {
  id: 'pagos',
  titulo: 'Webhook de pago con idempotencia',
  desc:
    'La misma interacción que el diagrama de actividades describe por dentro, aquí vista por sus enlaces. El endpoint no toca la máquina de estados ni ella responde a la pasarela: cada objeto habla solo con sus vecinos.',
  equivaleA: '/docs/diagrama-secuencia#pagos',
  origen: 'src/pages/api/payments/webhook.ts · src/lib/payments.ts',
  nota:
    'El reintento (mensaje 3.4) viaja por el mismo enlace que la escritura original: no es un camino alternativo sino la misma operación repetida con la versión nueva. Esa es toda la diferencia entre reintentar y cobrar dos veces.',
  objetos: [
    { id: 'wompi', clase: 'Wompi', estereotipo: 'external', col: 0, fila: 0 },
    { id: 'api', clase: 'WebhookEndpoint', estereotipo: 'boundary', col: 1, fila: 0 },
    { id: 'lib', clase: 'PaymentsService', estereotipo: 'control', col: 1, fila: 1 },
    { id: 'db', clase: 'Turso', estereotipo: 'entity', col: 2, fila: 1 },
  ],
  mensajes: [
    { seq: '1', from: 'wompi', to: 'api', label: 'POST del webhook' },
    { seq: '2', from: 'api', to: 'db', label: 'buscar el pago por referencia' },
    { seq: '3', from: 'api', to: 'lib', label: 'aplicar el evento' },
    { seq: '3.1', from: 'lib', to: 'db', label: 'guardar el evento crudo' },
    { seq: '3.2', from: 'lib', to: 'lib', label: 'calcular la transición' },
    { seq: '3.3', from: 'lib', to: 'db', label: 'UPDATE con la versión leída' },
    { seq: '3.4', from: 'lib', to: 'db', label: 'reintentar si afectó 0 filas' },
    { seq: '4', from: 'lib', to: 'api', label: 'aplicado o descartado', kind: 'reply' },
    { seq: '5', from: 'api', to: 'wompi', label: '200 OK', kind: 'reply' },
  ],
}

export const COMUNICACIONES: UmlCommunicationModel[] = [login, monitor, seguridad, pagos]
