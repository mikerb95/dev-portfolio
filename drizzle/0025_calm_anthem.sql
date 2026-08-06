CREATE TABLE `deck_slides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deck_id` integer NOT NULL,
	`idx` integer NOT NULL,
	`label` text,
	`speaker_notes` text,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deck_slides_deck_idx` ON `deck_slides` (`deck_id`,`idx`);--> statement-breakpoint
CREATE TABLE `decks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`blob_path` text NOT NULL,
	`blob_url` text NOT NULL,
	`file_size` integer DEFAULT 0 NOT NULL,
	`slide_count` integer DEFAULT 0 NOT NULL,
	`last_session_at` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `presentation_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deck_id` integer,
	`deck_title` text,
	`rating` integer,
	`comment` text,
	`contact` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `presentation_feedback_created_idx` ON `presentation_feedback` (`created_at`);