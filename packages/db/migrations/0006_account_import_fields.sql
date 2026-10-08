PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_import_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`account_id` text NOT NULL,
	`row_index` integer NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`payee_raw` text NOT NULL,
	`bank_id` text,
	`identity` text NOT NULL,
	`outcome` text NOT NULL,
	`transaction_id` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "import_rows_row_index" CHECK("row_index" >= 0),
	CONSTRAINT "import_rows_date" CHECK("date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "import_rows_outcome" CHECK("outcome" in ('created', 'matched', 'needs_review', 'duplicate', 'ignored'))
);
--> statement-breakpoint
INSERT INTO `__new_import_rows`("id", "batch_id", "account_id", "row_index", "date", "amount", "payee_raw", "bank_id", "identity", "outcome", "transaction_id", "active") SELECT "id", "batch_id", "account_id", "row_index", "date", "amount", "payee_raw", "bank_id", "identity", "outcome", "transaction_id", "active" FROM `import_rows`;--> statement-breakpoint
DROP TABLE `import_rows`;--> statement-breakpoint
ALTER TABLE `__new_import_rows` RENAME TO `import_rows`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `import_rows_batch_row_unique` ON `import_rows` (`batch_id`,`row_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `import_rows_account_identity_active` ON `import_rows` (`account_id`,`identity`) WHERE "import_rows"."active" = 1 and "import_rows"."outcome" <> 'duplicate';--> statement-breakpoint
CREATE INDEX `import_rows_batch` ON `import_rows` (`batch_id`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `import_preset` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `column_map` text;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `unreadable_json` text DEFAULT '[]' NOT NULL;