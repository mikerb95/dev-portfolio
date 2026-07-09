CREATE TABLE `blocked_ips` (
	`ip` text PRIMARY KEY NOT NULL,
	`reason` text,
	`rule_id` text,
	`hits` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`source` text DEFAULT 'auto' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `blocked_ips_expires_idx` ON `blocked_ips` (`expires_at`);--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `security_anomalies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`z_score` real,
	`baseline` real,
	`observed` real,
	`detail` text,
	`notified` integer DEFAULT false NOT NULL,
	`acknowledged` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`ip` text,
	`ip_hash` text,
	`method` text,
	`path` text NOT NULL,
	`query` text,
	`user_agent` text,
	`country` text,
	`asn` text,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`action` text DEFAULT 'logged' NOT NULL,
	`status_code` integer,
	`rule_id` text,
	`hits` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `security_events_at_idx` ON `security_events` (`at`);--> statement-breakpoint
CREATE INDEX `security_events_ip_idx` ON `security_events` (`ip`);--> statement-breakpoint
CREATE INDEX `security_events_ip_hash_idx` ON `security_events` (`ip_hash`);--> statement-breakpoint
CREATE TABLE `security_rollups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bucket` text NOT NULL,
	`at` integer NOT NULL,
	`category` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`unique_ips` integer DEFAULT 0 NOT NULL,
	`top_path` text,
	`top_country` text
);
