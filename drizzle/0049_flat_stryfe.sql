CREATE TABLE `aeo_diario` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dia` text NOT NULL,
	`tipo` text NOT NULL,
	`fuente` text NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`hits_llms` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aeo_diario_dia_tipo_fuente_idx` ON `aeo_diario` (`dia`,`tipo`,`fuente`);