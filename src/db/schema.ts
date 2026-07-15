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

// Credenciales WebAuthn (passkeys / llaves de seguridad FIDO2 como YubiKey).
// Segundo factor obligatorio para /admin una vez registrada la primera llave.
// La identidad del usuario es su `login` de GitHub (el mismo de la allowlist);
// no hay tabla de usuarios: una fila = una llave física registrada por ese login.
export const webauthnCredentials = sqliteTable('webauthn_credentials', {
  // credentialID en base64url (tal cual lo devuelve SimpleWebAuthn v13).
  id: text('id').primaryKey(),
  // A quién pertenece la llave: login de GitHub en minúsculas.
  login: text('login').notNull(),
  // Clave pública COSE en base64url (Uint8Array serializado).
  publicKey: text('public_key').notNull(),
  // Contador anti-clonación: debe crecer en cada uso o se rechaza (replay).
  counter: integer('counter').notNull().default(0),
  // Array JSON de transportes ("usb","nfc","internal","hybrid",…).
  transports: text('transports'),
  // 'singleDevice' (llave física, p. ej. YubiKey) o 'multiDevice' (passkey sincronizada).
  deviceType: text('device_type'),
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
  // Etiqueta legible que pone el usuario ("YubiKey azul", "Mac Touch ID").
  nickname: text('nickname'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
}, (t) => ({
  loginIdx: index('webauthn_credentials_login_idx').on(t.login),
}))

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

// ── Portal de clientes ──────────────────────────────────────────────────────
// Área autenticada donde cada cliente ve el estado de sus proyectos, sus
// facturas, sus documentos y conversa conmigo. Ver docs/plan-portal-clientes.md.
//
// Regla que atraviesa TODAS estas tablas: el aislamiento entre clientes es por
// `clientId`, y ese id SIEMPRE sale de la sesión (ver lib/portal/session.ts),
// nunca de un parámetro de URL. Una query del portal sin filtro por clientId es
// un bug de seguridad, no un descuido de estilo.

// Usuarios del portal. Separada de `clients` (la empresa) porque una empresa
// puede tener varias personas con acceso y distinto alcance.
export const clientUsers = sqliteTable('client_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // Identidad de login. UNIQUE global: un email = una persona = un cliente.
  email: text('email').notNull().unique(),
  name: text('name'),
  // scrypt$N$r$p$salt$hash — el formato lleva sus parámetros para poder
  // endurecerlos luego sin invalidar los hashes viejos. Null mientras la
  // invitación está pendiente (el usuario aún no eligió contraseña).
  passwordHash: text('password_hash'),
  // owner: todo + gestiona usuarios de su empresa.
  // member: proyectos, mensajes y documentos; ve facturas pero no paga.
  // billing: facturas y pagos; sin mensajes ni documentos técnicos.
  role: text('role', { enum: ['owner', 'member', 'billing'] }).notNull().default('member'),
  status: text('status', { enum: ['invited', 'active', 'disabled'] }).notNull().default('invited'),
  // Bloqueo por fuerza bruta: se limpia con un login correcto.
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: integer('locked_until', { mode: 'timestamp' }),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  clientIdx: index('client_users_client_idx').on(t.clientId),
}))

// Invitaciones y restablecimientos de contraseña: mismo mecanismo (token de un
// solo uso enviado por email), distinto propósito. Solo se guarda el hash del
// token: si me roban la base, no sirven para entrar.
export const clientInvitations = sqliteTable('client_invitations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // Null para invitaciones a un email que aún no tiene fila en client_users.
  clientUserId: integer('client_user_id').references(() => clientUsers.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role', { enum: ['owner', 'member', 'billing'] }).notNull().default('member'),
  kind: text('kind', { enum: ['invite', 'reset'] }).notNull().default('invite'),
  tokenHash: text('token_hash').notNull().unique(),
  // Quién invitó: login de admin ('mikerb95') o `user:<id>` si fue un owner.
  invitedBy: text('invited_by'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  emailIdx: index('client_invitations_email_idx').on(t.email),
}))

// Sesiones del portal. A diferencia del admin (JWT stateless + registro
// paralelo), aquí la sesión ES la fila: token opaco cuyo hash vive en esta
// tabla. Revocar una sesión tiene efecto inmediato y sin cookies que borrar.
export const portalSessions = sqliteTable('portal_sessions', {
  // sha-256 del token de la cookie. El token en claro solo existe en el navegador.
  id: text('id').primaryKey(),
  clientUserId: integer('client_user_id').notNull().references(() => clientUsers.id, { onDelete: 'cascade' }),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastSeen: integer('last_seen', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
}, (t) => ({
  userIdx: index('portal_sessions_user_idx').on(t.clientUserId),
  expiresIdx: index('portal_sessions_expires_idx').on(t.expiresAt),
}))

// Auditoría de lo que hace el cliente dentro del portal. Es su propio registro
// (lo ve el owner) y mi evidencia ante una disputa: quién descargó qué contrato
// y cuándo, quién aprobó un entregable, quién inició un pago.
export const portalAuditLog = sqliteTable('portal_audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  clientUserId: integer('client_user_id').references(() => clientUsers.id, { onDelete: 'set null' }),
  action: text('action').notNull(), // 'login', 'document.download', 'invoice.pay', …
  entity: text('entity'),
  entityId: integer('entity_id'),
  detail: text('detail'),
  ip: text('ip'),
  at: integer('at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  clientIdx: index('portal_audit_client_idx').on(t.clientId),
  atIdx: index('portal_audit_at_idx').on(t.at),
}))

