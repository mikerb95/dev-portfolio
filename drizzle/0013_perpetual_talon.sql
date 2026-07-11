CREATE TABLE `fp_devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`device_hash` text NOT NULL,
	`label` integer NOT NULL,
	`own_fp` text,
	`lib_fp_hash` text,
	`entropy_bits` real,
	`behavior_sig` text,
	`revisits` integer DEFAULT 0 NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `fp_rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fp_devices_room_idx` ON `fp_devices` (`room_id`);--> statement-breakpoint
CREATE INDEX `fp_devices_hash_idx` ON `fp_devices` (`device_hash`);--> statement-breakpoint
CREATE TABLE `fp_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fp_rooms_expires_idx` ON `fp_rooms` (`expires_at`);