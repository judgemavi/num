PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`match` text NOT NULL,
	`pattern` text NOT NULL,
	`account_id` text,
	`merchant_id` text,
	`category_id` text,
	`priority` integer NOT NULL,
	`origin` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rules_match" CHECK("match" in ('exact', 'prefix', 'contains')),
	CONSTRAINT "rules_origin" CHECK("origin" in ('manual', 'promoted')),
	CONSTRAINT "rules_target" CHECK("merchant_id" is not null or "category_id" is not null)
);
--> statement-breakpoint
DELETE FROM `rules` WHERE "match" = 'regex';--> statement-breakpoint
INSERT INTO `__new_rules`("id", "match", "pattern", "account_id", "merchant_id", "category_id", "priority", "origin", "archived_at") SELECT "id", "match", "pattern", "account_id", "merchant_id", "category_id", "priority", "origin", "archived_at" FROM `rules`;--> statement-breakpoint
DROP TABLE `rules`;--> statement-breakpoint
ALTER TABLE `__new_rules` RENAME TO `rules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `transactions` ADD `payee_normalized` text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE INDEX `transactions_payee_normalized` ON `transactions` (`payee_normalized`,`date`,`id`) WHERE "transactions"."deleted_at" is null;