import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const clients = sqliteTable('clients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email'),
  // Teléfono en E.164 ('+573104641228'). Es la llave con la que un cobro de
  // campo (/cobrar) se vincula solo a la ficha del cliente: se guarda siempre
  // normalizado para que la comparación sea exacta (ver lib/phone.ts).
  phone: text('phone'),
  company: text('company'),
  notes: text('notes'),
  // Portal de clientes (ver docs/plan-portal-clientes.md). El acceso se habilita
  // por cliente: tener ficha aquí no implica tener portal.
  portalEnabled: integer('portal_enabled', { mode: 'boolean' }).notNull().default(false),
  logoUrl: text('logo_url'),
  // JSON: NIT/documento, dirección y demás datos que van en la factura.
  billingInfo: text('billing_info'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  // Traducción opcional para /en/projects/<slug>. `techStack` no se traduce
  // (son nombres propios de tecnologías). NULL = todavía sin traducir; el
  // helper pickLocalized (src/i18n/localize.ts) cae al español, nunca en
  // blanco. Ver docs/plan-i18n-en.md §7.
  titleEn: text('title_en'),
  descriptionEn: text('description_en'),
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
  // Traducción opcional para la versión en inglés de /certifications. `skills`
  // no se traduce (nombres propios de tecnologías). Mismo patrón que projects.
  titleEn: text('title_en'),
  institutionEn: text('institution_en'),
  descriptionEn: text('description_en'),
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

// Progreso personal en las rutas de aprendizaje del Evolution Path (ver
// src/lib/education-paths.ts para el contenido, que es estático). Solo se
// persiste qué labs se completaron; el resto del contenido (título,
// duración, tags) no cambia por request.
export const educationLabProgress = sqliteTable('education_lab_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Formato "ruta-slug/lab-slug", ej. "linux-real/filesystem-real".
  labSlug: text('lab_slug').notNull().unique(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

// ── Tracker de especialización (/admin/aprendizaje) ─────────────────────────
// Distinto del Evolution Path: aquel es contenido estático con checkboxes,
// este mide la práctica real en el tiempo (racha, horas, temario, logros).
// Multi-track desde el día uno: el primero es .NET/C#, pero el modelo no sabe
// nada de .NET - añadir Rust o Azure es una fila, no una migración.
export const skillTracks = sqliteTable('skill_tracks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  tagline: text('tagline'),
  // Por qué te metiste en esto. Se muestra arriba del tablero: el tracker es
  // motivacional, y el recordatorio del motivo hace más que cualquier cifra.
  motivation: text('motivation'),
  // Meta semanal en minutos (no horas: las sesiones se registran en minutos y
  // convertir en dos sitios distintos es donde aparecen los off-by-60).
  weeklyGoalMinutes: integer('weekly_goal_minutes').notNull().default(360),
  accent: text('accent').notNull().default('violet'),
  startedOn: text('started_on'), // 'YYYY-MM-DD'
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  // Privado por defecto: el tracker es una herramienta personal. Si se activa,
  // solo se publica el AGREGADO (horas y % de avance), nunca la bitácora.
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export const skillSessions = sqliteTable('skill_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  trackId: integer('track_id')
    .notNull()
    .references(() => skillTracks.id, { onDelete: 'cascade' }),
  // Día calendario 'YYYY-MM-DD' en la zona del tracker, no un timestamp: una
  // racha es un hecho del calendario y guardarla como instante obligaría a
  // reinterpretar la zona en cada consulta. Ver src/lib/skills.ts.
  day: text('day').notNull(),
  minutes: integer('minutes').notNull(),
  topic: text('topic').notNull(),
  // Qué entendiste hoy. Es la bitácora, y lo único que sigue valiendo dentro
  // de un año cuando las cifras ya no digan nada.
  note: text('note'),
  milestoneId: integer('milestone_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

export const skillMilestones = sqliteTable('skill_milestones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  trackId: integer('track_id')
    .notNull()
    .references(() => skillTracks.id, { onDelete: 'cascade' }),
  area: text('area').notNull(), // agrupador del temario: "C# fundamentos", "EF Core"...
  title: text('title').notNull(),
  description: text('description'),
  position: integer('position').notNull().default(0),
  status: text('status', { enum: ['pendiente', 'en_curso', 'hecho'] })
    .notNull()
    .default('pendiente'),
  completedOn: text('completed_on'), // 'YYYY-MM-DD', mismo criterio que day
  // Prueba de que el hito está cerrado de verdad: repo, PR, endpoint desplegado.
  evidenceUrl: text('evidence_url'),
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
}, (t) => ({
  // Compuesto (monitor_id, at): sin él, la serie del EKG de /status obliga a un
  // SCAN + sort de la tabla entera en cada poll de 30s. Con 62k filas eso agotó
  // el 93% de la cuota de lecturas de Turso con una sola query (jul 2026).
  // El orden importa: monitor_id primero para poder buscar por partición, `at`
  // después para leer las últimas N sin ordenar.
  monitorAtIdx: index('monitor_checks_monitor_at_idx').on(t.monitorId, t.at),
  // Aparte del compuesto: /api/engineering/live consulta por fecha SIN filtrar
  // por monitor ("último sondeo", "cuántos en 24h"), y ahí el compuesto no
  // sirve - `at` no es su columna líder. Verificado con EXPLAIN QUERY PLAN.
  atIdx: index('monitor_checks_at_idx').on(t.at),
}))

// Resumen diario de sondeos: una fila por monitor y día, escrita por el cron
// `/api/cron/monitor-rollup`. Es lo que lee /status en vez de agregar 90 días
// de `monitor_checks` en cada render (200k filas por visita, y la cuota de
// lecturas de Turso agotada en ago 2026 cuando una prueba de carga le pegó sin
// el cache del CDN por delante). Los índices de monitor_checks arreglaron la
// BÚSQUEDA en jul 2026; esto arregla el VOLUMEN, que era lo que quedaba.
//
// `latency_hist` es un histograma de latencias en JSON (ver lib/monitor-rollup.ts):
// total/ok/sum_ms se pueden sumar entre días, pero un percentil no, y el p95 de
// 30 días tiene que salir de algo aditivo.
export const monitorDaily = sqliteTable('monitor_daily', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  monitorId: integer('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  // 'YYYY-MM-DD' en UTC, la misma clave que `date(at,'unixepoch')`.
  day: text('day').notNull(),
  total: integer('total').notNull(),
  ok: integer('ok').notNull(),
  sumMs: integer('sum_ms').notNull(),
  latencyHist: text('latency_hist').notNull(),
  computedAt: integer('computed_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  // UNIQUE y no un índice normal: el cron recalcula los últimos días en cada
  // pasada y necesita un upsert, no acumular una fila por ejecución.
  monitorDayIdx: uniqueIndex('monitor_daily_monitor_day_idx').on(t.monitorId, t.day),
  // /status filtra por ventana de días sin fijar monitor.
  dayIdx: index('monitor_daily_day_idx').on(t.day),
}))

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
  // % de mutantes detectados por los tests (job semanal/manual de Stryker,
  // null en las corridas normales de push). Cobertura dice "esta línea se
  // ejecutó"; esto dice "si la rompo, ¿algún test se entera?".
  mutationScore: real('mutation_score'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
}, (t) => ({
  // Mismo motivo que web_vitals: /api/engineering/live ordena por fecha desc.
  createdIdx: index('ci_runs_created_idx').on(t.createdAt),
}))

// Hallazgos de seguridad y accesibilidad reportados por CI (npm audit, CodeQL,
// axe…). Un hallazgo persiste entre corridas: se identifica por su `fingerprint`
// (source+ruleId+route) para poder decir "este ya lo vi y lo resolví" en vez de
// crear un duplicado cada vez que corre el scan. Reingerir uno abierto solo
// refresca lastSeenAt; uno ya resuelto/aceptado conserva su estado.
export const securityFindings = sqliteTable('security_findings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Clave de deduplicación estable: sha-256 de source|ruleId|route.
  fingerprint: text('fingerprint').notNull().unique(),
  source: text('source', {
    enum: ['npm-audit', 'codeql', 'semgrep', 'snyk', 'zap', 'axe', 'lighthouse'],
  }).notNull(),
  severity: text('severity', {
    enum: ['critical', 'high', 'medium', 'low', 'info'],
  }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  // Ruta/paquete/archivo afectado según la fuente (URL para axe, paquete para npm-audit).
  route: text('route'),
  ruleId: text('rule_id'),
  // Ciclo de vida del hallazgo. 'accepted' = riesgo asumido a conciencia (falso
  // positivo o inarreglable), distinto de 'resolved' = arreglado.
  status: text('status', { enum: ['open', 'resolved', 'accepted'] }).notNull().default('open'),
  // Nota al marcar resuelto/aceptado: el "cómo" o el "por qué" para el jurado.
  note: text('note'),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  firstSeenAt: integer('first_seen_at', { mode: 'timestamp' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  statusIdx: index('security_findings_status_idx').on(t.status),
  sourceIdx: index('security_findings_source_idx').on(t.source),
}))

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
  // Factura que este pago salda, si nació del portal de clientes. Null para los
  // pagos sueltos de /pay (la demo pública de la pasarela).
  invoiceId: integer('invoice_id'),
  // ── Cobros de campo (/cobrar → WhatsApp → /c/[code]) ──────────────────────
  // Un cobro NO es otra entidad: es un pago con estos campos. Todos nullables
  // para que los pagos de /pay y del portal sigan intactos.
  // Teléfono E.164 del pagador; es la llave del histórico en /mis-pagos.
  payerPhone: text('payer_phone'),
  // De dónde nació el pago. 'pay' = checkout público, 'cobro' = link de campo.
  source: text('source', { enum: ['pay', 'cobro', 'portal'] }).notNull().default('pay'),
  // Código corto y no adivinable del link (/c/AB3K9F). Solo en cobros.
  shortCode: text('short_code').unique(),
  // Vencimiento del link: pasado, no se generan checkouts nuevos (un pago ya
  // iniciado sí puede aprobarse: el dinero entró antes). Null = sin vencimiento.
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  // Vínculo suave con el CRM: si el teléfono coincidía con una ficha al crear
  // el cobro. Nunca crea clientes; SET NULL si la ficha se borra.
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'set null' }),
  // Concurrencia optimista: UPDATE … WHERE version = ?; si no afecta filas, reintentar.
  version: integer('version').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
}, (t) => ({
  // /mis-pagos barre el histórico por teléfono; /cobrar lista los pendientes.
  phoneIdx: index('payments_phone_idx').on(t.payerPhone),
  sourceIdx: index('payments_source_idx').on(t.source),
}))

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
// con resultado esperado vs. real - para mostrar el historial al jurado.
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
}, (t) => ({
  // /api/engineering/live pide la última muestra y el conteo de 24h en cada
  // apertura de card; sin índice ambas cosas son un scan completo.
  createdIdx: index('web_vitals_created_idx').on(t.createdAt),
}))

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
// sus dispositivos. Nada de esto sobrevive a la demo - es el punto ético.

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

