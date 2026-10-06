CREATE TABLE `cotiza_adicionales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`encargo_id` integer NOT NULL,
	`origen` text NOT NULL,
	`referencia_id` integer,
	`descripcion` text NOT NULL,
	`horas` real NOT NULL,
	`nivel` text NOT NULL,
	`urgente` integer DEFAULT false NOT NULL,
	`tarifa` integer NOT NULL,
	`recargo` integer DEFAULT 0 NOT NULL,
	`monto` integer NOT NULL,
	`estado` text DEFAULT 'propuesto' NOT NULL,
	`decidido_el` integer,
	`creado_el` integer NOT NULL,
	FOREIGN KEY (`encargo_id`) REFERENCES `cotiza_encargos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cotiza_adicionales_encargo_idx` ON `cotiza_adicionales` (`encargo_id`);--> statement-breakpoint
CREATE TABLE `cotiza_encargos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`titulo` text NOT NULL,
	`cliente_nombre` text DEFAULT '' NOT NULL,
	`cliente_empresa` text,
	`cliente_contacto` text,
	`moneda` text DEFAULT 'COP' NOT NULL,
	`estado` text DEFAULT 'borrador' NOT NULL,
	`config` text NOT NULL,
	`snapshot` text,
	`huella` text,
	`precio` integer,
	`enviado_el` integer,
	`aceptado_el` integer,
	`cerrado_el` integer,
	`creado_el` integer NOT NULL,
	`actualizado_el` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cotiza_encargos_estado_idx` ON `cotiza_encargos` (`estado`);--> statement-breakpoint
CREATE TABLE `cotiza_reuniones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`encargo_id` integer NOT NULL,
	`fecha` text NOT NULL,
	`minutos` integer NOT NULL,
	`resumen` text DEFAULT '' NOT NULL,
	`plazo_correccion` text NOT NULL,
	`creado_el` integer NOT NULL,
	FOREIGN KEY (`encargo_id`) REFERENCES `cotiza_encargos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cotiza_reuniones_encargo_idx` ON `cotiza_reuniones` (`encargo_id`);--> statement-breakpoint
CREATE TABLE `cotiza_rondas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`encargo_id` integer NOT NULL,
	`entregable` integer NOT NULL,
	`nota` text DEFAULT '' NOT NULL,
	`creado_el` integer NOT NULL,
	FOREIGN KEY (`encargo_id`) REFERENCES `cotiza_encargos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cotiza_rondas_encargo_idx` ON `cotiza_rondas` (`encargo_id`);--> statement-breakpoint
CREATE TABLE `cotiza_solicitudes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`encargo_id` integer NOT NULL,
	`pedido_el` integer NOT NULL,
	`canal` text NOT NULL,
	`texto` text NOT NULL,
	`clasificacion` text NOT NULL,
	`fuera_de_horario` integer DEFAULT false NOT NULL,
	`creado_el` integer NOT NULL,
	FOREIGN KEY (`encargo_id`) REFERENCES `cotiza_encargos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cotiza_solicitudes_encargo_idx` ON `cotiza_solicitudes` (`encargo_id`);