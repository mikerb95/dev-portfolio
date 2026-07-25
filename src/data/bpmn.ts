// Fuente de verdad de los diagramas BPMN de /docs/diagrama-bpmn.
//
// Igual que el resto de /docs: la página solo renderiza, aquí vive el modelo.
// Cada proceso declara su `origen` (dónde está implementado) para que el
// diagrama se pueda contrastar con el código en vez de creerle.

import type { BpmnProcess } from '../lib/bpmn-layout'

/** Cobro de campo: del "sí, te pago" al pago conciliado. */
const cobroCampo: BpmnProcess = {
  id: 'cobro-campo',
  titulo: 'Cobro de campo con link de pago',
  desc:
    'Del acuerdo verbal frente al cliente al pago conciliado en la base. El proceso vive sobre la máquina de estados idempotente de pagos: ningún reintento, reenvío ni webhook repetido puede cobrar dos veces.',
  origen: 'src/pages/cobrar.astro · src/pages/c/[code].astro · src/lib/payments.ts · src/pages/api/payments/webhook.ts',
  nota:
    'La compuerta de firma y monto es el corazón del control: si la pasarela reporta un monto distinto al del pago, el evento se registra como evidencia con la alerta correspondiente y el estado NO se transiciona.',
  lanes: [
    { id: 'cliente', label: 'Cliente' },
    { id: 'mike', label: 'Operador en campo' },
    { id: 'sistema', label: 'Backend' },
    { id: 'wompi', label: 'Pasarela (Wompi)' },
  ],
  nodes: [
    { id: 'ini', type: 'startEvent', label: 'El cliente acepta pagar', lane: 'mike', col: 0 },
    { id: 'conf', type: 'taskUser', label: 'Configura monto, descripción y vigencia', lane: 'mike', col: 1 },
    { id: 'crea', type: 'taskService', label: 'Crea el pago idempotente y su código corto', lane: 'sistema', col: 2 },
    { id: 'env', type: 'taskSend', label: 'Envía el link por WhatsApp', lane: 'mike', col: 3 },
    { id: 'abre', type: 'taskUser', label: 'Abre /c/[code] y revisa el monto', lane: 'cliente', col: 4 },
    { id: 'gvig', type: 'gatewayExclusive', label: '¿Link vigente?', lane: 'sistema', col: 5 },
    { id: 'venc', type: 'endEventError', label: 'Vencido o ya pagado', lane: 'sistema', col: 5, row: 1 },
    { id: 'paga', type: 'taskUser', label: 'Paga en la pasarela', lane: 'cliente', col: 6 },
    { id: 'proc', type: 'taskService', label: 'Procesa la transacción', lane: 'wompi', col: 7 },
    { id: 'hook', type: 'intermediateEvent', label: 'Webhook recibido', lane: 'sistema', col: 8 },
    { id: 'gval', type: 'gatewayExclusive', label: '¿Firma y monto correctos?', lane: 'sistema', col: 9 },
    { id: 'desc', type: 'endEventError', label: 'Descartado con alerta push', lane: 'sistema', col: 9, row: 1 },
    { id: 'apl', type: 'taskService', label: 'Aplica la transición al pago', lane: 'sistema', col: 10 },
    { id: 'fin', type: 'endEvent', label: 'Pago conciliado', lane: 'sistema', col: 11 },
  ],
  flows: [
    { from: 'ini', to: 'conf' },
    { from: 'conf', to: 'crea' },
    { from: 'crea', to: 'env' },
    { from: 'env', to: 'abre', kind: 'message' },
    { from: 'abre', to: 'gvig' },
    { from: 'gvig', to: 'venc', label: 'no' },
    { from: 'gvig', to: 'paga', label: 'sí' },
    { from: 'paga', to: 'proc', kind: 'message' },
    { from: 'proc', to: 'hook', kind: 'message' },
    { from: 'hook', to: 'gval' },
    { from: 'gval', to: 'desc', label: 'no' },
    { from: 'gval', to: 'apl', label: 'sí' },
    { from: 'apl', to: 'fin' },
  ],
}

