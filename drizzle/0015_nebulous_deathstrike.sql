CREATE TABLE `client_invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`client_user_id` integer,
	`email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`kind` text DEFAULT 'invite' NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_user_id`) REFERENCES `client_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_invitations_token_hash_unique` ON `client_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `client_invitations_email_idx` ON `client_invitations` (`email`);--> statement-breakpoint
CREATE TABLE `client_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`password_hash` text,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_users_email_unique` ON `client_users` (`email`);--> statement-breakpoint
CREATE INDEX `client_users_client_idx` ON `client_users` (`client_id`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invoice_items_invoice_idx` ON `invoice_items` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`project_id` integer,
	`number` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`currency` text DEFAULT 'COP' NOT NULL,
	`subtotal_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`issued_at` integer,
	`due_at` integer,
	`paid_at` integer,
	`payment_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_number_unique` ON `invoices` (`number`);--> statement-breakpoint
CREATE INDEX `invoices_client_idx` ON `invoices` (`client_id`);--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);--> statement-breakpoint
CREATE TABLE `portal_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`client_user_id` integer,
	`action` text NOT NULL,
	`entity` text,
	`entity_id` integer,
	`detail` text,
	`ip` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_user_id`) REFERENCES `client_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `portal_audit_client_idx` ON `portal_audit_log` (`client_id`);--> statement-breakpoint
CREATE INDEX `portal_audit_at_idx` ON `portal_audit_log` (`at`);--> statement-breakpoint
CREATE TABLE `portal_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`project_id` integer,
	`title` text NOT NULL,
	`category` text DEFAULT 'otro' NOT NULL,
	`blob_url` text NOT NULL,
	`blob_pathname` text NOT NULL,
	`mime_type` text,
	`size_bytes` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`supersedes_id` integer,
	`superseded_at` integer,
	`uploaded_by` text DEFAULT 'admin' NOT NULL,
	`uploaded_by_user_id` integer,
	`visible_to_client` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `client_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `portal_documents_client_idx` ON `portal_documents` (`client_id`);--> statement-breakpoint
CREATE TABLE `portal_message_reads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` integer NOT NULL,
	`client_user_id` integer NOT NULL,
	`last_read_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `portal_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_user_id`) REFERENCES `client_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portal_message_reads_thread_user_idx` ON `portal_message_reads` (`thread_id`,`client_user_id`);--> statement-breakpoint
CREATE TABLE `portal_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` integer NOT NULL,
	`author_type` text NOT NULL,
	`author_user_id` integer,
	`author_name` text,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `portal_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `client_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `portal_messages_thread_idx` ON `portal_messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `portal_notification_prefs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_user_id` integer NOT NULL,
	`type` text NOT NULL,
	`email_enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`client_user_id`) REFERENCES `client_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portal_notification_prefs_user_type_idx` ON `portal_notification_prefs` (`client_user_id`,`type`);--> statement-breakpoint
CREATE TABLE `portal_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_user_id` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`href` text,
	`read_at` integer,
	`emailed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_user_id`) REFERENCES `client_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portal_notifications_user_idx` ON `portal_notifications` (`client_user_id`);--> statement-breakpoint
CREATE TABLE `portal_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`client_user_id` integer NOT NULL,
	`ip` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`client_user_id`) REFERENCES `client_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portal_sessions_user_idx` ON `portal_sessions` (`client_user_id`);--> statement-breakpoint
CREATE INDEX `portal_sessions_expires_idx` ON `portal_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `portal_threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`project_id` integer,
	`subject` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`last_message_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `portal_threads_client_idx` ON `portal_threads` (`client_id`);--> statement-breakpoint
CREATE TABLE `project_milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'pendiente' NOT NULL,
	`due_at` integer,
	`completed_at` integer,
	`visible_to_client` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_milestones_project_idx` ON `project_milestones` (`project_id`);--> statement-breakpoint
ALTER TABLE `clients` ADD `portal_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `logo_url` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `billing_info` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `invoice_id` integer;