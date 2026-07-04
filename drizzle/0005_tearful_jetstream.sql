CREATE TABLE `lab_experiments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`params` text,
	`ok` integer,
	`result` text,
	`ran_at` integer
);
--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_id` integer NOT NULL,
	`provider` text NOT NULL,
	`type` text NOT NULL,
	`gateway_tx_id` text,
	`event_status` text,
	`payload` text,
	`duplicate` integer DEFAULT false NOT NULL,
	`out_of_order` integer DEFAULT false NOT NULL,
	`received_at` integer,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`description` text,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'COP' NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`provider` text DEFAULT 'mock' NOT NULL,
	`gateway_tx_id` text,
	`payer_email` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_reference_unique` ON `payments` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_idempotency_key_unique` ON `payments` (`idempotency_key`);