CREATE TABLE `hackaton_tableros` (
	`id` text PRIMARY KEY NOT NULL,
	`estado` text NOT NULL,
	`version` integer NOT NULL,
	`actualizado` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hackaton_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tablero` text NOT NULL,
	`hash` text NOT NULL,
	`creado` integer NOT NULL,
	`revocado` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hackaton_tokens_hash_uq` ON `hackaton_tokens` (`hash`);