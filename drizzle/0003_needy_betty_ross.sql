CREATE TABLE `monitor_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`at` integer NOT NULL,
	`ok` integer NOT NULL,
	`status_code` integer,
	`response_ms` integer,
	`error` text,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `monitor_incidents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`resolved_at` integer,
	`cause` text,
	`last_error` text,
	`duration_sec` integer,
	`created_at` integer,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `monitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`method` text DEFAULT 'GET',
	`expected_status` integer DEFAULT 200,
	`expected_text` text,
	`latency_threshold_ms` integer DEFAULT 2000,
	`interval_min` integer DEFAULT 5,
	`active` integer DEFAULT true,
	`paused` integer DEFAULT false,
	`last_status` text DEFAULT 'unknown',
	`last_checked_at` integer,
	`last_response_ms` integer,
	`ssl_expires_at` integer,
	`ssl_checked_at` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
