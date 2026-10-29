# 05 · Panel de administración (`/admin`)

Panel privado de un único usuario (Mike). Acceso: GitHub OAuth con allowlist o
llave de seguridad WebAuthn (ver [07](07-autenticacion-y-accesos.md)). Layout
`AdminLayout.astro`, mobile-first (drawer, tablas que se vuelven tarjetas).

El menú vive en [`src/data/panel-nav.ts`](../../src/data/panel-nav.ts): una sola
lista que pinta el sidebar **y** recorre el buscador del dashboard. Cada enlace
lleva `claves` (palabras con que Mike lo buscaría: "¿quién me debe?" lleva a
Clientes). Una página nueva del panel se da de alta ahí.

## Dashboard (`/admin`)

- **Caja "Pregunta o busca"** (RF-219): búsqueda instantánea sobre clientes,
  proyectos, páginas del panel… y, al enviar, el **asistente con IA** que
  consulta datos con herramientas y propone escrituras con tarjeta de
  aprobación (ver [11](11-ia-y-agentes.md)). Paleta de comandos con Ctrl+K.
- Pulso del sitio (`pulso-panel.ts`), pendientes, alertas.

## Secciones por grupo

### Workspace

| Ruta | Qué hace |
|---|---|
| `/admin/repos` | Elige qué repos de GitHub se muestran en el portafolio; stack auto-importado. |
| `/admin/monitors` | Monitores de uptime: alta, sparkline de sondeos, SSL, incidentes, diagnóstico manual. |
| `/admin/semana` | Resumen semanal de operación redactado por IA (lo escribe el cron de los lunes). |

### CRM y comercial

| Ruta | Qué hace |
|---|---|
| `/admin/projects`, `/admin/projects/<id>` | Proyectos: estado, fechas, stack, hitos, contactos, ADRs, variables de entorno por proyecto, servicios con costos y **bóveda cifrada**, monitores del proyecto con uptime/EKG/SSL. |
| `/admin/clients` | Clientes, deudores, alta de acceso al portal y **"Ver como cliente"** (impersonación de solo lectura). |
| `/admin/seguimiento` | Bitácora de interacciones (llamadas, reuniones, recordatorios) + tablero de pendientes vencidos/próximos. |
| `/admin/messages` | Bandeja del formulario de contacto. |
| `/admin/asesor`, `/admin/asesor/<id>` | **Asesor en vivo**: conversaciones del chat público donde la persona mostró interés; Mike puede entrar a responder (RF-213). Se guardan 48 h. |
| `/admin/plano`, `/admin/plano/<id>`, `/admin/plano/ajustes` | **Plano**: constructor de propuestas a la medida con precio en rango que se cierra, PDF, IA "del chat al plano" y "el cliente difícil", reglas de pago editables. |
| `/admin/marketing`, `/admin/marketing/<id>` | Correos promocionales: suscriptores (solo opt-in), campañas, cola de envíos por lotes. |
| `/admin/cotiza`, `/admin/cotiza/<id>` | **Cotiza**: encargos de consultoría con alcance, cupos y adicionales. Accesible también con **PIN** sin sesión de GitHub (vista sin menú). |
| `/admin/briefings`, `/admin/briefings/<id>` | Briefings de requerimientos de clientes (checklist). |
| `/admin/portal/*` | Administración del portal: estado por cliente, facturas, hitos, mensajes (los que esperan respuesta arriba), actividad (incluida la oculta al cliente). |
| `/admin/presentaciones/*` | Biblioteca de decks HTML, lanzamiento de sesiones con PIN. |
| `/admin/sustentacion` | Puesto de mando de la sustentación (PIN de presentador y PIN del público). |
| `/admin/capacitacion/*` | Programas, recursos del banco y códigos de acceso por grupo. |

### Finanzas

