PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`match` text NOT NULL,
	`pattern` text NOT NULL,
	`account_id` text,
	`merchant_id` text,
	`category_id` text,
	`transfer_account_id` text,
	`priority` integer NOT NULL,
	`origin` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transfer_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rules_match" CHECK("match" in ('exact', 'prefix', 'contains')),
	CONSTRAINT "rules_origin" CHECK("origin" in ('manual', 'promoted')),
	CONSTRAINT "rules_target" CHECK((
        "category_id" is null or "transfer_account_id" is null
      ) and (
        "merchant_id" is not null
        or "category_id" is not null
        or "transfer_account_id" is not null
      ) and (
        "transfer_account_id" is null
        or "account_id" is null
        or "transfer_account_id" <> "account_id"
      ))
);
--> statement-breakpoint
INSERT INTO `__new_rules`("id", "match", "pattern", "account_id", "merchant_id", "category_id", "transfer_account_id", "priority", "origin", "archived_at") SELECT "id", "match", "pattern", "account_id", "merchant_id", "category_id", null, "priority", "origin", "archived_at" FROM `rules`;--> statement-breakpoint
DROP TABLE `rules`;--> statement-breakpoint
ALTER TABLE `__new_rules` RENAME TO `rules`;--> statement-breakpoint
ALTER TABLE `transactions` ADD `mirror` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `transactions` SET `mirror` = 1
WHERE `import_row_id` IS NULL
  AND `transfer_peer_id` IS NOT NULL
  AND (SELECT count(*) FROM `transaction_lines` WHERE `transaction_id` = `transactions`.`id`) = 1
  AND (SELECT count(*) FROM `transaction_lines` WHERE `transaction_id` = `transactions`.`id` AND `transfer_account_id` IS NOT NULL) = 1
  AND EXISTS (
    SELECT 1 FROM `transactions` AS `peer`
    WHERE `peer`.`id` = `transactions`.`transfer_peer_id`
      AND `peer`.`import_row_id` IS NOT NULL
  );--> statement-breakpoint
PRAGMA foreign_keys=ON;