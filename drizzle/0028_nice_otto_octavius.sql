CREATE TABLE `sena_ep_recordatorios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text NOT NULL,
	`inicio` text NOT NULL,
	`dias_antes` integer DEFAULT 3 NOT NULL,
	`notified_keys` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer
);
