CREATE TABLE `marketing_campanas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asunto` text NOT NULL,
	`preheader` text,
	`titulo` text NOT NULL,
	`cuerpo` text NOT NULL,
	`boton_texto` text,
	`boton_url` text,
	`estado` text NOT NULL,
	`creada` integer NOT NULL,
	`actualizada` integer NOT NULL,
	`disparada` integer,
	`terminada` integer,
	`ultimo_error` text
);
--> statement-breakpoint
CREATE TABLE `marketing_envios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campana_id` integer NOT NULL,
	`suscriptor_id` integer NOT NULL,
	`estado` text NOT NULL,
	`lote` text,
	`lote_at` integer,
	`resend_id` text,
	`error` text,
	`creado` integer NOT NULL,
	`enviado` integer,
	FOREIGN KEY (`campana_id`) REFERENCES `marketing_campanas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`suscriptor_id`) REFERENCES `marketing_suscriptores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_envios_campana_suscriptor_uq` ON `marketing_envios` (`campana_id`,`suscriptor_id`);--> statement-breakpoint
CREATE INDEX `marketing_envios_estado_idx` ON `marketing_envios` (`estado`);--> statement-breakpoint
CREATE INDEX `marketing_envios_lote_idx` ON `marketing_envios` (`lote`);--> statement-breakpoint
CREATE INDEX `marketing_envios_suscriptor_enviado_idx` ON `marketing_envios` (`suscriptor_id`,`enviado`);--> statement-breakpoint
CREATE TABLE `marketing_suscriptores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`nombre` text,
	`origen` text NOT NULL,
	`estado` text NOT NULL,
	`texto_consentimiento` text NOT NULL,
	`token_confirmacion_hash` text,
	`client_user_id` integer,
	`creado` integer NOT NULL,
	`confirmado` integer,
	`baja` integer,
	`baja_campana_id` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_suscriptores_email_unique` ON `marketing_suscriptores` (`email`);--> statement-breakpoint
CREATE INDEX `marketing_suscriptores_estado_idx` ON `marketing_suscriptores` (`estado`);--> statement-breakpoint
CREATE INDEX `marketing_suscriptores_token_idx` ON `marketing_suscriptores` (`token_confirmacion_hash`);