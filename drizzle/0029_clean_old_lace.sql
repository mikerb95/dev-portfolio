CREATE TABLE `cron_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job` text NOT NULL,
	`ok` integer NOT NULL,
	`duration_ms` integer,
	`detail` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `cron_runs_created_idx` ON `cron_runs` (`created_at`);