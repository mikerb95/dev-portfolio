ALTER TABLE `invoices` ADD `doc_type` text DEFAULT 'factura' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `issuer_snapshot` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `payer_snapshot` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `concept` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `period_start` integer;--> statement-breakpoint
ALTER TABLE `invoices` ADD `period_end` integer;--> statement-breakpoint
ALTER TABLE `invoices` ADD `contract_ref` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `city` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `retentions` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `retentions_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `net_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `ss_planilla` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `ss_periodo` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `signature_url` text;--> statement-breakpoint
CREATE INDEX `invoices_doc_type_idx` ON `invoices` (`doc_type`);