CREATE TABLE `portal_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`project_id` integer,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`detail` text,
	`href` text,
	`visible_to_client` integer DEFAULT true NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portal_activity_client_at_idx` ON `portal_activity` (`client_id`,`at`);--> statement-breakpoint
CREATE INDEX `portal_activity_project_at_idx` ON `portal_activity` (`project_id`,`at`);