CREATE TABLE `presentation_slides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`presentation_id` integer NOT NULL,
	`order` integer NOT NULL,
	`url` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`presentation_id`) REFERENCES `presentations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `presentations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`title` text NOT NULL,
	`share_token` text NOT NULL,
	`current_slide` integer DEFAULT 0,
	`is_active` integer DEFAULT false,
	`created_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `presentations_share_token_unique` ON `presentations` (`share_token`);