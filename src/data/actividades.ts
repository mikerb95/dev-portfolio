// Fuente de verdad de los diagramas de actividades UML de /docs/diagrama-actividades.
//
// Igual que el resto de /docs: la página solo renderiza, el modelo vive aquí.
// Cada actividad declara su `origen` para que el diagrama se pueda contrastar
// con el código en vez de creerle.
//
// Criterio de selección: NINGUNA de estas tres actividades repite un proceso
// que ya esté en /docs/diagrama-bpmn. BPMN documenta los procesos de negocio
// —quién habla con quién para cobrar, para dar acceso, para responder a un
// incidente—; estos diagramas documentan flujos de control internos, que es
// donde la notación de actividad aporta lo que BPMN no tiene tan a mano: la
// bifurcación concurrente que nunca se vuelve a unir y el bucle de reintento.

import type { UmlActivityModel } from '../lib/uml-activity'

/**
 * Cadena de decisiones del middleware.
 *
 * El caso que justifica el diagrama: la observación de seguridad sale por una
 * bifurcación y termina en un FINAL DE FLUJO, no en un final de actividad y sin
 * unión posterior. Eso es exactamente la política de fail-open del repo dibujada
 * en notación: el registro del evento corre en paralelo y el request NUNCA lo
 * espera, así que el micro-SIEM no puede volverse la causa de una caída.
 */
const middleware: UmlActivityModel = {
  id: 'middleware',
  titulo: 'Atención de una solicitud en el middleware',
  desc:
    'El camino completo de un request desde que entra al edge hasta que sale con sus cabeceras. Concentra en un solo punto la normalización de idioma, el chaos del LAB, la blocklist, el límite de peticiones y las dos autenticaciones, en ese orden.',
  origen: 'src/middleware.ts · src/lib/security/{sensor,blocklist,ratelimit-durable}.ts · src/i18n/routing.ts',
  nota:
    'La ruta se normaliza con delocalizePath UNA sola vez, al principio, y todos los guardas posteriores comparan contra la ruta canónica. Si el prefijo de idioma sobreviviera hasta la comprobación de sesión, /en/admin sería una copia del panel sin vigilancia.',
  particiones: [
    { id: 'cliente', label: 'Cliente', rol: 'Navegador o agente' },
    { id: 'middleware', label: 'Middleware', rol: 'src/middleware.ts' },
    { id: 'siem', label: 'Micro-SIEM', rol: 'src/lib/security/*' },
    { id: 'app', label: 'Aplicación', rol: 'Astro SSR · /api' },
  ],
  nodes: [
    { id: 'ini', type: 'initial', particion: 'cliente', fila: 0 },
    { id: 'req', type: 'action', label: 'Emite la solicitud HTTPS', particion: 'cliente', fila: 1 },
    { id: 'norm', type: 'action', label: 'Normaliza la ruta con delocalizePath', particion: 'middleware', fila: 2 },
    { id: 'dpriv', type: 'decision', label: '¿ruta privada con prefijo de idioma?', particion: 'middleware', fila: 3 },
    { id: 'f404', type: 'activityFinal', label: '404', particion: 'cliente', fila: 3 },
    { id: 'chaos', type: 'action', label: 'Evalúa las banderas de chaos del LAB', particion: 'middleware', fila: 4 },
    { id: 'dblock', type: 'decision', label: '¿IP en la blocklist?', particion: 'middleware', fila: 5 },
    { id: 'f403', type: 'activityFinal', label: '403', particion: 'cliente', fila: 5 },
    {
      id: 'fk',
      type: 'fork',
      particion: 'middleware',
      fila: 6,
      abarca: 2,
      nota: 'La observación no bloquea el request',
    },
    { id: 'obs', type: 'action', label: 'Clasifica la amenaza y registra el evento', particion: 'siem', fila: 7 },
    { id: 'esc', type: 'decision', label: '¿coincide con un patrón de honeypot?', particion: 'siem', fila: 8 },
    { id: 'blk', type: 'action', label: 'Escala el bloqueo de la IP', particion: 'siem', fila: 9 },
    { id: 'ff', type: 'flowFinal', particion: 'siem', fila: 10, nota: 'Final de flujo: termina la rama, no la actividad' },
    { id: 'dlim', type: 'decision', label: '¿excede el límite de peticiones?', particion: 'middleware', fila: 7 },
    { id: 'f429', type: 'activityFinal', label: '429', particion: 'cliente', fila: 7 },
    { id: 'dauth', type: 'decision', label: '¿la ruta exige sesión?', particion: 'middleware', fila: 8 },
    { id: 'ver', type: 'action', label: 'Revalida la sesión y la allowlist', particion: 'middleware', fila: 9 },
    { id: 'dok', type: 'decision', label: '¿sesión válida?', particion: 'middleware', fila: 10 },
    { id: 'f401', type: 'activityFinal', label: 'Redirección al login', particion: 'cliente', fila: 10 },
    { id: 'mg', type: 'merge', particion: 'middleware', fila: 11 },
    { id: 'resp', type: 'action', label: 'Ejecuta la página o el endpoint', particion: 'app', fila: 12 },
    { id: 'hdr', type: 'action', label: 'Añade cabeceras CSP, HSTS y de caché', particion: 'middleware', fila: 13 },
    { id: 'fin', type: 'activityFinal', particion: 'cliente', fila: 14 },
  ],
  edges: [
    { from: 'ini', to: 'req' },
    { from: 'req', to: 'norm' },
    { from: 'norm', to: 'dpriv' },
    { from: 'dpriv', to: 'f404', guarda: 'privada bajo /en' },
    { from: 'dpriv', to: 'chaos', guarda: 'resto' },
    { from: 'chaos', to: 'dblock' },
    { from: 'dblock', to: 'f403', guarda: 'bloqueada' },
    { from: 'dblock', to: 'fk', guarda: 'limpia' },
    { from: 'fk', to: 'obs' },
    { from: 'fk', to: 'dlim' },
    { from: 'obs', to: 'esc' },
    { from: 'esc', to: 'blk', guarda: 'honeypot' },
    { from: 'esc', to: 'ff', guarda: 'tráfico normal', channelOffset: 104 },
    { from: 'blk', to: 'ff' },
    { from: 'dlim', to: 'f429', guarda: 'excede' },
    { from: 'dlim', to: 'dauth', guarda: 'dentro del límite' },
    { from: 'dauth', to: 'ver', guarda: 'admin o portal' },
    { from: 'dauth', to: 'mg', guarda: 'pública', channelOffset: 118 },
    { from: 'ver', to: 'dok' },
    { from: 'dok', to: 'f401', guarda: 'no válida' },
    { from: 'dok', to: 'mg', guarda: 'válida' },
    { from: 'mg', to: 'resp' },
    { from: 'resp', to: 'hdr' },
    { from: 'hdr', to: 'fin' },
  ],
}

