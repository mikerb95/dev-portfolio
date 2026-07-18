// ─────────────────────────────────────────────────────────────────────────────
// Documentación de ingeniería del portfolio (codebymike.tech / dev-portfolio).
// Fuente de verdad para /docs/*. Ver docs/plan-documentacion.md.
// ─────────────────────────────────────────────────────────────────────────────

export type Estado = 'implementado' | 'parcial' | 'planeado'
export type Prioridad = 'alta' | 'media' | 'baja'

export interface Requisito {
  id: string
  titulo: string
  descripcion: string
  prioridad: Prioridad
  estado: Estado
  origen?: string // dónde vive en el código (ruta, tabla, archivo)
  verificacion?: string // cómo se comprueba: test, revisión manual, monitor en prod...
  notas?: string // notas técnicas, decisiones de diseño o riesgos conocidos
  relacionados?: string[] // ids de otros RF/RNF/CU vinculados
}

export interface Modulo {
  id: string
  nombre: string
  items: Requisito[]
}

// ── Requerimientos funcionales ──────────────────────────────────────────────
export const REQUISITOS_FUNCIONALES: Modulo[] = [
  {
    id: 'publico',
    nombre: 'Sitio público',
    items: [
      { id: 'RF-001', titulo: 'Listado de proyectos', descripcion: 'El visitante puede ver los proyectos marcados como visibles, con stack, descripción y enlaces.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/index.astro, ProjectCard.astro', verificacion: 'Revisión manual en producción; el filtro por visible=true se cubre indirectamente en tests de la API de proyectos.', notas: 'Los proyectos no visibles siguen accesibles por URL directa si se conoce el slug (no hay 404 forzado); es una decisión consciente para poder compartir previews.', relacionados: ['RF-002'] },
      { id: 'RF-002', titulo: 'Detalle de proyecto', descripcion: 'Página individual por proyecto con metadata estructurada (JSON-LD), breadcrumbs y pestaña de observabilidad si tiene monitor asociado.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/projects/[slug].astro', verificacion: 'Validación manual del JSON-LD con el Rich Results Test de Google; smoke test de que la ruta renderiza 200 para slugs existentes.', notas: 'La pestaña de observabilidad solo aparece si el proyecto tiene un monitor asociado en la tabla monitors; si no, se omite sin dejar hueco visual.', relacionados: ['RF-001', 'RF-401'] },
      { id: 'RF-003', titulo: 'Formulario de contacto', descripcion: 'El visitante puede enviar un mensaje que queda asociado a un cliente (si el email coincide) y visible en el CRM.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/api/contact.ts', verificacion: 'Test de integración sobre el endpoint (envío válido, campos faltantes, rate limit); revisión manual del correo asociado en /admin/messages.', notas: 'Protegido por el rate limiting durable (RF-603) para evitar spam; el matching de cliente es por email exacto, sin normalización de dominios.', relacionados: ['RF-203', 'RF-603'] },
      { id: 'RF-004', titulo: 'Página de estado del sistema', descripcion: 'Vista pública con uptime de 30 días, incidentes activos y latencia en tiempo real (EKG) por servicio monitoreado.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/status, src/pages/api/status', verificacion: 'Comparación manual contra los datos crudos de monitor_checks; validado en prod con los 8 monitores activos.', notas: 'Alimentada por el mismo pipeline que RF-401/RF-402; ningún dato aquí se calcula aparte, solo se proyecta lo ya persistido.', relacionados: ['RF-401', 'RF-402'] },
      { id: 'RF-005', titulo: 'Vitrina de herramientas y notas', descripcion: 'Secciones públicas /tools y /notes con artículos técnicos y mocks de herramientas internas.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/tools, src/pages/notes', verificacion: 'Revisión manual de contenido y enlaces al publicar cada artículo.', notas: 'Contenido estático versionado junto al código, no editable desde el panel admin; publicar requiere un commit.' },
      { id: 'RF-006', titulo: 'Certificaciones y evolución académica', descripcion: 'Listado público de certificaciones vigentes/expiradas y línea de tiempo de hitos educativos.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/certifications, EvolutionTimeline.astro', verificacion: 'Revisión manual del estado vigente/expirado tras cada actualización de certificaciones.' },
      { id: 'RF-007', titulo: 'SEO técnico', descripcion: 'JSON-LD, sitemap, RSS, notificación IndexNow y manifest de PWA en cada publicación.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/rss.xml, scripts/indexnow', verificacion: 'Tests unitarios de la notificación IndexNow (tests/indexnow.test.ts); validación manual del sitemap y RSS en herramientas de Search Console/Bing.', notas: 'Las altas manuales en Search Console y Bing Webmaster Tools quedan pendientes; la capa técnica está completa desde jul 2026.', relacionados: ['CU-17'] },
      { id: 'RF-008', titulo: 'Demo read-only del panel admin', descripcion: 'Versión pública sin credenciales del panel admin con datos de ejemplo, para mostrar el producto a reclutadores.', prioridad: 'baja', estado: 'planeado', notas: 'Pendiente de diseño: requiere un dataset de ejemplo separado y bloquear cualquier mutación (POST/PUT/DELETE) a nivel de middleware.' },
    ],
  },
  {
    id: 'auth',
    nombre: 'Autenticación y sesiones',
    items: [
      { id: 'RF-101', titulo: 'Login con GitHub OAuth', descripcion: 'El administrador inicia sesión con su cuenta de GitHub; solo los logins en la allowlist obtienen acceso.', prioridad: 'alta', estado: 'implementado', origen: 'auth.config.ts, src/lib/auth.ts', verificacion: 'Probado manualmente contra la cuenta real de GitHub; login fuera de la allowlist se verifica que sea rechazado.', notas: 'Fase reciente añadió login sin contraseña vía WebAuthn/FIDO2 como alternativa; la allowlist sigue siendo la única fuente de autorización.', relacionados: ['RF-102', 'RNF-02', 'CU-04'] },
      { id: 'RF-102', titulo: 'Protección de rutas /admin', descripcion: 'Todas las rutas /admin y /api/admin exigen sesión válida; sin sesión, redirige a login.', prioridad: 'alta', estado: 'implementado', origen: 'src/middleware.ts', verificacion: 'Test de integración del middleware que golpea rutas /admin sin cookie de sesión y espera redirect.', relacionados: ['RF-101', 'RNF-02'] },
      { id: 'RF-103', titulo: 'Gestión de dispositivos/sesiones', descripcion: 'El administrador ve las sesiones activas por dispositivo (IP, user-agent, última actividad) y puede revocarlas.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/admin/sessions.astro, admin_sessions', verificacion: 'Revisión manual: revocar una sesión desde el panel y confirmar que ese dispositivo pierde acceso en el siguiente request.' },
      { id: 'RF-104', titulo: 'Cierre de sesión', descripcion: 'El administrador puede cerrar su sesión desde cualquier página del panel.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/api/auth', verificacion: 'Revisión manual: logout limpia la cookie de sesión y la siguiente visita a /admin redirige a login.' },
    ],
  },
  {
    id: 'crm',
    nombre: 'CRM (proyectos, clientes, seguimiento)',
    items: [
      { id: 'RF-201', titulo: 'Gestión de proyectos', descripcion: 'Alta, edición y archivo de proyectos con estado, fechas, stack, cliente asociado y visibilidad pública.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/admin/projects, projects', verificacion: 'Test de la API POST /api/admin/projects (400 sin slug/title); revisión manual del ciclo alta→edición→archivo.', relacionados: ['CU-06'] },
      { id: 'RF-202', titulo: 'Gestión de clientes', descripcion: 'Alta y edición de clientes con datos de contacto y notas internas.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/admin/clients.astro, clients', verificacion: 'Revisión manual del formulario de alta/edición.' },
      { id: 'RF-203', titulo: 'Bandeja de mensajes', descripcion: 'El administrador ve, marca como leídos y responde mensajes recibidos por el formulario público.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/admin/messages.astro, messages', verificacion: 'Revisión manual: enviar un mensaje desde el formulario público y confirmar que aparece en la bandeja.', relacionados: ['RF-003'] },
      { id: 'RF-204', titulo: 'Seguimiento comercial (interacciones)', descripcion: 'Registro de llamadas, reuniones, notas y tareas pendientes por cliente/proyecto, con recordatorios (nextAction/dueDate).', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/admin/seguimiento.astro, interactions', verificacion: 'Revisión manual del ciclo crear→marcar como resuelta (done/doneAt) en /admin/seguimiento.', relacionados: ['CU-06'] },
      { id: 'RF-205', titulo: 'Briefings de cliente', descripcion: 'Documento de alcance por proyecto con objetivo, presupuesto estimado/acordado, horas e ítems (requerimiento/entregable/exclusión).', prioridad: 'media', estado: 'implementado', origen: 'src/pages/admin/briefings, briefings, briefing_items', verificacion: 'Revisión manual creando un briefing completo con ítems de los tres tipos.', relacionados: ['CU-07'] },
      { id: 'RF-206', titulo: 'Contactos por proyecto', descripcion: 'Registro de contactos (cliente, PM, dev, QA, diseño) asociados a un proyecto.', prioridad: 'baja', estado: 'implementado', origen: 'project_contacts', verificacion: 'Revisión manual desde el detalle de proyecto.' },
      { id: 'RF-207', titulo: 'Decisiones de arquitectura (ADRs)', descripcion: 'Registro de decisiones técnicas por proyecto con contexto, decisión, justificación y alternativas consideradas; opcionalmente públicas.', prioridad: 'media', estado: 'implementado', origen: 'project_adrs', verificacion: 'Revisión manual del flag isPublic reflejándose en la vitrina pública del proyecto.', relacionados: ['RNF-15', 'CU-06'] },
      { id: 'RF-208', titulo: 'Presentaciones (slides) para cliente', descripcion: 'Creación de presentaciones ligadas a un proyecto con control remoto de avance de diapositivas en tiempo real.', prioridad: 'baja', estado: 'implementado', origen: 'src/pages/admin/slides, src/pages/present/[token], presentations', verificacion: 'Prueba manual con dos pestañas: control del administrador y vista pública del cliente en /present/[shareToken], confirmando sincronización.', notas: 'Sincronización por polling corto sobre HTTP, no WebSockets; suficiente para el caso de uso pero con latencia de hasta un ciclo de polling. La vista del cliente vive en /present/[shareToken] (pública, protegida solo por el token), separada de /admin/slides/[id]/present (previsualización del propio administrador, tras sesión). Las mutaciones (crear presentación, avanzar slide, subir slides) quedaron bajo /api/admin/slides/* tras corregir que no tenían gate de sesión.', relacionados: ['CU-16'] },
    ],
  },
  {
    id: 'finanzas',
    nombre: 'Finanzas',
    items: [
      { id: 'RF-301', titulo: 'Registro de ingresos', descripcion: 'Alta de cobros por proyecto/cliente con estado (cobrado/pendiente/proyectado) y fecha de vencimiento.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/admin/finances.astro, finances', verificacion: 'Revisión manual del ciclo proyectado→pendiente→cobrado.', relacionados: ['RF-302', 'CU-08'] },
      { id: 'RF-302', titulo: 'Costos y P&L por proyecto', descripcion: 'Registro de costos de servicios (hosting, dominio, DB, etc.) con quién paga y cuánto se le factura al cliente, para calcular la rentabilidad real.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/admin/costs.astro, project_services, src/lib/pnl.ts', verificacion: 'Revisión manual del cálculo de projectPnL() contra costos e ingresos conocidos de un proyecto real.', notas: 'Costos en moneda sin tasa de cambio configurada se excluyen del total y se marcan como advertencia en vez de fallar el cálculo.', relacionados: ['RF-301', 'RF-303', 'CU-08'] },
      { id: 'RF-303', titulo: 'Bóveda cifrada de credenciales', descripcion: 'Secrets de servicios (API keys, tokens) cifrados con AES-256-GCM en reposo, revelados on-demand vía fetch autenticado.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/crypto.ts, project_services.secrets', verificacion: 'Revisión manual: inspección directa de la base de datos confirma que el valor almacenado no es texto plano.', notas: 'Requiere ENCRYPTION_KEY configurada; sin ella, la API de guardado de credenciales responde 500 en vez de guardar en claro.', relacionados: ['RNF-01'] },
      { id: 'RF-304', titulo: 'Variables de entorno por proyecto', descripcion: 'Registro cifrado de variables de entorno por ambiente (producción/staging/dev) para cada proyecto gestionado.', prioridad: 'media', estado: 'implementado', origen: 'project_env_vars', verificacion: 'Revisión manual del cifrado en reposo, igual que RF-303.', relacionados: ['RNF-01'] },
      { id: 'RF-305', titulo: 'Alertas de vencimiento de dominios', descripcion: 'Descubrimiento automático de fecha de expiración vía RDAP y alerta por email/push antes del vencimiento.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/admin/domains.astro, src/lib/domains.ts', verificacion: 'Validado en prod contra dominios reales del portfolio; la fecha RDAP se contrasta manualmente con el registrador.', relacionados: ['RF-404'] },
    ],
  },
  {
    id: 'observabilidad',
    nombre: 'Observabilidad',
    items: [
      { id: 'RF-401', titulo: 'Monitoreo de disponibilidad', descripcion: 'Checks HTTP periódicos (cron externo) por servicio, con umbral de latencia degradada y validación de contenido esperado.', prioridad: 'alta', estado: 'implementado', origen: 'monitors, src/pages/api/cron', verificacion: 'Validado en prod: 8 monitores activos con cron-job.org disparando cada ~5 min desde jul 2026.', notas: 'El cron es externo (cron-job.org o Vercel Cron), no un proceso propio; el endpoint exige CRON_SECRET.', relacionados: ['CU-09', 'RF-004'] },
      { id: 'RF-402', titulo: 'Historial de incidentes', descripcion: 'Agrupación automática de caídas consecutivas (primer fallo → primer éxito) con causa y duración.', prioridad: 'alta', estado: 'implementado', origen: 'monitor_incidents', verificacion: 'Verificado con caídas reales y con chaos engineering (RF-503) simulando la caída.', relacionados: ['RF-401', 'RF-503'] },
      { id: 'RF-403', titulo: 'SLO / error budget', descripcion: 'Cálculo de SLI/SLO configurable (objetivo % y ventana en días) por monitor, con presupuesto de error restante.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/admin/lab/slo.astro, src/lib/slo.ts', verificacion: 'Contraste manual del cálculo contra el uptime crudo de monitor_checks para una ventana conocida.', relacionados: ['RNF-09'] },
      { id: 'RF-404', titulo: 'Notificaciones push', descripcion: 'Alertas push (ntfy.sh) ante caídas de monitores, vencimientos de dominio y anomalías de seguridad.', prioridad: 'media', estado: 'implementado', origen: 'src/lib/notify.ts', verificacion: 'Validado en prod tras corregir un bug de emoji en el header HTTP que rompía todas las alertas.', notas: 'El header HTTP de ntfy no soporta emojis directamente en el título; requiere codificarlos aparte.' },
      { id: 'RF-405', titulo: 'Web Vitals (RUM)', descripcion: 'Captura de Core Web Vitals de visitantes reales, sin PII, para calcular p75 públicos.', prioridad: 'baja', estado: 'implementado', origen: 'web_vitals, src/lib/vitals.ts', verificacion: 'Revisión manual de que el payload capturado no incluye IP ni identificadores personales.', relacionados: ['RNF-05', 'RNF-12'] },
      { id: 'RF-406', titulo: 'Certificados TLS', descripcion: 'Verificación periódica de expiración de certificado TLS por monitor con badge de alerta.', prioridad: 'baja', estado: 'implementado', origen: 'monitors.sslExpiresAt', verificacion: 'Validado contra la fecha real de expiración de los certificados de los dominios monitoreados.' },
    ],
  },
  {
    id: 'lab',
    nombre: 'LAB (SENA)',
    items: [
      { id: 'RF-501', titulo: 'Pipeline CI/CD con rollback', descripcion: 'Registro de runs de CI (GitHub Actions) con tests, cobertura, health check post-deploy y rollback automático si falla.', prioridad: 'alta', estado: 'implementado', origen: 'ci_runs, src/pages/admin/lab/pipeline.astro', verificacion: 'Validado provocando un health check fallido intencional y confirmando el rollback automático.', relacionados: ['RNF-08'] },
      { id: 'RF-502', titulo: 'Pasarela de pagos con idempotencia', descripcion: 'Cobros con clave de idempotencia única, máquina de estados sin retrocesos y bitácora de eventos de webhook (incl. duplicados y fuera de orden).', prioridad: 'alta', estado: 'implementado', origen: 'payments, payment_events, src/lib/payments.ts', verificacion: 'Test de integración reenviando el mismo webhook y uno fuera de orden, comprobando que el estado no se corrompe.', relacionados: ['RNF-06', 'RNF-07', 'CU-12'] },
      { id: 'RF-503', titulo: 'Chaos engineering', descripcion: 'Inyección de fallos reales (500, 503, latencia) por ruta con TTL obligatorio y kill-switch de pánico; /admin y /api/auth excluidos por código.', prioridad: 'media', estado: 'implementado', origen: 'chaos_flags, src/lib/chaos.ts', verificacion: 'Validado en LAB activando un flag y confirmando que el monitoreo (RF-401/402) lo detecta como caída real.', notas: 'La exclusión de /admin, /api/admin y /api/auth es por código (hardcoded), no configurable, para evitar auto-sabotaje.', relacionados: ['RF-402', 'CU-13'] },
      { id: 'RF-504', titulo: 'Historial de experimentos', descripcion: 'Bitácora de experimentos del LAB con resultado esperado vs. real, como evidencia para sustentación.', prioridad: 'baja', estado: 'implementado', origen: 'lab_experiments', verificacion: 'Revisión manual del registro tras cada experimento de chaos engineering.' },
      { id: 'RF-505', titulo: 'Pruebas de carga (k6)', descripcion: 'Escenarios de carga automatizados contra endpoints críticos, integrados al pipeline.', prioridad: 'media', estado: 'planeado', notas: 'Fase 5 del plan LAB (docs/plan-lab.md); pendiente junto con SAST/a11y y mutation testing.' },
      { id: 'RF-506', titulo: 'SAST / accesibilidad automatizada', descripcion: 'Análisis estático de seguridad y auditoría de accesibilidad en cada PR.', prioridad: 'media', estado: 'planeado', notas: 'Fase 6 del plan LAB; requiere VERCEL_TOKEN configurado en GitHub Actions.', relacionados: ['RNF-18'] },
      { id: 'RF-507', titulo: 'Mutation testing', descripcion: 'Medición de calidad real de la suite de tests mediante mutantes.', prioridad: 'baja', estado: 'planeado', notas: 'Fase 7 del plan LAB, la última pendiente.' },
    ],
  },
  {
    id: 'seguridad',
    nombre: 'Seguridad (micro-SIEM)',
    items: [
      { id: 'RF-601', titulo: 'Sensor de requests hostiles', descripcion: 'Clasificación de cada request por firmas conocidas (OWASP) de forma síncrona y no bloqueante en el middleware.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/security/sensor.ts, classify.ts', verificacion: 'Test unitario de classify.ts contra payloads de ataque conocidos (path traversal, SQLi, XSS).', notas: 'La escritura del evento es fire-and-forget para no añadir latencia al request real (RNF-11).', relacionados: ['RNF-11', 'CU-14'] },
      { id: 'RF-602', titulo: 'Blocklist de IPs', descripcion: 'Bloqueo (manual o automático) de IPs con TTL obligatorio y respuesta 403 seca; sin bloqueos eternos.', prioridad: 'alta', estado: 'implementado', origen: 'blocked_ips, src/lib/security/blocklist.ts', verificacion: 'Test de integración: IP bloqueada recibe 403, y tras expiresAt vuelve a pasar.', relacionados: ['RNF-04', 'RF-601', 'CU-14'] },
      { id: 'RF-603', titulo: 'Rate limiting durable', descripcion: 'Límite de tasa por clave respaldado en base de datos, que sobrevive a redeploys (reemplaza la implementación en memoria).', prioridad: 'alta', estado: 'implementado', origen: 'rate_limit_buckets, src/lib/security/ratelimit-durable.ts', verificacion: 'Test de integración validando que el contador persiste entre reinicios simulados del proceso.', relacionados: ['RNF-10', 'CU-15'] },
      { id: 'RF-604', titulo: 'Agregación y rollups', descripcion: 'Agregados horarios/diarios de eventos de seguridad por categoría para tendencias y detección de anomalías.', prioridad: 'media', estado: 'implementado', origen: 'security_rollups', verificacion: 'Revisión manual comparando el rollup contra el conteo crudo de security_events de la misma ventana.', relacionados: ['RF-605'] },
      { id: 'RF-605', titulo: 'Detección de anomalías', descripcion: 'Detector estadístico (z-score sobre baseline de 30 días) de picos, patrones nuevos, anomalías geográficas y ráfagas de error.', prioridad: 'media', estado: 'parcial', origen: 'security_anomalies', notas: 'El cálculo de z-score está implementado; falta ajustar sensibilidad con datos reales de producción para reducir falsos positivos.', relacionados: ['RF-604'] },
      { id: 'RF-606', titulo: 'Panel de seguridad consolidado', descripcion: 'Vista en /admin con eventos, anomalías y acciones de respuesta (bloquear IP, marcar revisado).', prioridad: 'media', estado: 'planeado', notas: 'Diseñado en docs/plan-security-observability.md; sin implementar a jul 2026.', relacionados: ['RF-602', 'RF-605'] },
    ],
  },
  {
    id: 'sistema',
    nombre: 'Sistema',
    items: [
      { id: 'RF-701', titulo: 'Backups automáticos', descripcion: 'Snapshot periódico de la base de datos subido a Vercel Blob vía cron, más creación manual desde el panel.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/admin/backup.astro, src/pages/api/cron', verificacion: 'Revisión manual: descargar un backup generado y confirmar que el JSON contiene las tablas de negocio esperadas.', relacionados: ['CU-11'] },
      { id: 'RF-702', titulo: 'Ajustes de la aplicación', descripcion: 'Configuración clave-valor (tasas de cambio, moneda base) editable desde el panel.', prioridad: 'baja', estado: 'implementado', origen: 'app_settings, src/pages/admin/settings.astro', verificacion: 'Revisión manual: cambiar una tasa y confirmar que el P&L (RF-302) la refleja.', relacionados: ['RF-302'] },
      { id: 'RF-703', titulo: 'Documentación de ingeniería', descripcion: 'Requerimientos, casos de uso, diagramas UML y kanban del propio proyecto, navegables desde /docs.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/docs', verificacion: 'Esta misma vista es la evidencia: los datos viven tipados en src/data/documentacion.ts.', relacionados: ['RNF-14', 'CU-18'] },
    ],
  },
]

// ── Requerimientos no funcionales (categorías ISO/IEC 25010) ────────────────
export const REQUISITOS_NO_FUNCIONALES: Modulo[] = [
  {
    id: 'seguridad-rnf',
    nombre: 'Seguridad',
    items: [
      { id: 'RNF-01', titulo: 'Cifrado de secretos en reposo', descripcion: 'Todo secreto de servicio (API keys, tokens) se almacena cifrado con AES-256-GCM; nunca en texto plano en la base de datos.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/crypto.ts', verificacion: 'Inspección directa de la base de datos: el valor almacenado es ciphertext, no el secreto original.', notas: 'La clave de cifrado (ENCRYPTION_KEY) vive fuera del repo, en variables de entorno; sin ella, el guardado de secretos falla en vez de degradar a texto plano.', relacionados: ['RF-303', 'RF-304'] },
      { id: 'RNF-02', titulo: 'Autorización por allowlist', descripcion: 'Solo los logins de GitHub explícitamente permitidos obtienen sesión de administrador, sin excepción.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/auth.ts', verificacion: 'Probado con un login de GitHub real fuera de la allowlist, confirmando el rechazo.', notas: 'La allowlist es la única fuente de autorización; no hay roles ni permisos granulares porque el panel tiene un único administrador.', relacionados: ['RF-101', 'RF-102'] },
      { id: 'RNF-03', titulo: 'Fail-open en enforcement de seguridad', descripcion: 'Cualquier fallo en blocklist, rate limiting o sensor deja pasar el request; el enforcement nunca puede tumbar el sitio.', prioridad: 'alta', estado: 'implementado', origen: 'src/middleware.ts', verificacion: 'Probado simulando un timeout de base de datos en la lectura de blocklist/chaos flags y confirmando que el request pasa igual.', notas: 'Decisión deliberada: un bug propio en el motor de seguridad no debe convertirse en una autocaída del sitio.', relacionados: ['RF-602', 'RF-503'] },
      { id: 'RNF-04', titulo: 'Sin bloqueos eternos', descripcion: 'Todo bloqueo de IP y todo chaos flag tiene TTL obligatorio; el sistema se autocorrige sin intervención manual.', prioridad: 'media', estado: 'implementado', origen: 'blocked_ips.expiresAt, chaos_flags.expiresAt', verificacion: 'Validado esperando el TTL de un bloqueo de prueba y confirmando que expira solo.', relacionados: ['RF-602', 'RF-503'] },
      { id: 'RNF-05', titulo: 'Minimización de PII en la vitrina pública', descripcion: 'La IP se enmascara/hashea antes de exponerse fuera del panel admin; Web Vitals no capturan datos personales.', prioridad: 'media', estado: 'implementado', origen: 'security_events.ipHash', verificacion: 'Revisión manual del payload de Web Vitals y de las vistas públicas confirmando ausencia de IP en claro.', relacionados: ['RF-405'] },
    ],
  },
  {
    id: 'confiabilidad',
    nombre: 'Confiabilidad y disponibilidad',
    items: [
      { id: 'RNF-06', titulo: 'Idempotencia de pagos', descripcion: 'Un mismo idempotencyKey nunca genera dos cobros, incluso ante doble clic o reintento de red.', prioridad: 'alta', estado: 'implementado', origen: 'payments.idempotencyKey', verificacion: 'Test de integración enviando dos requests de cobro con la misma key y confirmando un solo payment creado.', relacionados: ['RF-502', 'CU-12'] },
      { id: 'RNF-07', titulo: 'Máquina de estados sin retrocesos', descripcion: 'Los estados terminales de un pago (approved/declined/error/voided) nunca retroceden ante webhooks fuera de orden.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/payments.ts', verificacion: 'Test enviando un webhook "pending" después de uno "approved" y confirmando que el estado terminal se conserva (outOfOrder=true).', relacionados: ['RF-502', 'CU-12'] },
      { id: 'RNF-08', titulo: 'Rollback automático de deploy', descripcion: 'Si el health check post-deploy falla, el pipeline revierte automáticamente a la última versión saludable.', prioridad: 'alta', estado: 'implementado', origen: 'ci_runs.healthOk', verificacion: 'Validado en el LAB forzando un health check fallido y observando el rollback en ci_runs.', relacionados: ['RF-501'] },
      { id: 'RNF-09', titulo: 'Objetivo de disponibilidad (SLO)', descripcion: 'Cada servicio monitoreado puede evaluarse contra un objetivo configurable (por defecto 99.5% en ventana de 30 días).', prioridad: 'media', estado: 'implementado', origen: 'src/lib/slo.ts', verificacion: 'Contraste manual del error budget calculado contra el uptime real de un monitor en producción.', relacionados: ['RF-403'] },
      { id: 'RNF-10', titulo: 'Rate limiting resistente a redeploys', descripcion: 'El estado del limitador de tasa persiste en base de datos, no se resetea con cada despliegue.', prioridad: 'media', estado: 'implementado', origen: 'rate_limit_buckets', verificacion: 'Validado comparando el conteo antes/después de un redeploy en producción.', notas: 'Reemplazó una implementación previa en memoria que perdía el estado en cada redeploy de Vercel.', relacionados: ['RF-603'] },
    ],
  },
  {
    id: 'rendimiento',
    nombre: 'Eficiencia de desempeño',
    items: [
      { id: 'RNF-11', titulo: 'Latencia del sensor de seguridad', descripcion: 'La clasificación de cada request (regex/lookup en memoria) no debe añadir latencia perceptible; la escritura es fire-and-forget.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/security/sensor.ts', verificacion: 'Medición manual de tiempos de respuesta con y sin el sensor activo; sin diferencia perceptible.', relacionados: ['RF-601'] },
      { id: 'RNF-12', titulo: 'Core Web Vitals dentro de "good"', descripcion: 'LCP, INP y CLS del sitio público deben mantenerse en la banda "good" según el p75 medido en producción.', prioridad: 'media', estado: 'parcial', origen: 'web_vitals', notas: 'La captura RUM (RF-405) ya está en producción; falta consolidar el p75 histórico como badge visible y accionar sobre páginas que no cumplan.', relacionados: ['RF-405'] },
      { id: 'RNF-13', titulo: 'Cache de lecturas frecuentes', descripcion: 'Blocklist y flags de chaos se leen con cache en memoria (30s) para no golpear la base de datos en cada request.', prioridad: 'media', estado: 'implementado', origen: 'src/lib/security/blocklist.ts', verificacion: 'Revisión de logs de queries confirmando que no hay una consulta a blocklist por cada request.', relacionados: ['RF-602', 'RF-503'] },
    ],
  },
  {
    id: 'mantenibilidad',
    nombre: 'Mantenibilidad',
    items: [
      { id: 'RNF-14', titulo: 'Datos de documentación como código', descripcion: 'Requerimientos, casos de uso e iteraciones se definen en TypeScript tipado, no en documentos externos desincronizables.', prioridad: 'media', estado: 'implementado', origen: 'src/data/documentacion.ts', verificacion: 'Verificado por el propio compilador: cualquier campo faltante o mal tipado rompe `astro check`.', relacionados: ['RF-703'] },
      { id: 'RNF-15', titulo: 'Registro de decisiones de arquitectura', descripcion: 'Cada decisión técnica relevante por proyecto queda documentada con contexto, alternativas y consecuencias (ADR).', prioridad: 'media', estado: 'implementado', origen: 'project_adrs', verificacion: 'Revisión manual del ADR más reciente de un proyecto activo.', relacionados: ['RF-207'] },
      { id: 'RNF-16', titulo: 'Retención y purga de datos operativos', descripcion: 'Los checks de monitoreo y eventos de seguridad crudos se purgan pasados 90 días para no inflar el almacenamiento.', prioridad: 'baja', estado: 'implementado', origen: 'monitor_checks, security_events', verificacion: 'Revisión del job de purga y del volumen de la tabla antes/después de su ejecución.', notas: 'Los rollups agregados (RF-604) sobreviven la purga; solo se elimina el detalle crudo, para conservar tendencias históricas sin el peso de cada evento individual.', relacionados: ['RF-604'] },
    ],
  },
  {
    id: 'usabilidad',
    nombre: 'Usabilidad y accesibilidad',
    items: [
      { id: 'RNF-17', titulo: 'Panel operable desde móvil', descripcion: 'El panel admin y sus subpáginas son usables en viewport móvil (drawer de navegación colapsable).', prioridad: 'media', estado: 'implementado', origen: 'src/layouts/AdminLayout.astro', verificacion: 'Probado manualmente en viewport móvil real (el administrador opera el panel desde el celular para acciones rápidas).' },
      { id: 'RNF-18', titulo: 'Auditoría de accesibilidad automatizada', descripcion: 'Cada PR corre una auditoría automática de accesibilidad (axe/lighthouse) sobre las páginas públicas.', prioridad: 'media', estado: 'planeado', notas: 'Fase 6 del plan LAB (docs/plan-lab.md), junto con SAST.', relacionados: ['RF-506'] },
    ],
  },
]

// ── Actores ──────────────────────────────────────────────────────────────────
export interface Actor {
  id: string
  nombre: string
  descripcion: string
}

export const ACTORES: Actor[] = [
  { id: 'visitante', nombre: 'Visitante público', descripcion: 'Cualquier persona que navega el sitio público sin autenticarse: recluta, cliente potencial, buscador.' },
  { id: 'admin', nombre: 'Administrador (Mike)', descripcion: 'Único usuario con acceso al panel /admin, autenticado con GitHub OAuth vía allowlist.' },
  { id: 'cliente', nombre: 'Cliente', descripcion: 'Persona de negocio de un proyecto gestionado; interactúa vía formulario de contacto o presentaciones compartidas.' },
  { id: 'cron', nombre: 'Cron externo (cron-job.org / Vercel Cron)', descripcion: 'Disparador automático periódico que golpea endpoints de sondeo, backup y rollups.' },
  { id: 'gateway', nombre: 'Pasarela de pagos (Wompi)', descripcion: 'Sistema externo que envía webhooks de eventos de pago.' },
  { id: 'buscador', nombre: 'Buscador (Google/Bing)', descripcion: 'Rastreador que consume sitemap, RSS y recibe notificaciones IndexNow.' },
]

// ── Casos de uso ──────────────────────────────────────────────────────────────
export interface NodoRelacionadoCU {
  id: string
  nombre: string
}
export interface RelacionCU {
  tipo: 'include' | 'extends'
  nodo: NodoRelacionadoCU
  despues?: string // id del nodo previo en la cadena de <<include>>; por defecto, el propio caso de uso
}
export interface CasoDeUso {
  id: string
  nombre: string
  actor: string // id de ACTORES
  rf: string[] // ids de requerimientos funcionales relacionados
  resumen: string
  relaciones?: RelacionCU[] // <<include>>/<<extends>> hacia otros casos de uso o pasos compartidos
}

export const CASOS_DE_USO: CasoDeUso[] = [
  { id: 'CU-01', nombre: 'Explorar proyectos públicos', actor: 'visitante', rf: ['RF-001', 'RF-002'], resumen: 'El visitante navega el listado de proyectos y entra al detalle de uno.' },
  { id: 'CU-02', nombre: 'Enviar mensaje de contacto', actor: 'visitante', rf: ['RF-003'], resumen: 'El visitante completa el formulario de contacto y el mensaje queda en la bandeja del CRM.' },
  { id: 'CU-03', nombre: 'Consultar estado del sistema', actor: 'visitante', rf: ['RF-004'], resumen: 'El visitante revisa uptime, incidentes activos y latencia en tiempo real de los servicios.' },
  { id: 'CU-04', nombre: 'Iniciar sesión como administrador', actor: 'admin', rf: ['RF-101', 'RF-102'], resumen: 'El administrador se autentica con GitHub y accede al panel si su login está en la allowlist.', relaciones: [
    { tipo: 'extends', nodo: { id: 'CU-04-X1', nombre: 'Rechazar login fuera de la allowlist' } },
  ] },
  { id: 'CU-05', nombre: 'Gestionar sesiones de dispositivo', actor: 'admin', rf: ['RF-103'], resumen: 'El administrador revisa dispositivos con sesión activa y revoca los que no reconoce.' },
  { id: 'CU-06', nombre: 'Registrar y dar seguimiento a un proyecto', actor: 'admin', rf: ['RF-201', 'RF-204', 'RF-207'], resumen: 'El administrador crea un proyecto, registra interacciones de seguimiento y documenta decisiones de arquitectura.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-06-N1', nombre: 'Registrar interacción de seguimiento' } },
    { tipo: 'include', nodo: { id: 'CU-06-N2', nombre: 'Documentar decisión de arquitectura (ADR)' }, despues: 'CU-06-N1' },
    { tipo: 'extends', nodo: { id: 'CU-06-X1', nombre: 'Publicar ADR en vitrina pública' } },
  ] },
  { id: 'CU-07', nombre: 'Elaborar un briefing de cliente', actor: 'admin', rf: ['RF-205'], resumen: 'El administrador documenta objetivo, alcance, presupuesto e ítems de un proyecto antes de iniciarlo.' },
  { id: 'CU-08', nombre: 'Registrar costos y calcular P&L', actor: 'admin', rf: ['RF-302', 'RF-303'], resumen: 'El administrador registra el costo de un servicio, quién lo paga y cuánto se factura al cliente.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-08-N1', nombre: 'Calcular P&L del proyecto' } },
    { tipo: 'extends', nodo: { id: 'CU-08-X1', nombre: 'Excluir costo sin tasa de cambio' } },
  ] },
  { id: 'CU-09', nombre: 'Recibir alerta de monitor caído', actor: 'cron', rf: ['RF-401', 'RF-402', 'RF-404'], resumen: 'El cron externo dispara el chequeo, detecta una caída, abre un incidente y notifica por push.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-09-N1', nombre: 'Abrir incidente' } },
    { tipo: 'include', nodo: { id: 'CU-09-N2', nombre: 'Notificar caída por push' }, despues: 'CU-09-N1' },
    { tipo: 'extends', nodo: { id: 'CU-09-X1', nombre: 'Cerrar incidente por recuperación' } },
    { tipo: 'extends', nodo: { id: 'CU-09-X2', nombre: 'Marcar degradación por latencia' } },
  ] },
  { id: 'CU-10', nombre: 'Evaluar SLO de un servicio', actor: 'admin', rf: ['RF-403'], resumen: 'El administrador define objetivo y ventana, y consulta el presupuesto de error restante de un monitor.' },
  { id: 'CU-11', nombre: 'Ejecutar backup manual', actor: 'admin', rf: ['RF-701'], resumen: 'El administrador dispara un backup de la base de datos hacia Blob storage desde el panel.', relaciones: [
    { tipo: 'extends', nodo: { id: 'CU-11-X1', nombre: 'Backup automático por cron' } },
  ] },
  { id: 'CU-12', nombre: 'Procesar un pago con idempotencia', actor: 'gateway', rf: ['RF-502'], resumen: 'La pasarela envía un webhook de pago; el sistema aplica el evento respetando idempotencia y orden.', relaciones: [
    { tipo: 'extends', nodo: { id: 'CU-12-X1', nombre: 'Registrar evento duplicado' } },
    { tipo: 'extends', nodo: { id: 'CU-12-X2', nombre: 'Registrar evento fuera de orden' } },
  ] },
  { id: 'CU-13', nombre: 'Inyectar un fallo de chaos engineering', actor: 'admin', rf: ['RF-503'], resumen: 'El administrador activa un flag de fallo temporal en una ruta y observa cómo el monitoreo lo detecta.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-13-N1', nombre: 'Aplicar fallo simulado en middleware' } },
    { tipo: 'extends', nodo: { id: 'CU-13-X1', nombre: 'Desactivar todos los flags (botón de pánico)' } },
  ] },
  { id: 'CU-14', nombre: 'Bloquear una IP maliciosa', actor: 'admin', rf: ['RF-601', 'RF-602'], resumen: 'El sensor clasifica un request hostil; el administrador (o el auto-block) añade la IP a la blocklist con TTL.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-14-N1', nombre: 'Registrar evento de seguridad' } },
    { tipo: 'extends', nodo: { id: 'CU-14-X1', nombre: 'Bloquear IP manualmente' } },
  ] },
  { id: 'CU-15', nombre: 'Aplicar rate limiting durable', actor: 'admin', rf: ['RF-603'], resumen: 'Un cliente excede el límite de requests permitido; el sistema lo limita usando el estado persistido en base de datos.' },
  { id: 'CU-16', nombre: 'Presentar un proyecto a un cliente', actor: 'cliente', rf: ['RF-208'], resumen: 'El administrador controla remotamente el avance de una presentación que el cliente ve en su navegador.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-16-N1', nombre: 'Sincronizar slide vía polling' } },
  ] },
  { id: 'CU-17', nombre: 'Indexar contenido nuevo en buscadores', actor: 'buscador', rf: ['RF-007'], resumen: 'Al publicar contenido, el sistema notifica vía IndexNow y actualiza el RSS/sitemap para acelerar la indexación.' },
  { id: 'CU-18', nombre: 'Consultar documentación del proyecto', actor: 'admin', rf: ['RF-703'], resumen: 'El administrador navega /docs para revisar requerimientos, casos de uso, diagramas y el kanban del propio portfolio.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-18-N1', nombre: 'Navegar subpágina de documentación' } },
    { tipo: 'extends', nodo: { id: 'CU-18-X1', nombre: 'Consultar diagrama Mermaid' } },
  ] },
]

