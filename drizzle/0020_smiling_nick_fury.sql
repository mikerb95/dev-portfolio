CREATE TABLE `cv_downloads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_hash` text NOT NULL,
	`signals` text,
	`lib_fp_hash` text,
	`entropy_bits` real,
	`ip` text,
	`user_agent` text,
	`referer` text,
	`download_token` text NOT NULL,
	`downloaded_at` integer,
	`revisits` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cv_downloads_hash_idx` ON `cv_downloads` (`device_hash`);--> statement-breakpoint
CREATE INDEX `cv_downloads_token_idx` ON `cv_downloads` (`download_token`);--> statement-breakpoint
CREATE INDEX `cv_downloads_created_idx` ON `cv_downloads` (`created_at`);