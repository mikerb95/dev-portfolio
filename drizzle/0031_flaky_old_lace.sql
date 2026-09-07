CREATE TABLE `compute_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` integer NOT NULL,
	`received_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `compute_batches_received_idx` ON `compute_batches` (`received_at`);--> statement-breakpoint
CREATE TABLE `compute_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`periodo` text NOT NULL,
	`cpu_ms` real DEFAULT 0 NOT NULL,
	`gb_ms` real DEFAULT 0 NOT NULL,
	`invocations` integer DEFAULT 0 NOT NULL,
	`transfer_bytes` real DEFAULT 0 NOT NULL,
	`origin_transfer_bytes` real DEFAULT 0 NOT NULL,
	`edge_requests` integer DEFAULT 0 NOT NULL,
	`costo_medido_usd` real DEFAULT 0 NOT NULL,
	`factor_reconciliacion` real DEFAULT 1 NOT NULL,
	`costo_usd` real DEFAULT 0 NOT NULL,
	`margen_pct` real DEFAULT 0 NOT NULL,
	`total_usd` real DEFAULT 0 NOT NULL,
	`factura_real_usd` real,
	`estado` text DEFAULT 'abierto' NOT NULL,
	`invoice_id` integer,
	`cerrado_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `compute_periods_project_periodo_idx` ON `compute_periods` (`project_id`,`periodo`);--> statement-breakpoint
CREATE TABLE `compute_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vigente_desde` text NOT NULL,
	`cpu_activa_hora` real NOT NULL,
	`memoria_gb_hora` real NOT NULL,
	`invocaciones_millon` real NOT NULL,
	`transferencia_gb` real NOT NULL,
	`transferencia_origen_gb` real NOT NULL,
	`edge_requests_millon` real NOT NULL,
	`fuente` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `compute_rates_vigente_desde_unique` ON `compute_rates` (`vigente_desde`);--> statement-breakpoint
CREATE TABLE `compute_terms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`margen_pct` real DEFAULT 30 NOT NULL,
	`minimo_usd` real,
	`incluido_cpu_ms` real DEFAULT 0 NOT NULL,
	`incluido_gb_ms` real DEFAULT 0 NOT NULL,
	`incluido_invocaciones` integer DEFAULT 0 NOT NULL,
	`incluido_transfer_bytes` real DEFAULT 0 NOT NULL,
	`ingest_secret` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `compute_terms_project_id_unique` ON `compute_terms` (`project_id`);--> statement-breakpoint
CREATE TABLE `compute_usage_hourly` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`hour` integer NOT NULL,
	`cpu_ms` real DEFAULT 0 NOT NULL,
	`gb_ms` real DEFAULT 0 NOT NULL,
	`invocations` integer DEFAULT 0 NOT NULL,
	`transfer_bytes` real DEFAULT 0 NOT NULL,
	`origin_transfer_bytes` real DEFAULT 0 NOT NULL,
	`edge_requests` integer DEFAULT 0 NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `compute_usage_project_hour_idx` ON `compute_usage_hourly` (`project_id`,`hour`);--> statement-breakpoint
CREATE INDEX `compute_usage_hour_idx` ON `compute_usage_hourly` (`hour`);--> statement-breakpoint
ALTER TABLE `projects` ADD `vercel_project_id` text;