| Ruta | Qué hace |
|---|---|
| `/admin/resumen` | Resumen mensual: lo que sale del bolsillo (infra, suscripciones, vida); cinco meses atrás y seis adelante. |
| `/admin/finances` | Ingresos: cobrado, pendiente, proyectado. |
| `/admin/costs` | Costos por servicio multi-moneda (base USD), ciclo de cobro, renovaciones, responsable de pago, margen y **P&L** por proyecto/cliente. Los secretos nunca viajan en el HTML. |
| `/admin/vida` | Costos de vida personales (fijos y gastos). |
| `/admin/infra` | Simulador de costos de la infraestructura básica propia (Vercel, Turso, Claude): qué pasa al pasarse de cada cuota ("unos te cobran, otros te cortan"). |
| `/admin/computo` | Cómputo de Vercel por proyecto de cliente (medidor instalado en sus sitios), cuota gratis compartida con avisos, cotizador de hosting fijo. |
| `/admin/aeo` | Visibilidad en IA: lecturas de bots de IA y referidos desde asistentes, por día. |
| `/admin/cuentas-cobro` | Cuentas de cobro de persona natural no responsable de IVA (Colombia): retenciones parametrizables, semáforo del tope de IVA, PDF. Fechas en zona Colombia. |
| `/admin/domains` | Vencimiento de dominios vía RDAP, estado de canales de aviso. |
| `/cobrar` | (fuera de `/admin`, misma sesión) Cobro de campo desde el celular. |

### Perfil

| Ruta | Qué hace |
|---|---|
| `/admin/certifications` | Certificaciones con imagen en Blob. |
| `/admin/education` | "Evolution Path": rutas de aprendizaje con progreso por lab. |
| `/admin/aprendizaje` | Tracker de especialización (racha, meta semanal, temario, logros); estrenado con el track .NET y C#. |

### Lab

| Ruta | Qué hace |
|---|---|
| `/admin/lab/pipeline` | Corridas de CI ingeridas (estado, duración, cobertura, health check, rollback). |
| `/admin/lab/payments-lab` | Pasarela en modo laboratorio + cuatro ataques controlados (doble clic, webhook duplicado, eventos fuera de orden, carrera), cada uno con esperado/observado guardado en `lab_experiments`. |
| `/admin/lab/chaos` | Flags de chaos engineering con TTL ≤ 15 min y botón de pánico. |
| `/admin/lab/slo` | SLOs y error budget por monitor. |
| `/admin/lab/security` | Hallazgos SAST (npm audit, CodeQL), DAST (ZAP) y a11y (axe) con estado; última corrida del vigía nocturno. |
| `/admin/lab/load` | Corridas de k6 con escalera de p95/p50. |
| `/admin/lab/cv-downloads` | Historial de descargas del CV. |

### Sistema (fuera del menú principal o en ajustes)

| Ruta | Qué hace |
|---|---|
| `/admin/security` | Micro-SIEM: eventos, anomalías, rollups, blocklist con desbloqueo, bloqueo masivo, rastro de auditoría aparte. |
| `/admin/analista` | Analista de IA del micro-SIEM: recorrido en vivo (SSE), propuestas de bloqueo que Mike aprueba. |
| `/admin/sessions` | Dispositivos con sesión admin; revocación remota. |
| `/admin/passkeys` | Alta y baja de llaves de seguridad (exige login reciente). |
| `/admin/backup` | Backup manual y restauración (JSON en Vercel Blob). |
| `/admin/settings` | Ajustes: datos del emisor, parámetros tributarios, PIN de Cotiza… (en `app_settings`). |
| `/admin/vida`, `/admin/infra` | Ver Finanzas. |
| `/admin/docs/*` | Redirect permanente a `/docs/*` (la documentación se hizo pública). |
| `/admin/wiki` | Esta wiki (`docs/wiki`) leída dentro del panel: índice de páginas, anterior y siguiente, enlaces entre páginas en el panel y al código en GitHub (RF-721). |

## Redirecciones históricas

`/admin/slides*` y `/admin/presentations*` → `/admin/presentaciones`
(configurado en `astro.config.mjs`). Las tablas del sistema viejo
(`presentations`, `presentation_slides`) siguen en la base sin código que las
lea: borrarlas sería destructivo.

## Patrones del panel

- Toda acción relevante se registra con `recordAdminEvent` (con `await`) en
  `security_events` bajo una categoría de **auditoría**, que nunca se publica
  como ataque.
- Lo que se inyecta en `innerHTML` desde la API o la base se escapa.
- Las fechas de documentos usan `formatFechaCorta` (zona Colombia), no la zona
  del servidor (UTC en Vercel), o los documentos emitidos después de las 19:00
  saldrían con el día siguiente.
- Páginas que dependen de tablas nuevas son fail-open: sin tabla (p. ej. en la
  demo) se vacían, no se caen.
