CREATE UNIQUE INDEX `category_groups_name_lower_unique` ON `category_groups` (lower("name"));--> statement-breakpoint
ALTER TABLE `category_groups` DROP COLUMN `sort_order`;