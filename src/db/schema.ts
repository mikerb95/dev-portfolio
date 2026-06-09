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

// Configuración clave-valor (tasas FX, moneda base, etc.)
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})
