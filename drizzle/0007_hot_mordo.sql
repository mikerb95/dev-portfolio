CREATE TABLE `chaos_flags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`target_route` text NOT NULL,
	`param` integer,
	`active` integer DEFAULT true NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer
);
