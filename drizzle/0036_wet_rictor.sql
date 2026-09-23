CREATE TABLE `webauthn_challenges` (
	`challenge` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`login` text NOT NULL,
	`expires_at` integer NOT NULL
);
