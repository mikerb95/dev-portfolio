CREATE TABLE `skill_milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`track_id` integer NOT NULL,
	`area` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`position` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pendiente' NOT NULL,
	`completed_on` text,
	`evidence_url` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`track_id`) REFERENCES `skill_tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `skill_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`track_id` integer NOT NULL,
	`day` text NOT NULL,
	`minutes` integer NOT NULL,
	`topic` text NOT NULL,
	`note` text,
	`milestone_id` integer,
	`created_at` integer,
	FOREIGN KEY (`track_id`) REFERENCES `skill_tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `skill_tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`tagline` text,
	`motivation` text,
	`weekly_goal_minutes` integer DEFAULT 360 NOT NULL,
	`accent` text DEFAULT 'violet' NOT NULL,
	`started_on` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_tracks_slug_unique` ON `skill_tracks` (`slug`);--> statement-breakpoint
CREATE TABLE `training_access_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`note` text,
	`expires_at` integer,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`revoked_at` integer,
	`last_used_at` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `training_access_codes_code_unique` ON `training_access_codes` (`code`);--> statement-breakpoint
CREATE TABLE `training_programs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`audience` text,
	`format` text DEFAULT 'taller' NOT NULL,
	`duration_hours` real,
	`level` text DEFAULT 'intro' NOT NULL,
	`outcomes` text,
	`modules` text,
	`price_note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `training_programs_slug_unique` ON `training_programs` (`slug`);--> statement-breakpoint
CREATE TABLE `training_resources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`kind` text DEFAULT 'guia' NOT NULL,
	`body` text,
	`external_url` text,
	`file_url` text,
	`deck_id` integer,
	`program_id` integer,
	`level` text DEFAULT 'intro' NOT NULL,
	`topics` text,
	`visibility` text DEFAULT 'borrador' NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`program_id`) REFERENCES `training_programs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `training_resources_slug_unique` ON `training_resources` (`slug`);--> statement-breakpoint
CREATE INDEX `training_resources_visibility_idx` ON `training_resources` (`visibility`,`sort_order`);