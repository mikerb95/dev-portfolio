CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`login` text,
	`user_agent` text,
	`ip` text,
	`first_seen` integer,
	`last_seen` integer,
	`revoked_at` integer
);
