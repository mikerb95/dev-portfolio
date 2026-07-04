import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

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
  requirements: text('requirements'),
  deliverables: text('deliverables'),
  estimatedBudget: real('estimated_budget'),
  agreedBudget: real('agreed_budget'),
  estimatedHours: integer('estimated_hours'),
  deadline: integer('deadline', { mode: 'timestamp' }),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

// Seguimiento: llamadas, reuniones, notas y pendientes (con recordatorios)
export const interactions = sqliteTable('interactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', {
    enum: ['call', 'meeting', 'email', 'whatsapp', 'note', 'task', 'other'],
  }).notNull().default('note'),
  clientId: integer('client_id').references(() => clients.id, { onDelete: 'set null' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
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

// Configuración clave-valor (tasas FX, moneda base, etc.)
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})
