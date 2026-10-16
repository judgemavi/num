DROP INDEX `categories_name_lower_unique`;--> statement-breakpoint
ALTER TABLE `categories` ADD `name_key` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_key_unique` ON `categories` (`name_key`);--> statement-breakpoint
DROP INDEX `category_groups_name_lower_unique`;--> statement-breakpoint
ALTER TABLE `category_groups` ADD `name_key` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `category_groups_name_key_unique` ON `category_groups` (`name_key`);--> statement-breakpoint
DROP INDEX `merchants_name_lower_unique`;--> statement-breakpoint
ALTER TABLE `merchants` ADD `name_key` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_name_key_unique` ON `merchants` (`name_key`);--> statement-breakpoint
DROP INDEX `tags_name_lower_unique`;--> statement-breakpoint
ALTER TABLE `tags` ADD `name_key` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_key_unique` ON `tags` (`name_key`);