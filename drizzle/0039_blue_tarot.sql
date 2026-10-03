CREATE TABLE `asesor_conversaciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`creada` integer NOT NULL,
	`actualizada` integer NOT NULL,
	`locale` text NOT NULL,
	`pagina` text,
	`estado` text DEFAULT 'ia' NOT NULL,
	`motivo` text NOT NULL,
	`visto_visitante` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asesor_conversaciones_token_idx` ON `asesor_conversaciones` (`token_hash`);--> statement-breakpoint
CREATE INDEX `asesor_conversaciones_creada_idx` ON `asesor_conversaciones` (`creada`);--> statement-breakpoint
CREATE TABLE `asesor_mensajes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversacion_id` integer NOT NULL,
	`autor` text NOT NULL,
	`texto` text NOT NULL,
	`creado` integer NOT NULL,
	FOREIGN KEY (`conversacion_id`) REFERENCES `asesor_conversaciones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asesor_mensajes_conversacion_idx` ON `asesor_mensajes` (`conversacion_id`,`id`);