ALTER TABLE `accounts` ADD `created_at` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `accounts` SET `created_at` = COALESCE(
  (SELECT min(`at`) FROM `audit_log` WHERE `entity` = 'accounts' AND `entity_id` = `accounts`.`id` AND `action` = 'create'),
  (SELECT min(`date`) || 'T00:00:00Z' FROM `transactions` WHERE `account_id` = `accounts`.`id`),
  `opening_date` || 'T00:00:00Z',
  '1970-01-01T00:00:00Z'
);--> statement-breakpoint
ALTER TABLE `accounts` ADD `sort_key` text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE INDEX `accounts_sort_key_idx` ON `accounts` (`sort_key`,`name`,`id`);--> statement-breakpoint
ALTER TABLE `buckets` ADD `sort_key` text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE INDEX `buckets_sort_key_idx` ON `buckets` (`sort_key`,`name`,`id`);--> statement-breakpoint
ALTER TABLE `categories` ADD `sort_key` text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE INDEX `categories_sort_key_idx` ON `categories` (`sort_key`,`name`,`id`);--> statement-breakpoint
ALTER TABLE `category_groups` ADD `sort_key` text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE INDEX `category_groups_sort_key_idx` ON `category_groups` (`sort_key`,`name`,`id`);--> statement-breakpoint
ALTER TABLE `merchants` ADD `sort_key` text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE INDEX `merchants_sort_key_idx` ON `merchants` (`sort_key`,`name`,`id`);--> statement-breakpoint
ALTER TABLE `recurring_plans` ADD `sort_key` text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE INDEX `recurring_plans_sort_key_idx` ON `recurring_plans` (`sort_key`,`name`,`id`);--> statement-breakpoint
ALTER TABLE `tags` ADD `sort_key` text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE INDEX `tags_sort_key_idx` ON `tags` (`sort_key`,`name`,`id`);