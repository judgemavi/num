UPDATE `transaction_lines` SET `category_id` = NULL WHERE `transfer_account_id` IS NULL AND `transaction_id` IN (SELECT `id` FROM `transactions` WHERE `auto_reason` = 'merchant_default');--> statement-breakpoint
UPDATE `transactions` SET `auto_reason` = NULL, `auto_confidence` = NULL, `auto_source_id` = NULL WHERE `auto_reason` = 'merchant_default';--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
INSERT INTO `__new_merchants`("id", "name", "archived_at") SELECT "id", "name", "archived_at" FROM `merchants`;--> statement-breakpoint
DROP TABLE `merchants`;--> statement-breakpoint
ALTER TABLE `__new_merchants` RENAME TO `merchants`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_name_lower_unique` ON `merchants` (lower("name"));