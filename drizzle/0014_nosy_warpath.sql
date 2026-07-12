CREATE TABLE `webauthn_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`login` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`device_type` text,
	`backed_up` integer DEFAULT false NOT NULL,
	`nickname` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE INDEX `webauthn_credentials_login_idx` ON `webauthn_credentials` (`login`);