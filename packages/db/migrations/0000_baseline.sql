CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`institution` text,
	`kind` text NOT NULL,
	`on_budget` integer NOT NULL,
	`opening_date` text,
	`opening_balance` integer NOT NULL,
	`archived_at` text,
	`payment_policy` text,
	`fixed_payment` integer,
	`interest_rate_milli_pct` integer,
	`import_preset` text,
	`column_map` text,
	`created_on` text NOT NULL,
	`created_at` text NOT NULL,
	`sort_key` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accounts_sort_key_idx` ON `accounts` (`sort_key`,`name`,`id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`source` text NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bank_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`balance` integer NOT NULL,
	`import_batch_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_balances_account_date` ON `bank_balances` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `bucket_categories` (
	`category_id` text PRIMARY KEY NOT NULL,
	`bucket_id` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bucket_id`) REFERENCES `buckets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bucket_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`bucket_id` text NOT NULL,
	`other_bucket_id` text,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`month` text,
	`undone_at` text,
	FOREIGN KEY (`bucket_id`) REFERENCES `buckets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`other_bucket_id`) REFERENCES `buckets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bucket_events_bucket` ON `bucket_events` (`bucket_id`);--> statement-breakpoint
CREATE TABLE `buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`priority` integer NOT NULL,
	`essential` integer,
	`color` text NOT NULL,
	`icon` text NOT NULL,
	`start_date` text NOT NULL,
	`archived_at` text,
	`refill_to` integer,
	`amount` integer,
	`due_date` text,
	`repeat` text,
	`target` integer,
	`target_date` text,
	`fixed_amount` integer,
	`months` integer,
	`can_recede` integer,
	`paused_at` text,
	`sort_key` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `buckets_sort_key_idx` ON `buckets` (`sort_key`,`name`,`id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`group_id` text,
	`archived_at` text,
	`sort_key` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `category_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_lower_unique` ON `categories` (lower("name"));--> statement-breakpoint
CREATE INDEX `categories_sort_key_idx` ON `categories` (`sort_key`,`name`,`id`);--> statement-breakpoint
CREATE TABLE `category_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_groups_name_lower_unique` ON `category_groups` (lower("name"));--> statement-breakpoint
CREATE INDEX `category_groups_sort_key_idx` ON `category_groups` (`sort_key`,`name`,`id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`hash` text NOT NULL,
	`mime_type` text NOT NULL,
	`storage_path` text NOT NULL,
	`uploaded_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_hash_unique` ON `documents` (`hash`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`document_id` text NOT NULL,
	`parser` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`closing_balance` integer,
	`closing_date` text,
	`unreadable_json` text DEFAULT '[]' NOT NULL,
	`imported_on` text NOT NULL,
	`created_at` text NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `import_rows` (
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
	`previous_status` text,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_rows_batch_row_unique` ON `import_rows` (`batch_id`,`row_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `import_rows_account_identity_active` ON `import_rows` (`account_id`,`identity`) WHERE "import_rows"."active" = 1 and "import_rows"."outcome" <> 'duplicate';--> statement-breakpoint
CREATE INDEX `import_rows_batch` ON `import_rows` (`batch_id`);--> statement-breakpoint
CREATE INDEX `import_rows_transaction` ON `import_rows` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `inbox_decisions` (
	`item_key` text PRIMARY KEY NOT NULL,
	`decision` text NOT NULL,
	`decided_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `line_tags` (
	`line_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`line_id`, `tag_id`),
	FOREIGN KEY (`line_id`) REFERENCES `transaction_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `line_tags_tag` ON `line_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`archived_at` text,
	`sort_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_name_lower_unique` ON `merchants` (lower("name"));--> statement-breakpoint
CREATE INDEX `merchants_sort_key_idx` ON `merchants` (`sort_key`,`name`,`id`);--> statement-breakpoint
CREATE TABLE `mortgage_terms` (
	`account_id` text PRIMARY KEY NOT NULL,
	`rate_milli_pct` integer NOT NULL,
	`compounding` text NOT NULL,
	`payment_amount` integer NOT NULL,
	`payment_frequency` text NOT NULL,
	`first_payment_date` text NOT NULL,
	`term_end` text NOT NULL,
	`amortization_months_remaining` integer NOT NULL,
	`payment_account_id` text NOT NULL,
	`interest_category_id` text NOT NULL,
	`property_account_id` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`interest_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `occurrence_links` (
	`id` text PRIMARY KEY NOT NULL,
	`bucket_id` text NOT NULL,
	`due_date` text NOT NULL,
	`transaction_id` text,
	`skipped` integer NOT NULL,
	`reason` text,
	FOREIGN KEY (`bucket_id`) REFERENCES `schedules`(`bucket_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_links_transaction_id_unique` ON `occurrence_links` (`transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_links_bucket_due_date` ON `occurrence_links` (`bucket_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`bucket_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expected_amount` integer NOT NULL,
	`tolerance` integer NOT NULL,
	`amount_mode` text NOT NULL,
	`category_id` text,
	`transfer_account_id` text,
	`merchant_id` text,
	`start_date` text NOT NULL,
	`freq` text NOT NULL,
	`interval` integer NOT NULL,
	`month_day` integer,
	`business_day_shift` text NOT NULL,
	`end_date` text,
	FOREIGN KEY (`bucket_id`) REFERENCES `buckets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transfer_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`archived_at` text,
	`sort_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_lower_unique` ON `tags` (lower("name"));--> statement-breakpoint
CREATE INDEX `tags_sort_key_idx` ON `tags` (`sort_key`,`name`,`id`);--> statement-breakpoint
CREATE TABLE `transaction_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`amount` integer NOT NULL,
	`memo` text,
	`category_id` text,
	`transfer_account_id` text,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transfer_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transaction_lines_transfer_account` ON `transaction_lines` (`transfer_account_id`) WHERE "transaction_lines"."transfer_account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `transaction_lines_transaction` ON `transaction_lines` (`transaction_id`,`id`,`category_id`,`transfer_account_id`);--> statement-breakpoint
CREATE INDEX `transaction_lines_category` ON `transaction_lines` (`category_id`);--> statement-breakpoint
CREATE INDEX `transaction_lines_uncategorized` ON `transaction_lines` (`transaction_id`) WHERE "transaction_lines"."category_id" is null and "transaction_lines"."transfer_account_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_lines_one_transfer` ON `transaction_lines` (`transaction_id`) WHERE "transaction_lines"."transfer_account_id" is not null;--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`merchant_id` text,
	`payee_raw` text NOT NULL,
	`payee_normalized` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`import_row_id` text,
	`transfer_peer_id` text,
	`mirror` integer DEFAULT false NOT NULL,
	`auto_reason` text,
	`auto_confidence` integer,
	`auto_source_id` text,
	`refund_of_id` text,
	`edited_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_row_id`) REFERENCES `import_rows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transfer_peer_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`refund_of_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_import_row_id_unique` ON `transactions` (`import_row_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_transfer_peer_id_unique` ON `transactions` (`transfer_peer_id`);--> statement-breakpoint
CREATE INDEX `transactions_auto_reason` ON `transactions` (`auto_reason`) WHERE "transactions"."auto_reason" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `transactions_refund_of` ON `transactions` (`refund_of_id`);--> statement-breakpoint
CREATE INDEX `transactions_date` ON `transactions` (`date`,`id`);--> statement-breakpoint
CREATE INDEX `transactions_account_date` ON `transactions` (`account_id`,`date`,`id`,`amount`);--> statement-breakpoint
CREATE INDEX `transactions_merchant_date` ON `transactions` (`merchant_id`,`date`,`id`);--> statement-breakpoint
CREATE INDEX `transactions_payee_normalized` ON `transactions` (`payee_normalized`,`date`,`id`);--> statement-breakpoint
CREATE INDEX `transactions_confirmed_history` ON `transactions` (`id`,`date`,`amount`,`payee_normalized`,`merchant_id`) WHERE "transactions"."mirror" = 0 and "transactions"."auto_reason" is null;--> statement-breakpoint
CREATE TABLE `valuations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`balance` integer NOT NULL,
	`note` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `valuations_account_date` ON `valuations` (`account_id`,`date`);