CREATE TABLE `month_holds` (
	`month` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bucket_events` ADD `month` text;--> statement-breakpoint
UPDATE `bucket_events` SET
  `month` = (SELECT substr(`r`.`date`, 1, 7) FROM `funding_runs` `r` WHERE `r`.`id` = `bucket_events`.`funding_run_id`),
  `undone_at` = coalesce(`undone_at`, (SELECT `r`.`undone_at` FROM `funding_runs` `r` WHERE `r`.`id` = `bucket_events`.`funding_run_id`))
WHERE `funding_run_id` IS NOT NULL;--> statement-breakpoint
INSERT INTO `month_holds` (`month`, `created_at`)
SELECT substr(`date`, 1, 7), max(`undone_at`) FROM `funding_runs`
GROUP BY substr(`date`, 1, 7) HAVING sum(`undone_at` IS NULL) = 0;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bucket_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`bucket_id` text NOT NULL,
	`other_bucket_id` text,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`month` text,
	`undone_at` text,
	FOREIGN KEY (`bucket_id`) REFERENCES `buckets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`other_bucket_id`) REFERENCES `buckets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_bucket_events`("id", "kind", "bucket_id", "other_bucket_id", "amount", "date", "note", "month", "undone_at") SELECT "id", "kind", "bucket_id", "other_bucket_id", "amount", "date", "note", "month", "undone_at" FROM `bucket_events`;--> statement-breakpoint
DROP TABLE `bucket_events`;--> statement-breakpoint
ALTER TABLE `__new_bucket_events` RENAME TO `bucket_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `bucket_events_bucket` ON `bucket_events` (`bucket_id`);--> statement-breakpoint
DROP TABLE `funding_runs`;--> statement-breakpoint
ALTER TABLE `buckets` ADD `months` integer;--> statement-breakpoint
ALTER TABLE `buckets` ADD `fill_months` integer;--> statement-breakpoint
DELETE FROM `settings` WHERE `key` = 'emergencyFundMonths';--> statement-breakpoint
DELETE FROM `inbox_decisions` WHERE `decision` = 'keep_unassigned';
