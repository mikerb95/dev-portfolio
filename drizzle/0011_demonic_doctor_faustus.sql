CREATE TABLE `web_vitals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`rating` text,
	`path` text,
	`navigation_type` text,
	`created_at` integer
);
