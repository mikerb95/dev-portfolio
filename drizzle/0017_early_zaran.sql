CREATE TABLE `security_findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fingerprint` text NOT NULL,
	`source` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`route` text,
	`rule_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`note` text,
	`resolved_at` integer,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_findings_fingerprint_unique` ON `security_findings` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `security_findings_status_idx` ON `security_findings` (`status`);--> statement-breakpoint
CREATE INDEX `security_findings_source_idx` ON `security_findings` (`source`);