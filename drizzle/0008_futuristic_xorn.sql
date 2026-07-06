CREATE TABLE `briefing_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`briefing_id` integer NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`done` integer DEFAULT false,
	`sort_order` integer DEFAULT 0,
	`created_at` integer,
	FOREIGN KEY (`briefing_id`) REFERENCES `briefings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `briefings` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `interactions` ADD `briefing_id` integer REFERENCES briefings(id);