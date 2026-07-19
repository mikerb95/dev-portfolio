CREATE TABLE `education_lab_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lab_slug` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `education_lab_progress_lab_slug_unique` ON `education_lab_progress` (`lab_slug`);