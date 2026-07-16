ALTER TABLE `clients` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `payer_phone` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `source` text DEFAULT 'pay' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `short_code` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `client_id` integer REFERENCES clients(id);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_short_code_unique` ON `payments` (`short_code`);--> statement-breakpoint
CREATE INDEX `payments_phone_idx` ON `payments` (`payer_phone`);--> statement-breakpoint
CREATE INDEX `payments_source_idx` ON `payments` (`source`);