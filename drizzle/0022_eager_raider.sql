CREATE INDEX `ci_runs_created_idx` ON `ci_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `monitor_checks_monitor_at_idx` ON `monitor_checks` (`monitor_id`,`at`);--> statement-breakpoint
CREATE INDEX `monitor_checks_at_idx` ON `monitor_checks` (`at`);--> statement-breakpoint
CREATE INDEX `web_vitals_created_idx` ON `web_vitals` (`created_at`);