// Hitos del proyecto: la línea de tiempo que el cliente ve en su dashboard.
// `visibleToClient` permite planear hitos internos antes de comprometerlos.
export const projectMilestones = sqliteTable('project_milestones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', { enum: ['pendiente', 'en_curso', 'completado'] }).notNull().default('pendiente'),
  dueAt: integer('due_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  visibleToClient: integer('visible_to_client', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  projectIdx: index('project_milestones_project_idx').on(t.projectId),
}))

// Factura formal. `finances` sigue siendo mi libro contable interno (incluye
// proyecciones y costos); esto es el documento que el cliente ve y paga.
export const invoices = sqliteTable('invoices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  // Correlativo legible y estable: INV-2026-001. UNIQUE porque numerar dos
  // veces igual es un problema contable, no un detalle cosmético.
  number: text('number').notNull().unique(),
  status: text('status', { enum: ['draft', 'sent', 'paid', 'overdue', 'void'] }).notNull().default('draft'),
  currency: text('currency').notNull().default('COP'),
  // Todo en centavos enteros: nunca float para dinero.
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  taxCents: integer('tax_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  notes: text('notes'),
  issuedAt: integer('issued_at', { mode: 'timestamp' }),
  dueAt: integer('due_at', { mode: 'timestamp' }),
  paidAt: integer('paid_at', { mode: 'timestamp' }),
  // Pago que la saldó (el webhook de la pasarela cierra el círculo).
  paymentId: integer('payment_id').references(() => payments.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
}, (t) => ({
  clientIdx: index('invoices_client_idx').on(t.clientId),
  statusIdx: index('invoices_status_idx').on(t.status),
}))

export const invoiceItems = sqliteTable('invoice_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  invoiceId: integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: real('quantity').notNull().default(1),
  unitCents: integer('unit_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({
  invoiceIdx: index('invoice_items_invoice_idx').on(t.invoiceId),
}))

// Hilos de conversación. Opcionalmente atados a un proyecto: un cliente con
// tres proyectos no quiere una bandeja única donde todo se mezcla.
export const portalThreads = sqliteTable('portal_threads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  subject: text('subject').notNull(),
  status: text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
  lastMessageAt: integer('last_message_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  clientIdx: index('portal_threads_client_idx').on(t.clientId),
}))

export const portalMessages = sqliteTable('portal_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: integer('thread_id').notNull().references(() => portalThreads.id, { onDelete: 'cascade' }),
  authorType: text('author_type', { enum: ['admin', 'client'] }).notNull(),
  // Null cuando escribo yo (admin): mi identidad no vive en client_users.
  authorUserId: integer('author_user_id').references(() => clientUsers.id, { onDelete: 'set null' }),
  authorName: text('author_name'),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  threadIdx: index('portal_messages_thread_idx').on(t.threadId),
}))

// Lecturas por usuario: con varios usuarios por empresa, "leído" no puede ser
// una columna del mensaje — cada persona tiene su propio estado.
export const portalMessageReads = sqliteTable('portal_message_reads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: integer('thread_id').notNull().references(() => portalThreads.id, { onDelete: 'cascade' }),
  clientUserId: integer('client_user_id').notNull().references(() => clientUsers.id, { onDelete: 'cascade' }),
  lastReadAt: integer('last_read_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  threadUserIdx: index('portal_message_reads_thread_user_idx').on(t.threadId, t.clientUserId),
}))

// Documentos y entregables. El binario vive en Vercel Blob (privado); aquí solo
// los metadatos y la llave. La descarga pasa siempre por un endpoint que valida
// la sesión y el tenant antes de firmar una URL de vida corta.
export const portalDocuments = sqliteTable('portal_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  category: text('category', { enum: ['contrato', 'entregable', 'factura', 'acta', 'otro'] }).notNull().default('otro'),
  blobUrl: text('blob_url').notNull(),
  blobPathname: text('blob_pathname').notNull(),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  // Versionado simple: subir una versión nueva encadena a la anterior por
  // `supersedesId` y la vieja queda con `supersededAt` (historial, no borrado).
  version: integer('version').notNull().default(1),
  supersedesId: integer('supersedes_id'),
  supersededAt: integer('superseded_at', { mode: 'timestamp' }),
  uploadedBy: text('uploaded_by', { enum: ['admin', 'client'] }).notNull().default('admin'),
  uploadedByUserId: integer('uploaded_by_user_id').references(() => clientUsers.id, { onDelete: 'set null' }),
  visibleToClient: integer('visible_to_client', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  clientIdx: index('portal_documents_client_idx').on(t.clientId),
}))

// Centro de notificaciones in-app. Una fila por usuario destinatario (no por
// evento): así "leído" y las preferencias son por persona.
export const portalNotifications = sqliteTable('portal_notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientUserId: integer('client_user_id').notNull().references(() => clientUsers.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['invoice', 'message', 'milestone', 'incident', 'document', 'system'] }).notNull(),
  title: text('title').notNull(),
  body: text('body'),
  href: text('href'),
  readAt: integer('read_at', { mode: 'timestamp' }),
  // Cuándo salió el email de esta notificación (null = solo in-app).
  emailedAt: integer('emailed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  userIdx: index('portal_notifications_user_idx').on(t.clientUserId),
}))

// Preferencias de email por usuario y tipo. Ausencia de fila = valor por
// defecto (activo). Las facturas no son opt-out: son obligación contractual.
export const portalNotificationPrefs = sqliteTable('portal_notification_prefs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientUserId: integer('client_user_id').notNull().references(() => clientUsers.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  emailEnabled: integer('email_enabled', { mode: 'boolean' }).notNull().default(true),
}, (t) => ({
  userTypeIdx: index('portal_notification_prefs_user_type_idx').on(t.clientUserId, t.type),
}))