/** Portal de clientes: invitación, alta de contraseña y primer acceso. */
const portalAcceso: BpmnProcess = {
  id: 'portal-acceso',
  titulo: 'Invitación y acceso al portal de clientes',
  desc:
    'Alta de un usuario de cliente y su primer inicio de sesión. Autenticación propia (scrypt + cookie de sesión), completamente separada de la del administrador.',
  origen: 'src/lib/portal/invitations.ts · src/lib/portal/login.ts · src/lib/portal/session.ts',
  nota:
    'El correo es único global: si ya pertenece a otro cliente, la invitación se rechaza en vez de reasignarlo. Reasignar sería una fuga de datos entre clientes servida en bandeja.',
  lanes: [
    { id: 'admin', label: 'Administrador' },
    { id: 'sistema', label: 'Portal (backend)' },
    { id: 'usuario', label: 'Usuario del cliente' },
  ],
  nodes: [
    { id: 'ini', type: 'startEvent', label: 'Se acuerda dar acceso', lane: 'admin', col: 0 },
    { id: 'inv', type: 'taskUser', label: 'Invita el correo con un rol', lane: 'admin', col: 1 },
    { id: 'glibre', type: 'gatewayExclusive', label: '¿Correo libre para este cliente?', lane: 'sistema', col: 2 },
    { id: 'rech', type: 'endEventError', label: 'Rechazo: pertenece a otro cliente', lane: 'sistema', col: 2, row: 1 },
    { id: 'tok', type: 'taskService', label: 'Emite token con TTL y anula los anteriores', lane: 'sistema', col: 3 },
    { id: 'mail', type: 'taskSend', label: 'Envía el correo de invitación', lane: 'sistema', col: 4 },
    { id: 'def', type: 'taskUser', label: 'Define su contraseña', lane: 'usuario', col: 5 },
    { id: 'hash', type: 'taskScript', label: 'Deriva scrypt y consume el token', lane: 'sistema', col: 6 },
    { id: 'login', type: 'taskUser', label: 'Inicia sesión', lane: 'usuario', col: 7 },
    { id: 'gcred', type: 'gatewayExclusive', label: '¿Credenciales válidas?', lane: 'sistema', col: 8 },
    { id: 'falla', type: 'taskScript', label: 'Cuenta el intento y bloquea al llegar al tope', lane: 'sistema', col: 8, row: 1 },
    { id: 'ses', type: 'taskService', label: 'Crea la sesión y su cookie propia', lane: 'sistema', col: 9 },
    { id: 'fin', type: 'endEvent', label: 'Acceso solo a los datos de su cliente', lane: 'usuario', col: 10 },
  ],
  flows: [
    { from: 'ini', to: 'inv' },
    { from: 'inv', to: 'glibre' },
    { from: 'glibre', to: 'rech', label: 'no' },
    { from: 'glibre', to: 'tok', label: 'sí' },
    { from: 'tok', to: 'mail' },
    { from: 'mail', to: 'def', kind: 'message' },
    { from: 'def', to: 'hash' },
    { from: 'hash', to: 'login' },
    { from: 'login', to: 'gcred' },
    { from: 'gcred', to: 'falla', label: 'no' },
    { from: 'falla', to: 'login', label: 'mensaje único' },
    { from: 'gcred', to: 'ses', label: 'sí' },
    { from: 'ses', to: 'fin' },
  ],
}

