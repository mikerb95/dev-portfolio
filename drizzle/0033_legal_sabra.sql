CREATE TABLE `load_test_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tool` text DEFAULT 'k6' NOT NULL,
	`scenario` text NOT NULL,
	`target` text NOT NULL,
	`vus_max` integer,
	`duration_s` integer,
	`requests` integer,
	`rps` real,
	`p50` real,
	`p95` real,
	`p99` real,
	`avg_ms` real,
	`max_ms` real,
	`error_rate_pct` real,
	`checks_passed` integer,
	`checks_failed` integer,
	`thresholds_ok` integer,
	`sustained_rps` real,
	`breaking_point_rps` real,
	`recovered_after_s` integer,
	`steps_json` text,
	`findings_json` text,
	`raw_json` text,
	`ran_at` integer NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `load_test_runs_ran_at_idx` ON `load_test_runs` (`ran_at`);