/**
 * Pipeline de integración y despliegue con verificación posterior.
 *
 * Aquí la notación aporta la barra de unión: el despliegue NO empieza hasta que
 * las dos ramas de verificación terminan, y eso en un flowchart no se puede
 * afirmar. El rollback automático cuelga de una decisión posterior al deploy,
 * que es la etapa que casi nadie automatiza.
 */
const pipeline: UmlActivityModel = {
  id: 'pipeline',
  titulo: 'Integración, despliegue y verificación con rollback',
  desc:
    'Del push a main hasta producción verificada. Las dos ramas de verificación —pruebas y seguridad/accesibilidad— corren concurrentes y se sincronizan antes de desplegar; después del deploy hay una etapa más, la que decide si la versión nueva se queda o se revierte.',
  origen: '.github/workflows/{ci,security,a11y,dast}.yml · src/pages/api/health.ts · src/pages/docs/pipeline-en-vivo.astro',
  nota:
    'La barra de unión no es decorativa: si una sola de las dos ramas falla, el token de control nunca se completa y el despliegue no ocurre. El rollback se dispara desde el resultado del health check contra el deploy ya publicado, no desde el resultado de los tests.',
  particiones: [
    { id: 'dev', label: 'Desarrollo', rol: 'push a main' },
    { id: 'ci', label: 'CI · pruebas', rol: 'ci.yml' },
    { id: 'sec', label: 'CI · seguridad', rol: 'security · a11y · dast' },
    { id: 'vercel', label: 'Vercel', rol: 'build, deploy y promoción' },
  ],
  nodes: [
    { id: 'ini', type: 'initial', particion: 'dev', fila: 0 },
    { id: 'push', type: 'action', label: 'Publica los commits en main', particion: 'dev', fila: 1 },
    { id: 'fk', type: 'fork', particion: 'ci', fila: 2, abarca: 2, nota: 'Las dos ramas arrancan a la vez' },
    { id: 'test', type: 'action', label: 'Unitarios, cobertura y contratos', particion: 'ci', fila: 3 },
    { id: 'e2e', type: 'action', label: 'Suite e2e con bases desechables', particion: 'ci', fila: 4 },
    { id: 'sast', type: 'action', label: 'npm audit y análisis estático', particion: 'sec', fila: 3 },
    { id: 'a11y', type: 'action', label: 'axe sobre las páginas públicas', particion: 'sec', fila: 4 },
    { id: 'jn', type: 'join', particion: 'ci', fila: 5, abarca: 2, nota: 'Espera a las dos ramas' },
    { id: 'dverde', type: 'decision', label: '¿todo en verde?', particion: 'ci', fila: 6 },
    { id: 'froja', type: 'activityFinal', label: 'Sin desplegar', particion: 'dev', fila: 6 },
    { id: 'deploy', type: 'action', label: 'Construye y despliega a producción', particion: 'vercel', fila: 7 },
    { id: 'health', type: 'action', label: 'Consulta /api/health del deploy nuevo', particion: 'vercel', fila: 8 },
    { id: 'dsano', type: 'decision', label: '¿la versión nueva responde sana?', particion: 'vercel', fila: 9 },
    { id: 'rb', type: 'action', label: 'Promueve de vuelta el deploy anterior', particion: 'vercel', fila: 10 },
    { id: 'alert', type: 'sendSignal', label: 'Alerta push al operador', particion: 'vercel', fila: 11 },
    { id: 'frb', type: 'activityFinal', label: 'Producción en la versión previa', particion: 'vercel', fila: 12 },
    { id: 'ok', type: 'action', label: 'Registra el run en el panel', particion: 'ci', fila: 13 },
    { id: 'fin', type: 'activityFinal', particion: 'ci', fila: 14 },
  ],
  edges: [
    { from: 'ini', to: 'push' },
    { from: 'push', to: 'fk' },
    { from: 'fk', to: 'test' },
    { from: 'fk', to: 'sast' },
    { from: 'test', to: 'e2e' },
    { from: 'sast', to: 'a11y' },
    { from: 'e2e', to: 'jn' },
    { from: 'a11y', to: 'jn' },
    { from: 'jn', to: 'dverde' },
    { from: 'dverde', to: 'froja', guarda: 'algún job falla' },
    { from: 'dverde', to: 'deploy', guarda: 'todo pasa' },
    { from: 'deploy', to: 'health' },
    { from: 'dsano', to: 'rb', guarda: 'no sana' },
    { from: 'health', to: 'dsano' },
    { from: 'rb', to: 'alert' },
    { from: 'alert', to: 'frb' },
    { from: 'dsano', to: 'ok', guarda: 'sana', channelOffset: -122 },
    { from: 'ok', to: 'fin' },
  ],
}

