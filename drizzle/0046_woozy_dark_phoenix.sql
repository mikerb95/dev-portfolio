ALTER TABLE `cotiza_adicionales` ADD `decidido_por` text;--> statement-breakpoint
ALTER TABLE `cotiza_adicionales` ADD `decidido_nombre` text;--> statement-breakpoint
ALTER TABLE `cotiza_adicionales` ADD `constancia` text;--> statement-breakpoint
ALTER TABLE `cotiza_encargos` ADD `token_hash` text;--> statement-breakpoint
ALTER TABLE `cotiza_encargos` ADD `token_cifrado` text;--> statement-breakpoint
ALTER TABLE `cotiza_encargos` ADD `vista_primera` integer;--> statement-breakpoint
ALTER TABLE `cotiza_encargos` ADD `vistas` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cotiza_encargos` ADD `aceptado_por` text;--> statement-breakpoint
ALTER TABLE `cotiza_encargos` ADD `aceptado_documento` text;--> statement-breakpoint
ALTER TABLE `cotiza_encargos` ADD `aceptacion_huella` text;--> statement-breakpoint
CREATE UNIQUE INDEX `cotiza_encargos_token_idx` ON `cotiza_encargos` (`token_hash`);