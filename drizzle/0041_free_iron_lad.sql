CREATE TABLE `propuesta_horas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`propuesta_id` integer NOT NULL,
	`componente_id` text NOT NULL,
	`estimadas` real NOT NULL,
	`reales` real NOT NULL,
	`actualizada_el` integer NOT NULL,
	FOREIGN KEY (`propuesta_id`) REFERENCES `propuestas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `propuesta_horas_componente_idx` ON `propuesta_horas` (`propuesta_id`,`componente_id`);--> statement-breakpoint
CREATE TABLE `propuesta_versiones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`propuesta_id` integer NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`huella` text NOT NULL,
	`origen` text DEFAULT 'panel' NOT NULL,
	`creada_el` integer NOT NULL,
	FOREIGN KEY (`propuesta_id`) REFERENCES `propuestas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `propuesta_versiones_version_idx` ON `propuesta_versiones` (`propuesta_id`,`version`);--> statement-breakpoint
CREATE TABLE `propuestas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`client_id` integer,
	`titulo` text NOT NULL,
	`estado` text DEFAULT 'borrador' NOT NULL,
	`config` text NOT NULL,
	`version_actual` integer DEFAULT 0 NOT NULL,
	`conversacion` text,
	`revision` text,
	`ia_usd` real DEFAULT 0 NOT NULL,
	`vista_primera` integer,
	`vistas` integer DEFAULT 0 NOT NULL,
	`aceptada_version` integer,
	`aceptada_por` text,
	`aceptada_documento` text,
	`aceptada_el` integer,
	`aceptacion_huella` text,
	`anticipo_payment_id` integer,
	`project_id` integer,
	`enviada_el` integer,
	`creada_el` integer NOT NULL,
	`actualizada_el` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`anticipo_payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `propuestas_token_unique` ON `propuestas` (`token`);--> statement-breakpoint
CREATE INDEX `propuestas_estado_idx` ON `propuestas` (`estado`);