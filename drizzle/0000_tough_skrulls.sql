CREATE TABLE `briefings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer,
	`project_id` integer,
	`title` text NOT NULL,
	`status` text DEFAULT 'borrador',
	`objective` text,
	`scope` text,
	`requirements` text,
	`deliverables` text,
	`estimated_budget` real,
	`agreed_budget` real,
	`estimated_hours` integer,
	`deadline` integer,
	`notes` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`company` text,
	`notes` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `education_milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`institution` text,
	`description` text,
	`skills` text,
	`status` text DEFAULT 'en_curso',
	`start_date` integer,
	`completed_date` integer,
	`certificate_url` text,
	`project_id` integer,
	`is_public` integer DEFAULT true,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `finances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`client_id` integer,
	`description` text,
	`amount` real NOT NULL,
	`status` text NOT NULL,
	`due_date` integer,
	`created_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`read` integer DEFAULT false,
	`client_id` integer,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `project_adrs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'aceptado',
	`context` text NOT NULL,
	`decision` text NOT NULL,
	`rationale` text NOT NULL,
	`alternatives` text,
	`consequences` text,
	`is_public` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`role` text DEFAULT 'otro',
	`phone` text,
	`notes` text,
	`created_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_env_vars` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`environment` text DEFAULT 'all',
	`notes` text,
	`created_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`url` text,
	`username` text,
	`notes` text,
	`created_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`tech_stack` text,
	`repo_url` text,
	`preview_url` text,
	`screenshot_url` text,
	`visible` integer DEFAULT false,
	`status` text DEFAULT 'activo',
	`start_date` integer,
	`end_date` integer,
	`internal_notes` text,
	`client_id` integer,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);