import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const clients = sqliteTable('clients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email'),
  company: text('company'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  techStack: text('tech_stack'),
  repoUrl: text('repo_url'),
  previewUrl: text('preview_url'),
  screenshotUrl: text('screenshot_url'),
  visible: integer('visible', { mode: 'boolean' }).default(false),
  status: text('status', { enum: ['activo', 'pausado', 'completado', 'archivado'] }).default('activo'),
  startDate: integer('start_date', { mode: 'timestamp' }),
  endDate: integer('end_date', { mode: 'timestamp' }),
  internalNotes: text('internal_notes'),
  clientId: integer('client_id').references(() => clients.id),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  read: integer('read', { mode: 'boolean' }).default(false),
  clientId: integer('client_id').references(() => clients.id),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

export const finances = sqliteTable('finances', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id),
  clientId: integer('client_id').references(() => clients.id),
  description: text('description'),
  amount: real('amount').notNull(),
  status: text('status', { enum: ['cobrado', 'pendiente', 'proyectado'] }).notNull(),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

export const projectEnvVars = sqliteTable('project_env_vars', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
  environment: text('environment', { enum: ['production', 'staging', 'development', 'all'] }).default('all'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

export const projectServices = sqliteTable('project_services', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // projectId nullable: permite costos a nivel cuenta (dominio/suscripción no atada a un proyecto)
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').references(() => clients.id),
  name: text('name').notNull(),
  category: text('category', {
    enum: ['hosting', 'database', 'auth', 'cdn', 'email', 'storage', 'dns', 'domain', 'monitoring', 'payment', 'repository', 'other'],
  }).notNull(),
  provider: text('provider'), // github, aws, azure, gcp, vercel, netlify, cloudflare, turso, ...
  url: text('url'),
  username: text('username'),
  // Costos
  cost: real('cost'),
  currency: text('currency').default('USD'),
  billingCycle: text('billing_cycle', {
    enum: ['monthly', 'quarterly', 'annual', 'one_time', 'usage', 'free'],
  }).default('monthly'),
  renewalDate: integer('renewal_date', { mode: 'timestamp' }), // próxima renovación / expiración de dominio
  autoRenew: integer('auto_renew', { mode: 'boolean' }).default(true),
  active: integer('active', { mode: 'boolean' }).default(true),
  // P&L
  payer: text('payer', { enum: ['me', 'client_reimbursable', 'client_direct'] }).default('me'),
  billedToClient: real('billed_to_client'), // lo que se le cobra al cliente por esta línea
  // Bóveda: JSON cifrado AES-256-GCM con { apiKey?, token?, password?, extra? }
  secrets: text('secrets'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export const projectContacts = sqliteTable('project_contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  role: text('role', { enum: ['cliente', 'pm', 'dev', 'qa', 'diseño', 'otro'] }).default('otro'),
  phone: text('phone'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

export const projectAdrs = sqliteTable('project_adrs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  status: text('status', { enum: ['propuesto', 'aceptado', 'deprecado', 'reemplazado'] }).default('aceptado'),
  context: text('context').notNull(),
  decision: text('decision').notNull(),
  rationale: text('rationale').notNull(),
  alternatives: text('alternatives'),
  consequences: text('consequences'),
  isPublic: integer('is_public', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export const educationMilestones = sqliteTable('education_milestones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  institution: text('institution'),
  description: text('description'),
  skills: text('skills'), // JSON array: ["TypeScript", "Drizzle ORM"]
  status: text('status', { enum: ['en_curso', 'completado', 'pausado'] }).default('en_curso'),
  startDate: integer('start_date', { mode: 'timestamp' }),
  completedDate: integer('completed_date', { mode: 'timestamp' }),
  certificateUrl: text('certificate_url'),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  isPublic: integer('is_public', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export const briefings = sqliteTable('briefings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').references(() => clients.id),
  projectId: integer('project_id').references(() => projects.id),
  title: text('title').notNull(),
  status: text('status', { enum: ['borrador', 'en_revision', 'aprobado', 'rechazado'] }).default('borrador'),
  objective: text('objective'),
  scope: text('scope'),
  estimatedBudget: real('estimated_budget'),
  agreedBudget: real('agreed_budget'),
  estimatedHours: integer('estimated_hours'),
  deadline: integer('deadline', { mode: 'timestamp' }),
  notes: text('notes'),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export const briefingItems = sqliteTable('briefing_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  briefingId: integer('briefing_id').notNull().references(() => briefings.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['requerimiento', 'entregable', 'exclusion'] }).notNull(),
  content: text('content').notNull(),
  done: integer('done', { mode: 'boolean' }).default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

// Seguimiento: llamadas, reuniones, notas y pendientes (con recordatorios)
export const interactions = sqliteTable('interactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', {
    enum: ['call', 'meeting', 'email', 'whatsapp', 'note', 'task', 'other'],
  }).notNull().default('note'),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'set null' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  briefingId: integer('briefing_id').references(() => briefings.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  body: text('body'), // detalle, notas, información técnica
  occurredAt: integer('occurred_at', { mode: 'timestamp' }),
  // Recordatorio / pendiente
  nextAction: text('next_action'),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  done: integer('done', { mode: 'boolean' }).default(false),
  doneAt: integer('done_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export const presentations = sqliteTable('presentations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  shareToken: text('share_token').notNull().unique(),
  currentSlide: integer('current_slide').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

export const presentationSlides = sqliteTable('presentation_slides', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  presentationId: integer('presentation_id').notNull().references(() => presentations.id, { onDelete: 'cascade' }),
  order: integer('order').notNull(),
  url: text('url').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

// Observabilidad: qué URL vigilar por proyecto. El sondeo lo dispara un cron
// externo (cron-job.org) que pega a /api/cron/uptime-check con el CRON_SECRET.
export const monitors = sqliteTable('monitors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // projectId nullable: permite monitores sueltos (no atados a un proyecto).
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  method: text('method').default('GET'),
  expectedStatus: integer('expected_status').default(200),
  // Si está definido, la respuesta debe CONTENER este texto o se considera caída
  // (detecta deploys rotos que devuelven 200 pero con la página equivocada).
  expectedText: text('expected_text'),
  // Por encima de este umbral (ms) la respuesta cuenta como "degradada" (amarillo).
  latencyThresholdMs: integer('latency_threshold_ms').default(2000),
  // Cadencia esperada en minutos (informativa; la frecuencia real la fija el cron externo).
  intervalMin: integer('interval_min').default(5),
  active: integer('active', { mode: 'boolean' }).default(true),
  paused: integer('paused', { mode: 'boolean' }).default(false),
  // Estado materializado del último chequeo (para pintar el badge sin recalcular).
  lastStatus: text('last_status', { enum: ['up', 'degraded', 'down', 'unknown'] }).default('unknown'),
  lastCheckedAt: integer('last_checked_at', { mode: 'timestamp' }),
  lastResponseMs: integer('last_response_ms'),
  // Expiración del certificado TLS (refrescada como máximo cada ~12h).
  sslExpiresAt: integer('ssl_expires_at', { mode: 'timestamp' }),
  sslCheckedAt: integer('ssl_checked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

// Historial de sondeos. Se purga (>90 días) para no inflar Turso.
export const monitorChecks = sqliteTable('monitor_checks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  monitorId: integer('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  at: integer('at', { mode: 'timestamp' }).notNull(),
  ok: integer('ok', { mode: 'boolean' }).notNull(),
  statusCode: integer('status_code'),
  responseMs: integer('response_ms'),
  error: text('error'),
})

// Caídas agrupadas: del primer fallo al primer éxito posterior. Da el "informe de caídas".
export const monitorIncidents = sqliteTable('monitor_incidents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  monitorId: integer('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  cause: text('cause'),
  lastError: text('last_error'),
  durationSec: integer('duration_sec'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

// Runs del pipeline CI/CD (GitHub Actions reporta aquí vía POST /api/lab/ingest).
export const ciRuns = sqliteTable('ci_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sha: text('sha').notNull(),
  branch: text('branch'),
  // ID del run en GitHub Actions, para enlazar a los logs.
  runId: text('run_id'),
  url: text('url'),
  conclusion: text('conclusion', { enum: ['success', 'failure', 'rolled_back'] }).notNull(),
  testsPassed: integer('tests_passed'),
  testsFailed: integer('tests_failed'),
  coveragePct: real('coverage_pct'),
  durationMs: integer('duration_ms'),
  // Resultado del health check post-deploy (null si el run no llegó a esa etapa).
  healthOk: integer('health_ok', { mode: 'boolean' }),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

// ── Pasarela de pagos (donaciones/pagos dev) ────────────────────────────────

// Un pago = una intención de cobro. La clave de idempotencia es ÚNICA:
// requests repetidos (doble clic, retry de red) devuelven la misma fila
// en vez de crear un segundo cobro.
export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Referencia pública enviada a la pasarela (aparece en el checkout y los webhooks).
  reference: text('reference').notNull().unique(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  description: text('description'),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('COP'),
  // Máquina de estados: created → pending → (approved | declined | error | voided).
  // Los estados terminales nunca retroceden (webhooks fuera de orden se ignoran).
  status: text('status', { enum: ['created', 'pending', 'approved', 'declined', 'error', 'voided'] })
    .notNull()
    .default('created'),
  provider: text('provider', { enum: ['wompi', 'mock'] }).notNull().default('mock'),
  gatewayTxId: text('gateway_tx_id'),
  payerEmail: text('payer_email'),
  // Concurrencia optimista: UPDATE … WHERE version = ?; si no afecta filas, reintentar.
  version: integer('version').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

// Bitácora de TODOS los eventos de webhook recibidos, incluidos duplicados y
// fuera de orden (marcados, no aplicados). Es la evidencia para la sustentación.
export const paymentEvents = sqliteTable('payment_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  paymentId: integer('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  type: text('type').notNull(),
  gatewayTxId: text('gateway_tx_id'),
  eventStatus: text('event_status'),
  payload: text('payload'),
  duplicate: integer('duplicate', { mode: 'boolean' }).notNull().default(false),
  outOfOrder: integer('out_of_order', { mode: 'boolean' }).notNull().default(false),
  // El monto/moneda del evento no coincide con el pago: NUNCA se aplica y se alerta.
  amountMismatch: integer('amount_mismatch', { mode: 'boolean' }).notNull().default(false),
  receivedAt: integer('received_at', { mode: 'timestamp' }),
})

// Flags de chaos engineering: inyectan fallos reales en rutas específicas.
// Cinturones de seguridad: TTL obligatorio (máx 15 min), rutas admin/auth
// excluidas por código, kill-switch (PÁNICO) y fail-open si la lectura falla.
export const chaosFlags = sqliteTable('chaos_flags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind', { enum: ['latency', 'error500', 'kill_service'] }).notNull(),
  // Ruta exacta ("/api/health") o prefijo con comodín final ("/projects/*").
  targetRoute: text('target_route').notNull(),
  // Parámetro del fallo: ms de latencia para 'latency'.
  param: integer('param'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

// Historial de experimentos del LAB (ataques de idempotencia, caos, etc.)
// con resultado esperado vs. real — para mostrar el historial al jurado.
export const labExperiments = sqliteTable('lab_experiments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),
  params: text('params'),
  ok: integer('ok', { mode: 'boolean' }),
  result: text('result'),
  ranAt: integer('ran_at', { mode: 'timestamp' }),
})

// Configuración clave-valor (tasas FX, moneda base, etc.)
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

// Core Web Vitals medidos en el navegador de visitantes reales (RUM).
// Alimenta el p75 público de /engineering. Sin PII: solo métrica, valor, la
// ruta (sin query) y el tipo de navegación.
export const webVitals = sqliteTable('web_vitals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  metric: text('metric', { enum: ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] }).notNull(),
  value: real('value').notNull(),
  rating: text('rating', { enum: ['good', 'needs-improvement', 'poor'] }),
  path: text('path'),
  navigationType: text('navigation_type'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

// Sesiones de administrador por dispositivo. La estrategia de auth es JWT
// (stateless), así que este registro lo mantiene el middleware para poder
// listar los dispositivos con sesión abierta y cerrarlos remotamente.
// `id` es el `sid` firmado dentro del JWT cuando existe; si no, el valor de la
// cookie `device_id` (best-effort para sesiones previas al despliegue).
export const adminSessions = sqliteTable('admin_sessions', {
  id: text('id').primaryKey(),
  login: text('login'),
  userAgent: text('user_agent'),
  ip: text('ip'),
  firstSeen: integer('first_seen', { mode: 'timestamp' }),
  lastSeen: integer('last_seen', { mode: 'timestamp' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
})

// ── Observabilidad de seguridad (micro-SIEM propio) ─────────────────────────
// Sensor de superficie de ataque: el middleware y el 404 clasifican cada
// request hostil y lo registran aquí. Ver docs/plan-security-observability.md.
// Reglas: fail-open (registrar nunca bloquea el request), retención por capas
// y agregación en el cron de rollup. Sin PII cruda en la vitrina pública: la
// IP se enmascara/hashea al exponerla.

// Evento crudo por request sospechoso. Se purga (>90 días) en el cron.
export const securityEvents = sqliteTable('security_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: integer('at', { mode: 'timestamp' }).notNull(),
  // IP real (la pone Vercel en x-forwarded-for; solo uso interno/admin).
  ip: text('ip'),
  // sha-256 truncado de la IP: identificador estable para la vitrina pública
  // sin exponer la IP en claro.
  ipHash: text('ip_hash'),
  method: text('method'),
  path: text('path').notNull(),
  // query y user-agent truncados: acotan el tamaño de fila y evitan payloads.
  query: text('query'),
  userAgent: text('user_agent'),
  country: text('country'),
  asn: text('asn'),
  // Categoría OWASP-alineada; la determina el clasificador (classify.ts).
  category: text('category').notNull(),
  severity: text('severity', { enum: ['low', 'medium', 'high', 'critical'] }).notNull(),
  action: text('action', { enum: ['logged', 'rate_limited', 'blocked', 'honeypot'] })
    .notNull()
    .default('logged'),
  statusCode: integer('status_code'),
  // Qué regla del clasificador disparó (para calibrar reglas ruidosas).
  ruleId: text('rule_id'),
  // Ráfagas idénticas (mismo ip+regla en <1s) se colapsan en una fila con hits>1.
  hits: integer('hits').notNull().default(1),
}, (t) => ({
  // Rollup y purga por retención barren por tiempo; el panel filtra por IP;
  // la vitrina cuenta IPs únicas por hash.
  atIdx: index('security_events_at_idx').on(t.at),
  ipIdx: index('security_events_ip_idx').on(t.ip),
  ipHashIdx: index('security_events_ip_hash_idx').on(t.ipHash),
}))

// Agregado horario/diario para dashboards, tendencias y baseline de anomalías.
export const securityRollups = sqliteTable('security_rollups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bucket: text('bucket', { enum: ['hour', 'day'] }).notNull(),
  at: integer('at', { mode: 'timestamp' }).notNull(),
  category: text('category').notNull(),
  count: integer('count').notNull().default(0),
  uniqueIps: integer('unique_ips').notNull().default(0),
  topPath: text('top_path'),
  topCountry: text('top_country'),
})

// Lista de bloqueo con TTL OBLIGATORIO: ningún bloqueo es eterno por defecto.
// El middleware la lee con cache en memoria; el cron la mantiene (auto-block
// escalonado y purga de expirados).
export const blockedIps = sqliteTable('blocked_ips', {
  ip: text('ip').primaryKey(),
  reason: text('reason'),
  ruleId: text('rule_id'),
  hits: integer('hits').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  // Escalado por reincidencia: 1h → 24h → 7d. Nunca null (sin bloqueos eternos).
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  source: text('source', { enum: ['auto', 'manual'] }).notNull().default('auto'),
}, (t) => ({
  // El middleware y el cron filtran bloqueos vigentes por expiración.
  expiresIdx: index('blocked_ips_expires_idx').on(t.expiresAt),
}))

// Estado durable del rate limiter (sliding window por clave). Purga perezosa
// en el cron. Complementa la primera capa en memoria de ratelimit.ts.
export const rateLimitBuckets = sqliteTable('rate_limit_buckets', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  resetAt: integer('reset_at', { mode: 'timestamp' }).notNull(),
})

// Hallazgos del detector de anomalías (para timeline y alertas). Estadística
// simple y explicable (z-score sobre baseline de 30 días).
export const securityAnomalies = sqliteTable('security_anomalies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: integer('at', { mode: 'timestamp' }).notNull(),
  kind: text('kind', {
    enum: ['spike', 'new_pattern', 'geo_anomaly', 'auth_probing', 'error_burst'],
  }).notNull(),
  zScore: real('z_score'),
  baseline: real('baseline'),
  observed: real('observed'),
  detail: text('detail'),
  notified: integer('notified', { mode: 'boolean' }).notNull().default(false),
  acknowledged: integer('acknowledged', { mode: 'boolean' }).notNull().default(false),
})

// ── LAB · Fingerprinting (demo educativa) ───────────────────────────────────
// Sala efímera: se crea con QR, expira sola (≤2h) y el cron la purga junto con
// sus dispositivos. Nada de esto sobrevive a la demo — es el punto ético.

export const fpRooms = sqliteTable('fp_rooms', {
  id: text('id').primaryKey(), // slug corto, va en la URL del QR
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  expiresIdx: index('fp_rooms_expires_idx').on(t.expiresAt),
}))

export const fpDevices = sqliteTable('fp_devices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: text('room_id').notNull().references(() => fpRooms.id, { onDelete: 'cascade' }),
  // sha-256 del fingerprint combinado: identifica al dispositivo sin cookies.
  deviceHash: text('device_hash').notNull(),
  label: integer('label').notNull(), // "Dispositivo #N" dentro de la sala
  ownFp: text('own_fp'), // JSON: señales del recolector propio (desglose educativo)
  libFpHash: text('lib_fp_hash'), // hash de FingerprintJS, para contrastar precisión
  entropyBits: real('entropy_bits'),
  behaviorSig: text('behavior_sig'), // JSON: cadencia de tecleo, movimiento, orientación
  // Veces que este mismo hash volvió a hacer join en la sala (el "wow": incógnito/borrar cookies no lo evade).
  revisits: integer('revisits').notNull().default(0),
  firstSeen: integer('first_seen', { mode: 'timestamp' }).notNull(),
  lastSeen: integer('last_seen', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  roomIdx: index('fp_devices_room_idx').on(t.roomId),
  hashIdx: index('fp_devices_hash_idx').on(t.deviceHash),
}))
