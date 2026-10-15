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
	`payday` integer NOT NULL,
	FOREIGN KEY (`bucket_id`) REFERENCES `buckets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transfer_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_occurrence_links` (
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
DROP TABLE `occurrence_links`;--> statement-breakpoint
DROP TABLE `recurring_plans`;--> statement-breakpoint
ALTER TABLE `__new_occurrence_links` RENAME TO `occurrence_links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_links_transaction_id_unique` ON `occurrence_links` (`transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_links_bucket_due_date` ON `occurrence_links` (`bucket_id`,`due_date`);