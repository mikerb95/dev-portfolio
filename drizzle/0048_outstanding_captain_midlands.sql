CREATE TABLE `vigia_corridas` (
	`session_id` text PRIMARY KEY NOT NULL,
	`desenlace` text NOT NULL,
	`estado` text,
	`resumen` text,
	`informe` text,
	`informe_md` text,
	`pendientes` text,
	`costo_centavos` integer,
	`activo_segundos` integer,
	`creada` integer NOT NULL,
	`actualizada` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vigia_corridas_creada_idx` ON `vigia_corridas` (`creada`);