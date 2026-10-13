PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`priority` integer NOT NULL,
	`essential` integer NOT NULL,
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
	`fixed_amount` integer
);
--> statement-breakpoint
INSERT INTO `__new_buckets`("id", "name", "kind", "priority", "essential", "color", "icon", "start_date", "archived_at", "refill_to", "amount", "due_date", "repeat", "target", "target_date", "fixed_amount") SELECT "id", "name", "kind", "priority", "essential", "color", "icon", coalesce((SELECT min(substr(`audit_log`.`at`, 1, 10)) FROM `audit_log` WHERE `audit_log`.`entity` = 'buckets' AND `audit_log`.`entity_id` = `buckets`.`id` AND `audit_log`.`action` = 'create'), (SELECT min(`bucket_events`.`date`) FROM `bucket_events` WHERE `bucket_events`.`bucket_id` = `buckets`.`id` OR `bucket_events`.`other_bucket_id` = `buckets`.`id`), (SELECT min(`transactions`.`date`) FROM `transaction_lines` INNER JOIN `transactions` ON `transactions`.`id` = `transaction_lines`.`transaction_id` INNER JOIN `bucket_categories` ON `bucket_categories`.`category_id` = `transaction_lines`.`category_id` WHERE `bucket_categories`.`bucket_id` = `buckets`.`id`), '1970-01-01'), "archived_at", "refill_to", "amount", "due_date", "repeat", "target", "target_date", "fixed_amount" FROM `buckets`;--> statement-breakpoint
DROP TABLE `buckets`;--> statement-breakpoint
ALTER TABLE `__new_buckets` RENAME TO `buckets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