/** Micro-SIEM: qué le pasa a un request hostil antes de tocar una página. */
const seguridad: BpmnProcess = {
  id: 'seguridad',
  titulo: 'Detección y respuesta de seguridad (micro-SIEM)',
  desc:
    'Recorrido de un request por el middleware: clasificación, blocklist, honeypot y rate limiting durable, con el registro del evento y la alerta al operador.',
  origen: 'src/middleware.ts · src/lib/security/{sensor,classify,blocklist,ratelimit-durable,events}.ts',
  nota:
    'Todo el carril de seguridad es fail-open: si el clasificador, el limitador o el registro fallan, el request sigue su curso. Un sistema de defensa capaz de tumbar el sitio que protege es una superficie de ataque nueva, no una defensa.',
  lanes: [
    { id: 'origen', label: 'Cliente HTTP' },
    { id: 'mw', label: 'Middleware' },
    { id: 'siem', label: 'Micro-SIEM' },
    { id: 'op', label: 'Operador' },
  ],
  nodes: [
    { id: 'req', type: 'messageStart', label: 'Llega un request', lane: 'origen', col: 0 },
    { id: 'clas', type: 'taskScript', label: 'Clasifica método, ruta y cabeceras', lane: 'mw', col: 1 },
    { id: 'gbl', type: 'gatewayExclusive', label: '¿IP bloqueada?', lane: 'mw', col: 2 },
    { id: 'f403', type: 'endEventError', label: '403 seco, sin pistas', lane: 'mw', col: 2, row: 1 },
    { id: 'ghp', type: 'gatewayExclusive', label: '¿Tocó un honeypot?', lane: 'mw', col: 3 },
    { id: 'blq', type: 'taskService', label: 'Bloquea la IP con TTL escalado', lane: 'siem', col: 3, row: 1 },
    { id: 'grl', type: 'gatewayExclusive', label: '¿Excede el límite?', lane: 'mw', col: 4 },
    { id: 'f429', type: 'endEventError', label: '429 con Retry-After', lane: 'mw', col: 4, row: 1 },
    { id: 'ev', type: 'taskService', label: 'Registra el evento sin bloquear la respuesta', lane: 'siem', col: 5 },
    { id: 'alerta', type: 'taskSend', label: 'Notifica si la severidad lo amerita', lane: 'op', col: 6 },
    { id: 'sigue', type: 'taskService', label: 'Continúa a la página o API', lane: 'mw', col: 6 },
    { id: 'fin', type: 'endEvent', label: 'Respuesta servida', lane: 'mw', col: 7 },
    { id: 'rev', type: 'endEvent', label: 'Revisión en el panel', lane: 'op', col: 7 },
  ],
  flows: [
    { from: 'req', to: 'clas' },
    { from: 'clas', to: 'gbl' },
    { from: 'gbl', to: 'f403', label: 'sí' },
    { from: 'gbl', to: 'ghp', label: 'no' },
    { from: 'ghp', to: 'blq', label: 'sí' },
    { from: 'ghp', to: 'grl', label: 'no' },
    { from: 'grl', to: 'f429', label: 'sí' },
    { from: 'grl', to: 'ev', label: 'no' },
    { from: 'ev', to: 'sigue' },
    { from: 'ev', to: 'alerta' },
    { from: 'alerta', to: 'rev' },
    { from: 'sigue', to: 'fin' },
  ],
}

