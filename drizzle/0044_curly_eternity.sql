CREATE TABLE `asistente_conversaciones` (
	`id` text PRIMARY KEY NOT NULL,
	`creada` integer NOT NULL,
	`actualizada` integer NOT NULL,
	`estado` text NOT NULL,
	`pregunta` text NOT NULL,
	`mensajes` text NOT NULL,
	`propuesta` text,
	`respuesta` text,
	`error` text,
	`turnos` integer DEFAULT 1 NOT NULL,
	`iteraciones` integer DEFAULT 0 NOT NULL,
	`tokens_entrada` integer DEFAULT 0 NOT NULL,
	`tokens_salida` integer DEFAULT 0 NOT NULL,
	`tokens_cache_lectura` integer DEFAULT 0 NOT NULL,
	`tokens_cache_escritura` integer DEFAULT 0 NOT NULL,
	`costo_usd` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `asistente_conversaciones_creada_idx` ON `asistente_conversaciones` (`creada`);--> statement-breakpoint
CREATE INDEX `asistente_conversaciones_actualizada_idx` ON `asistente_conversaciones` (`actualizada`);