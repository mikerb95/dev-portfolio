CREATE TABLE `ep_agenda_episodios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cita` integer NOT NULL,
	`abierta_en` integer NOT NULL,
	`como` text NOT NULL,
	`cerrada_en` integer,
	`cierre` text
);
--> statement-breakpoint
CREATE INDEX `ep_agenda_episodios_cita_idx` ON `ep_agenda_episodios` (`cita`);