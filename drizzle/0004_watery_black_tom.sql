CREATE TABLE `ci_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sha` text NOT NULL,
	`branch` text,
	`run_id` text,
	`url` text,
	`conclusion` text NOT NULL,
	`tests_passed` integer,
	`tests_failed` integer,
	`coverage_pct` real,
	`duration_ms` integer,
	`health_ok` integer,
	`created_at` integer
);
