CREATE TABLE `monitor_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`day` text NOT NULL,
	`total` integer NOT NULL,
	`ok` integer NOT NULL,
	`sum_ms` integer NOT NULL,
	`latency_hist` text NOT NULL,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitor_daily_monitor_day_idx` ON `monitor_daily` (`monitor_id`,`day`);--> statement-breakpoint
CREATE INDEX `monitor_daily_day_idx` ON `monitor_daily` (`day`);