// ── Casos de uso extendidos ───────────────────────────────────────────────────
export interface CasoDeUsoExtendido {
  id: string // referencia a CASOS_DE_USO
  precondiciones: string[]
  flujoPrincipal: string[]
  flujosAlternos: { titulo: string; pasos: string[] }[]
  excepciones: string[]
  postcondiciones: string[]
}

export const CASOS_DE_USO_EXTENDIDOS: CasoDeUsoExtendido[] = [
  {
    id: 'CU-04',
    precondiciones: ['El administrador tiene una cuenta de GitHub válida.', 'Su login está registrado en la allowlist de src/lib/auth.ts.'],
    flujoPrincipal: [
      'El administrador visita /admin sin sesión activa.',
      'El middleware detecta ausencia de sesión y redirige a /api/auth/signin.',
      'El administrador autoriza la app OAuth de GitHub.',
      'Auth.js valida el login contra la allowlist.',
      'Se emite un JWT de sesión y se registra el dispositivo en admin_sessions.',
      'El administrador es redirigido al panel /admin.',
    ],
    flujosAlternos: [
      { titulo: 'Login no autorizado', pasos: ['GitHub autentica correctamente pero el login no está en la allowlist.', 'Auth.js rechaza la sesión y muestra error de acceso denegado.'] },
    ],
    excepciones: ['GitHub OAuth no disponible: el login falla con mensaje de error genérico, sin exponer detalles internos.'],
    postcondiciones: ['El administrador tiene una sesión JWT activa y un registro en admin_sessions con IP y user-agent.'],
  },
  {
    id: 'CU-09',
    precondiciones: ['Existe un monitor activo y no pausado en la tabla monitors.', 'El cron externo tiene configurado el CRON_SECRET válido.'],
    flujoPrincipal: [
      'El cron externo llama a /api/cron/uptime-check con el secreto.',
      'El sistema itera los monitores activos y hace la petición HTTP configurada (método, texto esperado, umbral de latencia).',
      'La respuesta falla (status inesperado, timeout o texto ausente).',
      'Se inserta un monitor_check con ok=false.',
      'Si es el primer fallo consecutivo, se abre un monitor_incidents con startedAt.',
      'Se actualiza monitors.lastStatus a "down" y se dispara una notificación push (ntfy).',
    ],
    flujosAlternos: [
      { titulo: 'Recuperación', pasos: ['Un chequeo posterior tiene éxito.', 'Se cierra el incidente abierto con resolvedAt y durationSec.', 'Se notifica la recuperación.'] },
      { titulo: 'Degradación por latencia', pasos: ['La respuesta es exitosa pero supera latencyThresholdMs.', 'lastStatus pasa a "degraded" sin abrir incidente.'] },
    ],
    excepciones: ['El endpoint del monitor no responde en absoluto (timeout de red): se registra como fallo con error de timeout.'],
    postcondiciones: ['El estado materializado del monitor refleja el último chequeo; el historial permite reconstruir el SLO.'],
  },
  {
    id: 'CU-12',
    precondiciones: ['Existe un payment en estado created o pending con un idempotencyKey único.'],
    flujoPrincipal: [
      'La pasarela (Wompi) envía un webhook con el resultado de la transacción.',
      'El sistema busca el payment por reference/gatewayTxId.',
      'Se registra el evento crudo en payment_events (incluyendo si es duplicado o fuera de orden).',
      'Si el evento es válido y en orden, se aplica la transición de estado (created→pending→approved/declined).',
      'Se responde 200 a la pasarela para confirmar recepción.',
    ],
    flujosAlternos: [
      { titulo: 'Evento duplicado', pasos: ['El gatewayTxId ya fue procesado.', 'Se marca duplicate=true en payment_events.', 'No se modifica el estado del payment.'] },
      { titulo: 'Evento fuera de orden', pasos: ['Llega un evento "pending" después de uno "approved".', 'Se marca outOfOrder=true.', 'El estado terminal previo se conserva (nunca retrocede).'] },
    ],
    excepciones: ['El monto del evento no coincide con el del payment: se marca amountMismatch=true y se genera una alerta; el evento nunca se aplica.'],
    postcondiciones: ['El estado del payment refleja fielmente la transacción real, con bitácora completa auditable para sustentación.'],
  },
  {
    id: 'CU-14',
    precondiciones: ['El sensor de seguridad (sensor.ts) está observando requests entrantes.'],
    flujoPrincipal: [
      'Llega un request al middleware.',
      'observeRequest clasifica el request contra las firmas conocidas (classify.ts).',
      'Se detecta una firma de severidad alta/crítica (p. ej. intento de path traversal).',
      'Se registra un security_events con category, severity y ruleId.',
      'El cron de auto-block evalúa la reincidencia de esa IP y decide bloquearla con TTL escalonado (1h → 24h → 7d).',
      'La IP queda en blocked_ips con expiresAt obligatorio.',
    ],
    flujosAlternos: [
      { titulo: 'Bloqueo manual', pasos: ['El administrador revisa un evento en el panel y decide bloquear la IP manualmente.', 'Se inserta en blocked_ips con source=manual.'] },
    ],
    excepciones: ['La lectura de blocklist falla (timeout de DB): el middleware falla abierto y deja pasar el request (nunca bloquea por error interno).'],
    postcondiciones: ['Requests posteriores de esa IP reciben 403 seco hasta que expire el bloqueo.'],
  },
  {
    id: 'CU-18',
    precondiciones: ['El administrador tiene sesión activa en /admin.'],
    flujoPrincipal: [
      'El administrador hace clic en "Documentación" en la sidebar.',
      'Se muestra el hub /docs con visión general, alcance y mapa de subpáginas.',
      'El administrador navega a una subpágina (RF, RNF, CU, diagramas o kanban) usando DocsNav.',
      'La página renderiza el contenido desde src/data/documentacion.ts o src/data/iteraciones-portfolio.ts.',
    ],
    flujosAlternos: [
      { titulo: 'Consulta de diagrama', pasos: ['El administrador entra a una página de diagrama (secuencia/componentes/clases).', 'El navegador renderiza el diagrama Mermaid desde el texto embebido en la página.'] },
    ],
    excepciones: [],
    postcondiciones: ['El administrador cuenta con la documentación de ingeniería completa del proyecto sin salir del panel.'],
  },
  {
    id: 'CU-06',
    precondiciones: ['El administrador tiene sesión activa.', 'Opcionalmente existe un cliente en la tabla clients al que asociar el proyecto.'],
    flujoPrincipal: [
      'El administrador crea el proyecto desde /admin/projects con POST /api/admin/projects (requiere slug y title), quedando en estado "activo" y no visible al público.',
      'Registra una interacción de seguimiento (llamada, reunión, tarea) con POST /api/admin/interactions, insertando en la tabla interactions con tipo, título, cuerpo y próxima acción.',
      'Marca la interacción como resuelta con PUT /api/admin/interactions (done, doneAt).',
      'Documenta una decisión de arquitectura con POST /api/admin/projects/[id]/adrs, insertando en project_adrs (contexto, decisión, justificación, estado).',
      'Opcionalmente marca el ADR como isPublic para exponerlo en la vitrina pública del proyecto.',
    ],
    flujosAlternos: [
      { titulo: 'Actualizar estado del proyecto', pasos: ['El administrador cambia el estado con PUT /api/admin/projects/[id] a pausado, completado o archivado.'] },
      { titulo: 'Editar o borrar un ADR', pasos: ['El administrador corrige o elimina una decisión previa vía PUT/DELETE sobre project_adrs.'] },
    ],
    excepciones: ['El POST de creación llega sin slug o title: la API responde 400 sin tocar la base de datos.'],
    postcondiciones: ['El proyecto queda con un historial trazable de interacciones y decisiones arquitectónicas en interactions y project_adrs.'],
  },
  {
    id: 'CU-08',
    precondiciones: ['El proyecto existe.', 'ENCRYPTION_KEY está configurada si el costo incluye credenciales cifradas.', 'Existen tasas de cambio en app_settings para costos que no están en USD.'],
    flujoPrincipal: [
      'El administrador registra un servicio o costo (ciclo de facturación, moneda, quién paga y a quién se factura) insertando en project_services.',
      'Registra el ingreso cobrado o pendiente en la tabla finances.',
      'La vista del proyecto invoca projectPnL() (src/lib/pnl.ts) con los servicios, las finanzas y las tasas de cambio.',
      'projectPnL calcula el costo mensual equivalente en USD por servicio y lo proyecta desde la fecha de inicio del proyecto.',
      'Se obtiene el margen estimado restando el costo acumulado a los ingresos cobrados.',
      'El panel muestra ingresos, costo mensual/anual, costo acumulado y margen, coloreado según sea positivo o negativo.',
    ],
    flujosAlternos: [
      { titulo: 'Editar o eliminar un servicio', pasos: ['El administrador ajusta o borra un costo; el P&L se recalcula en el siguiente render, sin job asíncrono.'] },
      { titulo: 'Costo sin tasa de cambio', pasos: ['Un costo en moneda sin tasa configurada se excluye del total y se muestra como advertencia con link a /admin/settings.'] },
    ],
    excepciones: ['Falta ENCRYPTION_KEY al guardar credenciales de un servicio: la API responde 500 pidiendo configurar la clave de cifrado.'],
    postcondiciones: ['El P&L del proyecto refleja el nuevo costo o ingreso desde el siguiente GET del detalle, sin desfase.'],
  },
  {
    id: 'CU-11',
    precondiciones: ['El administrador tiene sesión activa (o, en el modo automático, el cron externo dispone del CRON_SECRET).', 'Vercel Blob está habilitado en el proyecto.'],
    flujoPrincipal: [
      'El administrador dispara el backup manual desde /admin/backup.',
      'runBackup() consulta en paralelo las tablas de negocio (clients, projects, messages, finances, projectServices, projectAdrs, briefings, entre otras).',
      'Arma un dump JSON con metadatos de versión y fecha, más el contenido de cada tabla.',
      'Sube el dump a Vercel Blob como backups/portfolio-{fecha}-{timestamp}.json con acceso privado.',
      'Devuelve al panel la URL, el tamaño y el pathname del backup generado.',
      'El panel lista los últimos 30 backups ordenados por fecha para verificación visual.',
    ],
    flujosAlternos: [
      { titulo: 'Backup automático por cron', pasos: ['Vercel Cron llama al mismo endpoint con el CRON_SECRET en lugar de sesión de administrador, ejecutando runBackup() sin intervención manual.'] },
      { titulo: 'Consultar historial sin ejecutar', pasos: ['El administrador solo lista los backups existentes, sin generar uno nuevo.'] },
    ],
    excepciones: ['Falla la conexión a la base de datos durante el respaldo: el endpoint responde 500 y el fallo queda registrado en logs, sin generar un blob parcial.'],
    postcondiciones: ['Queda un archivo JSON inmutable en Vercel Blob con una fotografía completa de las tablas de negocio en ese momento.'],
  },
  {
    id: 'CU-13',
    precondiciones: ['El administrador tiene sesión activa.', 'La ruta objetivo no pertenece a /admin, /api/admin ni /api/auth (protegidas contra auto-sabotaje).'],
    flujoPrincipal: [
      'El administrador crea un flag de chaos desde /admin/lab/chaos, indicando tipo (latencia, error 500 o caída de servicio), ruta objetivo y TTL.',
      'El sistema valida el tipo y la ruta, aplica topes de seguridad (latencia máxima y TTL máximo) y calcula la expiración.',
      'El flag se inserta activo en la tabla chaos_flags y se invalida la caché para que aplique de inmediato.',
      'En cada request, el middleware evalúa los flags activos (con caché corta) y busca una coincidencia con la ruta solicitada.',
      'Si coincide, aplica el fallo simulado: introduce latencia, o responde error 500/503 con un header que identifica que es chaos.',
      'El chequeo de uptime del cron detecta la caída simulada en su siguiente sondeo, igual que detectaría una caída real.',
    ],
    flujosAlternos: [
      { titulo: 'Expiración natural', pasos: ['Al vencer el TTL, el flag deja de aplicarse automáticamente, sin que el administrador tenga que desactivarlo.'] },
      { titulo: 'Botón de pánico', pasos: ['El administrador desactiva todos los flags activos de una sola vez desde el panel.'] },
    ],
    excepciones: ['Si la lectura de flags falla por un problema de base de datos, el middleware falla abierto: el request pasa limpio y nunca se cae el sitio real por un error del propio motor de caos.'],
    postcondiciones: ['Las rutas coincidentes sufren el fallo simulado hasta que el flag expira o se apaga manualmente, permitiendo validar que el monitoreo lo detecta.'],
  },
  {
    id: 'CU-16',
    precondiciones: ['Existe una presentación creada para el proyecto con al menos un slide subido.'],
    flujoPrincipal: [
      'El administrador crea la presentación, que queda identificada con un token de acceso aleatorio y arranca en el primer slide.',
      'Sube las imágenes de los slides, asociadas a la presentación en orden.',
      'Comparte con el cliente el enlace de vista (/present/[shareToken]), que este abre en su navegador en pantalla completa sin necesidad de ninguna sesión.',
      'La vista del cliente consulta /api/present/[shareToken]/state cada fracción de segundo (polling corto sobre HTTP).',
      'El administrador controla el avance desde otra pestaña o su celular, avanzando o retrocediendo slides.',
      'Cada acción de control actualiza el slide actual persistido en base de datos.',
      'En el siguiente ciclo de polling, la vista del cliente detecta el cambio y hace la transición al nuevo slide.',
    ],
    flujosAlternos: [
      { titulo: 'Agregar slides en vivo', pasos: ['El administrador sube un slide nuevo mientras la presentación está en curso; la vista del cliente lo incorpora sin recargar la página.'] },
      { titulo: 'Navegación directa', pasos: ['El administrador salta a un slide específico desde la grilla de miniaturas, en lugar de avanzar de a uno.'] },
    ],
    excepciones: ['Si la presentación consultada no existe, la vista del cliente ignora la respuesta fallida y sigue reintentando sin romper la interfaz.'],
    postcondiciones: ['El slide actual queda sincronizado entre el control del administrador y la vista del cliente mediante estado persistido, sin necesidad de una conexión en tiempo real (WebSockets).'],
  },
]
