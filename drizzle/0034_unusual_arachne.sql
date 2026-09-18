CREATE TABLE `living_costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'COP' NOT NULL,
	`cycle` text DEFAULT 'monthly' NOT NULL,
	`anchor_month` integer,
	`due_day` integer,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `living_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`periodo` text NOT NULL,
	`living_cost_id` integer,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'COP' NOT NULL,
	`spent_on` text,
	`notes` text,
	`created_at` integer,
	FOREIGN KEY (`living_cost_id`) REFERENCES `living_costs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `living_expenses_periodo_idx` ON `living_expenses` (`periodo`);