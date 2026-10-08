PRAGMA foreign_keys=OFF;--> statement-breakpoint
DELETE FROM `settings` WHERE `key` = 'promoteAfter';--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "settings_key" CHECK("key" in ('currency', 'bufferAmount', 'emergencyFundMonths', 'staleImportDays', 'recurringGraceDays'))
);
--> statement-breakpoint
INSERT INTO `__new_settings`("key", "value") SELECT "key", "value" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`merchant_id` text,
	`notes` text,
	`payee_raw` text NOT NULL,
	`payee_normalized` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`import_row_id` text,
	`transfer_peer_id` text,
	`mirror` integer DEFAULT false NOT NULL,
	`auto_reason` text,
	`auto_source_id` text,
	`deleted_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_row_id`) REFERENCES `import_rows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transfer_peer_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_date" CHECK("date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "transactions_status" CHECK("status" in ('open', 'cleared', 'reconciled')),
	CONSTRAINT "transactions_source" CHECK("source" in ('import', 'manual', 'mcp')),
	CONSTRAINT "transactions_auto_reason" CHECK(("auto_reason" is null or "auto_reason" in ('rule', 'learned'))),
	CONSTRAINT "transactions_transfer_peer" CHECK("transfer_peer_id" is null or "transfer_peer_id" <> "id")
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "account_id", "date", "amount", "merchant_id", "notes", "payee_raw", "payee_normalized", "status", "source", "import_row_id", "transfer_peer_id", "mirror", "auto_reason", "auto_source_id", "deleted_at") SELECT "id", "account_id", "date", "amount", "merchant_id", "notes", "payee_raw", "payee_normalized", "status", "source", "import_row_id", "transfer_peer_id", "mirror", NULL, NULL, "deleted_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_import_row_id_unique` ON `transactions` (`import_row_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_transfer_peer_id_unique` ON `transactions` (`transfer_peer_id`);--> statement-breakpoint
CREATE INDEX `transactions_active_date` ON `transactions` (`date`,`id`) WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX `transactions_active_account_date` ON `transactions` (`account_id`,`date`,`id`,`amount`) WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX `transactions_active_merchant_date` ON `transactions` (`merchant_id`,`date`,`id`) WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX `transactions_payee_normalized` ON `transactions` (`payee_normalized`,`date`,`id`) WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
PRAGMA foreign_keys=ON;