/** Monitoreo: sondeo periódico, apertura y cierre de incidente. */
const monitoreo: BpmnProcess = {
  id: 'monitoreo',
  titulo: 'Chequeo de monitor, incidente y recuperación',
  desc:
    'Ciclo disparado por el cron externo: sondeo de cada servicio, materialización del estado, apertura o cierre del incidente y notificación al operador solo en las transiciones.',
  origen: 'src/pages/api/cron/uptime-check.ts · /status',
  nota:
    'Se notifica en la transición, nunca en cada sondeo: un monitor caído genera un aviso al caer y otro al recuperarse, no uno cada cinco minutos.',
  lanes: [
    { id: 'cron', label: 'Cron externo' },
    { id: 'api', label: 'Endpoint de chequeo' },
    { id: 'svc', label: 'Servicio monitoreado' },
    { id: 'db', label: 'Registro (Turso)' },
    { id: 'op', label: 'Operador' },
  ],
  nodes: [
    { id: 'tick', type: 'timerStart', label: 'Cada pocos minutos', lane: 'cron', col: 0 },
    { id: 'gauth', type: 'gatewayExclusive', label: '¿Secreto del cron válido?', lane: 'api', col: 1 },
    { id: 'no401', type: 'endEventError', label: '401 sin ejecutar nada', lane: 'api', col: 1, row: 1 },
    { id: 'sonda', type: 'taskService', label: 'Sondea el servicio y mide la respuesta', lane: 'api', col: 2 },
    { id: 'resp', type: 'task', label: 'Responde o agota el tiempo', lane: 'svc', col: 3 },
    { id: 'reg', type: 'taskService', label: 'Registra el sondeo y el estado del monitor', lane: 'db', col: 4 },
    { id: 'gok', type: 'gatewayExclusive', label: '¿Sondeo correcto?', lane: 'api', col: 5 },
    { id: 'gabierto', type: 'gatewayExclusive', label: '¿Ya había incidente?', lane: 'db', col: 6 },
    { id: 'gcerrar', type: 'gatewayExclusive', label: '¿Había incidente abierto?', lane: 'db', col: 6, row: 1 },
    { id: 'abre', type: 'taskService', label: 'Abre el incidente y marca caída', lane: 'db', col: 7 },
    { id: 'act', type: 'taskService', label: 'Actualiza el último error', lane: 'db', col: 7, row: 1 },
    { id: 'cierra', type: 'taskService', label: 'Cierra el incidente con su duración', lane: 'db', col: 8, row: 1 },
    { id: 'caida', type: 'taskSend', label: 'Aviso de servicio caído', lane: 'op', col: 8 },
    { id: 'recu', type: 'taskSend', label: 'Aviso de recuperación', lane: 'op', col: 9 },
    { id: 'fin', type: 'endEvent', label: 'Estado publicado en la página pública', lane: 'api', col: 10 },
  ],
  flows: [
    { from: 'tick', to: 'gauth' },
    { from: 'gauth', to: 'no401', label: 'no' },
    { from: 'gauth', to: 'sonda', label: 'sí' },
    { from: 'sonda', to: 'resp', kind: 'message' },
    { from: 'resp', to: 'reg' },
    { from: 'reg', to: 'gok' },
    { from: 'gok', to: 'gabierto', label: 'no' },
    { from: 'gok', to: 'gcerrar', label: 'sí' },
    { from: 'gabierto', to: 'abre', label: 'no' },
    { from: 'gabierto', to: 'act', label: 'sí' },
    { from: 'gcerrar', to: 'cierra', label: 'sí' },
    { from: 'abre', to: 'caida' },
    { from: 'cierra', to: 'recu' },
    { from: 'caida', to: 'fin' },
    { from: 'recu', to: 'fin' },
    { from: 'act', to: 'fin' },
    { from: 'gcerrar', to: 'fin', label: 'no' },
  ],
}

export const procesosBpmn: BpmnProcess[] = [cobroCampo, portalAcceso, seguridad, monitoreo]

/** Leyenda de la notación, para que el diagrama se lea sin saber BPMN de memoria. */
export const leyendaBpmn = [
  { type: 'startEvent' as const, label: 'Evento de inicio', desc: 'dispara el proceso' },
  { type: 'intermediateEvent' as const, label: 'Evento intermedio', desc: 'algo ocurre a mitad del flujo' },
  { type: 'endEvent' as const, label: 'Evento de fin', desc: 'el proceso termina bien' },
  { type: 'endEventError' as const, label: 'Fin por error', desc: 'termina por una condición de fallo' },
  { type: 'taskUser' as const, label: 'Tarea de usuario', desc: 'la ejecuta una persona' },
  { type: 'taskService' as const, label: 'Tarea de servicio', desc: 'la ejecuta el sistema' },
  { type: 'taskSend' as const, label: 'Tarea de envío', desc: 'emite un mensaje hacia afuera' },
  { type: 'taskScript' as const, label: 'Tarea de script', desc: 'lógica automática interna' },
  { type: 'gatewayExclusive' as const, label: 'Compuerta exclusiva', desc: 'un solo camino de salida' },
]