/**
 * Aplicación de un evento de la pasarela sobre la máquina de estados de pagos.
 *
 * El bucle de reintento con concurrencia optimista es la razón de este diagrama:
 * dos webhooks del mismo pago compitiendo es un caso real, y lo que evita el
 * cobro doble no es una comprobación al entrar sino que el UPDATE lleve la
 * versión leída en el WHERE. El que pierde la carrera vuelve al nodo de unión y
 * recalcula con el estado nuevo, en vez de pisarlo.
 */
const webhookPago: UmlActivityModel = {
  id: 'webhook-pago',
  titulo: 'Aplicación idempotente de un evento de la pasarela',
  desc:
    'Qué ocurre dentro del sistema cuando llega un webhook de pago. No es el proceso de cobro (ese está en BPMN): es el algoritmo que garantiza que un evento repetido, reenviado o simultáneo no cobre dos veces ni deje el pago a medias.',
  origen: 'src/pages/api/payments/webhook.ts · src/lib/payments.ts · src/lib/payments-state.ts',
  nota:
    'La transición se calcula en un módulo puro (payments-state.ts) sin acceso a base de datos, para poder ejercitarla en pruebas y también en el navegador. La escritura es la única parte que toca Turso, y va condicionada a la versión leída.',
  particiones: [
    { id: 'wompi', label: 'Pasarela', rol: 'Wompi' },
    { id: 'api', label: 'Endpoint', rol: '/api/payments/webhook' },
    { id: 'dominio', label: 'Dominio', rol: 'máquina de estados' },
    { id: 'db', label: 'Persistencia', rol: 'Turso · libSQL' },
  ],
  nodes: [
    { id: 'ini', type: 'initial', particion: 'wompi', fila: 0 },
    { id: 'hook', type: 'sendSignal', label: 'Emite el evento de la transacción', particion: 'wompi', fila: 1 },
    { id: 'recv', type: 'acceptEvent', label: 'Recibe el POST del webhook', particion: 'api', fila: 2 },
    { id: 'dfirma', type: 'decision', label: '¿firma y monto coinciden?', particion: 'api', fila: 3 },
    { id: 'evid', type: 'action', label: 'Guarda el evento como evidencia y alerta', particion: 'api', fila: 4 },
    { id: 'fdesc', type: 'activityFinal', label: 'Evento descartado', particion: 'api', fila: 5 },
    { id: 'carga', type: 'action', label: 'Carga el pago por su referencia', particion: 'api', fila: 6 },
    { id: 'dexiste', type: 'decision', label: '¿existe el pago?', particion: 'api', fila: 7 },
    { id: 'fno', type: 'activityFinal', label: 'Sin correspondencia', particion: 'api', fila: 8 },
    { id: 'mg', type: 'merge', particion: 'dominio', fila: 9 },
    { id: 'trans', type: 'action', label: 'Calcula la transición sobre la versión leída', particion: 'dominio', fila: 10 },
    { id: 'dval', type: 'decision', label: '¿la transición es legal?', particion: 'dominio', fila: 11 },
    { id: 'fign', type: 'activityFinal', label: 'Evento ya aplicado', particion: 'dominio', fila: 12 },
    { id: 'upd', type: 'action', label: 'UPDATE condicionado a la versión', particion: 'db', fila: 13 },
    { id: 'dgano', type: 'decision', label: '¿actualizó alguna fila?', particion: 'db', fila: 14 },
    { id: 'evt', type: 'action', label: 'Inserta el evento del pago', particion: 'db', fila: 15 },
    { id: 'fok', type: 'activityFinal', label: 'Pago conciliado', particion: 'db', fila: 16 },
    { id: 'dre', type: 'decision', label: '¿quedan reintentos?', particion: 'dominio', fila: 15 },
    { id: 'fagot', type: 'activityFinal', label: 'Reintentos agotados', particion: 'dominio', fila: 16 },
  ],
  edges: [
    { from: 'ini', to: 'hook' },
    { from: 'hook', to: 'recv' },
    { from: 'recv', to: 'dfirma' },
    { from: 'dfirma', to: 'evid', guarda: 'no coinciden' },
    { from: 'evid', to: 'fdesc' },
    { from: 'dfirma', to: 'carga', guarda: 'coinciden', channelOffset: 112 },
    { from: 'carga', to: 'dexiste' },
    { from: 'dexiste', to: 'fno', guarda: 'no existe' },
    { from: 'dexiste', to: 'mg', guarda: 'existe', channelOffset: 102 },
    { from: 'mg', to: 'trans' },
    { from: 'trans', to: 'dval' },
    { from: 'dval', to: 'fign', guarda: 'ya aplicada' },
    { from: 'dval', to: 'upd', guarda: 'legal', channelOffset: 96 },
    { from: 'upd', to: 'dgano' },
    { from: 'dgano', to: 'evt', guarda: 'ganó la carrera' },
    { from: 'evt', to: 'fok' },
    { from: 'dgano', to: 'dre', guarda: 'otra escritura ganó' },
    { from: 'dre', to: 'fagot', guarda: 'sin reintentos' },
    { from: 'dre', to: 'mg', guarda: 'quedan', channelOffset: 86 },
  ],
}

export const ACTIVIDADES: UmlActivityModel[] = [middleware, pipeline, webhookPago]
