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
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category', {
    enum: ['hosting', 'database', 'auth', 'cdn', 'email', 'storage', 'dns', 'monitoring', 'payment', 'repository', 'other'],
  }).notNull(),
  url: text('url'),
  username: text('username'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
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
