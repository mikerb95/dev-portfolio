CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text DEFAULT 'note' NOT NULL,
	`client_id` integer,
	`project_id` integer,
	`title` text NOT NULL,
	`body` text,
	`occurred_at` integer,
	`next_action` text,
	`due_date` integer,
	`done` integer DEFAULT false,
	`done_at` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_project_services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`client_id` integer,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`provider` text,
	`url` text,
	`username` text,
	`cost` real,
	`currency` text DEFAULT 'USD',
	`billing_cycle` text DEFAULT 'monthly',
	`renewal_date` integer,
	`auto_renew` integer DEFAULT true,
	`active` integer DEFAULT true,
	`payer` text DEFAULT 'me',
	`billed_to_client` real,
	`secrets` text,
	`notes` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_project_services`("id", "project_id", "client_id", "name", "category", "provider", "url", "username", "cost", "currency", "billing_cycle", "renewal_date", "auto_renew", "active", "payer", "billed_to_client", "secrets", "notes", "created_at", "updated_at") SELECT "id", "project_id", "client_id", "name", "category", "provider", "url", "username", "cost", "currency", "billing_cycle", "renewal_date", "auto_renew", "active", "payer", "billed_to_client", "secrets", "notes", "created_at", "updated_at" FROM `project_services`;--> statement-breakpoint
DROP TABLE `project_services`;--> statement-breakpoint
ALTER TABLE `__new_project_services` RENAME TO `project_services`;--> statement-breakpoint
PRAGMA foreign_keys=ON;