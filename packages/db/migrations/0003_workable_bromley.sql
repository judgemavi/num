PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_buckets` (
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
INSERT INTO `__new_buckets`("id", "name", "kind", "priority", "essential", "color", "icon", "start_date", "archived_at", "refill_to", "amount", "due_date", "repeat", "target", "target_date", "fixed_amount", "months", "can_recede", "paused_at", "sort_key") SELECT "id", "name", "kind", "priority", "essential", "color", "icon", "start_date", "archived_at", "refill_to", "amount", "due_date", "repeat", "target", "target_date", "fixed_amount", "months", "can_recede", "paused_at", "sort_key" FROM `buckets`;--> statement-breakpoint
DROP TABLE `buckets`;--> statement-breakpoint
ALTER TABLE `__new_buckets` RENAME TO `buckets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `buckets_sort_key_idx` ON `buckets` (`sort_key`,`name`,`id`);--> statement-breakpoint
UPDATE `buckets` SET `essential` = NULL WHERE `kind` IN ('income', 'sinking', 'goal', 'emergency');