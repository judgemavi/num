PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_category_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`sort_key` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_category_groups`("id", "name", "color", "sort_key") SELECT "id", "name", "color", "sort_key" FROM `category_groups`;--> statement-breakpoint
DROP TABLE `category_groups`;--> statement-breakpoint
ALTER TABLE `__new_category_groups` RENAME TO `category_groups`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `category_groups_name_lower_unique` ON `category_groups` (lower("name"));--> statement-breakpoint
CREATE INDEX `category_groups_sort_key_idx` ON `category_groups` (`sort_key`,`name`,`id`);