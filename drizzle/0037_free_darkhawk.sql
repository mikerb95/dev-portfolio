CREATE TABLE `analista_ejecuciones` (
	`id` text PRIMARY KEY NOT NULL,
	`creada` integer NOT NULL,
	`actualizada` integer NOT NULL,
	`estado` text NOT NULL,
	`pregunta` text NOT NULL,
	`mensajes` text NOT NULL,
	`seudonimos` text DEFAULT '{}' NOT NULL,
	`propuesta` text,
	`respuesta` text,
	`error` text,
	`iteraciones` integer DEFAULT 0 NOT NULL,
	`tokens_entrada` integer DEFAULT 0 NOT NULL,
	`tokens_salida` integer DEFAULT 0 NOT NULL,
	`tokens_cache_lectura` integer DEFAULT 0 NOT NULL,
	`tokens_cache_escritura` integer DEFAULT 0 NOT NULL,
	`costo_usd` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analista_ejecuciones_actualizada_idx` ON `analista_ejecuciones` (`actualizada`);--> statement-breakpoint
CREATE INDEX `analista_ejecuciones_creada_idx` ON `analista_ejecuciones` (`creada`);