// ── Descargas de CV ──────────────────────────────────────────────────────────
// Registro de control (sin TTL, a diferencia de fp_devices) de quién descarga
// el CV desde /contact: mismo recolector de señales del lab de fingerprinting,
// pero aquí sí persiste IP/UA - es el propósito del feature, no un efecto demo.
export const cvDownloads = sqliteTable('cv_downloads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deviceHash: text('device_hash').notNull(),
  signals: text('signals'), // JSON: mismo desglose que ownFp en fp_devices
  libFpHash: text('lib_fp_hash'),
  entropyBits: real('entropy_bits'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  referer: text('referer'),
  downloadToken: text('download_token').notNull(),
  downloadedAt: integer('downloaded_at', { mode: 'timestamp' }),
  revisits: integer('revisits').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  hashIdx: index('cv_downloads_hash_idx').on(t.deviceHash),
  tokenIdx: index('cv_downloads_token_idx').on(t.downloadToken),
  createdIdx: index('cv_downloads_created_idx').on(t.createdAt),
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
  // scrypt$N$r$p$salt$hash - el formato lleva sus parámetros para poder
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
  // "Ver como cliente" desde /admin/clients. Es un hecho de la sesión, no una
  // cookie aparte: así la restricción de solo-lectura no depende de que un
  // segundo cookie sobreviva exactamente lo mismo que el primero. Si es null,
  // la sesión es del cliente de verdad, entrando por su cuenta.
  impersonatedBy: text('impersonated_by'),
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
//
// La misma tabla sirve DOS documentos distintos, discriminados por `doc_type`:
//  · 'factura'      → la del portal, serie INV-, con IVA, la ve el cliente.
//  · 'cuenta_cobro' → documento de persona natural NO responsable de IVA, serie
//                     CC-, sin IVA, con retenciones y leyendas legales.
// No son dos tablas porque comparten líneas, totales en centavos, numeración
// UNIQUE, máquina de estados e inmutabilidad; duplicarlas sería duplicar el
// sitio donde arreglar un bug de redondeo. Mismo precedente que
// `payments.source`. La forma de cada tipo la valida lib/cuentas-cobro.ts en el
// borde, no la base. Ver docs/plan-cuentas-de-cobro.md.
export const invoices = sqliteTable('invoices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  // Correlativo legible y estable: INV-2026-001. UNIQUE porque numerar dos
  // veces igual es un problema contable, no un detalle cosmético.
  number: text('number').notNull().unique(),
  // El default preserva las filas que existían antes de la migración 0030.
  docType: text('doc_type', { enum: ['factura', 'cuenta_cobro'] }).notNull().default('factura'),
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

  // ── Solo cuentas de cobro (todas nullables: una factura no las usa) ───────
  // Datos del emisor y del deudor CONGELADOS al emitir. No se leen de
  // app_settings ni de clients al reimprimir: cambiar de banco en marzo no
  // puede reescribir un documento entregado en enero.
  issuerSnapshot: text('issuer_snapshot'),
  payerSnapshot: text('payer_snapshot'),
  // Concepto detallado del servicio. Una descripción genérica hace que el área
  // de pagos devuelva el documento, así que es obligatorio en este tipo.
  concept: text('concept'),
  periodStart: integer('period_start', { mode: 'timestamp' }),
  periodEnd: integer('period_end', { mode: 'timestamp' }),
  // Contrato u orden de compra: casi siempre exigido por empresas.
  contractRef: text('contract_ref'),
  // Ciudad de expedición (va en el encabezado del documento).
  city: text('city'),
  // Snapshot del cálculo: [{ concepto, tarifa, baseUvtCents, valueCents, ... }].
  // Se guarda el resultado, no la fórmula: las tarifas de retención cambian de
  // un año a otro y reimprimir no puede recalcular con las de hoy.
  retentions: text('retentions'),
  retentionsCents: integer('retentions_cents').notNull().default(0),
  // Neto = total - retenciones. Redundante a propósito: es lo que se agrega y
  // se ordena en el panel, y no quiero recalcularlo en cada SELECT.
  netCents: integer('net_cents').notNull().default(0),
  // Planilla PILA declarada (muchos pagadores la exigen como anexo).
  ssPlanilla: text('ss_planilla'),
  ssPeriodo: text('ss_periodo'),
  signatureUrl: text('signature_url'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
}, (t) => ({
  clientIdx: index('invoices_client_idx').on(t.clientId),
  statusIdx: index('invoices_status_idx').on(t.status),
  // El panel y el portal filtran SIEMPRE por tipo: sin este índice, cada
  // listado escanea las dos series juntas (y en Turso se factura por filas
  // escaneadas, no por filas devueltas).
  docTypeIdx: index('invoices_doc_type_idx').on(t.docType),
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
// una columna del mensaje - cada persona tiene su propio estado.
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

// Feed de actividad del portal: la línea de tiempo de "qué ha pasado en mi
// proyecto" que el cliente ve sin preguntar. No sustituye a las notificaciones
// (que son por persona y tienen estado de leído): esto es el registro compartido
// del cliente, y una entrada puede existir sin que se le notifique a nadie.
//
// `clientId` está denormalizado a propósito aunque se pueda derivar de
// `projectId`: el feed se lee SIEMPRE filtrando por él, y la consulta más
// caliente del portal no debe depender de un JOIN. Además hay entradas sin
// proyecto (facturas, avisos de cuenta), donde no habría de dónde derivarlo.
export const portalActivity = sqliteTable('portal_activity', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  type: text('type', {
    enum: ['milestone', 'invoice', 'document', 'message', 'incident', 'deploy', 'system'],
  }).notNull(),
  title: text('title').notNull(),
  detail: text('detail'),
  href: text('href'),
  // Interruptor de seguridad: permite emitir primero y decidir después. Si algo
  // se registra y no debía verse, se apaga desde /admin sin borrar el registro.
  visibleToClient: integer('visible_to_client', { mode: 'boolean' }).notNull().default(true),
  at: integer('at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  // El feed se pagina por cliente y fecha: este índice es la consulta literal.
  clientAtIdx: index('portal_activity_client_at_idx').on(t.clientId, t.at),
  projectAtIdx: index('portal_activity_project_at_idx').on(t.projectId, t.at),
}))

// ── Presentaciones (decks HTML autónomos) ───────────────────────────────────
//
// Convive con las tablas `presentations`/`presentation_slides` de arriba, que
// son del sistema anterior (imágenes PNG por proyecto) y quedan congeladas: sus
// rutas se retiraron, pero borrarlas sería una migración destructiva sobre
// datos de clientes reales. Ver docs/plan-presentaciones.md.
//
// Aquí SOLO vive lo persistente: la biblioteca de decks. El estado vivo de una
// sesión de proyección (PIN, slide actual, secreto del presentador) es efímero
// y vive en Redis con TTL - nunca toca Turso.
export const decks = sqliteTable('decks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  // Ruta del archivo en Vercel Blob. El HTML NO se sirve desde su URL de blob:
  // el control por DOM del deck exige mismo origen, así que se sirve por
  // /decks/<id>.html. Ver src/pages/decks/[id].html.ts.
  blobPath: text('blob_path').notNull(),
  blobUrl: text('blob_url').notNull(),
  fileSize: integer('file_size').notNull().default(0),
  // Total de <section> dentro de <deck-stage>, extraído al subir. El control
  // remoto no carga el iframe, así que necesita esta cifra de la base.
  slideCount: integer('slide_count').notNull().default(0),
  lastSessionAt: integer('last_session_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

// Notas y rótulos por slide, extraídos del HTML al subirlo. Se reescriben
// enteros cada vez que se reemplaza el archivo (borrar + insertar), porque el
// deck es la fuente de verdad y editar a mano aquí se desincronizaría.
export const deckSlides = sqliteTable('deck_slides', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deckId: integer('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  idx: integer('idx').notNull(),
  label: text('label'),
  speakerNotes: text('speaker_notes'),
}, (t) => ({
  deckIdxIdx: index('deck_slides_deck_idx').on(t.deckId, t.idx),
}))

// Feedback del público. Anónimo por diseño: no hay identificador de sesión ni
// de dispositivo, solo el deck que vieron. `contact` es opcional y lo escribe
// quien quiera respuesta - es el único campo que puede contener PII.
export const presentationFeedback = sqliteTable('presentation_feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Nullable: alguien puede llegar a /feedback sin venir de una presentación.
  // `set null` y no `cascade`: borrar un deck no debe borrar lo que la gente
  // opinó de él.
  deckId: integer('deck_id').references(() => decks.id, { onDelete: 'set null' }),
  // Título congelado en el momento del envío: si el deck se borra o se
  // renombra, el comentario sigue teniendo contexto.
  deckTitle: text('deck_title'),
  rating: integer('rating'),
  comment: text('comment'),
  contact: text('contact'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  createdAtIdx: index('presentation_feedback_created_idx').on(t.createdAt),
}))

// ── Capacitación en IA ───────────────────────────────────────────────────────
//
// Dos piezas distintas que conviene no confundir:
//
//  · `training_programs` es el CATÁLOGO comercial (qué se puede contratar). Lo
//    consume la landing pública /capacitacion-ia.
//  · `training_resources` es el BANCO de material que se queda con la gente
//    después de la sesión. Es general y reutilizable a propósito: los
//    ejercicios interactivos que se construyen a la medida del negocio de cada
//    cliente viven fuera de este repo y aquí solo entran como enlace.
//
// Las presentaciones NO se duplican aquí: un recurso de tipo `deck` apunta a
// la tabla `decks`, que sigue siendo la única fuente de verdad del material
// proyectable.
export const trainingPrograms = sqliteTable('training_programs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  summary: text('summary'),
  // A quién va dirigido: es el eje que más cambia el contenido de una
  // capacitación en IA (no es lo mismo un comité directivo que un equipo de
  // desarrollo), así que es campo propio y no una etiqueta suelta.
  audience: text('audience'),
  format: text('format', { enum: ['charla', 'taller', 'programa'] }).notNull().default('taller'),
  durationHours: real('duration_hours'),
  level: text('level', { enum: ['intro', 'intermedio', 'avanzado'] }).notNull().default('intro'),
  // JSON arrays de strings. Se guardan serializados porque son listas de texto
  // sin identidad propia: nunca se consultan por elemento ni se referencian.
  outcomes: text('outcomes'),
  modules: text('modules'),
  priceNote: text('price_note'),
  sortOrder: integer('sort_order').notNull().default(0),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export const trainingResources = sqliteTable('training_resources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  summary: text('summary'),
  kind: text('kind', {
    enum: ['guia', 'prompt', 'plantilla', 'checklist', 'video', 'enlace', 'deck'],
  }).notNull().default('guia'),
  // Markdown propio del recurso. Se renderiza con el subconjunto de
  // src/lib/capacitacion/markdown.ts, que escapa el HTML antes de formatear:
  // este texto lo escribe el admin, pero se sirve en una página pública y no
  // hay razón para permitir marcado arbitrario.
  body: text('body'),
  externalUrl: text('external_url'),
  fileUrl: text('file_url'),
  deckId: integer('deck_id').references(() => decks.id, { onDelete: 'set null' }),
  programId: integer('program_id').references(() => trainingPrograms.id, { onDelete: 'set null' }),
  level: text('level', { enum: ['intro', 'intermedio', 'avanzado'] }).notNull().default('intro'),
  topics: text('topics'), // JSON array de strings
  // `con_codigo` no protege secretos: separa lo que se publica al mundo (SEO,
  // captación) de lo que se entrega a quien asistió. El código de grupo es la
  // única barrera y por eso su canje tiene rate limit propio.
  visibility: text('visibility', { enum: ['publico', 'con_codigo', 'borrador'] })
    .notNull()
    .default('borrador'),
  views: integer('views').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
}, (t) => ({
  visibilityIdx: index('training_resources_visibility_idx').on(t.visibility, t.sortOrder),
}))

// Códigos de grupo que se dictan en voz alta al cerrar una sesión. No son
// credenciales de una persona: identifican a un grupo capacitado y caducan.
// Canjearlo entrega una cookie firmada; el código en sí no vuelve a viajar.
export const trainingAccessCodes = sqliteTable('training_access_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  label: text('label').notNull(),
  note: text('note'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  maxUses: integer('max_uses'),
  uses: integer('uses').notNull().default(0),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

// Suscripción personal (solo admin) a recordatorios por email de la
// calculadora de etapa productiva SENA (/ep). Un cron diario recalcula
// los hitos con `computeHitos` (src/lib/sena-ep.ts) y avisa por
// `sendEmail` los que caen dentro de la ventana de aviso, sin duplicar envíos
// gracias a `notifiedKeys`.
export const senaEpRecordatorios = sqliteTable('sena_ep_recordatorios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tipo: text('tipo', { enum: ['tecnico', 'tecnologo'] }).notNull(),
  inicio: text('inicio').notNull(), // YYYY-MM-DD
  diasAntes: integer('dias_antes').notNull().default(3),
  // Claves `titulo|YYYY-MM-DD` de los hitos ya notificados, como JSON array.
  notifiedKeys: text('notified_keys').notNull().default('[]'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

// Bitácora de los crons. Hasta ahora las tareas programadas no dejaban rastro
// propio: se podía ver su EFECTO (un backup nuevo, un sondeo escrito) pero no
// la ejecución, así que un cron que dejaba de dispararse solo se notaba cuando
// alguien echaba de menos el efecto. Eso ya pasó: los sondeos de monitores se
// cortaron del 10 de agosto al 1 de septiembre de 2026 y el hueco se descubrió
// tarde, mirando el historial.
//
// Una fila por ejecución autorizada. Los 401 de escaneo no se registran: la
// tabla describe el calendario real, no el ruido de internet.
export const cronRuns = sqliteTable('cron_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Nombre del cron, que es el último segmento de la ruta (`backup`, `uptime-check`).
  job: text('job').notNull(),
  ok: integer('ok', { mode: 'boolean' }).notNull(),
  durationMs: integer('duration_ms'),
  // Resumen corto del resultado, o el mensaje de error si reventó. Nunca lleva
  // secretos ni cuerpos de respuesta completos: esta tabla la lee una página pública.
  detail: text('detail'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
}, (t) => ({
  // La página pública pide las últimas N filas por fecha desc y reduce en
  // memoria a "última de cada job": con este índice son N filas escaneadas y
  // no la tabla entera (Turso factura filas escaneadas, no devueltas).
  createdIdx: index('cron_runs_created_idx').on(t.createdAt),
}))
