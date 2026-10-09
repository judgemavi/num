PRAGMA foreign_keys=OFF;--> statement-breakpoint
DELETE FROM `import_rows` WHERE `batch_id` IN (SELECT `id` FROM `import_batches` WHERE `document_id` IS NULL);--> statement-breakpoint
DELETE FROM `import_batches` WHERE `document_id` IS NULL;--> statement-breakpoint
DROP TABLE `proposals`;--> statement-breakpoint
CREATE TABLE `__new_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`document_id` text NOT NULL,
	`parser` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`closing_balance` integer,
	`closing_date` text,
	`unreadable_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "import_batches_period_start" CHECK("period_start" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "import_batches_period_end" CHECK("period_end" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "import_batches_closing_date" CHECK(("closing_date" is null or "closing_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'))
);
--> statement-breakpoint
INSERT INTO `__new_import_batches`("id", "account_id", "document_id", "parser", "period_start", "period_end", "closing_balance", "closing_date", "unreadable_json", "created_at", "undone_at") SELECT "id", "account_id", "document_id", "parser", "period_start", "period_end", "closing_balance", "closing_date", "unreadable_json", "created_at", "undone_at" FROM `import_batches`;--> statement-breakpoint
DROP TABLE `import_batches`;--> statement-breakpoint
ALTER TABLE `__new_import_batches` RENAME TO `import_batches`;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "settings_key" CHECK("key" in ('currency', 'bufferAmount', 'emergencyFundMonths', 'staleImportDays', 'recurringGraceDays', 'autoConfidence', 'aiCanWrite'))
);
--> statement-breakpoint
INSERT INTO `__new_settings`("key", "value") SELECT "key", "value" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
