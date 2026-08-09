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
  tiempos: [
    {
      concepto: 'Vigencia del link de cobro',
      valor: '24 h · 72 h · 7 días · sin vencimiento',
      origen: 'EXPIRY_OPTIONS / DEFAULT_EXPIRY - src/lib/cobros.ts',
      razon: 'Se elige al crear el cobro; 72 h es el valor por defecto porque cubre un fin de semana entero sin dejar el link vivo indefinidamente.',
    },
    {
      concepto: 'Momento en que se evalúa el vencimiento',
      valor: 'al abrir el link, no por temporizador',
      origen: 'isExpired() - src/lib/cobros.ts',
      razon: 'No hay proceso en espera: nada corre mientras el cliente no abre el link, así que el vencimiento se comprueba en ese instante contra expiresAt.',
    },
    {
      concepto: 'Límite de peticiones al link público',
      valor: '30 por minuto y por IP',
      origen: 'enforceLimit("cobro-link") - src/middleware.ts',
      razon: 'El código corto es adivinable por fuerza bruta; el límite la vuelve inviable sin estorbar a un cliente real.',
    },
    {
      concepto: 'Presupuesto de la consulta al limitador durable',
      valor: '150 ms',
      origen: 'timeoutMs - src/lib/security/ratelimit-durable.ts',
      razon: 'Pasado ese plazo se deja pasar el request (fail-open): el limitador no puede volverse la causa de la caída.',
    },
    {
      concepto: 'Reintentos al aplicar el evento de la pasarela',
      valor: 'hasta 5',
      origen: 'MAX_RETRIES - src/lib/payments.ts',
      razon: 'Concurrencia optimista: si dos webhooks del mismo pago compiten, el que pierde reintenta con la versión nueva en vez de pisar el estado.',
    },
  ],
  lanes: [
    { id: 'cliente', label: 'Cliente' },
    { id: 'mike', label: 'Operador en campo' },
    { id: 'sistema', label: 'Backend' },
    { id: 'wompi', label: 'Pasarela (Wompi)' },
  ],
  nodes: [
    { id: 'ini', type: 'startEvent', label: 'El cliente acepta pagar', lane: 'mike', col: 0 },
    { id: 'conf', type: 'taskUser', label: 'Configura monto, descripción y vigencia', lane: 'mike', col: 1 },
    { id: 'crea', type: 'taskService', label: 'Crea el pago idempotente y su código corto', lane: 'sistema', col: 2, duracion: 'vigencia 72 h por defecto' },
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
  tiempos: [
    {
      concepto: 'Vigencia de la invitación',
      valor: '72 h',
      origen: 'INVITE_TTL_MS - src/lib/portal/invitations.ts',
      razon: 'Da margen a un cliente que abre el correo el lunes después de recibirlo el viernes.',
    },
    {
      concepto: 'Vigencia del enlace de restablecimiento',
      valor: '30 min',
      origen: 'RESET_TTL_MS - src/lib/portal/invitations.ts',
      razon: 'Mucho más corto que la invitación a propósito: en un restablecimiento el buzón ya es un vector activo, así que la ventana de abuso se recorta.',
    },
    {
      concepto: 'Bloqueo por intentos fallidos',
      valor: '15 min tras 10 intentos',
      origen: 'LOCK_MS / MAX_ATTEMPTS - src/lib/portal/login.ts',
      razon: 'Frena la fuerza bruta sin dejar que un tercero deje fuera a un cliente legítimo de forma indefinida.',
    },
    {
      concepto: 'Duración de la sesión del portal',
      valor: '30 días, renovables',
      origen: 'SESSION_TTL_MS - src/lib/portal/session.ts',
      razon: 'Cada visita empuja el vencimiento; un cliente que entra una vez al mes no tiene que volver a autenticarse.',
    },
    {
      concepto: 'Refresco del registro de actividad de la sesión',
      valor: 'como mucho cada 5 min',
      origen: 'WRITE_THROTTLE_MS - src/lib/portal/session.ts',
      razon: 'Sin este freno, cada request escribiría en la tabla de sesiones solo para actualizar la marca de "visto por última vez".',
    },
    {
      concepto: 'Límite de intentos de autenticación',
      valor: '10 por minuto y por IP',
      origen: 'enforceLimit("portal-auth") - src/middleware.ts',
      razon: 'Es una segunda barrera por IP, independiente del bloqueo por cuenta: sin ella, atacar 500 cuentas distintas saldría gratis.',
    },
  ],
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
    // Temporizador de borde: el token muere solo, corra o no el proceso.
    { id: 'ttl', type: 'boundaryTimer', label: 'Vence el token', attachedTo: 'def', duracion: '72 h' },
    { id: 'vencida', type: 'endEventError', label: 'Invitación vencida', lane: 'usuario', col: 6, row: 1 },
    { id: 'hash', type: 'taskScript', label: 'Deriva scrypt y consume el token', lane: 'sistema', col: 6 },
    { id: 'login', type: 'taskUser', label: 'Inicia sesión', lane: 'usuario', col: 7 },
    { id: 'gcred', type: 'gatewayExclusive', label: '¿Credenciales válidas?', lane: 'sistema', col: 8 },
    { id: 'ses', type: 'taskService', label: 'Crea la sesión y su cookie propia', lane: 'sistema', col: 9, duracion: 'sesión 30 días' },
    { id: 'falla', type: 'taskScript', label: 'Cuenta el intento y bloquea al llegar al tope', lane: 'sistema', col: 9, row: 1, duracion: '15 min tras 10 intentos' },
    { id: 'fin', type: 'endEvent', label: 'Acceso solo a los datos de su cliente', lane: 'usuario', col: 10 },
  ],
  flows: [
    { from: 'ini', to: 'inv' },
    { from: 'inv', to: 'glibre' },
    { from: 'glibre', to: 'rech', label: 'no' },
    { from: 'glibre', to: 'tok', label: 'sí' },
    { from: 'tok', to: 'mail' },
    { from: 'mail', to: 'def', kind: 'message' },
    { from: 'ttl', to: 'vencida' },
    { from: 'def', to: 'hash' },
    { from: 'hash', to: 'login' },
    { from: 'login', to: 'gcred' },
    { from: 'gcred', to: 'falla', label: 'no' },
    // Canal más bajo: sin esto el "mensaje único" cae sobre la anotación de
    // tiempo de la tarea de la que sale.
    { from: 'falla', to: 'login', label: 'mensaje único', channelOffset: 24 },
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
  tiempos: [
    {
      concepto: 'Presupuesto del middleware antes de ceder el paso',
      valor: '150 ms para la consulta durable',
      origen: 'timeoutMs - src/lib/security/ratelimit-durable.ts',
      razon: 'Es el único tiempo de espera del camino caliente. Agotado el plazo, el request pasa sin verificar: el coste de un falso negativo es menor que el de tumbar el sitio.',
    },
    {
      concepto: 'Ventana del limitador',
      valor: '60 s',
      origen: 'windowMs - src/middleware.ts',
      razon: 'Ventana fija por IP: 10 peticiones para autenticación del portal, 30 para el resto de autenticación y para los links de cobro, 600 como paraguas general.',
    },
    {
      concepto: 'Caché en memoria de la lista de bloqueo',
      valor: '30 s',
      origen: 'CACHE_TTL_MS - src/lib/security/blocklist.ts',
      razon: 'Evita ir a la base en cada request. El precio es que desbloquear a una IP tarda hasta medio minuto en surtir efecto, que es aceptable en esa dirección.',
    },
    {
      concepto: 'Duración del bloqueo, escalada por reincidencia',
      valor: '1 h → 24 h → 7 días',
      origen: 'BLOCK_TTL_STEPS_SEC - src/lib/security/blocklist.ts',
      razon: 'Todo bloqueo caduca solo. Un bloqueo permanente por una regla automática convierte cualquier falso positivo en un daño indefinido.',
    },
    {
      concepto: 'Registro del evento y alerta',
      valor: 'no bloquea la respuesta',
      origen: 'recordSecurityEvent - src/lib/security/events.ts',
      razon: 'Se dispara y se olvida: el usuario nunca espera a que termine de escribirse la auditoría.',
    },
  ],
  lanes: [
    { id: 'origen', label: 'Cliente HTTP' },
    { id: 'mw', label: 'Middleware' },
    { id: 'siem', label: 'Micro-SIEM' },
    { id: 'op', label: 'Operador' },
  ],
  nodes: [
    { id: 'req', type: 'messageStart', label: 'Llega un request', lane: 'origen', col: 0 },
    { id: 'clas', type: 'taskScript', label: 'Clasifica método, ruta y cabeceras', lane: 'mw', col: 1 },
    { id: 'gbl', type: 'gatewayExclusive', label: '¿IP bloqueada?', lane: 'mw', col: 2, duracion: 'caché 30 s' },
    { id: 'f403', type: 'endEventError', label: '403 seco, sin pistas', lane: 'mw', col: 2, row: 1 },
    { id: 'ghp', type: 'gatewayExclusive', label: '¿Tocó un honeypot?', lane: 'mw', col: 3 },
    { id: 'blq', type: 'taskService', label: 'Bloquea la IP con TTL escalado', lane: 'siem', col: 3, row: 1, duracion: '1 h → 24 h → 7 días' },
    { id: 'bloqueada', type: 'endEvent', label: 'La IP cae en la blocklist', lane: 'siem', col: 4, row: 1 },
    { id: 'grl', type: 'gatewayExclusive', label: '¿Excede el límite?', lane: 'mw', col: 4, duracion: 'ventana de 60 s' },
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
    { from: 'blq', to: 'bloqueada' },
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
  tiempos: [
    {
      concepto: 'Cadencia del ciclo',
      valor: 'cada 5 min',
      origen: 'configurado en cron-job.org, fuera del repositorio',
      razon: 'Es el único tiempo del sistema que no vive en el código: el disparo es externo, y el endpoint no impone cadencia propia. Define el peor caso de detección de una caída.',
    },
    {
      concepto: 'Plazo del sondeo HTTP',
      valor: '12 s',
      origen: 'REQUEST_TIMEOUT_MS - src/lib/monitors.ts',
      razon: 'Pasado el plazo se aborta la petición y el sondeo cuenta como fallo. Sin corte, un servicio que no cierra la conexión colgaría el ciclo entero.',
    },
    {
      concepto: 'Umbral de degradado',
      valor: '2 s por defecto, ajustable por monitor',
      origen: 'latencyThresholdMs - src/db/schema.ts, src/lib/monitors.ts',
      razon: 'Separa "responde pero va lento" de "responde bien". Un servicio degradado no abre incidente, pero sí se ve en la página de estado.',
    },
    {
      concepto: 'Plazo del apretón de manos TLS',
      valor: '8 s',
      origen: 'SSL_TIMEOUT_MS - src/lib/monitors.ts',
      razon: 'Menor que el del sondeo HTTP porque comprobar el certificado es un extra: si tarda, se omite en vez de retrasar el ciclo.',
    },
    {
      concepto: 'Refresco de la fecha del certificado',
      valor: 'como mucho cada 12 h',
      origen: 'SSL_REFRESH_MS - src/pages/api/cron/uptime-check.ts',
      razon: 'Abrir un socket TLS es caro y la fecha de expiración cambia una vez cada varios meses: comprobarla cada 5 min sería puro desperdicio.',
    },
    {
      concepto: 'Retención del historial de sondeos',
      valor: '90 días',
      origen: 'CHECK_RETENTION_DAYS - src/pages/api/cron/uptime-check.ts',
      razon: 'Cubre de sobra la ventana de 30 días que publica la página de estado y mantiene la tabla acotada sin intervención.',
    },
    {
      concepto: 'Caducidad de sesiones de administración inactivas',
      valor: '24 h sin actividad',
      origen: 'IDLE_EXPIRY_MS - src/lib/device-sessions.ts',
      razon: 'La purga viaja en este mismo ciclo, en modo fail-open: si falla, no debe tumbar el chequeo de monitores.',
    },
  ],
  lanes: [
    { id: 'cron', label: 'Cron externo' },
    { id: 'api', label: 'Endpoint de chequeo' },
    { id: 'svc', label: 'Servicio monitoreado' },
    { id: 'db', label: 'Registro (Turso)' },
    { id: 'op', label: 'Operador' },
  ],
  nodes: [
    { id: 'tick', type: 'timerStart', label: 'Disparo del cron', lane: 'cron', col: 0, duracion: 'cada 5 min' },
    { id: 'gauth', type: 'gatewayExclusive', label: '¿Secreto del cron válido?', lane: 'api', col: 1 },
    { id: 'no401', type: 'endEventError', label: '401 sin ejecutar nada', lane: 'api', col: 1, row: 1 },
    { id: 'sonda', type: 'taskService', label: 'Sondea el servicio y mide la respuesta', lane: 'api', col: 2 },
    // Temporizador de borde: el sondeo se aborta solo, no espera indefinidamente.
    { id: 'corte', type: 'boundaryTimer', label: 'Se agota el tiempo y cuenta como caída', attachedTo: 'sonda', duracion: '12 s' },
    { id: 'resp', type: 'task', label: 'Responde dentro del plazo', lane: 'svc', col: 3 },
    { id: 'reg', type: 'taskService', label: 'Registra el sondeo y el estado del monitor', lane: 'db', col: 4 },
    { id: 'gok', type: 'gatewayExclusive', label: '¿Sondeo correcto?', lane: 'api', col: 5, duracion: 'degradado si >2 s' },
    // El carril del registro se lee en tres bandas: fallo nuevo, fallo repetido
    // y recuperación. Mezclarlas en dos filas hacía que las flechas de una rama
    // pasaran por encima de las tareas de la otra.
    { id: 'gabierto', type: 'gatewayExclusive', label: '¿Ya había incidente?', lane: 'db', col: 6 },
    { id: 'gcerrar', type: 'gatewayExclusive', label: '¿Había incidente abierto?', lane: 'db', col: 6, row: 2 },
    { id: 'abre', type: 'taskService', label: 'Abre el incidente y marca caída', lane: 'db', col: 7 },
    { id: 'act', type: 'taskService', label: 'Actualiza el último error', lane: 'db', col: 7, row: 1 },
    { id: 'cierra', type: 'taskService', label: 'Cierra el incidente con su duración', lane: 'db', col: 8, row: 2 },
    { id: 'estable', type: 'endEvent', label: 'Nada que cerrar', lane: 'api', col: 7, row: 1 },
    { id: 'caida', type: 'taskSend', label: 'Aviso de servicio caído', lane: 'op', col: 8 },
    { id: 'recu', type: 'taskSend', label: 'Aviso de recuperación', lane: 'op', col: 9, row: 1 },
    { id: 'fin', type: 'endEvent', label: 'Estado publicado en la página pública', lane: 'api', col: 10 },
  ],
  flows: [
    { from: 'tick', to: 'gauth' },
    { from: 'gauth', to: 'no401', label: 'no' },
    { from: 'gauth', to: 'sonda', label: 'sí' },
    { from: 'sonda', to: 'resp', kind: 'message' },
    // Baja pegado a la tarea para no cruzar el carril del servicio sondeado.
    // Sin etiqueta: el propio evento de borde ya dice qué pasa y en cuánto.
    // Transpuesto el estorbo es el mismo pero en el otro eje: el tramo que
    // cambia de carril tiene que pasar por encima del servicio sondeado, no a
    // su altura.
    { from: 'corte', to: 'reg', channelOffset: -78, channelOffsetV: -75 },
    { from: 'resp', to: 'reg' },
    { from: 'reg', to: 'gok' },
    // Las dos ramas bajan en paralelo un buen trecho, así que se separan lo
    // máximo que permite la etiqueta de la compuerta de abajo: pegadas, el ojo
    // no distingue cuál lleva a cuál.
    { from: 'gok', to: 'gabierto', label: 'no', channelOffset: -40, channelOffsetV: -34 },
    { from: 'gok', to: 'gcerrar', label: 'sí', channelOffset: 24, channelOffsetV: 0 },
    { from: 'gabierto', to: 'abre', label: 'no' },
    // Su canal se adelanta para que el "sí" no caiga sobre la línea que sube
    // desde la compuerta de abajo.
    { from: 'gabierto', to: 'act', label: 'sí', channelOffset: -20, channelOffsetV: -22 },
    { from: 'gcerrar', to: 'cierra', label: 'sí' },
    { from: 'gcerrar', to: 'estable', label: 'no' },
    { from: 'abre', to: 'caida' },
    { from: 'cierra', to: 'recu' },
    { from: 'caida', to: 'fin' },
    { from: 'recu', to: 'fin' },
    { from: 'act', to: 'fin' },
  ],
}

export const procesosBpmn: BpmnProcess[] = [cobroCampo, portalAcceso, seguridad, monitoreo]

/**
 * Los cinco tipos de compuerta de BPMN.
 *
 * Todas se dibujan con el mismo rombo: lo único que las distingue es el
 * marcador de dentro. Por eso van documentadas - confundir el marcador no es un
 * desliz estético, cambia lo que el diagrama afirma que hace el sistema.
 *
 * Cada una se comporta distinto según divida o junte caminos, así que ambos
 * sentidos se describen por separado.
 */
export const COMPUERTAS_BPMN = [
  {
    type: 'gatewayExclusive' as const,
    nombre: 'Exclusiva',
    marcador: 'una X',
    alias: 'XOR',
    divergencia: 'Toma UN solo camino: el primero cuya condición se cumple. Las ramas son mutuamente excluyentes.',
    convergencia: 'Deja pasar cada camino que llega, sin esperar a los demás.',
    ejemplo: 'Es la única que usan estos cuatro diagramas: “¿Link vigente?”, “¿Credenciales válidas?”, “¿IP bloqueada?”.',
    usada: true,
  },
  {
    type: 'gatewayEvent' as const,
    nombre: 'Basada en eventos',
    marcador: 'un pentágono dentro de un doble círculo',
    alias: null,
    divergencia:
      'También toma un solo camino, pero no lo decide una condición que el proceso evalúa: lo decide cuál de los eventos que espera ocurre primero. Es una carrera.',
    convergencia: 'No se usa para juntar caminos; su sentido es abrir la espera.',
    ejemplo:
      'Encajaría en el cobro de campo: tras enviar el link, el proceso espera a que llegue el webhook de la pasarela o a que venza la vigencia, lo que pase antes. Hoy ese vencimiento se modela como una condición evaluada al abrir el link, que es como está implementado de verdad.',
    usada: false,
  },
  {
    type: 'gatewayParallel' as const,
    nombre: 'Paralela',
    marcador: 'un signo +',
    alias: 'AND',
    divergencia: 'Activa TODOS los caminos a la vez, sin evaluar ninguna condición.',
    convergencia: 'Espera a que lleguen todos los caminos antes de continuar. Si uno no llega, el proceso se queda ahí.',
    ejemplo:
      'Sería lo correcto para el chequeo de monitores si el sondeo y la verificación del certificado corrieran a la vez; hoy van en secuencia dentro de la misma tarea.',
    usada: false,
  },
  {
    type: 'gatewayInclusive' as const,
    nombre: 'Inclusiva',
    marcador: 'un círculo',
    alias: 'OR',
    divergencia: 'Activa todos los caminos cuya condición se cumple: uno, varios o todos. No son excluyentes entre sí.',
    convergencia: 'Espera solo a los caminos que llegaron a activarse, no a todos los posibles.',
    ejemplo:
      'Describiría la notificación de un incidente si hubiera que avisar por push, por correo y en el panel según lo grave que sea: varios canales a la vez, no uno solo.',
    usada: false,
  },
  {
    type: 'gatewayComplex' as const,
    nombre: 'Compleja',
    marcador: 'un asterisco',
    alias: null,
    divergencia: 'Para condiciones que no caben en las anteriores; su comportamiento se explica con una expresión escrita al lado.',
    convergencia: 'Sincroniza según esa misma expresión, por ejemplo “sigue cuando hayan llegado 3 de los 5 caminos”.',
    ejemplo:
      'Es la menos usada de las cinco, y con razón: si hay que leer un párrafo para saber qué hace, el dibujo dejó de comunicar por sí mismo.',
    usada: false,
  },
]

/** Leyenda de la notación, para que el diagrama se lea sin saber BPMN de memoria. */
export const leyendaBpmn = [
  { type: 'startEvent' as const, label: 'Evento de inicio', desc: 'dispara el proceso' },
  { type: 'intermediateEvent' as const, label: 'Evento intermedio', desc: 'algo ocurre a mitad del flujo' },
  { type: 'timerStart' as const, label: 'Inicio temporizado', desc: 'lo dispara el reloj, no una persona' },
  { type: 'boundaryTimer' as const, label: 'Temporizador de borde', desc: 'corta la tarea si se pasa del plazo' },
  { type: 'endEvent' as const, label: 'Evento de fin', desc: 'el proceso termina bien' },
  { type: 'endEventError' as const, label: 'Fin por error', desc: 'termina por una condición de fallo' },
  { type: 'taskUser' as const, label: 'Tarea de usuario', desc: 'la ejecuta una persona' },
  { type: 'taskService' as const, label: 'Tarea de servicio', desc: 'la ejecuta el sistema' },
  { type: 'taskSend' as const, label: 'Tarea de envío', desc: 'emite un mensaje hacia afuera' },
  { type: 'taskScript' as const, label: 'Tarea de script', desc: 'lógica automática interna' },
  { type: 'gatewayExclusive' as const, label: 'Compuerta exclusiva', desc: 'un solo camino de salida' },
]
